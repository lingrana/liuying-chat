const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT ? Number(process.env.PORT) : 3200;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const USERS_DIR = path.join(DATA_DIR, "users");
const SONGS_DIR = path.join(DATA_DIR, "songs");
const SONGS_INDEX_PATH = path.join(SONGS_DIR, "songs.json");
const TOKEN_USAGE_PATH = path.join(DATA_DIR, "token-usage.json");
const VISITOR_TTL_MS = 45 * 1000;
const CHAT_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_ASSISTANT_AVATAR = path.join(DATA_DIR, "lingran.png");
const DEFAULT_USER_AVATAR = path.join(DATA_DIR, "lingran.png");
const DEFAULT_MAX_HISTORY_MESSAGES = 20;
const CHAT_TIME_ZONE = "Asia/Shanghai";
const SECRET_SEED = process.env.CONFIG_SECRET || ROOT;
const CONFIG_SECRET = crypto
  .createHash("sha256")
  .update(`${SECRET_SEED}|firefly-chat|config-secret`)
  .digest();
const ADMIN_TOKEN_SECRET = crypto
  .createHash("sha256")
  .update(`${SECRET_SEED}|firefly-chat|admin-token-secret`)
  .digest();
const ADMIN_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".txt": "text/plain; charset=utf-8"
};

const visitors = new Map();
let totalVisits = 0;
let apiConnectionStatus = { ok: false, message: "未测试", testedAt: 0 };
let tokenUsageEvents = [];
const imageGenerationLimits = new Map();
const IMAGE_GENERATION_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_JSON_BODY_BYTES = 30 * 1024 * 1024;

const apiResponseCache = new Map();
let CACHE_MAX_SIZE = 500;
const CACHE_TTL_MS = 60 * 60 * 1000;
let cacheHits = 0;
let cacheMisses = 0;

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

function loadConfig() {
  ensureDataFiles();
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const config = JSON.parse(raw);
  const normalized = normalizeConfig(config);
  CACHE_MAX_SIZE = normalized.cacheMaxSize || 500;
  return normalized;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", CONFIG_SECRET, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    value: encrypted.toString("base64")
  };
}

function decryptSecret(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const iv = Buffer.from(String(payload.iv || ""), "base64");
  const tag = Buffer.from(String(payload.tag || ""), "base64");
  const value = Buffer.from(String(payload.value || ""), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", CONFIG_SECRET, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(value), decipher.final()]);
  return decrypted.toString("utf8");
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

function getUserFilePath(userKey) {
  return path.join(USERS_DIR, `${userKey}.json`);
}

function getUserAvatarFilePath(userKey, extension = ".png") {
  return path.join(USERS_DIR, `${userKey}-avatar${extension}`);
}

function normalizePersistentUserStore(userStore) {
  if (!userStore || typeof userStore !== "object") {
    return null;
  }
  return {
    persistent: userStore.persistent !== false,
    sessionId: typeof userStore.sessionId === "string" ? userStore.sessionId : "",
    ip: typeof userStore.ip === "string" ? userStore.ip : "",
    createdAt: Number.isFinite(userStore.createdAt) ? userStore.createdAt : Date.now(),
    updatedAt: Number.isFinite(userStore.updatedAt) ? userStore.updatedAt : Date.now(),
    userAvatarPath: typeof userStore.userAvatarPath === "string" ? userStore.userAvatarPath : "",
    conversations: Array.isArray(userStore.conversations) ? userStore.conversations : []
  };
}

function normalizeConversationMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }
  return {
    id: typeof message.id === "string" && message.id.trim() ? message.id.trim() : crypto.randomUUID(),
    role: typeof message.role === "string" && message.role.trim() ? message.role.trim() : "assistant",
    content: typeof message.content === "string" ? message.content : "",
    createdAt: Number.isFinite(message.createdAt) ? message.createdAt : Date.now(),
    kind: typeof message.kind === "string" ? message.kind : undefined,
    imageUrl: typeof message.imageUrl === "string" ? message.imageUrl : undefined,
    imagePrompt: typeof message.imagePrompt === "string" ? message.imagePrompt : undefined,
    songUrl: typeof message.songUrl === "string" ? message.songUrl : undefined,
    songTitle: typeof message.songTitle === "string" ? message.songTitle : undefined,
    songArtist: typeof message.songArtist === "string" ? message.songArtist : undefined
  };
}

function normalizeConversationRecord(conversation) {
  if (!conversation || typeof conversation !== "object") {
    return null;
  }
  const messages = Array.isArray(conversation.messages)
    ? conversation.messages.map(normalizeConversationMessage).filter(Boolean)
    : [];
  const updatedAt = Number.isFinite(conversation.updatedAt)
    ? conversation.updatedAt
    : (messages[messages.length - 1]?.createdAt || Date.now());
  return {
    id: typeof conversation.id === "string" && conversation.id.trim() ? conversation.id.trim() : crypto.randomUUID(),
    title: typeof conversation.title === "string" && conversation.title.trim() ? conversation.title.trim() : "新对话",
    createdAt: Number.isFinite(conversation.createdAt) ? conversation.createdAt : updatedAt,
    updatedAt,
    messages
  };
}

function loadPersistentUserStore(userKey) {
  ensureDataFiles();
  const filePath = getUserFilePath(userKey);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const normalized = normalizePersistentUserStore(parsed);
    if (!normalized) return null;
    normalized.conversations = normalized.conversations.map(normalizeConversationRecord).filter(Boolean);
    return normalized;
  } catch {
    return null;
  }
}

function savePersistentUserStore(userKey, userStore) {
  const normalized = normalizePersistentUserStore(userStore);
  if (!normalized) {
    return;
  }
  normalized.conversations = normalized.conversations.map(normalizeConversationRecord).filter(Boolean);
  fs.writeFileSync(
    getUserFilePath(userKey),
    JSON.stringify(normalized, null, 2),
    "utf8"
  );
}

function normalizeTokenUsageEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  return {
    id: typeof event.id === "string" && event.id.trim() ? event.id.trim() : crypto.randomUUID(),
    createdAt: Number.isFinite(event.createdAt) ? event.createdAt : Date.now(),
    type: event.type === "image" ? "image" : "chat",
    ip: typeof event.ip === "string" && event.ip.trim() ? event.ip.trim() : "unknown",
    sessionId: typeof event.sessionId === "string" ? event.sessionId : "",
    promptTokens: Math.max(0, Number(event.promptTokens) || 0),
    completionTokens: Math.max(0, Number(event.completionTokens) || 0),
    totalTokens: Math.max(0, Number(event.totalTokens) || 0)
  };
}

function loadTokenUsageEvents() {
  ensureDataFiles();
  try {
    const parsed = JSON.parse(fs.readFileSync(TOKEN_USAGE_PATH, "utf8"));
    tokenUsageEvents = Array.isArray(parsed) ? parsed.map(normalizeTokenUsageEvent).filter(Boolean) : [];
  } catch {
    tokenUsageEvents = [];
  }
}

function saveTokenUsageEvents() {
  const cutoff = Date.now() - CHAT_RETENTION_MS;
  tokenUsageEvents = tokenUsageEvents
    .map(normalizeTokenUsageEvent)
    .filter((event) => event && event.createdAt >= cutoff);
  fs.writeFileSync(TOKEN_USAGE_PATH, JSON.stringify(tokenUsageEvents, null, 2), "utf8");
}

function deletePersistentUserStore(userKey) {
  const filePath = getUserFilePath(userKey);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  const avatarCandidates = fs.existsSync(USERS_DIR)
    ? fs.readdirSync(USERS_DIR).filter((name) => name.startsWith(`${userKey}-avatar.`))
    : [];
  for (const avatarFile of avatarCandidates) {
    fs.unlinkSync(path.join(USERS_DIR, avatarFile));
  }
}

function listPersistentUserStores() {
  ensureDataFiles();
  if (!fs.existsSync(USERS_DIR)) {
    return [];
  }
  return fs.readdirSync(USERS_DIR)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      const userKey = fileName.slice(0, -5);
      const userStore = loadPersistentUserStore(userKey);
      return userStore ? { userKey, userStore } : null;
    })
    .filter(Boolean);
}

function findPersistentUserStoreBySessionId(sessionId) {
  const target = String(sessionId || "").trim();
  if (!target) return null;
  return listPersistentUserStores().find((entry) => entry.userStore.sessionId === target) || null;
}

function loadSongs() {
  ensureDataFiles();
  try {
    const parsed = JSON.parse(fs.readFileSync(SONGS_INDEX_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed.filter((song) => song && song.id && song.fileName) : [];
  } catch {
    return [];
  }
}

function saveSongs(songs) {
  ensureDataFiles();
  fs.writeFileSync(SONGS_INDEX_PATH, JSON.stringify(songs, null, 2), "utf8");
}

function sanitizeSong(song) {
  return {
    id: song.id,
    title: song.title,
    artist: "AI流萤翻唱",
    fileName: song.originalName || song.fileName,
    mimeType: song.mimeType || "audio/mpeg",
    size: song.size || 0,
    createdAt: song.createdAt || 0
  };
}

function getSongFilePath(song) {
  const fileName = path.basename(String(song.fileName || ""));
  return path.join(SONGS_DIR, fileName);
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[《》「」『』"'“”‘’.,，。!！?？:：;；、\s_-]+/g, "");
}

function findRequestedSong(message) {
  const songs = loadSongs();
  if (songs.length === 0) return null;
  const text = String(message || "").trim();
  const normalizedText = normalizeSearchText(text);
  const wantsSong = /歌|歌曲|音乐|播放|听|唱|来一首|放一首|输出/.test(text);
  if (!wantsSong) return null;

  return songs.find((song) => {
    const title = normalizeSearchText(song.title);
    const original = normalizeSearchText(song.originalName);
    return title && (normalizedText.includes(title) || (original && normalizedText.includes(original)));
  }) || null;
}

function buildSongsPromptContext() {
  const songs = loadSongs().map(sanitizeSong);
  if (songs.length === 0) {
    return [
      "# 歌曲输出规则",
      "你现在没有保存任何自己的 AI 翻唱。不能声称可以播放、输出或提供歌曲；如果用户想听歌，只能自然说明现在还没有准备好。"
    ].join("\n");
  }

  const names = songs.map((song) => `《${song.title}》`).join("、");
  return [
    "# 歌曲输出规则",
    `你只保存了这些自己的 AI 翻唱：${names}。`,
    "当用户自然提到想听其中某首歌时，可以像把歌发给开拓者一样自然回应。不要说“后台曲库”“功能”“音频文件”等生硬表述。",
    "不能编造未保存的歌曲、外部链接或未上传歌曲；没有保存的歌只能自然说明现在还唱不了那一首。"
  ].join("\n");
}

function buildHumanChatStyleContext() {
  return [
    "# 对话节奏",
    "回复要像真人短信聊天，不要一次发很长一大段。",
    "默认用 1 到 3 句短句回答；需要表达较多内容时，拆成 2 到 4 个很短的自然段，每段只说一个意思。",
    "除非用户明确要求详细解释、整理资料、写长文或列清单，否则不要长篇说明，也不要把设定、背景和规则一次性倒出来。",
    "语气保持自然、轻柔、克制，可以留一点停顿感。"
  ].join("\n");
}

function inferExtensionFromMime(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("png")) return ".png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return ".jpg";
  if (normalized.includes("webp")) return ".webp";
  if (normalized.includes("gif")) return ".gif";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return ".mp3";
  if (normalized.includes("wav")) return ".wav";
  if (normalized.includes("ogg")) return ".ogg";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return ".m4a";
  if (normalized.includes("flac")) return ".flac";
  if (normalized.includes("aac")) return ".aac";
  return ".png";
}

function saveUserAvatarFromDataUrl(userKey, dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    throw new Error("头像文件格式不正确，仅支持常见图片。");
  }
  const mimeType = match[1];
  const base64 = match[2];
  const extension = inferExtensionFromMime(mimeType);
  const filePath = getUserAvatarFilePath(userKey, extension);
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error("头像文件不能超过 2MB。");
  }

  const existingFiles = fs.existsSync(USERS_DIR)
    ? fs.readdirSync(USERS_DIR).filter((name) => name.startsWith(`${userKey}-avatar.`))
    : [];
  for (const oldFile of existingFiles) {
    const oldPath = path.join(USERS_DIR, oldFile);
    if (oldPath !== filePath && fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }

  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function generateAdminToken(password) {
  const config = loadConfig();
  const expectedHash = config.adminPasswordHash;
  if (!expectedHash) {
    return null;
  }
  const inputHash = hashPassword(password);
  if (inputHash !== expectedHash) {
    return null;
  }
  const expiresAt = Date.now() + ADMIN_TOKEN_TTL_MS;
  const payload = `${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", ADMIN_TOKEN_SECRET)
    .update(payload)
    .digest("hex");
  return `${expiresAt}.${signature}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expiresAtStr, signature] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expectedSig = crypto
    .createHmac("sha256", ADMIN_TOKEN_SECRET)
    .update(expiresAtStr)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSig, "hex")
  );
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

