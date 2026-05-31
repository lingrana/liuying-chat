const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const USERS_DIR = path.join(DATA_DIR, "users");
const SONGS_DIR = path.join(DATA_DIR, "songs");
const GENERATED_IMAGES_DIR = path.join(DATA_DIR, "generated-images");
const SONGS_INDEX_PATH = path.join(SONGS_DIR, "songs.json");
const TOKEN_USAGE_PATH = path.join(DATA_DIR, "token-usage.json");
const DEFAULT_ASSISTANT_AVATAR = path.join(DATA_DIR, "lingran.png");
const DEFAULT_USER_AVATAR = path.join(DATA_DIR, "lingran.png");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT ? Number(process.env.PORT) : 3200;
const VISITOR_TTL_MS = 45 * 1000;
const CHAT_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_HISTORY_MESSAGES = 20;
const CHAT_TIME_ZONE = "Asia/Shanghai";
const ADMIN_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const IMAGE_GENERATION_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_JSON_BODY_BYTES = 30 * 1024 * 1024;
const CACHE_TTL_MS = 60 * 60 * 1000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".txt": "text/plain; charset=utf-8"
};

module.exports = {
  ROOT,
  PUBLIC_DIR,
  DATA_DIR,
  CONFIG_PATH,
  USERS_DIR,
  SONGS_DIR,
  GENERATED_IMAGES_DIR,
  SONGS_INDEX_PATH,
  TOKEN_USAGE_PATH,
  DEFAULT_ASSISTANT_AVATAR,
  DEFAULT_USER_AVATAR,
  HOST,
  PORT,
  VISITOR_TTL_MS,
  CHAT_RETENTION_MS,
  DEFAULT_MAX_HISTORY_MESSAGES,
  CHAT_TIME_ZONE,
  ADMIN_TOKEN_TTL_MS,
  IMAGE_GENERATION_COOLDOWN_MS,
  MAX_JSON_BODY_BYTES,
  CACHE_TTL_MS,
  MIME_TYPES
};
