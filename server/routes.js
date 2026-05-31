const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { loadConfig, saveConfig, stripPlainSecrets, sanitizeAdminConfig } = require("./config");
const { hashPassword, generateAdminToken, verifyAdminToken, generateUUID } = require("./crypto");
const { ADMIN_TOKEN_TTL_MS, IMAGE_GENERATION_COOLDOWN_MS, GENERATED_IMAGES_DIR } = require("./constants");
const { parseBody, sendJson, sendText, sendFile, getClientIp, summarizeApiError, inferExtensionFromMime } = require("./utils");
const { cleanupExpiredPersistentUsers, getOrCreateUserStore, ensureConversation, createConversation, sanitizeConversation, appendConversationMessage, deriveConversationTitle, loadPersistentUserStore, savePersistentUserStore, deletePersistentUserStore, listPersistentUserStores, findPersistentUserStoreBySessionId, normalizeConversationMessage } = require("./users");
const { loadSongs, saveSongs, sanitizeSong, getSongFilePath, findRequestedSong } = require("./songs");
const { getVisitorSnapshot, recordVisitor } = require("./visitors");
const { recordTokenUsage, recordUsageEvent, getTokenStats, getTokenUsageEvents, setTokenUsageEvents, normalizeTokenUsageEvent, saveTokenUsageEvents } = require("./token-usage");
const { clearCache, getCacheStats, setCacheMaxSize } = require("./cache");
const { getChatConfig, getImageConfig, getSemanticConfig, callModelApi, callImageApi, extractAssistantReply, getUsageFromPayload, buildImagePrompt, extractGeneratedImageData, fetchModelList, normalizeImageSize } = require("./api-client");
const { buildChatMessages } = require("./prompts");
const { getAvatarPath, resolveAvatarUrl, resolveUserAvatarUrl, getCustomUserAvatarPath, saveUserAvatarFromDataUrl } = require("./avatars");
const { getAdminConversationAudit, sanitizeAdminMessage, sanitizeAdminConversation, resolveAdminUserStore, findConversationForAdmin, findMessageForAdmin } = require("./admin-audit");

let apiConnectionStatus = { ok: false, message: "未测试", testedAt: 0 };
const imageGenerationLimits = new Map();
const imageGenerationJobs = new Map();

function getImageLimitKey({ sessionId, userKey }) {
  if (userKey) return userKey;
  return sessionId || "anonymous";
}

function getImageCooldownMs(limitKey) {
  const lastAt = imageGenerationLimits.get(limitKey) || 0;
  return Math.max(0, IMAGE_GENERATION_COOLDOWN_MS - (Date.now() - lastAt));
}

function markImageGenerated(limitKey) {
  imageGenerationLimits.set(limitKey, Date.now());
}

function setImageJob(jobId, updates) {
  const current = imageGenerationJobs.get(jobId) || {};
  imageGenerationJobs.set(jobId, {
    ...current,
    ...updates,
    updatedAt: Date.now()
  });
}

function scheduleImageJobCleanup(jobId) {
  setTimeout(() => {
    imageGenerationJobs.delete(jobId);
  }, 10 * 60 * 1000).unref();
}

function getConversationList(userStore) {
  return userStore.conversations
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(sanitizeConversation);
}

function resolveGeneratedImageUrl(imageData) {
  if (imageData?.url) return imageData.url;
  if (!imageData?.base64) return "";

  let base64 = String(imageData.base64 || "");
  let mimeType = imageData.mimeType || "image/png";
  const dataUrlMatch = base64.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1];
    base64 = dataUrlMatch[2];
  }

  const cleanBase64 = base64.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleanBase64)) {
    throw new Error("图片 API 返回了无法识别的 base64 图片。");
  }

  const buffer = Buffer.from(cleanBase64, "base64");
  if (buffer.length === 0) {
    throw new Error("图片 API 返回了空图片。");
  }
  if (buffer.length > 20 * 1024 * 1024) {
    throw new Error("图片 API 返回的图片过大。");
  }

  fs.mkdirSync(GENERATED_IMAGES_DIR, { recursive: true });
  const extension = inferExtensionFromMime(mimeType);
  const fileName = `${Date.now()}-${generateUUID()}${extension}`;
  const filePath = path.join(GENERATED_IMAGES_DIR, fileName);
  fs.writeFileSync(filePath, buffer);
  return `/api/generated-image/${encodeURIComponent(fileName)}`;
}