function getSessionUserKey(sessionId) {
  return hashPassword(`session:${String(sessionId || "").trim()}`);
}

function getIpUserKey(ip) {
  return hashPassword(`ip:${String(ip || "unknown").trim()}`);
}

function createConversation({ title = "新对话", now = Date.now() } = {}) {
  return normalizeConversationRecord({
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: []
  });
}

function sanitizeConversation(conversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: Array.isArray(conversation.messages) ? conversation.messages.length : 0
  };
}

function createUserStore({ persistent = true, sessionId, ip = "" } = {}) {
  const now = Date.now();
  return {
    persistent,
    sessionId: sessionId || "",
    ip,
    createdAt: now,
    updatedAt: now,
    userAvatarPath: "",
    conversations: [createConversation({ now })]
  };
}

function cleanupExpiredPersistentUsers() {
  const now = Date.now();
  if (!fs.existsSync(USERS_DIR)) {
    return;
  }

  for (const fileName of fs.readdirSync(USERS_DIR)) {
    if (!fileName.endsWith(".json")) continue;
    const userKey = fileName.slice(0, -5);
    const userStore = loadPersistentUserStore(userKey);
    if (!userStore) {
      deletePersistentUserStore(userKey);
      continue;
    }
    const conversations = Array.isArray(userStore.conversations)
      ? userStore.conversations
          .filter((conversation) => now - (conversation.updatedAt || 0) <= CHAT_RETENTION_MS)
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      : [];
    if (conversations.length === 0) {
      deletePersistentUserStore(userKey);
      continue;
    }
    userStore.conversations = conversations;
    userStore.updatedAt = conversations[0].updatedAt;
    savePersistentUserStore(userKey, userStore);
  }
}

function getOrCreateUserStore({ sessionId, ip = "" }) {
  const now = Date.now();
  
  // 优先使用IP来识别用户
  let key;
  let sessionKey;
  
  if (ip) {
    key = getIpUserKey(ip);
    sessionKey = `ip-${ip}`;
  } else {
    sessionKey = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : crypto.randomUUID();
    key = getSessionUserKey(sessionKey);
  }
  
  let userStore = loadPersistentUserStore(key);
  if (!userStore) {
    userStore = createUserStore({ persistent: true, sessionId: sessionKey, ip });
    savePersistentUserStore(key, userStore);
  }
  userStore.updatedAt = now;
  userStore.sessionId = userStore.sessionId || sessionKey;
  if (ip) {
    userStore.ip = ip;
  }
  if (!Array.isArray(userStore.conversations) || userStore.conversations.length === 0) {
    userStore.conversations = [createConversation({ now })];
  }
  return {
    key,
    sessionId: sessionKey,
    userStore,
    persistent: true,
    save() {
      savePersistentUserStore(key, userStore);
    }
  };
}

function ensureConversation(userStore, conversationId) {
  if (!Array.isArray(userStore.conversations) || userStore.conversations.length === 0) {
    userStore.conversations = [createConversation()];
  }

  let conversation = userStore.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    conversation = userStore.conversations[0];
  }
  return conversation;
}

function deriveConversationTitle(message) {
  const base = String(message || "").trim();
  if (!base) return "新对话";
  return base.length > 18 ? `${base.slice(0, 18)}…` : base;
}

