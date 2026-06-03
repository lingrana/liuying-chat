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
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, 64);
  return `scrypt:${salt.toString("base64")}:${derived.toString("base64")}`;
}

function hashPasswordLegacy(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function hashStableId(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function verifyPassword(password, storedHash) {
  const value = String(storedHash || "");
  if (!value) return false;

  if (value.startsWith("scrypt:")) {
    const [, saltText, keyText] = value.split(":");
    if (!saltText || !keyText) return false;
    try {
      const salt = Buffer.from(saltText, "base64");
      const expected = Buffer.from(keyText, "base64");
      const actual = crypto.scryptSync(String(password), salt, expected.length);
      return expected.length > 0 &&
        actual.length === expected.length &&
        crypto.timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  const legacyHash = value.startsWith("sha256:") ? value.slice(7) : value;
  if (!/^[a-f0-9]{64}$/i.test(legacyHash)) return false;
  const actual = Buffer.from(hashPasswordLegacy(password), "hex");
  const expected = Buffer.from(legacyHash, "hex");
  return crypto.timingSafeEqual(actual, expected);
}

function generateAdminToken(password, adminPasswordHash, ttlMs) {
  if (!adminPasswordHash) {
    return null;
  }
  if (!verifyPassword(password, adminPasswordHash)) {
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
  if (!/^\d{10,16}$/.test(expiresAtStr) || !/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }
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
  hashStableId,
  verifyPassword,
  generateAdminToken,
  verifyAdminToken,
  generateUUID
};
