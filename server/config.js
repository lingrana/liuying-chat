const fs = require("fs");
const { CONFIG_PATH, DATA_DIR, USERS_DIR, SONGS_DIR, GENERATED_IMAGES_DIR, SONGS_INDEX_PATH, TOKEN_USAGE_PATH, IMAGE_DAILY_USAGE_PATH } = require("./constants");
const { encryptSecret, decryptSecret, hashPassword } = require("./crypto");
const { writeFileAtomic, writeJsonAtomic } = require("./file-store");
const { normalizeImageDailyLimit } = require("./image-limit");
const { createDefaultCharacters, normalizeCharacterId, normalizeCharacters, resolveCharacter } = require("./characters");

function createDefaultConfig() {
  const adminPassword = String(process.env.ADMIN_PASSWORD || "").trim();
  const assistantAvatarPath = "public/ly.png";
  const systemPrompt = "你是流萤。请用自然、克制、亲近的语气和用户对话。";
  return {
    siteName: "多角色聊天",
    siteSubtitle: "选择一个角色开始对话",
    assistantAvatarPath,
    userAvatarPath: "public/ly.png",
    defaultCharacterId: "firefly",
    characters: createDefaultCharacters({ assistantAvatarPath, systemPrompt }),
    chatBaseUrl: "",
    chatModel: "",
    chatAvailableModels: [],
    imageBaseUrl: "",
    imageModel: "",
    imageAvailableModels: [],
    imageSize: "1024x1024",
    imageDailyLimit: 50,
    semanticBaseUrl: "",
    semanticModel: "",
    semanticAvailableModels: [],
    temperature: 0.8,
    maxTokens: 800,
    systemPrompt,
    announcementEnabled: false,
    announcementTitle: "公告",
    announcementHtml: "",
    cacheMaxSize: 500,
    adminPasswordHash: adminPassword ? hashPassword(adminPassword) : ""
  };
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    writeJsonAtomic(CONFIG_PATH, createDefaultConfig());
  }
  if (!fs.existsSync(USERS_DIR)) {
    fs.mkdirSync(USERS_DIR, { recursive: true });
  }
  if (!fs.existsSync(SONGS_DIR)) {
    fs.mkdirSync(SONGS_DIR, { recursive: true });
  }
  if (!fs.existsSync(GENERATED_IMAGES_DIR)) {
    fs.mkdirSync(GENERATED_IMAGES_DIR, { recursive: true });
  }
  if (!fs.existsSync(SONGS_INDEX_PATH)) {
    writeFileAtomic(SONGS_INDEX_PATH, "[]", "utf8");
  }
  if (!fs.existsSync(TOKEN_USAGE_PATH)) {
    writeFileAtomic(TOKEN_USAGE_PATH, "[]", "utf8");
  }
  if (!fs.existsSync(IMAGE_DAILY_USAGE_PATH)) {
    writeJsonAtomic(IMAGE_DAILY_USAGE_PATH, { date: "", count: 0 });
  }
}

