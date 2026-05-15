const { VISITOR_TTL_MS } = require("./constants");

const visitors = new Map();
let totalVisits = 0;

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

function recordVisitor(visitorKey, data) {
  const existed = visitors.has(visitorKey);
  if (!existed) {
    totalVisits += 1;
  }
  visitors.set(visitorKey, data);
  return !existed;
}

module.exports = {
  cleanupVisitors,
  getVisitorSnapshot,
  recordVisitor,
  visitors,
  get totalVisits() { return totalVisits; },
  set totalVisits(val) { totalVisits = val; }
};
