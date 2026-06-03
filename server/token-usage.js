const fs = require("fs");
const { TOKEN_USAGE_PATH, CHAT_RETENTION_MS } = require("./constants");
const { generateUUID } = require("./crypto");
const { writeJsonAtomic } = require("./file-store");

let tokenUsageEvents = [];

function normalizeTokenUsageEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  return {
    id: typeof event.id === "string" && event.id.trim() ? event.id.trim() : generateUUID(),
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
  writeJsonAtomic(TOKEN_USAGE_PATH, tokenUsageEvents);
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

function getTokenUsageEvents() {
  return tokenUsageEvents;
}

function setTokenUsageEvents(events) {
  tokenUsageEvents = events;
}

module.exports = {
  normalizeTokenUsageEvent,
  loadTokenUsageEvents,
  saveTokenUsageEvents,
  recordTokenUsage,
  recordUsageEvent,
  getTokenStats,
  getTokenUsageEvents,
  setTokenUsageEvents
};