function normalizeConfig(config) {
  const nextConfig = { ...config };

  if (typeof nextConfig.apiKey === "string" && nextConfig.apiKey.trim()) {
    nextConfig.apiKeyEncrypted = encryptSecret(nextConfig.apiKey.trim());
    delete nextConfig.apiKey;
    saveConfig(nextConfig);
  }

  try {
    nextConfig.apiKey = nextConfig.apiKeyEncrypted ? decryptSecret(nextConfig.apiKeyEncrypted) : "";
  } catch {
    nextConfig.apiKey = "";
    nextConfig.apiKeyEncrypted = null;
  }

  try {
    nextConfig.chatApiKey = nextConfig.chatApiKeyEncrypted
      ? decryptSecret(nextConfig.chatApiKeyEncrypted)
      : nextConfig.apiKey || "";
  } catch {
    nextConfig.chatApiKey = nextConfig.apiKey || "";
    nextConfig.chatApiKeyEncrypted = null;
  }

  try {
    nextConfig.imageApiKey = nextConfig.imageApiKeyEncrypted
      ? decryptSecret(nextConfig.imageApiKeyEncrypted)
      : "";
  } catch {
    nextConfig.imageApiKey = "";
    nextConfig.imageApiKeyEncrypted = null;
  }

  try {
    nextConfig.semanticApiKey = nextConfig.semanticApiKeyEncrypted
      ? decryptSecret(nextConfig.semanticApiKeyEncrypted)
      : nextConfig.chatApiKey || nextConfig.apiKey || "";
  } catch {
    nextConfig.semanticApiKey = nextConfig.chatApiKey || nextConfig.apiKey || "";
    nextConfig.semanticApiKeyEncrypted = null;
  }

  nextConfig.chatBaseUrl = nextConfig.chatBaseUrl || nextConfig.baseUrl || "";
  nextConfig.chatModel = nextConfig.chatModel || nextConfig.model || "";
  nextConfig.semanticBaseUrl = nextConfig.semanticBaseUrl || nextConfig.chatBaseUrl || nextConfig.baseUrl || "";
  nextConfig.semanticModel = nextConfig.semanticModel || nextConfig.chatModel || nextConfig.model || "";
  nextConfig.chatAvailableModels = Array.isArray(nextConfig.chatAvailableModels)
    ? nextConfig.chatAvailableModels
    : Array.isArray(nextConfig.availableModels) ? nextConfig.availableModels : [];
  nextConfig.imageAvailableModels = Array.isArray(nextConfig.imageAvailableModels)
    ? nextConfig.imageAvailableModels
    : [];
  nextConfig.semanticAvailableModels = Array.isArray(nextConfig.semanticAvailableModels)
    ? nextConfig.semanticAvailableModels
    : [];
  nextConfig.announcementEnabled = Boolean(nextConfig.announcementEnabled);
  nextConfig.announcementTitle = typeof nextConfig.announcementTitle === "string" && nextConfig.announcementTitle.trim()
    ? nextConfig.announcementTitle.trim()
    : "公告";
  nextConfig.announcementHtml = typeof nextConfig.announcementHtml === "string" ? nextConfig.announcementHtml : "";
  nextConfig.cacheMaxSize = Number(nextConfig.cacheMaxSize) || 500;
  nextConfig.imageDailyLimit = normalizeImageDailyLimit(nextConfig.imageDailyLimit);
  nextConfig.characters = normalizeCharacters(nextConfig.characters, nextConfig);
  nextConfig.defaultCharacterId = resolveCharacter({
    ...nextConfig,
    defaultCharacterId: normalizeCharacterId(nextConfig.defaultCharacterId)
  }).id;
  return nextConfig;
}

function loadConfig() {
  ensureDataFiles();
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const config = JSON.parse(raw);
  const normalized = normalizeConfig(config);
  return normalized;
}

function saveConfig(config) {
  writeJsonAtomic(CONFIG_PATH, config);
}

function stripPlainSecrets(config) {
  const storedConfig = { ...config };
  delete storedConfig.apiKey;
  delete storedConfig.chatApiKey;
  delete storedConfig.imageApiKey;
  delete storedConfig.semanticApiKey;
  return storedConfig;
}

function sanitizeAdminConfig(config) {
  const {
    apiKey,
    apiKeyEncrypted,
    chatApiKey,
    chatApiKeyEncrypted,
    imageApiKey,
    imageApiKeyEncrypted,
    semanticApiKey,
    semanticApiKeyEncrypted,
    adminPasswordHash,
    ...rest
  } = config;
  return {
    ...rest,
    apiKeyConfigured: Boolean(chatApiKey || apiKey),
    chatApiKeyConfigured: Boolean(chatApiKey || apiKey),
    imageApiKeyConfigured: Boolean(imageApiKey),
    semanticApiKeyConfigured: Boolean(semanticApiKey || chatApiKey || apiKey),
    apiKey: "",
    chatApiKey: "",
    imageApiKey: "",
    adminPasswordSet: Boolean(adminPasswordHash)
  };
}

module.exports = {
  ensureDataFiles,
  loadConfig,
  saveConfig,
  stripPlainSecrets,
  sanitizeAdminConfig,
  normalizeConfig,
  createDefaultConfig
};
