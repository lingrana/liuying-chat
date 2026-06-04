const onlineCount = document.getElementById("onlineCount");
const totalVisits = document.getElementById("totalVisits");
const cacheBadge = document.getElementById("cacheBadge");
const clearCacheBtn = document.getElementById("clearCacheBtn");
const cacheMaxSizeInput = document.getElementById("cacheMaxSizeInput");
const currentCacheSize = document.getElementById("currentCacheSize");
const currentCacheMax = document.getElementById("currentCacheMax");
const apiConfigForm = document.getElementById("apiConfigForm");
const siteConfigForm = document.getElementById("siteConfigForm");
const roleConfigForm = document.getElementById("roleConfigForm");
const apiSaveStatus = document.getElementById("apiSaveStatus");
const siteSaveStatus = document.getElementById("siteSaveStatus");
const roleSaveStatus = document.getElementById("roleSaveStatus");
const fetchModelsButton = document.getElementById("fetchModelsButton");
const fetchModelsStatus = document.getElementById("fetchModelsStatus");
const availableModelsList = document.getElementById("availableModelsList");
const fetchImageModelsButton = document.getElementById("fetchImageModelsButton");
const fetchImageModelsStatus = document.getElementById("fetchImageModelsStatus");
const imageAvailableModelsList = document.getElementById("imageAvailableModelsList");
const imageDailyUsageHint = document.getElementById("imageDailyUsageHint");
const fetchSemanticModelsButton = document.getElementById("fetchSemanticModelsButton");
const fetchSemanticModelsStatus = document.getElementById("fetchSemanticModelsStatus");
const semanticAvailableModelsList = document.getElementById("semanticAvailableModelsList");
const songUploadForm = document.getElementById("songUploadForm");
const songTitleInput = document.getElementById("songTitleInput");
const songFileInput = document.getElementById("songFileInput");
const songUploadStatus = document.getElementById("songUploadStatus");
const songList = document.getElementById("songList");
const songFileText = document.getElementById("songFileText");
const apiModalTabs = document.querySelectorAll("[data-api-panel]");
const apiPanels = {
  chat: document.getElementById("chatApiPanel"),
  image: document.getElementById("imageApiPanel"),
  semantic: document.getElementById("semanticApiPanel")
};
const tokenRangeButtons = document.querySelectorAll("[data-token-range]");
const ipAuditList = document.getElementById("ipAuditList");
const auditRetentionLabel = document.getElementById("auditRetentionLabel");

const apiFields = {
  chatBaseUrl: document.getElementById("chatBaseUrlInput"),
  chatApiKey: document.getElementById("chatApiKeyInput"),
  chatModel: document.getElementById("chatModelInput"),
  temperature: document.getElementById("temperatureInput"),
  maxTokens: document.getElementById("maxTokensInput"),
  imageBaseUrl: document.getElementById("imageBaseUrlInput"),
  imageApiKey: document.getElementById("imageApiKeyInput"),
  imageModel: document.getElementById("imageModelInput"),
  imageDailyLimit: document.getElementById("imageDailyLimitInput"),
  semanticBaseUrl: document.getElementById("semanticBaseUrlInput"),
  semanticApiKey: document.getElementById("semanticApiKeyInput"),
  semanticModel: document.getElementById("semanticModelInput")
};

const siteFields = {
  siteName: document.getElementById("siteNameInput"),
  siteSubtitle: document.getElementById("siteSubtitleInput"),
  announcementEnabled: document.getElementById("announcementEnabledInput"),
  announcementTitle: document.getElementById("announcementTitleInput"),
  announcementHtml: document.getElementById("announcementHtmlInput"),
  adminPassword: document.getElementById("adminPasswordInput")
};

const roleFields = {
  id: document.getElementById("roleIdInput"),
  name: document.getElementById("roleNameInput"),
  title: document.getElementById("roleTitleInput"),
  subtitle: document.getElementById("roleSubtitleInput"),
  avatarPath: document.getElementById("roleAvatarPathInput"),
  portraitUrl: document.getElementById("rolePortraitUrlInput"),
  portraitMirror: document.getElementById("rolePortraitMirrorInput"),
  portraitOffsetX: document.getElementById("rolePortraitOffsetXInput"),
  portraitScale: document.getElementById("rolePortraitScaleInput"),
  eyebrow: document.getElementById("roleEyebrowInput"),
  quoteLabel: document.getElementById("roleQuoteLabelInput"),
  quote: document.getElementById("roleQuoteInput"),
  traits: document.getElementById("roleTraitsInput"),
  greeting: document.getElementById("roleGreetingInput"),
  systemPrompt: document.getElementById("roleSystemPromptInput"),
  imagePromptHints: document.getElementById("roleImagePromptHintsInput")
};

const roleThemeFields = {
  accent: document.getElementById("roleThemeAccentInput"),
  accentBright: document.getElementById("roleThemeAccentBrightInput"),
  accentDim: document.getElementById("roleThemeAccentDimInput"),
  accentDeep: document.getElementById("roleThemeAccentDeepInput"),
  bg: document.getElementById("roleThemeBgInput"),
  bgWarm: document.getElementById("roleThemeBgWarmInput"),
  surface: document.getElementById("roleThemeSurfaceInput"),
  border: document.getElementById("roleThemeBorderInput"),
  borderLight: document.getElementById("roleThemeBorderLightInput"),
  text: document.getElementById("roleThemeTextInput"),
  textMid: document.getElementById("roleThemeTextMidInput"),
  textDim: document.getElementById("roleThemeTextDimInput"),
  visualStart: document.getElementById("roleThemeVisualStartInput"),
  visualMid: document.getElementById("roleThemeVisualMidInput"),
  visualEnd: document.getElementById("roleThemeVisualEndInput")
};

const defaultCharacterIdSelect = document.getElementById("defaultCharacterIdSelect");
const roleList = document.getElementById("roleList");
const addRoleButton = document.getElementById("addRoleButton");
const deleteRoleButton = document.getElementById("deleteRoleButton");

let statsTimer = null;
let adminInitialized = false;
let tokenRange = "1d";
let latestAudit = null;
let latestConfig = null;
let roleCharacters = [];
let activeRoleId = "";

// 分页状态
let auditCurrentPage = 1;
let auditPageSize = 20;
let auditSearchQuery = "";
let auditSortBy = "tokens";

// 分页控件元素
const auditSearchInput = document.getElementById("auditSearchInput");
const auditSortSelect = document.getElementById("auditSortSelect");
const auditRefreshButton = document.getElementById("auditRefreshButton");
const auditPageSizeSelect = document.getElementById("auditPageSize");
const auditPrevPageBtn = document.getElementById("auditPrevPage");
const auditNextPageBtn = document.getElementById("auditNextPage");
const auditPageInfo = document.getElementById("auditPageInfo");
const auditLastRefresh = document.getElementById("auditLastRefresh");

// 统计元素
const auditTotalIps = document.getElementById("auditTotalIps");
const auditTotalTokens = document.getElementById("auditTotalTokens");
const auditTotalRequests = document.getElementById("auditTotalRequests");
const auditTotalSessions = document.getElementById("auditTotalSessions");

// 记录展开状态
const expandedIps = new Set();

const ROLE_THEME_DEFAULTS = {
  accent: "#111111",
  accentBright: "#000000",
  accentDim: "#555555",
  accentDeep: "#000000",
  bg: "#f6f6f6",
  bgWarm: "#ffffff",
  surface: "#ffffff",
  border: "#d4d4d4",
  borderLight: "#e8e8e8",
  text: "#111111",
  textMid: "#444444",
  textDim: "#777777",
  visualStart: "#eeeeee",
  visualMid: "#ffffff",
  visualEnd: "#e7e7e7"
};

function normalizeRoleId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeRoleText(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function normalizeRoleBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return false;
}

function normalizeRoleNumber(value, fallback = 0, min = -320, max = 320) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function normalizeRoleScale(value, fallback = 1, min = 0.6, max = 1.6) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clamped = Math.min(max, Math.max(min, numeric));
  return Math.round(clamped * 100) / 100;
}

