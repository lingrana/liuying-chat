const fs = require("fs");
const path = require("path");
const { USERS_DIR, CHAT_RETENTION_MS } = require("./constants");
const { generateUUID, hashPassword } = require("./crypto");

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
    id: typeof message.id === "string" && message.id.trim() ? message.id.trim() : generateUUID(),
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
    id: typeof conversation.id === "string" && conversation.id.trim() ? conversation.id.trim() : generateUUID(),
    title: typeof conversation.title === "string" && conversation.title.trim() ? conversation.title.trim() : "新对话",
    createdAt: Number.isFinite(conversation.createdAt) ? conversation.createdAt : updatedAt,
    updatedAt,
    messages
  };
}

function loadPersistentUserStore(userKey) {
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

function getSessionUserKey(sessionId) {
  return hashPassword(`session:${String(sessionId || "").trim()}`);
}

function getIpUserKey(ip) {
  return hashPassword(`ip:${String(ip || "unknown").trim()}`);
}

function createConversation({ title = "新对话", now = Date.now() } = {}) {
  return normalizeConversationRecord({
    id: generateUUID(),
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
  
  let key;
  let sessionKey;
  
  if (ip) {
    key = getIpUserKey(ip);
    sessionKey = `ip-${ip}`;
  } else {
    sessionKey = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : generateUUID();
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
  const { DEFAULT_MAX_HISTORY_MESSAGES } = require("./constants");
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

module.exports = {
  getUserFilePath,
  getUserAvatarFilePath,
  normalizePersistentUserStore,
  normalizeConversationMessage,
  normalizeConversationRecord,
  loadPersistentUserStore,
  savePersistentUserStore,
  deletePersistentUserStore,
  listPersistentUserStores,
  findPersistentUserStoreBySessionId,
  getSessionUserKey,
  getIpUserKey,
  createConversation,
  sanitizeConversation,
  createUserStore,
  cleanupExpiredPersistentUsers,
  getOrCreateUserStore,
  ensureConversation,
  deriveConversationTitle,
  appendConversationMessage
};