async function handleGeneratedImage(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const fileName = decodeURIComponent(url.pathname.replace(/^\/api\/generated-image\//, "")).trim();
  if (!/^[a-zA-Z0-9_.-]+$/.test(fileName)) {
    sendText(res, 404, "Not Found");
    return;
  }

  const root = path.resolve(GENERATED_IMAGES_DIR);
  const filePath = path.resolve(root, fileName);
  if (!filePath.startsWith(root + path.sep)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  sendFile(res, filePath);
}

async function handleImageJobStatus(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const jobId = decodeURIComponent(url.pathname.replace(/^\/api\/image-job\//, "")).trim();
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) {
    sendJson(res, 404, { error: "图片任务不存在。" });
    return;
  }

  const job = imageGenerationJobs.get(jobId);
  if (!job) {
    sendJson(res, 404, { error: "图片任务不存在或已过期。" });
    return;
  }

  sendJson(res, 200, {
    id: jobId,
    status: job.status || "pending",
    reply: job.reply || "",
    error: job.error || "",
    imageUrl: job.imageUrl || "",
    imagePrompt: job.imagePrompt || "",
    model: job.model || "",
    persistent: Boolean(job.persistent),
    userAvatarUrl: job.userAvatarUrl || "",
    conversationId: job.conversationId || "",
    conversations: Array.isArray(job.conversations) ? job.conversations : []
  });
}

async function runImageGenerationJob({
  jobId,
  imageConfig,
  prompt,
  imagePrompt,
  conversation,
  userStore,
  save,
  config,
  clientIp,
  persistent
}) {
  try {
    const { apiResponse, payload } = await callImageApi(imageConfig, prompt);
    if (!apiResponse.ok) {
      throw new Error(summarizeApiError(payload, apiResponse.status));
    }

    const imageUrl = resolveGeneratedImageUrl(extractGeneratedImageData(payload));
    if (!imageUrl) {
      throw new Error("图片 API 没有返回可用图片。");
    }

    const usage = getUsageFromPayload(payload);
    recordUsageEvent({ type: "image", ...usage, ip: clientIp });

    const reply = "我画好了……给你。";
    const now = Date.now();
    appendConversationMessage(conversation, "assistant", reply, now, {
      kind: "image",
      imageUrl,
      imagePrompt
    });
    userStore.updatedAt = now;
    save();

    setImageJob(jobId, {
      status: "done",
      reply,
      imageUrl,
      imagePrompt,
      model: imageConfig.model,
      persistent,
      userAvatarUrl: resolveUserAvatarUrl(config, userStore),
      conversationId: conversation.id,
      conversations: getConversationList(userStore)
    });
  } catch (error) {
    const reply = `图片没有顺利生成……${error.message}`;
    const now = Date.now();
    appendConversationMessage(conversation, "assistant", reply, now);
    userStore.updatedAt = now;
    save();

    setImageJob(jobId, {
      status: "error",
      reply,
      error: error.message || "图片生成失败。",
      model: imageConfig.model,
      persistent,
      userAvatarUrl: resolveUserAvatarUrl(config, userStore),
      conversationId: conversation.id,
      conversations: getConversationList(userStore)
    });
  }
}

function parseIntentDecision(reply) {
  const text = String(reply || "").trim().toLowerCase();
  const compact = text.replace(/[`"'“”‘’。，,.!！?？:：;；\s_-]+/g, "");
  if (["image", "imageapi", "图片api", "图像api", "调用图片api", "图片", "图像", "照片", "画图", "绘图", "生图"].includes(compact)) {
    return { intent: "image", raw: text };
  }
  if (["chat", "chatapi", "对话api", "调用对话api", "聊天", "对话", "文字", "普通聊天"].includes(compact)) {
    return { intent: "chat", raw: text };
  }
  return null;
}

async function classifyUserIntent(semanticConfig, conversation, message) {
  const recentMessages = (conversation.messages || [])
    .slice(-8)
    .map((item) => `${item.role}: ${String(item.content || "").slice(0, 300)}`)
    .join("\n");

  async function requestIntent(maxTokens, retry = false) {
    const requestBody = {
      model: semanticConfig.model,
      temperature: 0,
      max_tokens: maxTokens,
      stream: false,
      messages: [
        {
          role: "system",
          content: [
            "你是内部意图分类器，只输出一个英文单词，不要输出解释。",
            "你的任务不是回答用户能不能做，而是选择哪个下游 API 最适合满足用户真实意图。",
            "基于当前用户消息和最近对话语义，判断下一步只应该调用哪个 API。",
            "如果满足用户请求需要生成或发送一张视觉图片、照片、画像、插画或视觉结果，只输出 image。",
            "如果用户是在询问、讨论、排查、抱怨或配置生图/图片功能，而不是要立即生成一张图，只输出 chat。",
            "如果用户只是问你会不会画图、能不能生图、图片接口是否可用，只输出 chat。",
            "如果当前消息是对上一轮视觉创作请求的继续确认，例如“就按刚才的画出来”，并且最近对话里有可用于生成画面的内容，只输出 image。",
            "其他所有情况，包括普通聊天、解释、描述、问答、音乐、代码和设定讨论，只输出 chat。",
            "不要输出思考过程，不要先分析，直接输出最终分类词。",
            retry ? "上一轮输出为空或格式不正确。现在不要思考过程，不要解释，只输出 chat 或 image。" : "",
            "只能输出两个结果之一：chat 或 image。不要输出 JSON、标点、解释或其他文字。"
          ].filter(Boolean).join("\n")
        },
        {
          role: "user",
          content: [
            "最近对话：",
            recentMessages || "（无）",
            "",
            "当前用户消息：",
            message
          ].join("\n")
        }
      ]
    };

    let apiResult;
    try {
      apiResult = await callModelApi(semanticConfig, requestBody, false);
    } catch (error) {
      throw new Error(`无法连接语义理解 API：${error.message}`);
    }

    const { apiResponse, payload } = apiResult;
    if (!apiResponse.ok) {
      throw new Error(`语义理解 API 返回错误：${summarizeApiError(payload, apiResponse.status)}`);
    }

    const reply = extractAssistantReply(payload);
    const finishReason = payload?.choices?.[0]?.finish_reason || payload?.choices?.[0]?.finishReason || "";
    const rawPreview =
      reply ||
      (typeof payload?.raw === "string" ? payload.raw : "") ||
      (typeof payload?.message === "string" ? payload.message : "") ||
      (typeof payload?.error?.message === "string" ? payload.error.message : "") ||
      (finishReason ? `finish_reason=${finishReason}` : "") ||
      JSON.stringify(payload).slice(0, 500);
    return {
      decision: parseIntentDecision(reply),
      reply,
      rawPreview
    };
  }

  const first = await requestIntent(256, false);
  if (first.decision) return first.decision;

  const second = await requestIntent(512, true);
  if (second.decision) return second.decision;

  const preview = String(second.rawPreview || first.rawPreview || "").trim().slice(0, 120) || "空响应";
  throw new Error(`语义理解 API 没有返回可识别的意图：${preview}`);
}

function requireAdminAuth(req, res) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!verifyAdminToken(token)) {
    sendJson(res, 401, { error: "未授权，请先登录。" });
    return false;
  }
  return true;
}

function publicConfig(config) {
  const chatConfig = getChatConfig(config);
  return {
    siteName: config.siteName,
    siteSubtitle: config.siteSubtitle,
    modelConfigured: Boolean(chatConfig.model && chatConfig.baseUrl),
    model: chatConfig.model || "",
    assistantAvatarUrl: resolveAvatarUrl(config, "assistant"),
    userAvatarUrl: resolveAvatarUrl(config, "user"),
    connectionOk: apiConnectionStatus.ok,
    connectionMessage: apiConnectionStatus.message,
    connectionTestedAt: apiConnectionStatus.testedAt
  };
}

async function handleAvatar(_req, res, role) {
  const config = loadConfig();
  sendFile(res, getAvatarPath(config, role));
}

async function handleSongGet(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const id = decodeURIComponent(url.pathname.replace(/^\/api\/song\//, "")).trim();
  const song = loadSongs().find((item) => item.id === id);
  if (!song) {
    sendText(res, 404, "Not Found");
    return;
  }
  const { SONGS_DIR } = require("./constants");
  const filePath = getSongFilePath(song);
  const safePath = require("path").normalize(filePath);
  if (!safePath.startsWith(SONGS_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  sendFile(res, safePath);
}

async function handleCustomUserAvatar(req, res) {
  const config = loadConfig();
  const { userStore } = getOrCreateUserStore({ ip: getClientIp(req) });
  const customPath = getCustomUserAvatarPath(userStore);
  if (customPath) {
    sendFile(res, customPath);
    return;
  }
  sendFile(res, getAvatarPath(config, "user"));
}

async function handleHeartbeat(req, res) {
  const body = await parseBody(req);
  const ip = getClientIp(req);
  const visitorKey = ip || crypto.randomUUID();
  const page = typeof body.page === "string" && body.page.trim() ? body.page.trim() : "chat";
  const now = Date.now();

  recordVisitor(visitorKey, {
    sessionId: visitorKey,
    page,
    startedAt: now,
    lastSeen: now,
    ip,
    userAgent: req.headers["user-agent"] || "unknown"
  });

  sendJson(res, 200, {
    sessionId: visitorKey,
    ...getVisitorSnapshot()
  });
}

async function handleChat(req, res) {
  const body = await parseBody(req);
  const config = loadConfig();
  const chatConfig = getChatConfig(config);
  const semanticConfig = getSemanticConfig(config);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  const clientIp = getClientIp(req);

  if (!message) {
    sendJson(res, 400, { error: "消息不能为空。" });
    return;
  }

  if (!semanticConfig.baseUrl || !semanticConfig.model) {
    sendJson(res, 400, { error: "语义理解 API 尚未配置完成，请先去后台填写 Base URL 和模型名称。" });
    return;
  }

  cleanupExpiredPersistentUsers();
  const { key: userKey, sessionId, userStore, persistent, save } = getOrCreateUserStore({ ip: clientIp });
  let conversation = ensureConversation(userStore, conversationId);

  if (!conversationId || !userStore.conversations.some((item) => item.id === conversationId)) {
    conversation = userStore.conversations[0];
  }

  let imageDecision;
  try {
    imageDecision = await classifyUserIntent(semanticConfig, conversation, message);
  } catch (error) {
    sendJson(res, 502, { error: error.message });
    return;
  }
  const imageRequested = imageDecision.intent === "image";

  if (!imageRequested && (!chatConfig.baseUrl || !chatConfig.model)) {
    sendJson(res, 400, { error: "API 尚未配置完成，请先去后台填写 Base URL 和模型名称。" });
    return;
  }

  const requestedSong = imageRequested ? null : findRequestedSong(message);
  if (requestedSong) {
    const song = sanitizeSong(requestedSong);
    const songUrl = `/api/song/${encodeURIComponent(song.id)}`;
    const songReplyPrompt = [
      message,
      "",
      `用户想听你保存的 AI 翻唱《${song.title}》。`,
      "请以流萤的身份自然回复一句很短的话，像真人聊天一样，不要提到后台、曲库、功能、音频文件，也不要说你是 AI。"
    ].join("\n");
    const requestBody = {
      model: chatConfig.model,
      temperature: Number(chatConfig.temperature) || 0.8,
      max_tokens: Math.min(Number(chatConfig.maxTokens) || 800, 160),
      stream: false,
      messages: buildChatMessages(chatConfig, conversation.messages || [], songReplyPrompt, false)
    };

    let apiResult;
    try {
      apiResult = await callModelApi(chatConfig, requestBody);
    } catch (error) {
      sendJson(res, 502, { error: `无法连接上游 API：${error.message}` });
      return;
    }

    const { apiResponse, payload } = apiResult;
    if (!apiResponse.ok) {
      const messageText = summarizeApiError(payload, apiResponse.status);
      sendJson(res, apiResponse.status, { error: messageText, details: payload });
      return;
    }

    const reply = (extractAssistantReply(payload) || "").trim();
    if (!reply) {
      sendJson(res, 502, { error: "上游 API 没有返回可用文本。", details: payload });
      return;
    }

    const usage = getUsageFromPayload(payload);
    recordTokenUsage({ ...usage, ip: clientIp });

    const now = Date.now();
    appendConversationMessage(conversation, "user", message, now);
    appendConversationMessage(conversation, "assistant", reply, now + 1);
    appendConversationMessage(conversation, "assistant", "", now + 2, {
      kind: "song",
      songId: song.id,
      songTitle: song.title,
      songArtist: song.artist,
      songUrl
    });
    userStore.updatedAt = now + 2;
    save();
    sendJson(res, 200, {
      reply,
      kind: "song",
      songId: song.id,
      songTitle: song.title,
      songArtist: song.artist,
      songUrl,
      songDuration: Math.ceil(song.size / 16000),
      model: chatConfig.model,
      persistent,
      userAvatarUrl: resolveUserAvatarUrl(config, userStore),
      conversationId: conversation.id,
      conversations: userStore.conversations
        .slice()
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .map(sanitizeConversation)
    });
    return;
  }

  if (imageRequested) {
    const imageConfig = getImageConfig(config);
    if (!imageConfig.baseUrl || !imageConfig.model) {
      const reply = "嗯……我知道你想要一张图片。不过这边还没有接上图片接口。等后台把图片 API 的 Base URL 和模型名称配置好，我就能试着画给你。";
      const now = Date.now();
      appendConversationMessage(conversation, "user", message, now);
      appendConversationMessage(conversation, "assistant", reply, now + 1);
      userStore.updatedAt = now + 1;
      save();
      sendJson(res, 200, {
        reply,
        model: imageConfig.model,
        kind: "text",
        persistent,
        userAvatarUrl: resolveUserAvatarUrl(config, userStore),
        conversationId: conversation.id,
        conversations: getConversationList(userStore)
      });
      return;
    }

    const promptResult = buildImagePrompt(message, conversation.messages || []);
    if (!promptResult.ok) {
      const reply = promptResult.reply || "嗯……这张图还缺一点内容。可以告诉我，你想画什么吗？";
      const now = Date.now();
      appendConversationMessage(conversation, "user", message, now);
      appendConversationMessage(conversation, "assistant", reply, now + 1);
      userStore.updatedAt = now + 1;
      save();
      sendJson(res, 200, {
        reply,
        model: imageConfig.model,
        kind: "text",
        persistent,
        userAvatarUrl: resolveUserAvatarUrl(config, userStore),
        conversationId: conversation.id,
        conversations: getConversationList(userStore)
      });
      return;
    }

    const limitKey = getImageLimitKey({ sessionId, userKey });
    const cooldownMs = getImageCooldownMs(limitKey);
    if (cooldownMs > 0) {
      const waitMinutes = Math.ceil(cooldownMs / 60000);
      const reply = `图片生成需要稍等一下……大约 ${waitMinutes} 分钟后再试。`;
      const now = Date.now();
      appendConversationMessage(conversation, "user", message, now);
      appendConversationMessage(conversation, "assistant", reply, now + 1);
      userStore.updatedAt = now + 1;
      save();
      sendJson(res, 200, {
        reply,
        model: imageConfig.model,
        kind: "text",
        persistent,
        userAvatarUrl: resolveUserAvatarUrl(config, userStore),
        conversationId: conversation.id,
        conversations: getConversationList(userStore)
      });
      return;
    }

    markImageGenerated(limitKey);

    const imagePrompt = promptResult.userPrompt;
    const imageJobId = generateUUID();
    const reply = "我开始画了……稍等一下。";
    const now = Date.now();
    appendConversationMessage(conversation, "user", message, now);
    appendConversationMessage(conversation, "assistant", reply, now + 1, {
      kind: "image_pending",
      imageJobId,
      imagePrompt
    });
    userStore.updatedAt = now + 1;
    save();

    setImageJob(imageJobId, {
      status: "pending",
      reply,
      imagePrompt,
      model: imageConfig.model,
      persistent,
      userAvatarUrl: resolveUserAvatarUrl(config, userStore),
      conversationId: conversation.id,
      conversations: getConversationList(userStore)
    });
    scheduleImageJobCleanup(imageJobId);
    runImageGenerationJob({
      jobId: imageJobId,
      imageConfig,
      prompt: promptResult.prompt,
      imagePrompt,
      conversation,
      userStore,
      save,
      config,
      clientIp,
      persistent
    });

    sendJson(res, 200, {
      reply,
      kind: "image_pending",
      imageJobId,
      imagePrompt,
      model: imageConfig.model,
      persistent,
      userAvatarUrl: resolveUserAvatarUrl(config, userStore),
      conversationId: conversation.id,
      conversations: getConversationList(userStore)
    });
    return;
  }

  const requestBody = {
    model: chatConfig.model,
    temperature: Number(chatConfig.temperature) || 0.8,
    max_tokens: Number(chatConfig.maxTokens) || 800,
    stream: false,
    messages: buildChatMessages(chatConfig, conversation.messages || [], message, false)
  };

  let apiResult;
  try {
    apiResult = await callModelApi(chatConfig, requestBody);
  } catch (error) {
    sendJson(res, 502, { error: `无法连接上游 API：${error.message}` });
    return;
  }

  const { apiResponse, payload, chatUrl } = apiResult;
  if (!apiResponse.ok) {
    const messageText = summarizeApiError(payload, apiResponse.status);
    sendJson(res, apiResponse.status, { error: messageText, details: payload });
    return;
  }

  const reply = extractAssistantReply(payload);

  if (!reply) {
    sendJson(res, 502, { error: "上游 API 没有返回可用文本。", details: payload });
    return;
  }

  const usage = getUsageFromPayload(payload);
  recordTokenUsage({ ...usage, ip: clientIp });

  const now = Date.now();
  appendConversationMessage(conversation, "user", message, now);
  appendConversationMessage(conversation, "assistant", reply.trim(), now + 1);
  userStore.updatedAt = now + 1;
  save();

  sendJson(res, 200, {
    reply: reply.trim(),
    kind: "text",
    model: chatConfig.model,
    persistent,
    userAvatarUrl: resolveUserAvatarUrl(config, userStore),
    conversationId: conversation.id,
    conversations: userStore.conversations
      .slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .map(sanitizeConversation)
  });
}

async function handleSessionState(req, res) {
  const body = req.method === "POST" ? await parseBody(req) : {};
  const ip = getClientIp(req);

  cleanupExpiredPersistentUsers();
  const { userStore, persistent, save } = getOrCreateUserStore({ ip });
  save();

  const conversations = userStore.conversations
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const activeConversation = conversations[0];

  sendJson(res, 200, {
    persistent,
    userAvatarUrl: resolveUserAvatarUrl(loadConfig(), userStore),
    conversationId: activeConversation?.id || "",
    conversations: conversations.map(sanitizeConversation),
    messages: Array.isArray(activeConversation?.messages) ? activeConversation.messages : [],
    retentionDays: 3
  });
}

async function handleConversationCreate(req, res) {
  const body = await parseBody(req);
  const title = typeof body.title === "string" ? body.title.trim() : "新对话";
  cleanupExpiredPersistentUsers();
  const { userStore, persistent, save } = getOrCreateUserStore({ ip: getClientIp(req) });
  const now = Date.now();
  const conversation = createConversation({ title: title || "新对话", now });
  userStore.conversations.unshift(conversation);
  userStore.updatedAt = now;
  save();

  sendJson(res, 200, {
    ok: true,
    persistent,
    userAvatarUrl: resolveUserAvatarUrl(loadConfig(), userStore),
    conversationId: conversation.id,
    conversation: sanitizeConversation(conversation),
    conversations: userStore.conversations.map(sanitizeConversation)
  });
}

async function handleConversationGet(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const conversationId = (url.searchParams.get("conversationId") || "").trim();
  cleanupExpiredPersistentUsers();
  const { userStore } = getOrCreateUserStore({ ip: getClientIp(req) });
  const conversation = ensureConversation(userStore, conversationId);

  sendJson(res, 200, {
    conversationId: conversation.id,
    messages: Array.isArray(conversation.messages) ? conversation.messages : []
  });
}

async function handleConversationDelete(req, res) {
  const body = await parseBody(req);
  const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";

  if (!conversationId) {
    sendJson(res, 400, { error: "缺少会话 ID。" });
    return;
  }

  cleanupExpiredPersistentUsers();
  const { userStore, save } = getOrCreateUserStore({ ip: getClientIp(req) });
  userStore.conversations = (userStore.conversations || []).filter((item) => item.id !== conversationId);
  if (userStore.conversations.length === 0) {
    userStore.conversations = [createConversation()];
  }
  userStore.updatedAt = Date.now();
  save();

  sendJson(res, 200, {
    ok: true,
    conversations: userStore.conversations.map(sanitizeConversation),
    conversationId: userStore.conversations[0].id
  });
}

async function handleUserProfilePut(req, res) {
  const body = await parseBody(req);
  const userAvatarPath = typeof body.userAvatarPath === "string" ? body.userAvatarPath.trim() : "";
  const userAvatarData = typeof body.userAvatarData === "string" ? body.userAvatarData.trim() : "";
  const config = loadConfig();
  const { userStore, save, key } = getOrCreateUserStore({ ip: getClientIp(req) });

  if (userAvatarData) {
    userStore.userAvatarPath = saveUserAvatarFromDataUrl(key, userAvatarData);
  } else {
    userStore.userAvatarPath = userAvatarPath;
  }
  userStore.updatedAt = Date.now();
  save();

  sendJson(res, 200, {
    ok: true,
    userAvatarUrl: resolveUserAvatarUrl(config, userStore),
    persistent: true
  });
}

async function handleAdminConfigGet(req, res) {
  if (!requireAdminAuth(req, res)) return;
  sendJson(res, 200, sanitizeAdminConfig(loadConfig()));
}

async function handleAdminSongsGet(req, res) {
  if (!requireAdminAuth(req, res)) return;
  sendJson(res, 200, { songs: loadSongs().map(sanitizeSong) });
}

async function handleAdminSongUpload(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const title = String(body.title || "").trim();
  const artist = "AI流萤翻唱";
  const originalName = String(body.fileName || "").trim() || "song.mp3";
  const mimeType = String(body.mimeType || "").toLowerCase();
  const dataUrl = String(body.dataUrl || "");
  const allowedMimeTypes = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/flac", "audio/aac"]);

  if (!title) {
    sendJson(res, 400, { error: "请填写歌曲名称。" });
    return;
  }
  if (!allowedMimeTypes.has(mimeType)) {
    sendJson(res, 400, { error: "只支持 mp3、wav、ogg、m4a、flac、aac 音频。" });
    return;
  }

  const match = dataUrl.match(/^data:audio\/[a-z0-9.+-]+;base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    sendJson(res, 400, { error: "音频数据格式不正确。" });
    return;
  }

  const buffer = Buffer.from(match[1], "base64");
  if (buffer.length === 0 || buffer.length > 20 * 1024 * 1024) {
    sendJson(res, 400, { error: "音频文件大小需在 20MB 以内。" });
    return;
  }

  const { inferExtensionFromMime } = require("./utils");
  const { SONGS_DIR } = require("./constants");
  const ext = inferExtensionFromMime(mimeType) === ".bin"
    ? require("path").extname(originalName).toLowerCase() || ".mp3"
    : inferExtensionFromMime(mimeType);
  const id = generateUUID();
  const fileName = `${id}${ext}`;
  require("fs").writeFileSync(require("path").join(SONGS_DIR, fileName), buffer);

  const songs = loadSongs();
  songs.unshift({
    id,
    title,
    artist,
    fileName,
    originalName,
    mimeType,
    size: buffer.length,
    createdAt: Date.now()
  });
  saveSongs(songs);
  sendJson(res, 200, { ok: true, songs: songs.map(sanitizeSong) });
}

async function handleAdminSongDelete(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const id = String(body.id || "").trim();
  const songs = loadSongs();
  const song = songs.find((item) => item.id === id);
  if (!song) {
    sendJson(res, 404, { error: "歌曲不存在。" });
    return;
  }

  const { SONGS_DIR } = require("./constants");
  const filePath = getSongFilePath(song);
  const safePath = require("path").normalize(filePath);
  if (safePath.startsWith(SONGS_DIR) && require("fs").existsSync(safePath)) {
    require("fs").unlinkSync(safePath);
  }
  const nextSongs = songs.filter((item) => item.id !== id);
  saveSongs(nextSongs);
  sendJson(res, 200, { ok: true, songs: nextSongs.map(sanitizeSong) });
}

async function handleAdminSongAudio(req, res, pathname) {
  const idMatch = pathname.match(/^\/api\/admin\/songs\/([^/]+)\/audio$/);
  if (!idMatch) {
    sendText(res, 404, "Not Found");
    return;
  }
  
  const id = idMatch[1];
  const songs = loadSongs();
  const song = songs.find((item) => item.id === id);
  
  if (!song) {
    sendText(res, 404, "歌曲不存在");
    return;
  }
  
  const { SONGS_DIR, MIME_TYPES } = require("./constants");
  const filePath = getSongFilePath(song);
  const safePath = require("path").normalize(filePath);
  
  if (!safePath.startsWith(SONGS_DIR) || !require("fs").existsSync(safePath)) {
    sendText(res, 404, "音频文件不存在");
    return;
  }
  
  const ext = require("path").extname(safePath).toLowerCase();
  const mimeTypes = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac"
  };
  
  const contentType = mimeTypes[ext] || "audio/mpeg";
  const stat = require("fs").statSync(safePath);
  
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store"
  });
  
  require("fs").createReadStream(safePath).pipe(res);
}

async function handleAdminModelsFetch(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const config = loadConfig();
  const chatConfig = getChatConfig(config);
  const imageConfig = getImageConfig(config);
  const semanticConfig = getSemanticConfig(config);
  const body = await parseBody(req);
  const target = body.target === "image" ? "image" : body.target === "semantic" ? "semantic" : "chat";
  const sourceConfig = target === "image" ? imageConfig : target === "semantic" ? semanticConfig : chatConfig;
  const fetchConfig = {
    ...sourceConfig,
    baseUrl: typeof body.baseUrl === "string" && body.baseUrl.trim()
      ? body.baseUrl.trim()
      : sourceConfig.baseUrl,
    apiKey: typeof body.apiKey === "string" && body.apiKey.trim()
      ? body.apiKey.trim()
      : sourceConfig.apiKey
  };

  try {
    const models = await fetchModelList(fetchConfig);
    const fetchedAt = Date.now();
    if (target === "image") {
      config.imageAvailableModels = models;
      config.imageModelsFetchedAt = fetchedAt;
    } else if (target === "semantic") {
      config.semanticAvailableModels = models;
      config.semanticModelsFetchedAt = fetchedAt;
    } else {
      config.chatAvailableModels = models;
      config.availableModels = models;
      config.modelsFetchedAt = fetchedAt;
    }
    saveConfig(stripPlainSecrets(config));
    sendJson(res, 200, {
      ok: true,
      models,
      target,
      fetchedAt
    });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "获取模型失败。" });
  }
}

async function handleAdminTestConnection(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const chatConfig = getChatConfig(loadConfig());

  if (!chatConfig.baseUrl || !chatConfig.model) {
    apiConnectionStatus = { ok: false, message: "请先配置 Base URL 和模型名称。", testedAt: Date.now() };
    sendJson(res, 200, { ok: false, message: apiConnectionStatus.message, testedAt: apiConnectionStatus.testedAt });
    return;
  }

  try {
    const requestBody = {
      model: chatConfig.model,
      max_tokens: 256,
      stream: false,
      messages: [
        { role: "user", content: "请回复：连通测试成功" }
      ]
    };
    const { apiResponse, payload, chatUrl } = await callModelApi(chatConfig, requestBody);

    if (!apiResponse.ok) {
      const errorMsg = summarizeApiError(payload, apiResponse.status);
      apiConnectionStatus = { ok: false, message: `API 返回错误: ${errorMsg} (${chatUrl})`, testedAt: Date.now() };
      sendJson(res, 200, { ok: false, message: apiConnectionStatus.message, testedAt: apiConnectionStatus.testedAt });
      return;
    }

    const reply = extractAssistantReply(payload);

    if (reply) {
      apiConnectionStatus = { ok: true, message: `连通成功 · 模型 ${chatConfig.model} 已回复`, testedAt: Date.now() };
    } else {
      apiConnectionStatus = { ok: false, message: `API 已连接但未返回内容`, testedAt: Date.now() };
    }
    sendJson(res, 200, { ok: apiConnectionStatus.ok, message: apiConnectionStatus.message, testedAt: apiConnectionStatus.testedAt });
  } catch (error) {
    apiConnectionStatus = { ok: false, message: `连接失败: ${error.message}`, testedAt: Date.now() };
    sendJson(res, 200, { ok: false, message: apiConnectionStatus.message, testedAt: apiConnectionStatus.testedAt });
  }
}

async function handleAdminTestImageConnection(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const imageConfig = getImageConfig(loadConfig());

  if (!imageConfig.baseUrl || !imageConfig.model) {
    sendJson(res, 200, { ok: false, message: "图片 API 未配置；不影响普通对话。" });
    return;
  }

  try {
    const { apiResponse, payload, imageUrl } = await callImageApi(imageConfig, "a small glowing firefly under a quiet night sky");
    if (!apiResponse.ok) {
      const errorMsg = summarizeApiError(payload, apiResponse.status);
      sendJson(res, 200, { ok: false, message: `图片 API 返回错误: ${errorMsg} (${imageUrl})` });
      return;
    }

    let generatedImage = "";
    try {
      generatedImage = resolveGeneratedImageUrl(extractGeneratedImageData(payload));
    } catch (error) {
      sendJson(res, 200, { ok: false, message: error.message });
      return;
    }
    if (!generatedImage) {
      sendJson(res, 200, { ok: false, message: "图片 API 已连接但没有返回可用图片。" });
      return;
    }

    const usage = getUsageFromPayload(payload);
    recordUsageEvent({ type: "image", ...usage, ip: getClientIp(req) });
    sendJson(res, 200, { ok: true, message: `图片 API 连通成功 · 模型 ${imageConfig.model} 已返回图片`, imageUrl: generatedImage });
  } catch (error) {
    sendJson(res, 200, { ok: false, message: `图片 API 连接失败: ${error.message}` });
  }
}

async function handleAdminTestSemanticConnection(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const semanticConfig = getSemanticConfig(loadConfig());

  if (!semanticConfig.baseUrl || !semanticConfig.model) {
    sendJson(res, 200, { ok: false, message: "语义理解 API 未配置。" });
    return;
  }

  try {
    const decision = await classifyUserIntent(semanticConfig, { messages: [] }, "用户现在想和你正常聊一会儿。");
    if (decision.intent !== "chat" && decision.intent !== "image") {
      sendJson(res, 200, { ok: false, message: "语义理解 API 已响应，但返回格式不可识别。" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      message: `语义理解 API 连通成功 · 模型 ${semanticConfig.model} 已返回调用目标`,
      decision
    });
  } catch (error) {
    sendJson(res, 200, { ok: false, message: `语义理解 API 连接失败: ${error.message}` });
  }
}

async function handleAdminConfigPut(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const config = loadConfig();
  const hasField = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const updatesApiConfig = [
    "chatBaseUrl", "chatApiKey", "chatModel", "chatAvailableModels",
    "baseUrl", "apiKey", "model", "availableModels", "availableModelsText",
    "imageBaseUrl", "imageApiKey", "imageModel", "imageAvailableModels", "imageSize",
    "semanticBaseUrl", "semanticApiKey", "semanticModel", "semanticAvailableModels",
    "temperature", "maxTokens"
  ].some(hasField);
  const updatesSiteConfig = [
    "siteName", "siteSubtitle", "assistantAvatarPath",
    "userAvatarPath", "systemPrompt", "adminPassword"
  ].some(hasField);
  const manualModels = Array.isArray(body.chatAvailableModels)
    ? body.chatAvailableModels.filter((item) => typeof item === "string" && item.trim())
    : Array.isArray(body.availableModels)
      ? body.availableModels.filter((item) => typeof item === "string" && item.trim())
    : typeof body.availableModelsText === "string"
      ? body.availableModelsText
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean)
      : Array.isArray(config.chatAvailableModels) ? config.chatAvailableModels : Array.isArray(config.availableModels) ? config.availableModels : [];
  const imageManualModels = Array.isArray(body.imageAvailableModels)
    ? body.imageAvailableModels.filter((item) => typeof item === "string" && item.trim())
    : Array.isArray(config.imageAvailableModels) ? config.imageAvailableModels : [];
  const semanticManualModels = Array.isArray(body.semanticAvailableModels)
    ? body.semanticAvailableModels.filter((item) => typeof item === "string" && item.trim())
    : Array.isArray(config.semanticAvailableModels) ? config.semanticAvailableModels : [];

  const nextConfig = {
    ...config,
    siteName: hasField("siteName") ? String(body.siteName || "").trim() || config.siteName : config.siteName,
    siteSubtitle: hasField("siteSubtitle") ? String(body.siteSubtitle || "").trim() || config.siteSubtitle : config.siteSubtitle,
    assistantAvatarPath: hasField("assistantAvatarPath") ? String(body.assistantAvatarPath || "").trim() || require("./constants").DEFAULT_ASSISTANT_AVATAR : config.assistantAvatarPath,
    userAvatarPath: hasField("userAvatarPath") ? String(body.userAvatarPath || "").trim() || require("./constants").DEFAULT_USER_AVATAR : config.userAvatarPath,
    chatBaseUrl: hasField("chatBaseUrl") ? String(body.chatBaseUrl || "").trim() : hasField("baseUrl") ? String(body.baseUrl || "").trim() : config.chatBaseUrl || config.baseUrl,
    chatModel: hasField("chatModel") ? String(body.chatModel || "").trim() : hasField("model") ? String(body.model || "").trim() : config.chatModel || config.model,
    baseUrl: hasField("chatBaseUrl") ? String(body.chatBaseUrl || "").trim() : hasField("baseUrl") ? String(body.baseUrl || "").trim() : config.baseUrl,
    model: hasField("chatModel") ? String(body.chatModel || "").trim() : hasField("model") ? String(body.model || "").trim() : config.model,
    availableModels: manualModels,
    chatAvailableModels: manualModels,
    imageBaseUrl: hasField("imageBaseUrl") ? String(body.imageBaseUrl || "").trim() : config.imageBaseUrl || "",
    imageModel: hasField("imageModel") ? String(body.imageModel || "").trim() : config.imageModel || "",
    imageAvailableModels: imageManualModels,
    semanticBaseUrl: hasField("semanticBaseUrl") ? String(body.semanticBaseUrl || "").trim() : config.semanticBaseUrl || config.chatBaseUrl || config.baseUrl || "",
    semanticModel: hasField("semanticModel") ? String(body.semanticModel || "").trim() : config.semanticModel || config.chatModel || config.model || "",
    semanticAvailableModels: semanticManualModels,
    imageSize: hasField("imageSize") ? normalizeImageSize(body.imageSize) : normalizeImageSize(config.imageSize || "1024x1024"),
    temperature: hasField("temperature") ? Number(body.temperature) : config.temperature,
    maxTokens: hasField("maxTokens") ? Number(body.maxTokens) : config.maxTokens,
    systemPrompt: hasField("systemPrompt") ? String(body.systemPrompt || "").trim() : config.systemPrompt
  };

  if (hasField("chatApiKey") || hasField("apiKey")) {
    const submittedApiKey = String(hasField("chatApiKey") ? body.chatApiKey : body.apiKey || "").trim();
    const effectiveApiKey = submittedApiKey || config.chatApiKey || config.apiKey || "";
    const { encryptSecret } = require("./crypto");
    nextConfig.chatApiKeyEncrypted = effectiveApiKey ? encryptSecret(effectiveApiKey) : null;
    nextConfig.chatApiKey = effectiveApiKey;
    nextConfig.apiKeyEncrypted = nextConfig.chatApiKeyEncrypted;
    nextConfig.apiKey = effectiveApiKey;
  }

  if (hasField("imageApiKey")) {
    const submittedImageApiKey = String(body.imageApiKey || "").trim();
    const effectiveImageApiKey = submittedImageApiKey || config.imageApiKey || "";
    const { encryptSecret } = require("./crypto");
    nextConfig.imageApiKeyEncrypted = effectiveImageApiKey ? encryptSecret(effectiveImageApiKey) : null;
    nextConfig.imageApiKey = effectiveImageApiKey;
  }

  if (hasField("semanticApiKey")) {
    const submittedSemanticApiKey = String(body.semanticApiKey || "").trim();
    const effectiveSemanticApiKey = submittedSemanticApiKey || config.semanticApiKey || config.chatApiKey || config.apiKey || "";
    const { encryptSecret } = require("./crypto");
    nextConfig.semanticApiKeyEncrypted = effectiveSemanticApiKey ? encryptSecret(effectiveSemanticApiKey) : null;
    nextConfig.semanticApiKey = effectiveSemanticApiKey;
  }

  const newAdminPassword = typeof body.adminPassword === "string" ? body.adminPassword.trim() : "";
  if (newAdminPassword) {
    nextConfig.adminPasswordHash = hashPassword(newAdminPassword);
  }

  if (updatesApiConfig && (!nextConfig.chatBaseUrl || !nextConfig.chatModel)) {
    sendJson(res, 400, { error: "对话 Base URL 和对话模型名称不能为空。" });
    return;
  }

  if (updatesApiConfig && (nextConfig.imageBaseUrl || nextConfig.imageModel) && (!nextConfig.imageBaseUrl || !nextConfig.imageModel)) {
    sendJson(res, 400, { error: "图片 API 如需启用，Base URL 和模型名称需要同时填写。" });
    return;
  }

  if (updatesApiConfig && (nextConfig.semanticBaseUrl || nextConfig.semanticModel) && (!nextConfig.semanticBaseUrl || !nextConfig.semanticModel)) {
    sendJson(res, 400, { error: "语义理解 API 如需启用，Base URL 和模型名称需要同时填写。" });
    return;
  }

  if (updatesSiteConfig && !nextConfig.systemPrompt) {
    sendJson(res, 400, { error: "系统提示词不能为空。" });
    return;
  }

  if (updatesApiConfig && (!Number.isFinite(nextConfig.temperature) || nextConfig.temperature < 0 || nextConfig.temperature > 2)) {
    sendJson(res, 400, { error: "temperature 需要在 0 到 2 之间。" });
    return;
  }

  if (updatesApiConfig && (!Number.isFinite(nextConfig.maxTokens) || nextConfig.maxTokens < 1 || nextConfig.maxTokens > 32000)) {
    sendJson(res, 400, { error: "maxTokens 需要在 1 到 32000 之间。" });
    return;
  }

  saveConfig(stripPlainSecrets(nextConfig));
  sendJson(res, 200, { ok: true, config: sanitizeAdminConfig(nextConfig) });
}

async function handleAdminStats(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const stats = getVisitorSnapshot();
  stats.cache = getCacheStats();
  sendJson(res, 200, stats);
}

async function handleAdminTokenStats(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const range = url.searchParams.get("range") || "all";
  sendJson(res, 200, getTokenStats(range));
}

async function handleAdminConversationAudit(req, res) {
  if (!requireAdminAuth(req, res)) return;
  sendJson(res, 200, getAdminConversationAudit());
}

async function handleAdminCacheClear(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const cleared = clearCache();
  sendJson(res, 200, { ok: true, cleared });
}

async function handleAdminAuditIpUpdate(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const ip = typeof body.ip === "string" ? body.ip.trim() : "";
  const nextIp = typeof body.nextIp === "string" ? body.nextIp.trim() : "";
  if (!ip || !nextIp) {
    sendJson(res, 400, { error: "缺少 IP 信息。" });
    return;
  }
  const events = getTokenUsageEvents();
  for (const event of events) {
    if ((event.ip || "unknown") === ip) {
      event.ip = nextIp;
    }
  }
  saveTokenUsageEvents();
  for (const { userKey, userStore } of listPersistentUserStores()) {
    if ((userStore.ip || "unknown") === ip) {
      userStore.ip = nextIp;
      savePersistentUserStore(userKey, userStore);
    }
  }
  sendJson(res, 200, { ok: true, audit: getAdminConversationAudit() });
}

async function handleAdminAuditIpDelete(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const ip = typeof body.ip === "string" ? body.ip.trim() : "";
  if (!ip) {
    sendJson(res, 400, { error: "缺少 IP。" });
    return;
  }
  const events = getTokenUsageEvents().filter((event) => (event.ip || "unknown") !== ip);
  setTokenUsageEvents(events);
  saveTokenUsageEvents();
  for (const { userKey, userStore } of listPersistentUserStores()) {
    if ((userStore.ip || "unknown") === ip) {
      deletePersistentUserStore(userKey);
    }
  }
  sendJson(res, 200, { ok: true, audit: getAdminConversationAudit() });
}

async function handleAdminTokenEventCreate(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const event = normalizeTokenUsageEvent({
    id: generateUUID(),
    createdAt: Number.isFinite(Number(body.createdAt)) ? Number(body.createdAt) : Date.now(),
    type: body.type === "image" ? "image" : "chat",
    ip: typeof body.ip === "string" && body.ip.trim() ? body.ip.trim() : "unknown",
    sessionId: typeof body.sessionId === "string" ? body.sessionId.trim() : "",
    promptTokens: body.promptTokens,
    completionTokens: body.completionTokens,
    totalTokens: body.totalTokens
  });
  getTokenUsageEvents().push(event);
  saveTokenUsageEvents();
  sendJson(res, 200, { ok: true, event, audit: getAdminConversationAudit() });
}

async function handleAdminTokenEventUpdate(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const event = getTokenUsageEvents().find((item) => item.id === eventId);
  if (!event) {
    sendJson(res, 404, { error: "消耗记录不存在。" });
    return;
  }
  const next = normalizeTokenUsageEvent({
    ...event,
    ...body,
    id: event.id
  });
  Object.assign(event, next);
  saveTokenUsageEvents();
  sendJson(res, 200, { ok: true, event, audit: getAdminConversationAudit() });
}

async function handleAdminTokenEventDelete(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const events = getTokenUsageEvents();
  const nextEvents = events.filter((item) => item.id !== eventId);
  if (nextEvents.length === events.length) {
    sendJson(res, 404, { error: "消耗记录不存在。" });
    return;
  }
  setTokenUsageEvents(nextEvents);
  saveTokenUsageEvents();
  sendJson(res, 200, { ok: true, audit: getAdminConversationAudit() });
}

async function handleAdminConversationCreate(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const resolved = resolveAdminUserStore(body);
  if (resolved.error) {
    sendJson(res, 404, { error: resolved.error });
    return;
  }
  const now = Date.now();
  const conversation = createConversation({
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "新对话",
    now: Number.isFinite(Number(body.createdAt)) ? Number(body.createdAt) : now
  });
  resolved.userStore.ip = typeof body.ip === "string" && body.ip.trim() ? body.ip.trim() : (resolved.userStore.ip || "unknown");
  resolved.userStore.sessionId = resolved.userStore.sessionId || resolved.sessionId;
  resolved.userStore.conversations.unshift(conversation);
  resolved.userStore.updatedAt = now;
  savePersistentUserStore(resolved.userKey, resolved.userStore);
  sendJson(res, 200, {
    ok: true,
    conversation: sanitizeAdminConversation(conversation, resolved.userKey, resolved.userStore.sessionId || ""),
    audit: getAdminConversationAudit()
  });
}

async function handleAdminConversationUpdate(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const resolved = resolveAdminUserStore(body);
  if (resolved.error) {
    sendJson(res, 404, { error: resolved.error });
    return;
  }
  const conversation = findConversationForAdmin(resolved.userStore, body.conversationId);
  if (!conversation) {
    sendJson(res, 404, { error: "对话不存在。" });
    return;
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title) {
    conversation.title = title;
  }
  if (typeof body.ip === "string" && body.ip.trim()) {
    resolved.userStore.ip = body.ip.trim();
  }
  conversation.updatedAt = Date.now();
  resolved.userStore.updatedAt = conversation.updatedAt;
  savePersistentUserStore(resolved.userKey, resolved.userStore);
  sendJson(res, 200, {
    ok: true,
    conversation: sanitizeAdminConversation(conversation, resolved.userKey, resolved.userStore.sessionId || ""),
    audit: getAdminConversationAudit()
  });
}

async function handleAdminConversationDelete(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const resolved = resolveAdminUserStore(body);
  if (resolved.error) {
    sendJson(res, 404, { error: resolved.error });
    return;
  }
  const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  const nextConversations = (resolved.userStore.conversations || []).filter((item) => item.id !== conversationId);
  if (nextConversations.length === (resolved.userStore.conversations || []).length) {
    sendJson(res, 404, { error: "对话不存在。" });
    return;
  }
  if (nextConversations.length === 0) {
    deletePersistentUserStore(resolved.userKey);
  } else {
    resolved.userStore.conversations = nextConversations;
    resolved.userStore.updatedAt = Date.now();
    savePersistentUserStore(resolved.userKey, resolved.userStore);
  }
  sendJson(res, 200, { ok: true, audit: getAdminConversationAudit() });
}

async function handleAdminMessageCreate(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const resolved = resolveAdminUserStore(body);
  if (resolved.error) {
    sendJson(res, 404, { error: resolved.error });
    return;
  }
  const conversation = findConversationForAdmin(resolved.userStore, body.conversationId);
  if (!conversation) {
    sendJson(res, 404, { error: "对话不存在。" });
    return;
  }
  const content = typeof body.content === "string" ? body.content : "";
  const role = typeof body.role === "string" && body.role.trim() ? body.role.trim() : "assistant";
  const message = normalizeConversationMessage({
    id: generateUUID(),
    role,
    content,
    createdAt: Number.isFinite(Number(body.createdAt)) ? Number(body.createdAt) : Date.now()
  });
  conversation.messages.push(message);
  conversation.messages.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  conversation.updatedAt = message.createdAt;
  resolved.userStore.updatedAt = message.createdAt;
  if (typeof body.title === "string" && body.title.trim()) {
    conversation.title = body.title.trim();
  } else if (!conversation.title || conversation.title === "新对话") {
    conversation.title = deriveConversationTitle(content);
  }
  savePersistentUserStore(resolved.userKey, resolved.userStore);
  sendJson(res, 200, {
    ok: true,
    message: sanitizeAdminMessage(message),
    conversation: sanitizeAdminConversation(conversation, resolved.userKey, resolved.userStore.sessionId || ""),
    audit: getAdminConversationAudit()
  });
}

async function handleAdminMessageUpdate(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const resolved = resolveAdminUserStore(body);
  if (resolved.error) {
    sendJson(res, 404, { error: resolved.error });
    return;
  }
  const conversation = findConversationForAdmin(resolved.userStore, body.conversationId);
  if (!conversation) {
    sendJson(res, 404, { error: "对话不存在。" });
    return;
  }
  const message = findMessageForAdmin(conversation, body.messageId);
  if (!message) {
    sendJson(res, 404, { error: "消息不存在。" });
    return;
  }
  if (typeof body.role === "string" && body.role.trim()) {
    message.role = body.role.trim();
  }
  if (typeof body.content === "string") {
    message.content = body.content;
  }
  if (Number.isFinite(Number(body.createdAt))) {
    message.createdAt = Number(body.createdAt);
  }
  conversation.messages = conversation.messages.map((item) => normalizeConversationMessage(item)).filter(Boolean);
  conversation.messages.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (typeof body.title === "string" && body.title.trim()) {
    conversation.title = body.title.trim();
  }
  conversation.updatedAt = conversation.messages[conversation.messages.length - 1]?.createdAt || Date.now();
  resolved.userStore.updatedAt = conversation.updatedAt;
  savePersistentUserStore(resolved.userKey, resolved.userStore);
  sendJson(res, 200, {
    ok: true,
    message: sanitizeAdminMessage(findMessageForAdmin(conversation, message.id)),
    conversation: sanitizeAdminConversation(conversation, resolved.userKey, resolved.userStore.sessionId || ""),
    audit: getAdminConversationAudit()
  });
}

async function handleAdminMessageDelete(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const resolved = resolveAdminUserStore(body);
  if (resolved.error) {
    sendJson(res, 404, { error: resolved.error });
    return;
  }
  const conversation = findConversationForAdmin(resolved.userStore, body.conversationId);
  if (!conversation) {
    sendJson(res, 404, { error: "对话不存在。" });
    return;
  }
  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  const nextMessages = (conversation.messages || []).filter((item) => item.id !== messageId);
  if (nextMessages.length === (conversation.messages || []).length) {
    sendJson(res, 404, { error: "消息不存在。" });
    return;
  }
  conversation.messages = nextMessages;
  conversation.updatedAt = conversation.messages[conversation.messages.length - 1]?.createdAt || conversation.createdAt || Date.now();
  resolved.userStore.updatedAt = conversation.updatedAt;
  savePersistentUserStore(resolved.userKey, resolved.userStore);
  sendJson(res, 200, {
    ok: true,
    conversation: sanitizeAdminConversation(conversation, resolved.userKey, resolved.userStore.sessionId || ""),
    audit: getAdminConversationAudit()
  });
}

module.exports = {
  publicConfig,
  handleGeneratedImage,
  handleImageJobStatus,
  handleAvatar,
  handleSongGet,
  handleCustomUserAvatar,
  handleHeartbeat,
  handleChat,
  handleSessionState,
  handleConversationCreate,
  handleConversationGet,
  handleConversationDelete,
  handleUserProfilePut,
  handleAdminConfigGet,
  handleAdminSongsGet,
  handleAdminSongUpload,
  handleAdminSongDelete,
  handleAdminSongAudio,
  handleAdminModelsFetch,
  handleAdminTestConnection,
  handleAdminTestImageConnection,
  handleAdminTestSemanticConnection,
  handleAdminConfigPut,
  handleAdminStats,
  handleAdminTokenStats,
  handleAdminConversationAudit,
  handleAdminCacheClear,
  handleAdminAuditIpUpdate,
  handleAdminAuditIpDelete,
  handleAdminTokenEventCreate,
  handleAdminTokenEventUpdate,
  handleAdminTokenEventDelete,
  handleAdminConversationCreate,
  handleAdminConversationUpdate,
  handleAdminConversationDelete,
  handleAdminMessageCreate,
  handleAdminMessageUpdate,
  handleAdminMessageDelete,
  generateAdminToken: (password) => generateAdminToken(password, loadConfig().adminPasswordHash, ADMIN_TOKEN_TTL_MS),
  verifyAdminToken
};
