const onlineCount = document.getElementById("onlineCount");
const totalVisits = document.getElementById("totalVisits");
const cacheBadge = document.getElementById("cacheBadge");
const clearCacheBtn = document.getElementById("clearCacheBtn");
const cacheMaxSizeInput = document.getElementById("cacheMaxSizeInput");
const currentCacheSize = document.getElementById("currentCacheSize");
const currentCacheMax = document.getElementById("currentCacheMax");
const apiConfigForm = document.getElementById("apiConfigForm");
const siteConfigForm = document.getElementById("siteConfigForm");
const apiSaveStatus = document.getElementById("apiSaveStatus");
const siteSaveStatus = document.getElementById("siteSaveStatus");
const fetchModelsButton = document.getElementById("fetchModelsButton");
const fetchModelsStatus = document.getElementById("fetchModelsStatus");
const availableModelsList = document.getElementById("availableModelsList");
const fetchImageModelsButton = document.getElementById("fetchImageModelsButton");
const fetchImageModelsStatus = document.getElementById("fetchImageModelsStatus");
const imageAvailableModelsList = document.getElementById("imageAvailableModelsList");
const songUploadForm = document.getElementById("songUploadForm");
const songTitleInput = document.getElementById("songTitleInput");
const songFileInput = document.getElementById("songFileInput");
const songUploadStatus = document.getElementById("songUploadStatus");
const songList = document.getElementById("songList");
const songFileText = document.getElementById("songFileText");
const apiModalTabs = document.querySelectorAll("[data-api-panel]");
const apiPanels = {
  chat: document.getElementById("chatApiPanel"),
  image: document.getElementById("imageApiPanel")
};
const tokenRangeButtons = document.querySelectorAll("[data-token-range]");

const apiFields = {
  chatBaseUrl: document.getElementById("chatBaseUrlInput"),
  chatApiKey: document.getElementById("chatApiKeyInput"),
  chatModel: document.getElementById("chatModelInput"),
  temperature: document.getElementById("temperatureInput"),
  maxTokens: document.getElementById("maxTokensInput"),
  imageBaseUrl: document.getElementById("imageBaseUrlInput"),
  imageApiKey: document.getElementById("imageApiKeyInput"),
  imageModel: document.getElementById("imageModelInput"),
  imageSize: document.getElementById("imageSizeInput")
};

const siteFields = {
  siteName: document.getElementById("siteNameInput"),
  siteSubtitle: document.getElementById("siteSubtitleInput"),
  assistantAvatarPath: document.getElementById("assistantAvatarPathInput"),
  userAvatarPath: document.getElementById("userAvatarPathInput"),
  systemPrompt: document.getElementById("systemPromptInput"),
  adminPassword: document.getElementById("adminPasswordInput")
};

let statsTimer = null;
let adminInitialized = false;
let tokenRange = "1d";