function normalizeRoleArray(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "").split(/\r?\n|,|，/);
  return source.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeRoleTheme(theme = {}) {
  const result = {};
  for (const key of Object.keys(ROLE_THEME_DEFAULTS)) {
    const value = String(theme?.[key] || "").trim();
    result[key] = /^#[0-9a-f]{6}$/i.test(value) ? value : ROLE_THEME_DEFAULTS[key];
  }
  return result;
}

function normalizeRole(role = {}, index = 0) {
  const id = normalizeRoleId(role.id) || `role-${index + 1}`;
  const name = normalizeRoleText(role.name, id);
  return {
    id,
    name,
    title: normalizeRoleText(role.title, `${name} · 在线聊天`),
    subtitle: normalizeRoleText(role.subtitle, ""),
    avatarPath: normalizeRoleText(role.avatarPath, "public/favicon.svg"),
    portraitUrl: normalizeRoleText(role.portraitUrl, ""),
    portraitMirror: normalizeRoleBoolean(role.portraitMirror),
    portraitOffsetX: normalizeRoleNumber(role.portraitOffsetX),
    portraitScale: normalizeRoleScale(role.portraitScale),
    eyebrow: normalizeRoleText(role.eyebrow, "Character Channel"),
    quoteLabel: normalizeRoleText(role.quoteLabel, "角色介绍"),
    quote: normalizeRoleText(role.quote, ""),
    traits: normalizeRoleArray(role.traits),
    greeting: normalizeRoleText(role.greeting, `你好，我是${name}。`),
    systemPrompt: normalizeRoleText(role.systemPrompt, `你是${name}。请保持角色口吻与用户对话。`),
    imagePromptHints: normalizeRoleArray(role.imagePromptHints),
    theme: normalizeRoleTheme(role.theme)
  };
}

function createBlankRole() {
  let index = roleCharacters.length + 1;
  let id = `role-${index}`;
  const existing = new Set(roleCharacters.map((role) => role.id));
  while (existing.has(id)) {
    index += 1;
    id = `role-${index}`;
  }
  return normalizeRole({
    id,
    name: `新角色${index}`,
    title: `新角色${index} · 在线聊天`,
    avatarPath: "public/favicon.svg"
  }, index - 1);
}

function getRoleAvatarUrl(role) {
  const raw = String(role?.avatarPath || "").trim();
  if (!raw) return "/api/avatar/assistant";
  if (/^(?:https?:)?\/\//i.test(raw) || raw.startsWith("/")) return raw;
  const normalized = raw.replace(/\\/g, "/");
  return normalized.startsWith("public/") ? `/${normalized.slice(7)}` : "/api/avatar/assistant";
}

function setRoleStatus(text = "", isError = false) {
  if (!roleSaveStatus) return;
  roleSaveStatus.textContent = text;
  roleSaveStatus.style.opacity = text ? "1" : "";
  roleSaveStatus.style.color = isError ? "#d44" : "var(--accent)";
}

function updateActiveRoleFromEditor() {
  if (!activeRoleId) return true;
  const index = roleCharacters.findIndex((role) => role.id === activeRoleId);
  if (index < 0) return true;
  const nextId = normalizeRoleId(roleFields.id?.value) || activeRoleId;
  const duplicate = roleCharacters.some((role, roleIndex) => roleIndex !== index && role.id === nextId);
  if (duplicate) {
    setRoleStatus(`角色 ID ${nextId} 已存在`, true);
    return false;
  }
  const current = roleCharacters[index];
  const nextRole = normalizeRole({
    ...current,
    id: nextId,
    name: roleFields.name?.value,
    title: roleFields.title?.value,
    subtitle: roleFields.subtitle?.value,
    avatarPath: roleFields.avatarPath?.value,
    portraitUrl: roleFields.portraitUrl?.value,
    portraitMirror: roleFields.portraitMirror?.checked,
    portraitOffsetX: roleFields.portraitOffsetX?.value,
    portraitScale: roleFields.portraitScale?.value,
    eyebrow: roleFields.eyebrow?.value,
    quoteLabel: roleFields.quoteLabel?.value,
    quote: roleFields.quote?.value,
    traits: roleFields.traits?.value,
    greeting: roleFields.greeting?.value,
    systemPrompt: roleFields.systemPrompt?.value,
    imagePromptHints: roleFields.imagePromptHints?.value,
    theme: Object.fromEntries(
      Object.entries(roleThemeFields).map(([key, input]) => [key, input?.value || current.theme?.[key]])
    )
  }, index);
  roleCharacters[index] = nextRole;
  activeRoleId = nextRole.id;
  if (defaultCharacterIdSelect?.value === current.id) {
    defaultCharacterIdSelect.value = nextRole.id;
  }
  return true;
}

function renderDefaultRoleOptions(preferredId = "") {
  if (!defaultCharacterIdSelect) return;
  const previous = preferredId || defaultCharacterIdSelect.value || latestConfig?.defaultCharacterId || activeRoleId;
  defaultCharacterIdSelect.innerHTML = roleCharacters
    .map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.name)} (${escapeHtml(role.id)})</option>`)
    .join("");
  defaultCharacterIdSelect.value = roleCharacters.some((role) => role.id === previous)
    ? previous
    : roleCharacters[0]?.id || "";
}

function renderRoleList() {
  if (!roleList) return;
  if (!roleCharacters.length) {
    roleList.innerHTML = `<div class="empty-state">暂无角色</div>`;
    return;
  }
  roleList.innerHTML = roleCharacters.map((role) => {
    const active = role.id === activeRoleId ? " active" : "";
    return `
      <button class="role-list-item${active}" type="button" data-role-id="${escapeHtml(role.id)}">
        <img class="role-list-avatar" src="${escapeHtml(getRoleAvatarUrl(role))}" alt="${escapeHtml(role.name)}">
        <span>
          <span class="role-list-name">${escapeHtml(role.name)}</span>
          <span class="role-list-id">${escapeHtml(role.id)}</span>
        </span>
      </button>
    `;
  }).join("");

  roleList.querySelectorAll("[data-role-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!updateActiveRoleFromEditor()) return;
      activeRoleId = button.getAttribute("data-role-id") || activeRoleId;
      fillRoleEditor(activeRoleId);
      renderDefaultRoleOptions();
      renderRoleList();
      setRoleStatus("");
    });
  });
}

function fillRoleEditor(roleId) {
  const role = roleCharacters.find((item) => item.id === roleId) || roleCharacters[0];
  if (!role) return;
  activeRoleId = role.id;
  for (const [key, input] of Object.entries(roleFields)) {
    if (!input) continue;
    if (key === "traits" || key === "imagePromptHints") {
      input.value = Array.isArray(role[key]) ? role[key].join("\n") : "";
    } else if (input.type === "checkbox") {
      input.checked = Boolean(role[key]);
    } else {
      input.value = role[key] ?? "";
    }
  }
  for (const [key, input] of Object.entries(roleThemeFields)) {
    if (input) input.value = role.theme?.[key] || ROLE_THEME_DEFAULTS[key];
  }
  if (deleteRoleButton) {
    deleteRoleButton.disabled = roleCharacters.length <= 1;
  }
}

function renderRoleConfig(config) {
  roleCharacters = (Array.isArray(config.characters) ? config.characters : [])
    .map((role, index) => normalizeRole(role, index));
  if (!roleCharacters.length) {
    roleCharacters = [createBlankRole()];
  }
  activeRoleId = roleCharacters.some((role) => role.id === activeRoleId)
    ? activeRoleId
    : config.defaultCharacterId || roleCharacters[0].id;
  if (!roleCharacters.some((role) => role.id === activeRoleId)) {
    activeRoleId = roleCharacters[0].id;
  }
  renderDefaultRoleOptions();
  if (defaultCharacterIdSelect && roleCharacters.some((role) => role.id === config.defaultCharacterId)) {
    defaultCharacterIdSelect.value = config.defaultCharacterId;
  }
  fillRoleEditor(activeRoleId);
  renderRoleList();
  setRoleStatus("");
}

function normalizeAuditIp(ip) {
  const value = String(ip || "").trim();
  return value || "unknown";
}

function getAuditItemKey(item) {
  return `ip:${normalizeAuditIp(item?.ip)}`;
}

function pruneExpandedAuditKeys(items) {
  const availableKeys = new Set(items.map(getAuditItemKey));
  for (const key of Array.from(expandedIps)) {
    if (!availableKeys.has(key)) {
      expandedIps.delete(key);
    }
  }
}

function getModelUi(target = "chat") {
  const isImage = target === "image";
  const isSemantic = target === "semantic";
  return {
    listEl: isImage ? imageAvailableModelsList : isSemantic ? semanticAvailableModelsList : availableModelsList,
    modelInput: isImage ? apiFields.imageModel : isSemantic ? apiFields.semanticModel : apiFields.chatModel,
    label: isImage ? "图片" : isSemantic ? "语义理解" : "对话"
  };
}

function renderAvailableModels(models, target = "chat") {
  const { listEl, modelInput, label } = getModelUi(target);
  if (!listEl || !modelInput) return;

  const list = Array.isArray(models) ? Array.from(new Set(models.filter(Boolean))) : [];
  if (list.length === 0) {
    listEl.innerHTML = `<span style="font-size:0.72rem;color:var(--text-dim);">暂无模型，请先获取</span>`;
    return;
  }

  const currentModel = modelInput.value.trim();
  listEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
      <span style="font-size:0.72rem;color:var(--text-dim);">${label}模型共 ${list.length} 个</span>
      <button type="button" class="model-toggle-btn" data-model-toggle="${target}">收起列表</button>
    </div>
    <div class="model-list-collapsed open" data-model-list="${target}">
      ${list.map((m) => `<button type="button" class="model-pill${m === currentModel ? ' active' : ''}" data-model="${m}">${m}</button>`).join("")}
    </div>
  `;

  const toggleBtn = listEl.querySelector("[data-model-toggle]");
  const collapsedDiv = listEl.querySelector("[data-model-list]");
  if (toggleBtn && collapsedDiv) {
    toggleBtn.addEventListener("click", () => {
      const isOpen = collapsedDiv.classList.toggle("open");
      toggleBtn.textContent = isOpen ? "收起列表" : "展开列表";
    });
  }

  listEl.querySelectorAll("[data-model]").forEach((button) => {
    button.addEventListener("click", () => {
      modelInput.value = button.getAttribute("data-model") || "";
      modelInput.focus();
      listEl.querySelectorAll("[data-model]").forEach(b => b.classList.remove("active"));
      button.classList.add("active");
    });
  });
}