function appendConversationMessage(conversation, role, content, createdAt = Date.now(), extra = {}) {
  if (!Array.isArray(conversation.messages)) {
    conversation.messages = [];
  }
  conversation.messages.push(normalizeConversationMessage({ role, content, createdAt, ...extra }));
  conversation.messages = conversation.messages.slice(-DEFAULT_MAX_HISTORY_MESSAGES);
  if (!conversation.title || conversation.title === "新对话") {
    conversation.title = deriveConversationTitle(content);
  }
  conversation.updatedAt = createdAt;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_JSON_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(message);
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function cleanupVisitors() {
  const now = Date.now();
  for (const [sessionId, visitor] of visitors.entries()) {
    if (now - visitor.lastSeen > VISITOR_TTL_MS) {
      visitors.delete(sessionId);
    }
  }
}

function getVisitorSnapshot() {
  cleanupVisitors();
  const list = [...visitors.values()]
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .map((item) => ({
      sessionId: item.sessionId,
      page: item.page,
      startedAt: item.startedAt,
      lastSeen: item.lastSeen,
      ip: item.ip,
      userAgent: item.userAgent
    }));

  return {
    onlineCount: list.length,
    totalVisits,
    visitors: list
  };
}

function recordTokenUsage({ promptTokens, completionTokens, totalTokens, ip = "unknown", sessionId = "" }) {
  tokenUsageEvents.push(normalizeTokenUsageEvent({
    createdAt: Date.now(),
    type: "chat",
    ip,
    sessionId,
    promptTokens,
    completionTokens,
    totalTokens
  }));
  saveTokenUsageEvents();
}

function recordUsageEvent({ type, promptTokens = 0, completionTokens = 0, totalTokens = 0, ip = "unknown", sessionId = "" }) {
  tokenUsageEvents.push(normalizeTokenUsageEvent({
    createdAt: Date.now(),
    type,
    ip,
    sessionId,
    promptTokens,
    completionTokens,
    totalTokens
  }));
  saveTokenUsageEvents();
}

function getTokenStats(range = "all") {
  const normalizedRange = ["1d", "7d", "all"].includes(range) ? range : "all";
  const now = Date.now();
  const windows = {
    "1d": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000
  };
  const windowMs = windows[normalizedRange];
  const from = windowMs ? now - windowMs : 0;
  const events = tokenUsageEvents.filter((event) => event.createdAt >= from);

  const createEmpty = () => ({ totalPrompt: 0, totalCompletion: 0, totalTokens: 0, requests: 0 });
  const stats = { range: normalizedRange, chat: createEmpty(), image: createEmpty(), total: createEmpty() };

  for (const event of events) {
    const bucket = event.type === "image" ? stats.image : stats.chat;
    bucket.totalPrompt += event.promptTokens;
    bucket.totalCompletion += event.completionTokens;
    bucket.totalTokens += event.totalTokens;
    bucket.requests += 1;
    stats.total.totalPrompt += event.promptTokens;
    stats.total.totalCompletion += event.completionTokens;
    stats.total.totalTokens += event.totalTokens;
    stats.total.requests += 1;
  }

  return {
    ...stats.total,
    ...stats
  };
}

function getAdminConversationAudit() {
  cleanupExpiredPersistentUsers();
  const now = Date.now();
  const byIp = new Map();
  const createBucket = (ip) => ({
    ip,
    totalPrompt: 0,
    totalCompletion: 0,
    totalTokens: 0,
    requests: 0,
    tokenEvents: [],
    sessions: [],
    conversations: []
  });

  for (const event of tokenUsageEvents) {
    if (now - (event.createdAt || 0) > CHAT_RETENTION_MS || event.type !== "chat") {
      continue;
    }
    const ip = event.ip || "unknown";
    if (!byIp.has(ip)) {
      byIp.set(ip, createBucket(ip));
    }
    const bucket = byIp.get(ip);
    bucket.totalPrompt += Number(event.promptTokens) || 0;
    bucket.totalCompletion += Number(event.completionTokens) || 0;
    bucket.totalTokens += Number(event.totalTokens) || 0;
    bucket.requests += 1;
    bucket.tokenEvents.push({
      id: event.id,
      type: event.type,
      ip: event.ip,
      sessionId: event.sessionId || "",
      promptTokens: Number(event.promptTokens) || 0,
      completionTokens: Number(event.completionTokens) || 0,
      totalTokens: Number(event.totalTokens) || 0,
      createdAt: event.createdAt || 0
    });
  }

  for (const { userKey, userStore } of listPersistentUserStores()) {
    const conversations = Array.isArray(userStore.conversations)
      ? userStore.conversations.filter((conversation) => now - (conversation.updatedAt || 0) <= CHAT_RETENTION_MS)
      : [];
    if (conversations.length === 0) continue;
    const ip = userStore.ip || "unknown";
    if (!byIp.has(ip)) {
      byIp.set(ip, createBucket(ip));
    }
    const bucket = byIp.get(ip);
    const sessionRecord = {
      userKey,
      sessionId: userStore.sessionId || "",
      ip,
      createdAt: userStore.createdAt || 0,
      updatedAt: userStore.updatedAt || 0,
      conversationCount: conversations.length,
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title || "新对话",
        createdAt: conversation.createdAt || 0,
        updatedAt: conversation.updatedAt || 0,
        messageCount: Array.isArray(conversation.messages) ? conversation.messages.length : 0,
        messages: Array.isArray(conversation.messages)
          ? conversation.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              createdAt: message.createdAt,
              kind: message.kind,
              imageUrl: message.imageUrl,
              imagePrompt: message.imagePrompt,
              songUrl: message.songUrl,
              songTitle: message.songTitle,
              songArtist: message.songArtist
            }))
          : []
      }))
    };
    bucket.sessions.push(sessionRecord);
    bucket.conversations.push(...sessionRecord.conversations.map((conversation) => ({
      ...conversation,
      userKey,
      sessionId: userStore.sessionId || ""
    })));
  }

  return {
    retentionDays: Math.round(CHAT_RETENTION_MS / (24 * 60 * 60 * 1000)),
    items: [...byIp.values()]
      .map((item) => ({
        ...item,
        tokenEvents: item.tokenEvents.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
        sessions: item.sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
        conversations: item.conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      }))
      .sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0))
  };
}

function sanitizeAdminMessage(message) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    kind: message.kind,
    imageUrl: message.imageUrl,
    imagePrompt: message.imagePrompt,
    songUrl: message.songUrl,
    songTitle: message.songTitle,
    songArtist: message.songArtist
  };
}