function getModelUi(target = "chat") {
  const isImage = target === "image";
  return {
    listEl: isImage ? imageAvailableModelsList : availableModelsList,
    modelInput: isImage ? apiFields.imageModel : apiFields.chatModel,
    label: isImage ? "图片" : "对话"
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

function switchApiPanel(target) {
  const panel = target === "image" ? "image" : "chat";
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
        <div class="song-meta">AI流萤翻唱 · ${formatFileSize(song.size)}</div>
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
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
  if (file.size > 20 * 1024 * 1024) {
    songUploadStatus.textContent = "音频文件不能超过 20MB";
    songUploadStatus.classList.add("visible");
    songUploadStatus.style.color = "#d44";
    return;
  }

  songUploadStatus.textContent = "上传中…";
  songUploadStatus.classList.add("visible");
  songUploadStatus.style.color = "var(--accent)";
  const dataUrl = await readFileAsDataUrl(file);
  const response = await fetch("/api/admin/songs", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      title,
      fileName: file.name,
      mimeType: file.type || "audio/mpeg",
      dataUrl
    })
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
  onlineCount.textContent = data.onlineCount || 0;
  totalVisits.textContent = data.totalVisits || 0;

  if (data.cache) {
    cacheBadge.textContent = data.cache.hitRate || '0%';
    cacheBadge.title = `缓存命中率: ${data.cache.hitRate}\n命中: ${data.cache.hits} 次\n未命中: ${data.cache.misses} 次`;
    currentCacheSize.textContent = data.cache.size || 0;
    currentCacheMax.textContent = data.cache.maxSize || 500;
  }
}

function formatTokenCount(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
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
  document.getElementById("tokenTotal").textContent = formatTokenCount(chat.totalTokens || 0);
  document.getElementById("tokenRequests").textContent = formatTokenCount(chat.requests || 0);
  document.getElementById("tokenPrompt").textContent = formatTokenCount(chat.totalPrompt || 0);
  document.getElementById("tokenCompletion").textContent = formatTokenCount(chat.totalCompletion || 0);
  document.getElementById("imageTokenTotal").textContent = formatTokenCount(image.totalTokens || 0);
  document.getElementById("imageTokenRequests").textContent = formatTokenCount(image.requests || 0);
  document.getElementById("imageTokenPrompt").textContent = formatTokenCount(image.totalPrompt || 0);
  document.getElementById("imageTokenCompletion").textContent = formatTokenCount(image.totalCompletion || 0);
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

  for (const [key, input] of Object.entries(apiFields)) {
    if (key === "chatApiKey" || key === "imageApiKey") {
      input.value = "";
      const configured = key === "chatApiKey" ? config.chatApiKeyConfigured : config.imageApiKeyConfigured;
      input.placeholder = configured
        ? "API Key 已保存，留空则保持不变"
        : "可留空";
      continue;
    }
    input.value = config[key] ?? "";
  }

  for (const [key, input] of Object.entries(siteFields)) {
    if (key === "adminPassword") {
      input.value = "";
      input.placeholder = config.adminPasswordSet
        ? "管理密码已设置，留空则保持不变"
        : "请设置管理密码";
      continue;
    }
    input.value = config[key] ?? "";
  }

  cacheMaxSizeInput.value = config.cacheMaxSize || 500;

  const chatModels = Array.isArray(config.chatAvailableModels) ? config.chatAvailableModels : Array.isArray(config.availableModels) ? config.availableModels : [];
  const imageModels = Array.isArray(config.imageAvailableModels) ? config.imageAvailableModels : [];
  renderAvailableModels(chatModels, "chat");
  renderAvailableModels(imageModels, "image");
  apiSaveStatus.textContent = "";
  siteSaveStatus.textContent = "";
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
}

async function saveSiteConfig(event) {
  event.preventDefault();
  siteSaveStatus.textContent = "保存中…";
  siteSaveStatus.style.opacity = "1";
  siteSaveStatus.style.color = "var(--accent)";

  const payload = Object.fromEntries(
    Object.entries(siteFields).map(([key, input]) => [key, input.value])
  );

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

async function fetchModels(target = "chat") {
  const isImage = target === "image";
  const button = isImage ? fetchImageModelsButton : fetchModelsButton;
  const status = isImage ? fetchImageModelsStatus : fetchModelsStatus;
  const baseUrlInput = isImage ? apiFields.imageBaseUrl : apiFields.chatBaseUrl;
  const apiKeyInput = isImage ? apiFields.imageApiKey : apiFields.chatApiKey;
  const modelInput = isImage ? apiFields.imageModel : apiFields.chatModel;

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
    const data = await response.json();
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
    const data = await response.json();
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
  const status = document.getElementById("testConnectionStatus");
  const result = document.getElementById("testConnectionResult");
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
    const data = await response.json();
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

async function initAdmin() {
  if (adminInitialized) {
    await Promise.all([loadStats(), loadConfig(), loadTokenStats(), loadSongs()]);
    return;
  }
  adminInitialized = true;
  apiConfigForm.addEventListener("submit", saveApiConfig);
  siteConfigForm.addEventListener("submit", saveSiteConfig);
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
  apiModalTabs.forEach((button) => {
    button.addEventListener("click", () => switchApiPanel(button.getAttribute("data-api-panel")));
  });
  document.getElementById("testConnectionButton").addEventListener("click", testConnection);
  document.getElementById("testImageConnectionButton").addEventListener("click", testImageConnection);
  bindTokenRangeControls();
  await Promise.all([loadStats(), loadConfig(), loadTokenStats(), loadSongs()]);
  statsTimer = setInterval(() => { loadStats(); loadTokenStats(); }, 5000);
}

window.addEventListener("beforeunload", () => {
  if (statsTimer) clearInterval(statsTimer);
});
