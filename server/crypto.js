const crypto = require("crypto");
const path = require("path");
const { ROOT } = require("./constants");

const SECRET_SEED = process.env.CONFIG_SECRET || ROOT;
const CONFIG_SECRET = crypto
  .createHash("sha256")
  .update(`${SECRET_SEED}|firefly-chat|config-secret`)
  .digest();
const ADMIN_TOKEN_SECRET = crypto
  .createHash("sha256")
  .update(`${SECRET_SEED}|firefly-chat|admin-token-secret`)
  .digest();

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

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function generateAdminToken(password, adminPasswordHash, ttlMs) {
  if (!adminPasswordHash) {
    return null;
  }
  const inputHash = hashPassword(password);
  if (inputHash !== adminPasswordHash) {
    return null;
  }
  const expiresAt = Date.now() + ttlMs;
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

function generateUUID() {
  return crypto.randomUUID();
}

module.exports = {
  CONFIG_SECRET,
  ADMIN_TOKEN_SECRET,
  encryptSecret,
  decryptSecret,
  hashPassword,
  generateAdminToken,
  verifyAdminToken,
  generateUUID
};