function sanitizeAdminConversation(conversation, userKey = "", sessionId = "") {
  return {
    id: conversation.id,
    userKey,
    sessionId,
    title: conversation.title || "新对话",
    createdAt: conversation.createdAt || 0,
    updatedAt: conversation.updatedAt || 0,
    messageCount: Array.isArray(conversation.messages) ? conversation.messages.length : 0,
    messages: Array.isArray(conversation.messages) ? conversation.messages.map(sanitizeAdminMessage) : []
  };
}

function resolveAdminUserStore(body = {}) {
  const userKey = typeof body.userKey === "string" ? body.userKey.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const ip = typeof body.ip === "string" ? body.ip.trim() : "";

  if (userKey) {
    const userStore = loadPersistentUserStore(userKey);
    if (!userStore) {
      return { error: "用户会话不存在。" };
    }
    if (ip) userStore.ip = ip;
    return { userKey, sessionId: userStore.sessionId || sessionId, userStore };
  }

  if (sessionId) {
    const existing = findPersistentUserStoreBySessionId(sessionId);
    if (existing) {
      if (ip) existing.userStore.ip = ip;
      return { userKey: existing.userKey, sessionId, userStore: existing.userStore };
    }
    const created = getOrCreateUserStore({ sessionId, ip });
    return { userKey: created.key, sessionId: created.sessionId, userStore: created.userStore };
  }

  const created = getOrCreateUserStore({ sessionId: crypto.randomUUID(), ip });
  return { userKey: created.key, sessionId: created.sessionId, userStore: created.userStore };
}

function findConversationForAdmin(userStore, conversationId) {
  const id = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!id) return null;
  return Array.isArray(userStore.conversations)
    ? userStore.conversations.find((conversation) => conversation.id === id) || null
    : null;
}

function findMessageForAdmin(conversation, messageId) {
  const id = typeof messageId === "string" ? messageId.trim() : "";
  if (!id || !Array.isArray(conversation.messages)) return null;
  return conversation.messages.find((message) => message.id === id) || null;
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
  for (const event of tokenUsageEvents) {
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
  tokenUsageEvents = tokenUsageEvents.filter((event) => (event.ip || "unknown") !== ip);
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
    id: crypto.randomUUID(),
    createdAt: Number.isFinite(Number(body.createdAt)) ? Number(body.createdAt) : Date.now(),
    type: body.type === "image" ? "image" : "chat",
    ip: typeof body.ip === "string" && body.ip.trim() ? body.ip.trim() : "unknown",
    sessionId: typeof body.sessionId === "string" ? body.sessionId.trim() : "",
    promptTokens: body.promptTokens,
    completionTokens: body.completionTokens,
    totalTokens: body.totalTokens
  });
  tokenUsageEvents.push(event);
  saveTokenUsageEvents();
  sendJson(res, 200, { ok: true, event, audit: getAdminConversationAudit() });
}

async function handleAdminTokenEventUpdate(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const event = tokenUsageEvents.find((item) => item.id === eventId);
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
  const nextEvents = tokenUsageEvents.filter((item) => item.id !== eventId);
  if (nextEvents.length === tokenUsageEvents.length) {
    sendJson(res, 404, { error: "消耗记录不存在。" });
    return;
  }
  tokenUsageEvents = nextEvents;
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
    id: crypto.randomUUID(),
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

function getUsageFromPayload(payload) {
  const usage = payload?.usage || {};
  const promptTokens = Number(usage.prompt_tokens || usage.input_tokens) || 0;
  const completionTokens = Number(usage.completion_tokens || usage.output_tokens) || 0;
  const totalTokens = Number(usage.total_tokens) || (promptTokens + completionTokens);
  return { promptTokens, completionTokens, totalTokens };
}

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

function getCurrentChatTimeContext() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: CHAT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  })
    .formatToParts(now)
    .reduce((result, part) => {
      if (part.type !== "literal") {
        result[part.type] = part.value;
      }
      return result;
    }, {});

  const hour = Number(parts.hour);
  let period = "白天";
  if (hour >= 5 && hour < 9) {
    period = "清晨";
  } else if (hour >= 9 && hour < 12) {
    period = "上午";
  } else if (hour >= 12 && hour < 14) {
    period = "中午";
  } else if (hour >= 14 && hour < 18) {
    period = "下午";
  } else if (hour >= 18 && hour < 22) {
    period = "晚上";
  } else {
    period = "深夜";
  }

  return [
    "# 当前真实时间",
    `当前时间为北京时间（${CHAT_TIME_ZONE}）${parts.year}年${parts.month}月${parts.day}日 ${parts.weekday} ${parts.hour}:${parts.minute}，现在是${period}。`,
    "对话时必须以这个时间为准，不能说出与当前日期、星期、时段或昼夜相矛盾的话。",
    "如果提到今天、明天、昨晚、清晨、下午、夜晚、星空、睡觉、起床、用餐等时间相关内容，必须先核对当前时间再回答。",
    "除非用户明确要求虚构、回忆或角色剧情时间，否则不要把当前时间说成其他日期或时段。"
  ].join("\n");
}

function buildSystemPrompt(config) {
  return [
    config.systemPrompt || "",
    getCurrentChatTimeContext(),
    buildSongsPromptContext(),
    buildHumanChatStyleContext()
  ].filter(Boolean).join("\n\n");
}

function getImageConfig(config) {
  return {
    baseUrl: config.imageBaseUrl || "",
    model: config.imageModel || "",
    apiKey: config.imageApiKey || "",
    size: config.imageSize || "1024x1024"
  };
}

