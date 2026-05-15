const crypto = require("crypto");
const { CACHE_TTL_MS } = require("./constants");
const { getCachedResponse, setCachedResponse, incrementCacheHits, incrementCacheMisses } = require("./cache");
const { summarizeApiError } = require("./utils");

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
    size: config.imageSize || "1024x1024"
  };
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
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (/\/images\/generations$/i.test(trimmed)) {
    return trimmed;
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

async function callModelApi(config, requestBody, useCache = true) {
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
  const apiResponse = await fetch(chatUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody)
  });

  const text = await apiResponse.text();
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
    size: config.size || "1024x1024"
  };
  const apiResponse = await fetch(imageUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody)
  });

  const text = await apiResponse.text();
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

function shouldGenerateImage(message, config) {
  const imageConfig = getImageConfig(config);
  if (!imageConfig.baseUrl || !imageConfig.model) {
    return false;
  }
  const text = String(message || "").trim();
  if (!text) return false;
  return /(画一张|画张|帮我画|生成(一张)?图|生成图片|生图|出图|做一张图|绘制|画个|画幅|image|draw|generate.*image)/i.test(text);
}

function getImagePrompt(message) {
  return String(message || "")
    .replace(/^(请|帮我|给我|麻烦)?(画一张|画张|画个|画幅|生成一张|生成|生成图片|生图|出图|绘制|做一张图)/i, "")
    .replace(/[，,:：。.\s]+$/g, "")
    .trim() || String(message || "").trim();
}

function extractGeneratedImage(payload) {
  const first = Array.isArray(payload?.data) ? payload.data[0] : payload?.image || payload?.result || payload;
  const imageUrl =
    (typeof first === "string" && first) ||
    first?.url ||
    first?.image_url ||
    payload?.url ||
    payload?.image_url ||
    "";
  const b64 = first?.b64_json || first?.base64 || payload?.b64_json || payload?.base64 || "";
  if (imageUrl) {
    return imageUrl;
  }
  if (b64) {
    return `data:image/png;base64,${b64}`;
  }
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
  buildChatUrl,
  buildImageUrl,
  callModelApi,
  callImageApi,
  extractAssistantReply,
  getUsageFromPayload,
  shouldGenerateImage,
  getImagePrompt,
  extractGeneratedImage,
  buildModelsUrl,
  extractModelIds,
  fetchModelList
};
