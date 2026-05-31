const crypto = require("crypto");
const { CACHE_TTL_MS } = require("./constants");
const { getCachedResponse, setCachedResponse, incrementCacheHits, incrementCacheMisses } = require("./cache");
const { summarizeApiError } = require("./utils");

const IMAGE_API_TIMEOUT_MS = 600 * 1000;
const IMAGE_PROMPT_MAX_LENGTH = 1800;
const VALID_IMAGE_SIZES = new Set([
  "auto",
  "256x256",
  "512x512",
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "1024x1792",
  "1792x1024"
]);

function getChatConfig(config) {
  return {
    baseUrl: config.chatBaseUrl || config.baseUrl || "",
    model: config.chatModel || config.model || "",
    apiKey: config.chatApiKey || config.apiKey || "",
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    systemPrompt: config.systemPrompt
  };
}

function getImageConfig(config) {
  return {
    baseUrl: config.imageBaseUrl || "",
    model: config.imageModel || "",
    apiKey: config.imageApiKey || "",
    size: normalizeImageSize(config.imageSize || "1024x1024")
  };
}

function getSemanticConfig(config) {
  return {
    baseUrl: config.semanticBaseUrl || config.chatBaseUrl || config.baseUrl || "",
    model: config.semanticModel || config.chatModel || config.model || "",
    apiKey: config.semanticApiKey || config.chatApiKey || config.apiKey || "",
    temperature: 0,
    maxTokens: 180
  };
}

function normalizeImageSize(size) {
  const normalized = String(size || "").trim().toLowerCase();
  return VALID_IMAGE_SIZES.has(normalized) ? normalized : "auto";
}

function buildChatUrl(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/v\d+$/i.test(trimmed)) {
    return trimmed + "/chat/completions";
  }
  return trimmed + "/chat/completions";
}

function buildImageUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (/\/images\/generations$/i.test(trimmed)) {
    return trimmed;
  }
  const endpointSuffixes = ["/chat/completions", "/responses", "/completions", "/models"];
  const lower = trimmed.toLowerCase();
  const matchedSuffix = endpointSuffixes.find((suffix) => lower.endsWith(suffix));
  if (matchedSuffix) {
    const prefix = trimmed.slice(0, trimmed.length - matchedSuffix.length).replace(/\/+$/, "");
    return `${prefix}/images/generations`;
  }
  return trimmed + "/images/generations";
}

function generateCacheKey(config, requestBody) {
  const keyData = {
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    messages: requestBody.messages
  };
  return crypto.createHash("sha256").update(JSON.stringify(keyData)).digest("hex");
}

async function callModelApi(config, requestBody, useCache = true, timeoutMs = 0) {
  const cacheKey = useCache ? generateCacheKey(config, requestBody) : null;

  if (cacheKey) {
    const cached = getCachedResponse(cacheKey, CACHE_TTL_MS);
    if (cached) {
      incrementCacheHits();
      return cached;
    }
    incrementCacheMisses();
  }

  const chatUrl = buildChatUrl(config.baseUrl);
  const headers = {
    "Content-Type": "application/json"
  };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let apiResponse;
  let text = "";
  try {
    apiResponse = await fetch(chatUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller?.signal
    });
    text = await apiResponse.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("上游 API 请求超时，请稍后再试。");
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }

  const result = { apiResponse, payload, chatUrl };

  if (cacheKey && apiResponse.ok) {
    setCachedResponse(cacheKey, result);
  }

  return result;
}