function stripPlainSecrets(config) {
  const storedConfig = { ...config };
  delete storedConfig.apiKey;
  delete storedConfig.chatApiKey;
  delete storedConfig.imageApiKey;
  return storedConfig;
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function resolveAvatarUrl(config, role) {
  const key = role === "user" ? "userAvatarPath" : "assistantAvatarPath";
  const rawValue = typeof config[key] === "string" ? config[key].trim() : "";
  if (rawValue && isRemoteUrl(rawValue)) {
    return rawValue;
  }
  return role === "user" ? "/api/avatar/user" : "/api/avatar/assistant";
}

function getAvatarPath(config, role) {
  const fallback = role === "user" ? DEFAULT_USER_AVATAR : DEFAULT_ASSISTANT_AVATAR;
  const key = role === "user" ? "userAvatarPath" : "assistantAvatarPath";
  const rawValue = typeof config[key] === "string" ? config[key].trim() : "";

  if (!rawValue || isRemoteUrl(rawValue)) {
    return fallback;
  }

  const resolvedPath = path.isAbsolute(rawValue) ? rawValue : path.resolve(ROOT, rawValue);
  if (fs.existsSync(resolvedPath)) {
    return resolvedPath;
  }

  const portableFileName = path.win32.basename(rawValue);
  const dataPath = portableFileName ? path.join(DATA_DIR, portableFileName) : "";
  if (dataPath && fs.existsSync(dataPath)) {
    return dataPath;
  }

  return fallback;
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

function resolveUserAvatarUrl(config, userStore) {
  const rawValue = typeof userStore?.userAvatarPath === "string" ? userStore.userAvatarPath.trim() : "";
  if (rawValue && isRemoteUrl(rawValue)) {
    return rawValue;
  }
  if (rawValue) {
    return "/api/avatar/user-custom";
  }
  return resolveAvatarUrl(config, "user");
}

function getCustomUserAvatarPath(userStore) {
  const rawValue = typeof userStore?.userAvatarPath === "string" ? userStore.userAvatarPath.trim() : "";
  if (!rawValue || isRemoteUrl(rawValue)) {
    return "";
  }
  return path.isAbsolute(rawValue) ? rawValue : path.resolve(ROOT, rawValue);
}

function sendFile(res, filePath) {
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendText(res, 404, "Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    fs.createReadStream(filePath).pipe(res);
  });
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
  const filePath = getSongFilePath(song);
  const safePath = path.normalize(filePath);
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
  const current = visitors.get(visitorKey);

  if (!current) {
    totalVisits += 1;
  }

  visitors.set(visitorKey, {
    sessionId: visitorKey,
    page,
    startedAt: current ? current.startedAt : now,
    lastSeen: now,
    ip,
    userAgent: req.headers["user-agent"] || "unknown"
  });

  sendJson(res, 200, {
    sessionId: visitorKey,
    ...getVisitorSnapshot()
  });
}

function buildChatMessages(config, conversationMessages, latestUserMessage, stateless) {
  const preservedMessages = stateless
    ? []
    : conversationMessages
        .filter((item) => item && typeof item.role === "string" && typeof item.content === "string")
        .slice(-12)
        .map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content
        }));

  return [
    { role: "system", content: buildSystemPrompt(config) },
    ...preservedMessages,
    { role: "user", content: latestUserMessage }
  ];
}

function contentToText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        if (typeof item.text === "string") return item.text;
        if (typeof item.content === "string") return item.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function stripThinkingText(content) {
  return contentToText(content)
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*<\/think>\s*/i, "")
    .replace(/^[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff\ufffd\u25a1\u2612\u2610\u2611]+/u, "")
    .trim();
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

function summarizeApiError(payload, statusCode) {
  const message =
    payload?.error?.message ||
    payload?.error ||
    payload?.message ||
    payload?.msg ||
    payload?.detail ||
    payload?.raw ||
    "";
  const text = typeof message === "string" ? message : JSON.stringify(message);
  return text ? `HTTP ${statusCode}: ${text.slice(0, 500)}` : `HTTP ${statusCode}`;
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

function generateCacheKey(config, requestBody) {
  const keyData = {
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    messages: requestBody.messages
  };
  return crypto.createHash("sha256").update(JSON.stringify(keyData)).digest("hex");
}

function getCachedResponse(cacheKey) {
  const cached = apiResponseCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    apiResponseCache.delete(cacheKey);
    return null;
  }
  return cached.data;
}

function setCachedResponse(cacheKey, data) {
  if (apiResponseCache.size >= CACHE_MAX_SIZE) {
    const firstKey = apiResponseCache.keys().next().value;
    apiResponseCache.delete(firstKey);
  }
  apiResponseCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
}

