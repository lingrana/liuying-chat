const http = require("http");
const path = require("path");
const { HOST, PORT, PUBLIC_DIR, MIME_TYPES } = require("./constants");
const { ensureDataFiles, loadConfig } = require("./config");
const { setCacheMaxSize } = require("./cache");
const { loadTokenUsageEvents, saveTokenUsageEvents } = require("./token-usage");
const { cleanupExpiredPersistentUsers } = require("./users");
const { cleanupVisitors } = require("./visitors");
const { sendText, sendFile } = require("./utils");
const {
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
  generateAdminToken,
  verifyAdminToken
} = require("./routes");
const { parseBody, sendJson } = require("./utils");

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

  const fs = require("fs");
  fs.stat(safePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendText(res, 404, "Not Found");
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
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

    if (req.method === "GET" && url.pathname.startsWith("/api/generated-image/")) {
      await handleGeneratedImage(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/image-job/")) {
      await handleImageJobStatus(req, res);
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

    if (req.method === "POST" && url.pathname === "/api/admin/test-semantic-connection") {
      await handleAdminTestSemanticConnection(req, res);
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

    if (req.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin/")) {
      const fs = require("fs");
      const adminPath = path.join(PUBLIC_DIR, "admin.html");
      if (fs.existsSync(adminPath)) {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store"
        });
        fs.createReadStream(adminPath).pipe(res);
        return;
      }
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

const config = loadConfig();
setCacheMaxSize(config.cacheMaxSize);

server.listen(PORT, HOST, () => {
  console.log(`Firefly Chat running at http://${HOST}:${PORT}`);
});