async function callImageApi(config, prompt) {
  const imageUrl = buildImageUrl(config.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_API_TIMEOUT_MS);
  const headers = {
    "Content-Type": "application/json"
  };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  const requestBody = {
    model: config.model,
    prompt,
    n: 1,
    size: normalizeImageSize(config.size || "1024x1024")
  };
  let apiResponse;
  let text = "";
  try {
    apiResponse = await fetch(imageUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    text = await apiResponse.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("图片 API 请求超时，请稍后再试。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }

  return { apiResponse, payload, imageUrl };
}

function extractAssistantReply(payload) {
  const choice = payload?.choices?.[0];
  const msg = choice?.message;
  const candidates = [
    msg?.content,
    choice?.text,
    payload?.data?.[0]?.content,
    payload?.result,
    payload?.response,
    payload?.output_text
  ];

  for (const candidate of candidates) {
    const reply = stripThinkingText(candidate);
    if (reply) return reply;
  }

  return "";
}

function stripThinkingText(content) {
  const { contentToText } = require("./utils");
  return contentToText(content)
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*<\/think>\s*/i, "")
    .replace(/^[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff\ufffd\u25a1\u2612\u2610\u2611]+/u, "")
    .trim();
}

function getUsageFromPayload(payload) {
  const usage = payload?.usage || {};
  const promptTokens = Number(usage.prompt_tokens || usage.input_tokens) || 0;
  const completionTokens = Number(usage.completion_tokens || usage.output_tokens) || 0;
  const totalTokens = Number(usage.total_tokens) || (promptTokens + completionTokens);
  return { promptTokens, completionTokens, totalTokens };
}

function getImagePrompt(message) {
  return buildImagePrompt(message).prompt || normalizePromptText(message);
}

function buildImagePrompt(message, contextMessages = []) {
  const normalized = normalizePromptText(message);
  const userPrompt = normalized.replace(/[，,:：。.\s]+$/g, "").trim();
  const imageSubject = stripImageCommand(userPrompt);
  const vagueTerms = new Set([
    "图",
    "图片",
    "图像",
    "一张图",
    "一张图片",
    "画",
    "画图",
    "绘图",
    "生图",
    "出图",
    "作图",
    "生成图片",
    "生成一张图",
    "生成一张图片",
    "画一张",
    "画一幅",
    "画一个",
    "帮我画",
    "帮我画图",
    "image",
    "picture",
    "draw",
    "draw it",
    "generate image",
    "generate an image",
    "make an image",
    "an image",
    "a picture"
  ]);

  if (!userPrompt) {
    return {
      ok: false,
      prompt: "",
      userPrompt: "",
      reply: "嗯……我想画得更接近你心里的样子。可以告诉我，画面里想出现什么吗？"
    };
  }

  const promptCandidate = imageSubject || userPrompt;
  const isVague = vagueTerms.has(userPrompt.toLowerCase())
    || vagueTerms.has(promptCandidate.toLowerCase())
    || isReferentialImagePrompt(promptCandidate);
  const contextText = isVague ? buildImageContext(contextMessages) : "";

  if (isVague && !contextText) {
    return {
      ok: false,
      prompt: "",
      userPrompt: "",
      reply: "嗯……我想画得更接近你心里的样子。可以告诉我，画面里想出现什么吗？"
    };
  }

  const rawPrompt = contextText
    ? [
        "Create an image from the latest user request and the relevant conversation context.",
        `Latest request: ${userPrompt}`,
        "Relevant context:",
        contextText,
        "Resolve pronouns such as this, that, it, above, or just now from the context. Do not render chat UI, captions, watermarks, or system text unless the user explicitly asked for them."
      ].join("\n")
    : promptCandidate;
  const capped = rawPrompt.slice(0, IMAGE_PROMPT_MAX_LENGTH);
  return {
    ok: true,
    prompt: enhanceImagePrompt(capped),
    userPrompt: userPrompt.slice(0, IMAGE_PROMPT_MAX_LENGTH),
    reply: ""
  };
}

function normalizePromptText(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff\ufffd]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripImageCommand(prompt) {
  let text = normalizePromptText(prompt);
  text = text
    .replace(/^(?:请|麻烦你|拜托|可以的话|能不能|可以|帮我|给我|为我|替我|我要|我想要|想要|来)\s*/i, "")
    .replace(/^(?:draw|generate|create|make|paint|render)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration|drawing)?\s*(?:of\s+)?/i, "")
    .replace(/^(?:画出|画一张|画一幅|画一个|画|绘制|绘图|生成一张|生成一个|生成|生图|出图|作图|制作一张|制作|做一张|做)\s*/i, "")
    .replace(/^(?:图片|图像|照片|插画|壁纸|头像|表情包)\s*(?:是|为|：|:)?\s*/i, "")
    .trim();

  return text.replace(/^[，,:：。.\s]+|[，,:：。.\s]+$/g, "").trim();
}

function isReferentialImagePrompt(prompt) {
  const text = normalizePromptText(prompt).toLowerCase();
  if (!text) return true;
  return /^(这个|那个|它|他|她|这张|这幅|这段|上面|前面|之前|刚才|刚刚|上一条|上一个|就这个|就那个|就这样|按这个|按那个|照这个|照那个|按刚才|照刚才|画出来|生成出来|this|that|it|the above|same as above|previous one)$/i.test(text);
}

function buildImageContext(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  return messages
    .slice(-6)
    .map((item) => {
      const role = item?.role === "assistant" ? "Assistant" : item?.role === "user" ? "User" : "";
      const content = normalizePromptText(item?.content || "").slice(0, 360);
      if (!role || !content) return "";
      return `${role}: ${content}`;
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 1200);
}

function enhanceImagePrompt(prompt) {
  if (!/(流萤|firefly|萨姆|sam|星穹|星铁|崩坏|hon kai|honkai|hsr|你|your|you)/i.test(prompt)) {
    return prompt;
  }
  const fireflyCues = [
    "Keep the user's requested scene primary.",
    "If the request refers to 'you' or the current speaker, interpret the subject as Firefly.",
    "If depicting Firefly from Honkai: Star Rail, use official-safe visual cues: silver hair, black hair ornament, blue-and-pink eyes, gentle restrained expression, gray-green dress with dark shawl, or SAM fire armor when explicitly requested.",
    "Mood: quiet, sincere, resilient, with motifs of stars, dreams, fireflies, night wind, and a fragile but determined light.",
    "Avoid unsupported future plot, private relationship escalation, system text, captions, watermarks, and out-of-character elements."
  ].join(" ");
  return `${prompt}\n\n${fireflyCues}`;
}

function getFirstImageCandidate(payload) {
  if (Array.isArray(payload?.data) && payload.data.length > 0) return payload.data[0];
  if (Array.isArray(payload?.images) && payload.images.length > 0) return payload.images[0];
  if (Array.isArray(payload?.result) && payload.result.length > 0) return payload.result[0];
  return payload?.image || payload?.result || payload?.output?.[0] || payload;
}

function extractGeneratedImageData(payload) {
  const first = getFirstImageCandidate(payload);
  const imageUrl =
    (typeof first === "string" && first) ||
    first?.url ||
    first?.image_url ||
    first?.imageUrl ||
    first?.content?.[0]?.image_url ||
    payload?.url ||
    payload?.image_url ||
    payload?.imageUrl ||
    "";
  const base64 =
    first?.b64_json ||
    first?.base64 ||
    first?.image_base64 ||
    first?.content?.[0]?.b64_json ||
    payload?.b64_json ||
    payload?.base64 ||
    payload?.image_base64 ||
    "";
  const mimeType =
    first?.mime_type ||
    first?.mimeType ||
    first?.content_type ||
    payload?.mime_type ||
    payload?.mimeType ||
    "image/png";

  return { url: imageUrl, base64, mimeType };
}

function extractGeneratedImage(payload) {
  const image = extractGeneratedImageData(payload);
  if (image.url) return image.url;
  if (image.base64) return `data:${image.mimeType || "image/png"};base64,${image.base64}`;
  return "";
}

function buildModelsUrl(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Base URL 格式不正确。");
  }
  url.search = "";
  url.hash = "";

  const pathname = url.pathname.replace(/\/+$/, "");
  const lowerPathname = pathname.toLowerCase();
  const endpointSuffixes = ["/chat/completions", "/responses", "/completions"];
  const matchedSuffix = endpointSuffixes.find((suffix) => lowerPathname.endsWith(suffix));

  if (matchedSuffix) {
    const prefix = pathname.slice(0, pathname.length - matchedSuffix.length).replace(/\/+$/, "");
    url.pathname = `${prefix || ""}/models`;
    return url.toString();
  }

  if (!lowerPathname.endsWith("/models")) {
    url.pathname = `${pathname || ""}/models`;
  }

  return url.toString();
}

function extractModelIds(payload) {
  const candidates = [
    payload?.data,
    payload?.models,
    payload?.data?.models
  ];
  const list = candidates.find((item) => Array.isArray(item)) || [];
  const ids = list
    .map((item) => {
      if (typeof item === "string") return item;
      return item?.id || item?.name || item?.model;
    })
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());

  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}

async function fetchModelList(config) {
  const baseUrl = String(config.baseUrl || "").trim();
  const apiKey = String(config.apiKey || "").trim();

  if (!baseUrl) {
    throw new Error("请先配置 Base URL。");
  }

  const modelsUrl = buildModelsUrl(baseUrl);
  const headers = {
    Accept: "application/json"
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const response = await fetch(modelsUrl, {
    method: "GET",
    headers
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const errorText = payload?.error?.message || payload?.message || `获取模型失败：${response.status}`;
    throw new Error(errorText);
  }

  const list = extractModelIds(payload);
  if (list.length === 0) {
    throw new Error("接口已响应，但没有返回可识别的模型列表。");
  }

  return list;
}

module.exports = {
  getChatConfig,
  getImageConfig,
  getSemanticConfig,
  buildChatUrl,
  buildImageUrl,
  callModelApi,
  callImageApi,
  extractAssistantReply,
  getUsageFromPayload,
  buildImagePrompt,
  getImagePrompt,
  normalizeImageSize,
  extractGeneratedImage,
  extractGeneratedImageData,
  buildModelsUrl,
  extractModelIds,
  fetchModelList
};
