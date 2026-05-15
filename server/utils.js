const path = require("path");
const { MAX_JSON_BODY_BYTES, MIME_TYPES } = require("./constants");

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

function sendFile(res, filePath) {
  const fs = require("fs");
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

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
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

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[《》「」『』"'""''.,，。!！?？:：;；、\s_-]+/g, "");
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(value);
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

module.exports = {
  parseBody,
  sendJson,
  sendText,
  sendFile,
  getClientIp,
  inferExtensionFromMime,
  normalizeSearchText,
  isRemoteUrl,
  contentToText,
  stripThinkingText,
  summarizeApiError
};
