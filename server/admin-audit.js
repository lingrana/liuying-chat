const { CHAT_RETENTION_MS } = require("./constants");
const { loadTokenUsageEvents, saveTokenUsageEvents, setTokenUsageEvents, getTokenUsageEvents } = require("./token-usage");
const { listPersistentUserStores, loadPersistentUserStore, savePersistentUserStore, deletePersistentUserStore } = require("./users");

function getAdminConversationAudit() {
  const now = Date.now();
  const tokenUsageEvents = getTokenUsageEvents();
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
    const { getOrCreateUserStore } = require("./users");
    const created = getOrCreateUserStore({ sessionId, ip });
    return { userKey: created.key, sessionId: created.sessionId, userStore: created.userStore };
  }

  const { getOrCreateUserStore, generateUUID } = require("./users");
  const crypto = require("crypto");
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

module.exports = {
  getAdminConversationAudit,
  sanitizeAdminMessage,
  sanitizeAdminConversation,
  resolveAdminUserStore,
  findConversationForAdmin,
  findMessageForAdmin
};
