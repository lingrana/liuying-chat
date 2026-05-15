const fs = require("fs");
const { CONFIG_PATH, DATA_DIR, USERS_DIR, SONGS_DIR, SONGS_INDEX_PATH, TOKEN_USAGE_PATH } = require("./constants");
const { encryptSecret, decryptSecret } = require("./crypto");

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error("Missing data/config.json");
  }
  if (!fs.existsSync(USERS_DIR)) {
    fs.mkdirSync(USERS_DIR, { recursive: true });
  }
  if (!fs.existsSync(SONGS_DIR)) {
    fs.mkdirSync(SONGS_DIR, { recursive: true });
  }
  if (!fs.existsSync(SONGS_INDEX_PATH)) {
    fs.writeFileSync(SONGS_INDEX_PATH, "[]", "utf8");
  }
  if (!fs.existsSync(TOKEN_USAGE_PATH)) {
    fs.writeFileSync(TOKEN_USAGE_PATH, "[]", "utf8");
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

  nextConfig.chatBaseUrl = nextConfig.chatBaseUrl || nextConfig.baseUrl || "";
  nextConfig.chatModel = nextConfig.chatModel || nextConfig.model || "";
  nextConfig.chatAvailableModels = Array.isArray(nextConfig.chatAvailableModels)
    ? nextConfig.chatAvailableModels
    : Array.isArray(nextConfig.availableModels) ? nextConfig.availableModels : [];
  nextConfig.imageAvailableModels = Array.isArray(nextConfig.imageAvailableModels)
    ? nextConfig.imageAvailableModels
    : [];
  nextConfig.cacheMaxSize = Number(nextConfig.cacheMaxSize) || 500;
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
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function stripPlainSecrets(config) {
  const storedConfig = { ...config };
  delete storedConfig.apiKey;
  delete storedConfig.chatApiKey;
  delete storedConfig.imageApiKey;
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
    adminPasswordHash,
    ...rest
  } = config;
  return {
    ...rest,
    apiKeyConfigured: Boolean(chatApiKey || apiKey),
    chatApiKeyConfigured: Boolean(chatApiKey || apiKey),
    imageApiKeyConfigured: Boolean(imageApiKey),
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
  normalizeConfig
};