async function callModelApi(config, requestBody, useCache = true) {
  const cacheKey = useCache ? generateCacheKey(config, requestBody) : null;

  if (cacheKey) {
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      cacheHits++;
      return cached;
    }
    cacheMisses++;
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

async function handleChat(req, res) {
  const body = await parseBody(req);
  const config = loadConfig();
  const chatConfig = getChatConfig(config);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  const clientIp = getClientIp(req);

  if (!message) {
    sendJson(res, 400, { error: "消息不能为空。" });
    return;
  }

  if (!chatConfig.baseUrl || !chatConfig.model) {
    sendJson(res, 400, { error: "API 尚未配置完成，请先去后台填写 Base URL 和模型名称。" });
    return;
  }

  cleanupExpiredPersistentUsers();
  const { key: userKey, userStore, persistent, save } = getOrCreateUserStore({ ip: clientIp });
  let conversation = ensureConversation(userStore, conversationId);

  if (!conversationId || !userStore.conversations.some((item) => item.id === conversationId)) {
    conversation = userStore.conversations[0];
  }

  const requestedSong = findRequestedSong(message);
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

  if (shouldGenerateImage(message, config)) {
    const imageConfig = getImageConfig(config);
    const limitKey = getImageLimitKey({ userKey });
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
        conversations: userStore.conversations
          .slice()
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
          .map(sanitizeConversation)
      });
      return;
    }

    const imagePrompt = getImagePrompt(message);
    let imageResult;
    try {
      imageResult = await callImageApi(imageConfig, imagePrompt);
    } catch (error) {
      sendJson(res, 502, { error: `无法连接图片 API：${error.message}` });
      return;
    }

    const { apiResponse, payload } = imageResult;
    if (!apiResponse.ok) {
      const messageText = summarizeApiError(payload, apiResponse.status);
      sendJson(res, apiResponse.status, { error: messageText, details: payload });
      return;
    }

    const imageUrl = extractGeneratedImage(payload);
    if (!imageUrl) {
      sendJson(res, 502, { error: "图片 API 没有返回可用图片。", details: payload });
      return;
    }

    const usage = getUsageFromPayload(payload);
    recordUsageEvent({ type: "image", ...usage, ip: clientIp });
    markImageGenerated(limitKey);

    const reply = "我画好了……给你。";
    const now = Date.now();
    appendConversationMessage(conversation, "user", message, now);
    appendConversationMessage(conversation, "assistant", reply, now + 1, {
      kind: "image",
      imageUrl,
      imagePrompt
    });
    userStore.updatedAt = now + 1;
    save();

    sendJson(res, 200, {
      reply,
      kind: "image",
      imageUrl,
      imagePrompt,
      model: imageConfig.model,
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

  const ext = inferExtensionFromMime(mimeType) === ".bin"
    ? path.extname(originalName).toLowerCase() || ".mp3"
    : inferExtensionFromMime(mimeType);
  const id = crypto.randomUUID();
  const fileName = `${id}${ext}`;
  fs.writeFileSync(path.join(SONGS_DIR, fileName), buffer);

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

  const filePath = getSongFilePath(song);
  const safePath = path.normalize(filePath);
  if (safePath.startsWith(SONGS_DIR) && fs.existsSync(safePath)) {
    fs.unlinkSync(safePath);
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
  
  const filePath = getSongFilePath(song);
  const safePath = path.normalize(filePath);
  
  if (!safePath.startsWith(SONGS_DIR) || !fs.existsSync(safePath)) {
    sendText(res, 404, "音频文件不存在");
    return;
  }
  
  const ext = path.extname(safePath).toLowerCase();
  const mimeTypes = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac"
  };
  
  const contentType = mimeTypes[ext] || "audio/mpeg";
  const stat = fs.statSync(safePath);
  
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store"
  });
  
  fs.createReadStream(safePath).pipe(res);
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