function renderImageDailyUsage(usage) {
  if (!imageDailyUsageHint) return;
  if (!usage) {
    imageDailyUsageHint.textContent = "";
    return;
  }
  const used = Number(usage.used) || 0;
  const limit = Number(usage.limit) || 50;
  const remaining = Math.max(0, Number(usage.remaining) || 0);
  imageDailyUsageHint.textContent = `今日公共图片额度：${used} / ${limit}，剩余 ${remaining} 张。用户自定义图片 API 不计入额度。`;
}

function switchApiPanel(target) {
  const panel = target === "image" ? "image" : target === "semantic" ? "semantic" : "chat";
  apiModalTabs.forEach((button) => {
    const isActive = button.getAttribute("data-api-panel") === panel;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  Object.entries(apiPanels).forEach(([key, el]) => {
    if (!el) return;
    const isActive = key === panel;
    el.classList.toggle("active", isActive);
    el.hidden = !isActive;
  });
}

function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

function authHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${getAdminToken()}`,
    ...extra
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const plainText = text
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    throw new Error(plainText || `HTTP ${response.status} 返回了非 JSON 响应`);
  }
}

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function renderSongs(songs) {
  const list = Array.isArray(songs) ? songs : [];
  if (!songList) return;
  
  const songCount = document.getElementById("songCount");
  if (songCount) {
    songCount.textContent = `${list.length} 首`;
  }
  
  if (list.length === 0) {
    songList.innerHTML = `
      <div class="empty-state" style="padding:2rem;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:32px;height:32px;margin:0 auto 0.8rem;display:block;color:var(--text-dim);">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
        暂无歌曲，上传一首吧
      </div>`;
    return;
  }
  
  songList.innerHTML = list.map((song) => `
    <div class="song-item" data-song-id="${escapeHtml(song.id)}">
      <div class="song-icon">
        <svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
      <div class="song-info">
        <div class="song-name">${escapeHtml(song.title || "未命名歌曲")}</div>
        <div class="song-meta">角色音频 · ${formatFileSize(song.size)}</div>
      </div>
      <div class="song-actions">
        <button class="song-play-btn" type="button" data-play-song="${escapeHtml(song.id)}" title="播放">
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <button class="song-delete-btn" type="button" data-delete-song="${escapeHtml(song.id)}" title="删除">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `).join("");

  songList.querySelectorAll("[data-play-song]").forEach((button) => {
    button.addEventListener("click", () => playSong(button.getAttribute("data-play-song")));
  });

  songList.querySelectorAll("[data-delete-song]").forEach((button) => {
    button.addEventListener("click", () => deleteSong(button.getAttribute("data-delete-song")));
  });
}

let currentAudio = null;
let currentPlayBtn = null;

function playSong(id) {
  if (!id) return;
  
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
    if (currentPlayBtn) {
      currentPlayBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      currentPlayBtn.style.background = '';
      currentPlayBtn.style.color = '';
    }
  }
  
  const btn = songList.querySelector(`[data-play-song="${id}"]`);
  if (btn && currentPlayBtn === btn) {
    currentPlayBtn = null;
    return;
  }
  
  currentPlayBtn = btn;
  const audio = new Audio(`/api/admin/songs/${id}/audio`);
  currentAudio = audio;
  
  audio.addEventListener('play', () => {
    if (btn) {
      btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      btn.style.background = 'var(--accent)';
      btn.style.color = 'white';
    }
  });
  
  audio.addEventListener('ended', () => {
    if (btn) {
      btn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      btn.style.background = '';
      btn.style.color = '';
    }
    currentAudio = null;
    currentPlayBtn = null;
  });
  
  audio.addEventListener('error', () => {
    if (btn) {
      btn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      btn.style.background = '';
      btn.style.color = '';
    }
    currentAudio = null;
    currentPlayBtn = null;
  });
  
  audio.play().catch(() => {});
}

async function loadSongs() {
  const response = await fetch("/api/admin/songs", {
    cache: "no-store",
    headers: authHeaders()
  });
  if (response.status === 401) {
    window.location.reload();
    return;
  }
  const data = await response.json();
  renderSongs(data.songs || []);
}

async function uploadSong(event) {
  event.preventDefault();
  const file = songFileInput?.files?.[0];
  const title = songTitleInput?.value.trim() || "";
  if (!title || !file) {
    songUploadStatus.textContent = "请填写歌曲名称并选择音频文件";
    songUploadStatus.classList.add("visible");
    songUploadStatus.style.color = "#d44";
    return;
  }
  songUploadStatus.textContent = "上传中…";
  songUploadStatus.classList.add("visible");
  songUploadStatus.style.color = "var(--accent)";
  const formData = new FormData();
  formData.append("title", title);
  formData.append("fileName", file.name);
  formData.append("mimeType", file.type || "audio/mpeg");
  formData.append("file", file, file.name);
  const headers = authHeaders();
  delete headers["Content-Type"];
  const response = await fetch("/api/admin/songs", {
    method: "POST",
    headers,
    body: formData
  });
  if (response.status === 401) {
    window.location.reload();
    return;
  }
  const data = await response.json();
  if (!response.ok) {
    songUploadStatus.textContent = data.error || "上传失败";
    songUploadStatus.classList.add("visible");
    songUploadStatus.style.color = "#d44";
    return;
  }
  songUploadForm.reset();
  songUploadStatus.textContent = "✓ 已上传";
  songUploadStatus.classList.add("visible");
  songUploadStatus.style.color = "var(--accent)";
  renderSongs(data.songs || []);
}

async function deleteSong(id) {
  if (!id) return;
  songUploadStatus.textContent = "删除中…";
  songUploadStatus.classList.add("visible");
  songUploadStatus.style.color = "var(--accent)";
  const response = await fetch("/api/admin/songs", {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ id })
  });
  if (response.status === 401) {
    window.location.reload();
    return;
  }
  const data = await response.json();
  if (!response.ok) {
    songUploadStatus.textContent = data.error || "删除失败";
    songUploadStatus.classList.add("visible");
    songUploadStatus.style.color = "#d44";
    return;
  }
  songUploadStatus.textContent = "✓ 已删除";
  songUploadStatus.classList.add("visible");
  songUploadStatus.style.color = "var(--accent)";
  renderSongs(data.songs || []);
}

async function loadStats() {
  const response = await fetch("/api/admin/stats", {
    cache: "no-store",
    headers: authHeaders()
  });
  if (response.status === 401) {
    window.location.reload();
    return;
  }
  const data = await response.json();

  // Update dashboard stats
  if (onlineCount) onlineCount.textContent = data.onlineCount || 0;
  if (totalVisits) totalVisits.textContent = data.totalVisits || 0;

  if (data.cache) {
    const cacheHitRate = document.getElementById("cacheHitRate");
    const cacheSizeInfo = document.getElementById("cacheSizeInfo");

    if (cacheHitRate) {
      cacheHitRate.textContent = data.cache.hitRate || '0%';
    }
    if (cacheSizeInfo) {
      cacheSizeInfo.textContent = `${data.cache.size || 0} / ${data.cache.maxSize || 500}`;
    }
    if (currentCacheSize) currentCacheSize.textContent = data.cache.size || 0;
    if (currentCacheMax) currentCacheMax.textContent = data.cache.maxSize || 500;
  }
}

async function loadRecentConversations() {
  const listEl = document.getElementById("recentConversationsList");
  if (!listEl) return;

  try {
    const response = await fetch("/api/admin/conversations", {
      cache: "no-store",
      headers: authHeaders()
    });
    if (response.status === 401) {
      window.location.reload();
      return;
    }
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];

    const conversations = [];
    for (const item of items) {
      const ip = item.ip || "unknown";
      for (const session of (item.sessions || [])) {
        for (const conv of (session.conversations || [])) {
          conversations.push({
            ip,
            title: conv.title || "新对话",
            createdAt: conv.createdAt || 0,
            updatedAt: conv.updatedAt || 0,
            messageCount: conv.messageCount || 0,
            sessionId: session.sessionId || ""
          });
        }
      }
    }

    conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    const recent = conversations.slice(0, 10);

    if (recent.length === 0) {
      listEl.innerHTML = `<div class="empty-state">暂无对话记录</div>`;
      return;
    }

    listEl.innerHTML = recent.map(conv => `
      <div class="audit-token-row" style="padding:0.6rem 0;">
        <div>
          <span style="font-family:'DM Mono',monospace;font-size:0.72rem;color:var(--accent);">${escapeHtml(conv.ip)}</span>
          <span style="font-size:0.72rem;color:var(--text);margin-left:0.5rem;">${escapeHtml(conv.title)}</span>
          <span style="font-size:0.62rem;color:var(--text-dim);margin-left:0.5rem;">${conv.messageCount} 条</span>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'DM Mono',monospace;font-size:0.58rem;color:var(--text-dim);">开始: ${formatDateTime(conv.createdAt)}</div>
          <div style="font-family:'DM Mono',monospace;font-size:0.58rem;color:var(--accent);">最后: ${formatDateTime(conv.updatedAt)}</div>
        </div>
      </div>
    `).join("");
  } catch {
    if (listEl) {
      listEl.innerHTML = `<div class="empty-state">记录读取失败</div>`;
    }
  }
}

function formatTokenCount(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function formatDateTime(timestamp) {
  if (!timestamp) return "--";
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function roleLabel(role) {
  if (role === "user") return "用户";
  if (role === "assistant") return "角色";
  return role || "消息";
}

function auditActionButton(action, label, extra = "") {
  return `<button type="button" class="audit-action-btn" data-audit-action="${action}" ${extra}>${label}</button>`;
}

function updateAuditStats(items) {
  const totalIps = items.length;
  const totalTokens = items.reduce((sum, item) => sum + (item.totalTokens || 0), 0);
  const totalRequests = items.reduce((sum, item) => sum + (item.requests || 0), 0);
  const totalSessions = items.reduce((sum, item) => sum + (Array.isArray(item.sessions) ? item.sessions.length : 0), 0);
  
  if (auditTotalIps) auditTotalIps.textContent = totalIps;
  if (auditTotalTokens) auditTotalTokens.textContent = formatTokenCount(totalTokens);
  if (auditTotalRequests) auditTotalRequests.textContent = formatTokenCount(totalRequests);
  if (auditTotalSessions) auditTotalSessions.textContent = totalSessions;
}

function filterAndSortAuditItems(items) {
  let filtered = items;
  
  // 搜索过滤
  if (auditSearchQuery) {
    const query = auditSearchQuery.toLowerCase();
    filtered = items.filter(item => {
      const ip = (item.ip || "unknown").toLowerCase();
      return ip.includes(query);
    });
  }
  
  // 排序
  const sorted = [...filtered];
  switch (auditSortBy) {
    case "tokens":
      sorted.sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0));
      break;
    case "requests":
      sorted.sort((a, b) => (b.requests || 0) - (a.requests || 0));
      break;
    case "sessions":
      sorted.sort((a, b) => (Number(b.sessionCount) || (Array.isArray(b.sessions) ? b.sessions.length : 0)) - (Number(a.sessionCount) || (Array.isArray(a.sessions) ? a.sessions.length : 0)));
      break;
    case "recent":
      sorted.sort((a, b) => {
        const aTime = Number(a.latestAt) || Math.max(...(Array.isArray(a.sessions) ? a.sessions.map(s => {
          const convs = Array.isArray(s.conversations) ? s.conversations : [];
          return Math.max(...convs.map(c => c.updatedAt || 0), 0);
        }) : [0]), 0);
        const bTime = Number(b.latestAt) || Math.max(...(Array.isArray(b.sessions) ? b.sessions.map(s => {
          const convs = Array.isArray(s.conversations) ? s.conversations : [];
          return Math.max(...convs.map(c => c.updatedAt || 0), 0);
        }) : [0]), 0);
        return bTime - aTime;
      });
      break;
  }
  
  return sorted;
}

function renderIpAudit(data) {
  if (!ipAuditList) return;
  latestAudit = data;
  const allItems = Array.isArray(data.items) ? data.items : [];
  
  if (auditRetentionLabel) {
    auditRetentionLabel.textContent = `仅保留 ${data.retentionDays || 3} 天`;
  }
  pruneExpandedAuditKeys(allItems);
  
  // 更新统计
  updateAuditStats(allItems);
  
  // 过滤和排序
  const items = filterAndSortAuditItems(allItems);
  
  // 分页
  const totalPages = Math.max(1, Math.ceil(items.length / auditPageSize));
  if (auditCurrentPage > totalPages) auditCurrentPage = totalPages;
  const startIndex = (auditCurrentPage - 1) * auditPageSize;
  const endIndex = startIndex + auditPageSize;
  const pageItems = items.slice(startIndex, endIndex);
  
  // 更新分页控件
  if (auditPageInfo) auditPageInfo.textContent = `${auditCurrentPage} / ${totalPages}`;
  if (auditPrevPageBtn) auditPrevPageBtn.disabled = auditCurrentPage <= 1;
  if (auditNextPageBtn) auditNextPageBtn.disabled = auditCurrentPage >= totalPages;
  
  // 更新最后刷新时间
  if (auditLastRefresh) {
    const now = new Date();
    auditLastRefresh.textContent = `最后刷新: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  }
  
  if (items.length === 0) {
    ipAuditList.innerHTML = `<div class="empty-state">${auditSearchQuery ? "没有匹配的记录" : "暂无记录"}</div>`;
    return;
  }

  ipAuditList.innerHTML = pageItems.map((item) => {
    const sessions = Array.isArray(item.sessions) ? item.sessions : [];
    const tokenEvents = Array.isArray(item.tokenEvents) ? item.tokenEvents : [];
    const sessionHtml = sessions.length
      ? sessions.map((session) => {
          const conversations = Array.isArray(session.conversations) ? session.conversations : [];
          const conversationHtml = conversations.map((conversation) => {
            const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
            const userMessages = messages.filter(m => m.role === "user").length;
            const assistantMessages = messages.filter(m => m.role === "assistant").length;
            return `
                <div class="audit-conversation">
                  <div class="audit-title">
                    <span>${escapeHtml(conversation.title || "新对话")}</span>
                    <span class="audit-time">${formatDateTime(conversation.updatedAt)}</span>
                  </div>
                  <div style="font-size:0.72rem;color:var(--text-mid);padding:0.3rem 0;">
                    用户 ${userMessages} 条 · 角色 ${assistantMessages} 条 · 共 ${messages.length} 条
                  </div>
                  <div class="audit-inline-actions">
                    ${auditActionButton("edit-conversation", "编辑", `data-user-key="${escapeHtml(session.userKey)}" data-conversation-id="${escapeHtml(conversation.id)}"`)}
                    ${auditActionButton("delete-conversation", "删除", `data-user-key="${escapeHtml(session.userKey)}" data-conversation-id="${escapeHtml(conversation.id)}"`)}
                  </div>
                </div>
              `;
          }).join("");
          return `
          <div class="audit-session">
            <div class="audit-section-title">
              <span>会话 ${escapeHtml(session.sessionId || "未命名")}</span>
              <span class="audit-inline-actions">
                ${auditActionButton("create-conversation", "新增对话", `data-ip="${escapeHtml(item.ip || "unknown")}" data-session-id="${escapeHtml(session.sessionId || "")}"`)}
              </span>
            </div>
            ${conversationHtml || '<div class="empty-state">暂无对话</div>'}
          </div>
        `;
        }).join("")
      : `<div class="empty-state">暂无对话记录</div>`;
    const tokenHtml = tokenEvents.length
      ? tokenEvents.map((tokenEvent) => `
          <div class="audit-token-row">
            <span class="audit-token-main">${formatDateTime(tokenEvent.createdAt)} · ${escapeHtml(tokenEvent.sessionId || "无 session")} · ${formatTokenCount(tokenEvent.totalTokens || 0)} tokens</span>
            <span class="audit-inline-actions">
              ${auditActionButton("edit-token", "编辑", `data-event-id="${escapeHtml(tokenEvent.id)}"`)}
              ${auditActionButton("delete-token", "删除", `data-event-id="${escapeHtml(tokenEvent.id)}"`)}
            </span>
          </div>
        `).join("")
      : `<div class="empty-state">暂无消耗记录</div>`;
    const ip = normalizeAuditIp(item.ip);
    const auditKey = getAuditItemKey(item);
    const isExpanded = expandedIps.has(auditKey);
    const latestAt = Number(item.latestAt) || 0;
    const conversationCount = Number(item.conversationCount) || sessions.reduce((sum, session) => sum + ((session.conversations || []).length), 0);
    return `
      <div class="audit-item${isExpanded ? " open" : ""}" data-ip="${escapeHtml(ip)}" data-audit-key="${escapeHtml(auditKey)}">
        <button class="audit-summary" type="button" aria-expanded="${isExpanded ? "true" : "false"}">
          <span class="audit-ip">${escapeHtml(ip)}</span>
          <span class="audit-meta">${formatTokenCount(item.totalTokens || 0)} tokens · ${item.requests || 0} 次 · ${sessions.length} 个会话 · ${conversationCount} 个对话${latestAt ? ` · ${formatDateTime(latestAt)}` : ""}</span>
        </button>
        <div class="audit-detail">
          <div class="audit-toolbar">
            ${auditActionButton("edit-ip", "修改 IP", `data-ip="${escapeHtml(item.ip || "unknown")}"`)}
            ${auditActionButton("delete-ip", "清空 IP", `data-ip="${escapeHtml(item.ip || "unknown")}"`)}
            ${auditActionButton("create-token", "新增消耗", `data-ip="${escapeHtml(item.ip || "unknown")}"`)}
            ${auditActionButton("create-conversation", "新增对话", `data-ip="${escapeHtml(item.ip || "unknown")}"`)}
          </div>
          <div class="audit-grid">
            <div class="audit-panel">
              <div class="audit-section-title"><span>Token 消耗</span></div>
              ${tokenHtml}
            </div>
            <div class="audit-panel">
              <div class="audit-section-title"><span>对话记录</span></div>
              ${sessionHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function findAuditConversation(userKey, conversationId) {
  const items = Array.isArray(latestAudit?.items) ? latestAudit.items : [];
  for (const item of items) {
    for (const session of item.sessions || []) {
      if (session.userKey !== userKey) continue;
      const conversation = (session.conversations || []).find((entry) => entry.id === conversationId);
      if (conversation) return { item, session, conversation };
    }
  }
  return null;
}

function findAuditMessage(userKey, conversationId, messageId) {
  const match = findAuditConversation(userKey, conversationId);
  if (!match) return null;
  const message = (match.conversation.messages || []).find((entry) => entry.id === messageId);
  return message ? { ...match, message } : null;
}

function findAuditTokenEvent(eventId) {
  const items = Array.isArray(latestAudit?.items) ? latestAudit.items : [];
  for (const item of items) {
    const tokenEvent = (item.tokenEvents || []).find((entry) => entry.id === eventId);
    if (tokenEvent) return { item, tokenEvent };
  }
  return null;
}

async function sendAuditMutation(url, method, body, refreshStats = false) {
  const response = await fetch(url, {
    method,
    headers: authHeaders(),
    body: JSON.stringify(body)
  });
  if (response.status === 401) {
    window.location.reload();
    return null;
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "操作失败");
  }
  if (data.audit) {
    renderIpAudit(data.audit);
  } else {
    await loadIpAudit();
  }
  if (refreshStats) {
    loadTokenStats();
  }
  return data;
}

async function handleAuditAction(event) {
  const button = event.target.closest("[data-audit-action], .audit-summary");
  if (!button) return;
  if (button.classList.contains("audit-summary")) {
    const auditItem = button.closest(".audit-item");
    if (auditItem) {
      const auditKey = auditItem.getAttribute("data-audit-key") || `ip:${normalizeAuditIp(auditItem.getAttribute("data-ip"))}`;
      const nextOpen = !expandedIps.has(auditKey);
      if (nextOpen) {
        expandedIps.add(auditKey);
      } else {
        expandedIps.delete(auditKey);
      }
      auditItem.classList.toggle("open", nextOpen);
      button.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    }
    return;
  }

  const action = button.getAttribute("data-audit-action");
  try {
    if (action === "edit-ip") {
      const ip = button.getAttribute("data-ip") || "unknown";
      const nextIp = prompt("输入新的 IP", ip);
      if (!nextIp || nextIp === ip) return;
      await sendAuditMutation("/api/admin/audit/ip", "PATCH", { ip, nextIp }, true);
      return;
    }
    if (action === "delete-ip") {
      const ip = button.getAttribute("data-ip") || "unknown";
      if (!confirm(`确定清空 IP ${ip} 的所有消耗和对话记录吗？`)) return;
      await sendAuditMutation("/api/admin/audit/ip", "DELETE", { ip }, true);
      return;
    }
    if (action === "create-token") {
      const ip = button.getAttribute("data-ip") || "unknown";
      const sessionId = prompt("sessionId（可留空）", "");
      if (sessionId === null) return;
      const promptTokens = prompt("prompt tokens", "0");
      if (promptTokens === null) return;
      const completionTokens = prompt("completion tokens", "0");
      if (completionTokens === null) return;
      const totalTokens = prompt("total tokens", String((Number(promptTokens) || 0) + (Number(completionTokens) || 0)));
      if (totalTokens === null) return;
      await sendAuditMutation("/api/admin/token-event", "POST", {
        ip,
        sessionId,
        type: "chat",
        promptTokens: Number(promptTokens) || 0,
        completionTokens: Number(completionTokens) || 0,
        totalTokens: Number(totalTokens) || 0
      }, true);
      return;
    }
    if (action === "edit-token") {
      const eventId = button.getAttribute("data-event-id") || "";
      const match = findAuditTokenEvent(eventId);
      if (!match) throw new Error("找不到消耗记录");
      const promptTokens = prompt("prompt tokens", String(match.tokenEvent.promptTokens || 0));
      if (promptTokens === null) return;
      const completionTokens = prompt("completion tokens", String(match.tokenEvent.completionTokens || 0));
      if (completionTokens === null) return;
      const totalTokens = prompt("total tokens", String(match.tokenEvent.totalTokens || 0));
      if (totalTokens === null) return;
      const sessionId = prompt("sessionId", match.tokenEvent.sessionId || "");
      if (sessionId === null) return;
      await sendAuditMutation("/api/admin/token-event", "PATCH", {
        eventId,
        sessionId,
        promptTokens: Number(promptTokens) || 0,
        completionTokens: Number(completionTokens) || 0,
        totalTokens: Number(totalTokens) || 0
      }, true);
      return;
    }
    if (action === "delete-token") {
      const eventId = button.getAttribute("data-event-id") || "";
      if (!confirm("确定删除这条消耗记录吗？")) return;
      await sendAuditMutation("/api/admin/token-event", "DELETE", { eventId }, true);
      return;
    }
    if (action === "create-conversation") {
      const ip = button.getAttribute("data-ip") || "unknown";
      const defaultSessionId = button.getAttribute("data-session-id") || "";
      const sessionId = prompt("sessionId（留空则自动新建）", defaultSessionId);
      if (sessionId === null) return;
      const title = prompt("对话标题", "新对话");
      if (title === null) return;
      await sendAuditMutation("/api/admin/conversation", "POST", { ip, sessionId, title });
      return;
    }
    if (action === "edit-conversation") {
      const userKey = button.getAttribute("data-user-key") || "";
      const conversationId = button.getAttribute("data-conversation-id") || "";
      const match = findAuditConversation(userKey, conversationId);
      if (!match) throw new Error("找不到对话");
      const title = prompt("对话标题", match.conversation.title || "新对话");
      if (title === null) return;
      await sendAuditMutation("/api/admin/conversation", "PATCH", { userKey, conversationId, title });
      return;
    }
    if (action === "delete-conversation") {
      const userKey = button.getAttribute("data-user-key") || "";
      const conversationId = button.getAttribute("data-conversation-id") || "";
      if (!confirm("确定删除这个对话吗？")) return;
      await sendAuditMutation("/api/admin/conversation", "DELETE", { userKey, conversationId });
      return;
    }
    if (action === "create-message") {
      const userKey = button.getAttribute("data-user-key") || "";
      const conversationId = button.getAttribute("data-conversation-id") || "";
      const role = prompt("角色（user / assistant）", "assistant");
      if (role === null) return;
      const content = prompt("消息内容", "");
      if (content === null) return;
      await sendAuditMutation("/api/admin/message", "POST", { userKey, conversationId, role, content });
      return;
    }
    if (action === "edit-message") {
      const userKey = button.getAttribute("data-user-key") || "";
      const conversationId = button.getAttribute("data-conversation-id") || "";
      const messageId = button.getAttribute("data-message-id") || "";
      const match = findAuditMessage(userKey, conversationId, messageId);
      if (!match) throw new Error("找不到消息");
      const role = prompt("角色（user / assistant）", match.message.role || "assistant");
      if (role === null) return;
      const content = prompt("消息内容", match.message.content || "");
      if (content === null) return;
      await sendAuditMutation("/api/admin/message", "PATCH", { userKey, conversationId, messageId, role, content });
      return;
    }
    if (action === "delete-message") {
      const userKey = button.getAttribute("data-user-key") || "";
      const conversationId = button.getAttribute("data-conversation-id") || "";
      const messageId = button.getAttribute("data-message-id") || "";
      if (!confirm("确定删除这条消息吗？")) return;
      await sendAuditMutation("/api/admin/message", "DELETE", { userKey, conversationId, messageId });
    }
  } catch (error) {
    alert(error.message || "操作失败");
  }
}

async function loadIpAudit() {
  try {
    const response = await fetch("/api/admin/conversations", {
      cache: "no-store",
      headers: authHeaders()
    });
    if (response.status === 401) {
      window.location.reload();
      return;
    }
    renderIpAudit(await response.json());
  } catch {
    if (ipAuditList) {
      ipAuditList.innerHTML = `<div class="empty-state">记录读取失败</div>`;
    }
  }
}

async function loadTokenStats() {
  try {
    const response = await fetch(`/api/admin/token-stats?range=${encodeURIComponent(tokenRange)}`, {
      cache: "no-store",
      headers: authHeaders()
    });
    if (response.status === 401) {
      window.location.reload();
      return;
    }
    const data = await response.json();
    const chat = data.chat || data;
    const image = data.image || {};
    
    // Update dashboard token stats
    const tokenTotal = document.getElementById("tokenTotal");
    const tokenRequests = document.getElementById("tokenRequests");
    const imageTokenTotal = document.getElementById("imageTokenTotal");
    const imageTokenRequests = document.getElementById("imageTokenRequests");
    
    if (tokenTotal) tokenTotal.textContent = formatTokenCount(chat.totalTokens || 0);
    if (tokenRequests) tokenRequests.textContent = formatTokenCount(chat.requests || 0);
    if (imageTokenTotal) imageTokenTotal.textContent = formatTokenCount(image.totalTokens || 0);
    if (imageTokenRequests) imageTokenRequests.textContent = formatTokenCount(image.requests || 0);
    
    // Update detailed token stats
    const tokenTotalDetail = document.getElementById("tokenTotalDetail");
    const tokenRequestsDetail = document.getElementById("tokenRequestsDetail");
    const tokenPromptDetail = document.getElementById("tokenPromptDetail");
    const tokenCompletionDetail = document.getElementById("tokenCompletionDetail");
    const imageTokenTotalDetail = document.getElementById("imageTokenTotalDetail");
    const imageTokenRequestsDetail = document.getElementById("imageTokenRequestsDetail");
    const imageTokenPromptDetail = document.getElementById("imageTokenPromptDetail");
    const imageTokenCompletionDetail = document.getElementById("imageTokenCompletionDetail");
    
    if (tokenTotalDetail) tokenTotalDetail.textContent = formatTokenCount(chat.totalTokens || 0);
    if (tokenRequestsDetail) tokenRequestsDetail.textContent = formatTokenCount(chat.requests || 0);
    if (tokenPromptDetail) tokenPromptDetail.textContent = formatTokenCount(chat.totalPrompt || 0);
    if (tokenCompletionDetail) tokenCompletionDetail.textContent = formatTokenCount(chat.totalCompletion || 0);
    if (imageTokenTotalDetail) imageTokenTotalDetail.textContent = formatTokenCount(image.totalTokens || 0);
    if (imageTokenRequestsDetail) imageTokenRequestsDetail.textContent = formatTokenCount(image.requests || 0);
    if (imageTokenPromptDetail) imageTokenPromptDetail.textContent = formatTokenCount(image.totalPrompt || 0);
    if (imageTokenCompletionDetail) imageTokenCompletionDetail.textContent = formatTokenCount(image.totalCompletion || 0);
  } catch {}
}

function bindTokenRangeControls() {
  tokenRangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      tokenRange = button.getAttribute("data-token-range") || "all";
      tokenRangeButtons.forEach((item) => item.classList.toggle("active", item === button));
      loadTokenStats();
    });
  });
}

async function loadConfig() {
  const response = await fetch("/api/admin/config", {
    cache: "no-store",
    headers: authHeaders()
  });
  if (response.status === 401) {
    window.location.reload();
    return;
  }
  const config = await response.json();
  latestConfig = config;

  for (const [key, input] of Object.entries(apiFields)) {
    if (key === "chatApiKey" || key === "imageApiKey" || key === "semanticApiKey") {
      input.value = "";
      const configured = key === "chatApiKey"
        ? config.chatApiKeyConfigured
        : key === "semanticApiKey" ? config.semanticApiKeyConfigured : config.imageApiKeyConfigured;
      input.placeholder = configured
        ? "API Key 已保存，留空则保持不变"
        : "可留空";
      continue;
    }
    input.value = config[key] ?? "";
  }

  for (const [key, input] of Object.entries(siteFields)) {
    if (!input) continue;
    if (key === "adminPassword") {
      input.value = "";
      input.placeholder = config.adminPasswordSet
        ? "管理密码已设置，留空则保持不变"
        : "请设置管理密码";
      continue;
    }
    if (input.type === "checkbox") {
      input.checked = Boolean(config[key]);
      continue;
    }
    input.value = config[key] ?? "";
  }

  cacheMaxSizeInput.value = config.cacheMaxSize || 500;
  renderRoleConfig(config);

  const chatModels = Array.isArray(config.chatAvailableModels) ? config.chatAvailableModels : Array.isArray(config.availableModels) ? config.availableModels : [];
  const imageModels = Array.isArray(config.imageAvailableModels) ? config.imageAvailableModels : [];
  const semanticModels = Array.isArray(config.semanticAvailableModels) ? config.semanticAvailableModels : [];
  renderAvailableModels(chatModels, "chat");
  renderAvailableModels(imageModels, "image");
  renderAvailableModels(semanticModels, "semantic");
  renderImageDailyUsage(config.imageDailyUsage);
  apiSaveStatus.textContent = "";
  siteSaveStatus.textContent = "";
  setRoleStatus("");
}

async function saveApiConfig(event) {
  event.preventDefault();
  apiSaveStatus.textContent = "保存中…";
  apiSaveStatus.style.opacity = "1";
  apiSaveStatus.style.color = "var(--accent)";

  const payload = Object.fromEntries(
    Object.entries(apiFields).map(([key, input]) => [key, input.value])
  );

  const modelPills = availableModelsList?.querySelectorAll("[data-model]");
  if (modelPills && modelPills.length > 0) {
    payload.chatAvailableModels = Array.from(modelPills).map(b => b.getAttribute("data-model")).filter(Boolean);
  }
  const imageModelPills = imageAvailableModelsList?.querySelectorAll("[data-model]");
  if (imageModelPills && imageModelPills.length > 0) {
    payload.imageAvailableModels = Array.from(imageModelPills).map(b => b.getAttribute("data-model")).filter(Boolean);
  }
  const semanticModelPills = semanticAvailableModelsList?.querySelectorAll("[data-model]");
  if (semanticModelPills && semanticModelPills.length > 0) {
    payload.semanticAvailableModels = Array.from(semanticModelPills).map(b => b.getAttribute("data-model")).filter(Boolean);
  }

  const response = await fetch("/api/admin/config", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });

  if (response.status === 401) {
    window.location.reload();
    return;
  }

  const data = await response.json();
  if (!response.ok) {
    apiSaveStatus.textContent = data.error || "保存失败";
    apiSaveStatus.style.color = "#d44";
    return;
  }

  apiSaveStatus.textContent = "✓ 已保存";
  apiSaveStatus.style.color = "var(--accent)";
  renderImageDailyUsage(data.config?.imageDailyUsage);
}

async function saveSiteConfig(event) {
  event.preventDefault();
  siteSaveStatus.textContent = "保存中…";
  siteSaveStatus.style.opacity = "1";
  siteSaveStatus.style.color = "var(--accent)";

  const payload = {};
  for (const [key, input] of Object.entries(siteFields)) {
    if (!input) continue;
    payload[key] = input.type === "checkbox" ? input.checked : input.value;
  }

  payload.cacheMaxSize = parseInt(cacheMaxSizeInput.value) || 500;

  const response = await fetch("/api/admin/config", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });

  if (response.status === 401) {
    window.location.reload();
    return;
  }

  const data = await response.json();
  if (!response.ok) {
    siteSaveStatus.textContent = data.error || "保存失败";
    siteSaveStatus.style.color = "#d44";
    return;
  }

  siteSaveStatus.textContent = "✓ 已保存";
  siteSaveStatus.style.color = "var(--accent)";
}

async function saveRoleConfig(event) {
  event.preventDefault();
  const previousActiveRoleId = activeRoleId;
  const previousDefaultRoleId = defaultCharacterIdSelect?.value || "";
  if (!updateActiveRoleFromEditor()) return;
  renderDefaultRoleOptions(previousDefaultRoleId === previousActiveRoleId ? activeRoleId : previousDefaultRoleId);
  if (!roleCharacters.length) {
    setRoleStatus("至少需要保留一个角色", true);
    return;
  }
  const defaultCharacterId = defaultCharacterIdSelect?.value || roleCharacters[0].id;
  const defaultRole = roleCharacters.find((role) => role.id === defaultCharacterId) || roleCharacters[0];
  if (!defaultRole?.systemPrompt) {
    setRoleStatus("默认角色系统提示词不能为空", true);
    return;
  }

  setRoleStatus("保存中…");
  const payload = {
    defaultCharacterId: defaultRole.id,
    systemPrompt: defaultRole.systemPrompt,
    characters: roleCharacters
  };

  const response = await fetch("/api/admin/config", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });

  if (response.status === 401) {
    window.location.reload();
    return;
  }

  const data = await response.json();
  if (!response.ok) {
    setRoleStatus(data.error || "保存失败", true);
    return;
  }

  latestConfig = data.config || latestConfig;
  renderRoleConfig(latestConfig || { characters: roleCharacters, defaultCharacterId: defaultRole.id });
  setRoleStatus("✓ 已保存");
}

function addRole() {
  if (!updateActiveRoleFromEditor()) return;
  const role = createBlankRole();
  roleCharacters.push(role);
  activeRoleId = role.id;
  renderDefaultRoleOptions();
  fillRoleEditor(activeRoleId);
  renderRoleList();
  setRoleStatus("已新增角色，保存后生效");
}

function deleteActiveRole() {
  if (roleCharacters.length <= 1) {
    setRoleStatus("至少需要保留一个角色", true);
    return;
  }
  const role = roleCharacters.find((item) => item.id === activeRoleId);
  if (!role) return;
  const confirmed = confirm(`确定删除角色「${role.name}」吗？`);
  if (!confirmed) return;
  roleCharacters = roleCharacters.filter((item) => item.id !== activeRoleId);
  activeRoleId = roleCharacters[0]?.id || "";
  renderDefaultRoleOptions();
  fillRoleEditor(activeRoleId);
  renderRoleList();
  setRoleStatus("已删除角色，保存后生效");
}

async function fetchModels(target = "chat") {
  const isImage = target === "image";
  const isSemantic = target === "semantic";
  const button = isImage ? fetchImageModelsButton : isSemantic ? fetchSemanticModelsButton : fetchModelsButton;
  const status = isImage ? fetchImageModelsStatus : isSemantic ? fetchSemanticModelsStatus : fetchModelsStatus;
  const baseUrlInput = isImage ? apiFields.imageBaseUrl : isSemantic ? apiFields.semanticBaseUrl : apiFields.chatBaseUrl;
  const apiKeyInput = isImage ? apiFields.imageApiKey : isSemantic ? apiFields.semanticApiKey : apiFields.chatApiKey;
  const modelInput = isImage ? apiFields.imageModel : isSemantic ? apiFields.semanticModel : apiFields.chatModel;

  status.textContent = "获取中…";
  status.style.opacity = "1";
  status.style.color = "var(--text-dim)";
  button.disabled = true;

  try {
    const bodyPayload = {
      target,
      baseUrl: baseUrlInput.value,
      apiKey: apiKeyInput.value
    };
    const response = await fetch("/api/admin/models/fetch", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(bodyPayload)
    });
    if (response.status === 401) {
      window.location.reload();
      return;
    }
    const data = await readJsonResponse(response);
    if (!response.ok) {
      status.textContent = data.error || "获取失败";
      status.style.color = "#d44";
      return;
    }

    const models = Array.isArray(data.models) ? data.models : [];
    renderAvailableModels(models, target);
    if (!modelInput.value.trim() && models.length > 0) {
      modelInput.value = models[0];
    }
    status.textContent = "模型列表已更新";
    status.style.color = "var(--accent)";
  } catch (error) {
    status.textContent = error.message || "获取失败";
    status.style.color = "#d44";
  } finally {
    button.disabled = false;
  }
}

async function testConnection() {
  const btn = document.getElementById("testConnectionButton");
  const status = document.getElementById("testConnectionStatus");
  const result = document.getElementById("testConnectionResult");
  btn.disabled = true;
  btn.textContent = "测试中…";
  status.textContent = "";
  result.textContent = "正在向对话 API 发送测试请求…";
  result.style.color = "var(--text-dim)";

  try {
    const response = await fetch("/api/admin/test-connection", {
      method: "POST",
      headers: authHeaders()
    });
    if (response.status === 401) {
      window.location.reload();
      return;
    }
    const data = await readJsonResponse(response);
    if (data.ok) {
      status.textContent = "✓ 连通成功";
      status.classList.add("visible");
      result.textContent = data.message;
      result.style.color = "var(--accent)";
    } else {
      status.textContent = "✗ 连通失败";
      status.classList.add("visible");
      result.textContent = data.message;
      result.style.color = "#d44";
    }
  } catch (error) {
    status.textContent = "✗ 请求失败";
    status.classList.add("visible");
    result.textContent = error.message;
    result.style.color = "#d44";
  } finally {
    btn.disabled = false;
    btn.textContent = "测试对话 API";
  }
}

async function testImageConnection() {
  const btn = document.getElementById("testImageConnectionButton");
  const status = document.getElementById("testImageConnectionStatus");
  const result = document.getElementById("testImageConnectionResult");
  btn.disabled = true;
  btn.textContent = "测试中…";
  status.textContent = "";
  result.textContent = "正在向图片 API 发送测试请求…";
  result.style.color = "var(--text-dim)";

  try {
    const response = await fetch("/api/admin/test-image-connection", {
      method: "POST",
      headers: authHeaders()
    });
    if (response.status === 401) {
      window.location.reload();
      return;
    }
    const data = await readJsonResponse(response);
    status.textContent = data.ok ? "✓ 图片连通成功" : "✗ 图片连通失败";
    status.classList.add("visible");
    result.textContent = data.message;
    result.style.color = data.ok ? "var(--accent)" : "#d44";
  } catch (error) {
    status.textContent = "✗ 请求失败";
    status.classList.add("visible");
    result.textContent = error.message;
    result.style.color = "#d44";
  } finally {
    btn.disabled = false;
    btn.textContent = "测试图片 API";
  }
}

async function testSemanticConnection() {
  const btn = document.getElementById("testSemanticConnectionButton");
  const status = document.getElementById("testSemanticConnectionStatus");
  const result = document.getElementById("testSemanticConnectionResult");
  btn.disabled = true;
  btn.textContent = "测试中…";
  status.textContent = "";
  result.textContent = "正在向语义理解 API 发送测试请求…";
  result.style.color = "var(--text-dim)";

  try {
    const response = await fetch("/api/admin/test-semantic-connection", {
      method: "POST",
      headers: authHeaders()
    });
    if (response.status === 401) {
      window.location.reload();
      return;
    }
    const data = await readJsonResponse(response);
    status.textContent = data.ok ? "✓ 语义理解连通成功" : "✗ 语义理解连通失败";
    status.classList.add("visible");
    result.textContent = data.message;
    result.style.color = data.ok ? "var(--accent)" : "#d44";
  } catch (error) {
    status.textContent = "✗ 请求失败";
    status.classList.add("visible");
    result.textContent = error.message;
    result.style.color = "#d44";
  } finally {
    btn.disabled = false;
    btn.textContent = "测试语义理解 API";
  }
}

async function initAdmin() {
  if (adminInitialized) {
    await Promise.all([loadStats(), loadConfig(), loadTokenStats(), loadIpAudit(), loadSongs(), loadRecentConversations()]);
    return;
  }
  adminInitialized = true;
  apiConfigForm.addEventListener("submit", saveApiConfig);
  siteConfigForm.addEventListener("submit", saveSiteConfig);
  roleConfigForm?.addEventListener("submit", saveRoleConfig);
  addRoleButton?.addEventListener("click", addRole);
  deleteRoleButton?.addEventListener("click", deleteActiveRole);
  [...Object.values(roleFields), ...Object.values(roleThemeFields), defaultCharacterIdSelect]
    .filter(Boolean)
    .forEach((input) => {
      input.addEventListener("input", () => setRoleStatus("未保存"));
      input.addEventListener("change", () => setRoleStatus("未保存"));
    });
  songUploadForm?.addEventListener("submit", uploadSong);

  if (songFileInput && songFileText) {
    songFileInput.addEventListener("change", () => {
      const file = songFileInput.files?.[0];
      songFileText.textContent = file ? file.name : "未选择文件";
    });
  }

  clearCacheBtn.addEventListener("click", async () => {
    if (!confirm("确定要清空所有缓存吗？")) return;
    try {
      const response = await fetch("/api/admin/cache/clear", {
        method: "POST",
        headers: authHeaders()
      });
      if (response.status === 401) {
        window.location.reload();
        return;
      }
      const data = await response.json();
      if (data.ok) {
        alert(`已清空 ${data.cleared} 条缓存`);
        loadStats();
      }
    } catch (error) {
      alert("清空缓存失败：" + error.message);
    }
  });

  fetchModelsButton.addEventListener("click", () => fetchModels("chat"));
  fetchImageModelsButton.addEventListener("click", () => fetchModels("image"));
  fetchSemanticModelsButton.addEventListener("click", () => fetchModels("semantic"));
  ipAuditList?.addEventListener("click", handleAuditAction);
  apiModalTabs.forEach((button) => {
    button.addEventListener("click", () => switchApiPanel(button.getAttribute("data-api-panel")));
  });
  document.getElementById("testConnectionButton").addEventListener("click", testConnection);
  document.getElementById("testImageConnectionButton").addEventListener("click", testImageConnection);
  document.getElementById("testSemanticConnectionButton").addEventListener("click", testSemanticConnection);
  bindTokenRangeControls();
  
  // IP审计相关事件监听
  if (auditSearchInput) {
    auditSearchInput.addEventListener("input", (e) => {
      auditSearchQuery = e.target.value.trim();
      auditCurrentPage = 1;
      if (latestAudit) renderIpAudit(latestAudit);
    });
  }
  
  if (auditSortSelect) {
    auditSortSelect.addEventListener("change", (e) => {
      auditSortBy = e.target.value;
      auditCurrentPage = 1;
      if (latestAudit) renderIpAudit(latestAudit);
    });
  }
  
  if (auditRefreshButton) {
    auditRefreshButton.addEventListener("click", async () => {
      auditRefreshButton.disabled = true;
      auditRefreshButton.textContent = "刷新中...";
      await loadIpAudit();
      auditRefreshButton.disabled = false;
      auditRefreshButton.textContent = "刷新";
    });
  }
  
  if (auditPageSizeSelect) {
    auditPageSizeSelect.addEventListener("change", (e) => {
      auditPageSize = parseInt(e.target.value) || 20;
      auditCurrentPage = 1;
      if (latestAudit) renderIpAudit(latestAudit);
    });
  }
  
  if (auditPrevPageBtn) {
    auditPrevPageBtn.addEventListener("click", () => {
      if (auditCurrentPage > 1) {
        auditCurrentPage--;
        if (latestAudit) renderIpAudit(latestAudit);
      }
    });
  }
  
  if (auditNextPageBtn) {
    auditNextPageBtn.addEventListener("click", () => {
      if (latestAudit) {
        const items = filterAndSortAuditItems(latestAudit.items || []);
        const totalPages = Math.max(1, Math.ceil(items.length / auditPageSize));
        if (auditCurrentPage < totalPages) {
          auditCurrentPage++;
          renderIpAudit(latestAudit);
        }
      }
    });
  }
  
  await Promise.all([loadStats(), loadConfig(), loadTokenStats(), loadIpAudit(), loadSongs(), loadRecentConversations()]);
  statsTimer = setInterval(() => { loadStats(); loadTokenStats(); loadIpAudit(); loadRecentConversations(); }, 5000);
}

window.addEventListener("beforeunload", () => {
  if (statsTimer) clearInterval(statsTimer);
});
