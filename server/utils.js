const path = require("path");
const { MAX_JSON_BODY_BYTES, MIME_TYPES, TRUST_PROXY } = require("./constants");

function readRequestBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        rejected = true;
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (rejected) return;
      resolve(Buffer.concat(chunks, total));
    });
    req.on("error", reject);
  });
}

function parseBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  return readRequestBody(req, maxBytes).then((buffer) => {
    const raw = buffer.toString("utf8");
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("Invalid JSON body");
    }
  });
}

function parseContentDisposition(value) {
  const result = {};
  for (const part of String(value || "").split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) continue;
    const key = rawKey.toLowerCase();
    let nextValue = rawValue.join("=");
    if (nextValue.startsWith('"') && nextValue.endsWith('"')) {
      nextValue = nextValue.slice(1, -1);
    }
    result[key] = nextValue.replace(/\\"/g, '"');
  }
  return result;
}

function getMultipartBoundary(contentType) {
  const match = String(contentType || "").match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i);
  return match ? (match[1] || match[2] || "").trim() : "";
}

async function parseMultipartForm(req, maxBytes = MAX_JSON_BODY_BYTES) {
  const boundary = getMultipartBoundary(req.headers["content-type"] || "");
  if (!boundary) {
    throw new Error("Missing multipart boundary");
  }

  const body = await readRequestBody(req, maxBytes);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const headerSeparator = Buffer.from("\r\n\r\n");
  const fields = {};
  const files = {};
  let offset = 0;

  while (offset < body.length) {
    const boundaryIndex = body.indexOf(boundaryBuffer, offset);
    if (boundaryIndex === -1) break;
    let partStart = boundaryIndex + boundaryBuffer.length;
    if (body[partStart] === 45 && body[partStart + 1] === 45) break;
    if (body[partStart] === 13 && body[partStart + 1] === 10) {
      partStart += 2;
    }

    const headerEnd = body.indexOf(headerSeparator, partStart);
    if (headerEnd === -1) break;
    const headersText = body.slice(partStart, headerEnd).toString("utf8");
    const headers = {};
    for (const line of headersText.split(/\r\n/)) {
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }

    const contentStart = headerEnd + headerSeparator.length;
    const nextBoundaryIndex = body.indexOf(boundaryBuffer, contentStart);
    if (nextBoundaryIndex === -1) break;
    let contentEnd = nextBoundaryIndex;
    if (body[contentEnd - 2] === 13 && body[contentEnd - 1] === 10) {
      contentEnd -= 2;
    }
    const content = body.slice(contentStart, contentEnd);
    const disposition = parseContentDisposition(headers["content-disposition"]);
    const name = disposition.name || "";
    if (name) {
      if (disposition.filename !== undefined) {
        files[name] = {
          fileName: disposition.filename,
          mimeType: headers["content-type"] || "application/octet-stream",
          buffer: content
        };
      } else {
        fields[name] = content.toString("utf8");
      }
    }
    offset = nextBoundaryIndex;
  }

  return { fields, files };
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

function isPrivateProxyAddress(remoteAddress) {
  const value = String(remoteAddress || "").replace(/^::ffff:/, "");
  return value === "127.0.0.1" ||
    value === "::1" ||
    value === "localhost" ||
    value.startsWith("10.") ||
    value.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(value);
}

function getClientIp(req) {
  const remoteAddress = req.socket.remoteAddress || "";
  const shouldTrustProxy = TRUST_PROXY || isPrivateProxyAddress(remoteAddress);
  const forwarded = shouldTrustProxy ? req.headers["x-forwarded-for"] : "";
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = shouldTrustProxy ? req.headers["x-real-ip"] : "";
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
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
  readRequestBody,
  parseBody,
  parseMultipartForm,
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