async function handleAdminModelsFetch(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const config = loadConfig();
  const chatConfig = getChatConfig(config);
  const imageConfig = getImageConfig(config);
  const body = await parseBody(req);
  const target = body.target === "image" ? "image" : "chat";
  const sourceConfig = target === "image" ? imageConfig : chatConfig;
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
      const debugInfo = choice
        ? `finish_reason=${choice.finish_reason}, content=${JSON.stringify(msg?.content)}, keys=[${Object.keys(msg || {}).join(",")}]`
        : `无 choices 数据`;
      apiConnectionStatus = { ok: false, message: `API 已连接但未返回内容 (${debugInfo})`, testedAt: Date.now() };
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

    const generatedImage = extractGeneratedImage(payload);
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

async function handleAdminConfigPut(req, res) {
  if (!requireAdminAuth(req, res)) return;
  const body = await parseBody(req);
  const config = loadConfig();
  const hasField = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const updatesApiConfig = [
    "chatBaseUrl",
    "chatApiKey",
    "chatModel",
    "chatAvailableModels",
    "baseUrl",
    "apiKey",
    "model",
    "availableModels",
    "availableModelsText",
    "imageBaseUrl",
    "imageApiKey",
    "imageModel",
    "imageAvailableModels",
    "imageSize",
    "temperature",
    "maxTokens"
  ].some(hasField);
  const updatesSiteConfig = [
    "siteName",
    "siteSubtitle",
    "assistantAvatarPath",
    "userAvatarPath",
    "systemPrompt",
    "adminPassword"
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

  const nextConfig = {
    ...config,
    siteName: hasField("siteName") ? String(body.siteName || "").trim() || config.siteName : config.siteName,
    siteSubtitle: hasField("siteSubtitle") ? String(body.siteSubtitle || "").trim() || config.siteSubtitle : config.siteSubtitle,
    assistantAvatarPath: hasField("assistantAvatarPath") ? String(body.assistantAvatarPath || "").trim() || DEFAULT_ASSISTANT_AVATAR : config.assistantAvatarPath,
    userAvatarPath: hasField("userAvatarPath") ? String(body.userAvatarPath || "").trim() || DEFAULT_USER_AVATAR : config.userAvatarPath,
    chatBaseUrl: hasField("chatBaseUrl") ? String(body.chatBaseUrl || "").trim() : hasField("baseUrl") ? String(body.baseUrl || "").trim() : config.chatBaseUrl || config.baseUrl,
    chatModel: hasField("chatModel") ? String(body.chatModel || "").trim() : hasField("model") ? String(body.model || "").trim() : config.chatModel || config.model,
    baseUrl: hasField("chatBaseUrl") ? String(body.chatBaseUrl || "").trim() : hasField("baseUrl") ? String(body.baseUrl || "").trim() : config.baseUrl,
    model: hasField("chatModel") ? String(body.chatModel || "").trim() : hasField("model") ? String(body.model || "").trim() : config.model,
    availableModels: manualModels,
    chatAvailableModels: manualModels,
    imageBaseUrl: hasField("imageBaseUrl") ? String(body.imageBaseUrl || "").trim() : config.imageBaseUrl || "",
    imageModel: hasField("imageModel") ? String(body.imageModel || "").trim() : config.imageModel || "",
    imageAvailableModels: imageManualModels,
    imageSize: hasField("imageSize") ? String(body.imageSize || "").trim() || "1024x1024" : config.imageSize || "1024x1024",
    temperature: hasField("temperature") ? Number(body.temperature) : config.temperature,
    maxTokens: hasField("maxTokens") ? Number(body.maxTokens) : config.maxTokens,
    systemPrompt: hasField("systemPrompt") ? String(body.systemPrompt || "").trim() : config.systemPrompt
  };

  if (hasField("chatApiKey") || hasField("apiKey")) {
    const submittedApiKey = String(hasField("chatApiKey") ? body.chatApiKey : body.apiKey || "").trim();
    const effectiveApiKey = submittedApiKey || config.chatApiKey || config.apiKey || "";
    nextConfig.chatApiKeyEncrypted = effectiveApiKey ? encryptSecret(effectiveApiKey) : null;
    nextConfig.chatApiKey = effectiveApiKey;
    nextConfig.apiKeyEncrypted = nextConfig.chatApiKeyEncrypted;
    nextConfig.apiKey = effectiveApiKey;
  }

  if (hasField("imageApiKey")) {
    const submittedImageApiKey = String(body.imageApiKey || "").trim();
    const effectiveImageApiKey = submittedImageApiKey || config.imageApiKey || "";
    nextConfig.imageApiKeyEncrypted = effectiveImageApiKey ? encryptSecret(effectiveImageApiKey) : null;
    nextConfig.imageApiKey = effectiveImageApiKey;
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
  stats.cache = {
    size: apiResponseCache.size,
    maxSize: CACHE_MAX_SIZE,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: cacheHits + cacheMisses > 0 ? (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(2) + '%' : '0%',
    ttlMs: CACHE_TTL_MS
  };
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
  const previousSize = apiResponseCache.size;
  apiResponseCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  sendJson(res, 200, { ok: true, cleared: previousSize });
}

function serveStatic(req, res) {
  let pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (pathname === "/") {
    pathname = "/index.html";
  }

  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(safePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendText(res, 404, "Not Found");
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-store" : "no-store"
    });
    fs.createReadStream(safePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/config/public") {
      sendJson(res, 200, publicConfig(loadConfig()));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/heartbeat") {
      await handleHeartbeat(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/avatar/assistant") {
      await handleAvatar(req, res, "assistant");
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/avatar/user") {
      await handleAvatar(req, res, "user");
      return;
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/avatar/user-custom") {
      await handleCustomUserAvatar(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/song/")) {
      await handleSongGet(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/session/state") {
      await handleSessionState(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/session/state") {
      await handleSessionState(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/conversations") {
      await handleConversationCreate(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/conversation") {
      await handleConversationGet(req, res);
      return;
    }

    if (req.method === "DELETE" && url.pathname === "/api/conversation") {
      await handleConversationDelete(req, res);
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/user/profile") {
      await handleUserProfilePut(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      await handleChat(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/login") {
      const body = await parseBody(req);
      const password = typeof body.password === "string" ? body.password : "";
      const token = generateAdminToken(password);
      if (!token) {
        sendJson(res, 401, { error: "密码错误或管理员密码未设置。" });
        return;
      }
      sendJson(res, 200, { ok: true, token });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/verify") {
      const body = await parseBody(req);
      const token = typeof body.token === "string" ? body.token : "";
      const ok = verifyAdminToken(token);
      sendJson(res, 200, { ok });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/config") {
      await handleAdminConfigGet(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/songs") {
      await handleAdminSongsGet(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/admin/songs/") && url.pathname.endsWith("/audio")) {
      await handleAdminSongAudio(req, res, url.pathname);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/songs") {
      await handleAdminSongUpload(req, res);
      return;
    }

    if (req.method === "DELETE" && url.pathname === "/api/admin/songs") {
      await handleAdminSongDelete(req, res);
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/admin/config") {
      await handleAdminConfigPut(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/models/fetch") {
      await handleAdminModelsFetch(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/test-connection") {
      await handleAdminTestConnection(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/test-image-connection") {
      await handleAdminTestImageConnection(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats") {
      await handleAdminStats(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/token-stats") {
      await handleAdminTokenStats(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/conversations") {
      await handleAdminConversationAudit(req, res);
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/admin/audit/ip") {
      await handleAdminAuditIpUpdate(req, res);
      return;
    }

    if (req.method === "DELETE" && url.pathname === "/api/admin/audit/ip") {
      await handleAdminAuditIpDelete(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/token-event") {
      await handleAdminTokenEventCreate(req, res);
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/admin/token-event") {
      await handleAdminTokenEventUpdate(req, res);
      return;
    }

    if (req.method === "DELETE" && url.pathname === "/api/admin/token-event") {
      await handleAdminTokenEventDelete(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/conversation") {
      await handleAdminConversationCreate(req, res);
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/admin/conversation") {
      await handleAdminConversationUpdate(req, res);
      return;
    }

    if (req.method === "DELETE" && url.pathname === "/api/admin/conversation") {
      await handleAdminConversationDelete(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/message") {
      await handleAdminMessageCreate(req, res);
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/admin/message") {
      await handleAdminMessageUpdate(req, res);
      return;
    }

    if (req.method === "DELETE" && url.pathname === "/api/admin/message") {
      await handleAdminMessageDelete(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/cache/clear") {
      await handleAdminCacheClear(req, res);
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "服务器错误。" });
  }
});

setInterval(() => {
  cleanupVisitors();
  cleanupExpiredPersistentUsers();
  saveTokenUsageEvents();
}, 10 * 60 * 1000).unref();

ensureDataFiles();
loadTokenUsageEvents();
cleanupExpiredPersistentUsers();

server.listen(PORT, HOST, () => {
  console.log(`Firefly Chat running at http://${HOST}:${PORT}`);
});
