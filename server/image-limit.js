const fs = require("fs");
const { IMAGE_DAILY_USAGE_PATH } = require("./constants");
const { writeJsonAtomic } = require("./file-store");

const DEFAULT_IMAGE_DAILY_LIMIT = 50;
const IMAGE_DAILY_LIMIT_MAX = 100000;
const IMAGE_DAILY_LIMIT_HELP_URL = "https://newapi.lingrana.top/";
const IMAGE_DAILY_LIMIT_MESSAGE =
  `今天的公共图片生成额度已用完。你可以在右上角打开“自定义图片 API”，填入自己的接口后继续生成；接口入口：${IMAGE_DAILY_LIMIT_HELP_URL}`;

function normalizeImageDailyLimit(value) {
  const limit = Math.floor(Number(value));
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_IMAGE_DAILY_LIMIT;
  return Math.min(limit, IMAGE_DAILY_LIMIT_MAX);
}

function getTodayKey(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(now));
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${partMap.year}-${partMap.month}-${partMap.day}`;
}

function normalizeUsageState(raw, now = Date.now()) {
  const today = getTodayKey(now);
  const date = typeof raw?.date === "string" ? raw.date : "";
  const count = Math.max(0, Math.floor(Number(raw?.count) || 0));
  if (date !== today) {
    return { date: today, count: 0 };
  }
  return { date, count };
}

function loadImageDailyUsage(now = Date.now()) {
  let raw = null;
  try {
    raw = fs.existsSync(IMAGE_DAILY_USAGE_PATH)
      ? JSON.parse(fs.readFileSync(IMAGE_DAILY_USAGE_PATH, "utf8"))
      : null;
  } catch {
    raw = null;
  }
  const state = normalizeUsageState(raw, now);
  if (!raw || raw.date !== state.date || raw.count !== state.count) {
    writeJsonAtomic(IMAGE_DAILY_USAGE_PATH, state);
  }
  return state;
}

function getImageDailyUsageSnapshot(config, now = Date.now()) {
  const limit = normalizeImageDailyLimit(config?.imageDailyLimit);
  const state = loadImageDailyUsage(now);
  return {
    date: state.date,
    used: state.count,
    limit,
    remaining: Math.max(0, limit - state.count)
  };
}

function reserveImageDailyQuota(config, now = Date.now()) {
  const limit = normalizeImageDailyLimit(config?.imageDailyLimit);
  const state = loadImageDailyUsage(now);
  if (state.count >= limit) {
    return {
      ok: false,
      date: state.date,
      used: state.count,
      limit,
      remaining: 0
    };
  }

  const nextState = {
    date: state.date,
    count: state.count + 1
  };
  writeJsonAtomic(IMAGE_DAILY_USAGE_PATH, nextState);
  return {
    ok: true,
    date: nextState.date,
    used: nextState.count,
    limit,
    remaining: Math.max(0, limit - nextState.count)
  };
}

module.exports = {
  DEFAULT_IMAGE_DAILY_LIMIT,
  IMAGE_DAILY_LIMIT_MAX,
  IMAGE_DAILY_LIMIT_HELP_URL,
  IMAGE_DAILY_LIMIT_MESSAGE,
  normalizeImageDailyLimit,
  getImageDailyUsageSnapshot,
  reserveImageDailyQuota
};
