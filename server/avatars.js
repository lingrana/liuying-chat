const fs = require("fs");
const path = require("path");
const { ROOT, DATA_DIR, USERS_DIR, DEFAULT_ASSISTANT_AVATAR, DEFAULT_USER_AVATAR } = require("./constants");
const { isRemoteUrl, inferExtensionFromMime } = require("./utils");

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

function resolveAvatarUrl(config, role) {
  const key = role === "user" ? "userAvatarPath" : "assistantAvatarPath";
  const rawValue = typeof config[key] === "string" ? config[key].trim() : "";
  if (rawValue && isRemoteUrl(rawValue)) {
    return rawValue;
  }
  return role === "user" ? "/api/avatar/user" : "/api/avatar/assistant";
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

function saveUserAvatarFromDataUrl(userKey, dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    throw new Error("头像文件格式不正确，仅支持常见图片。");
  }
  const mimeType = match[1];
  const base64 = match[2];
  const extension = inferExtensionFromMime(mimeType);
  const filePath = path.join(USERS_DIR, `${userKey}-avatar${extension}`);
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

module.exports = {
  getAvatarPath,
  resolveAvatarUrl,
  resolveUserAvatarUrl,
  getCustomUserAvatarPath,
  saveUserAvatarFromDataUrl
};
