const chatBody = document.getElementById("chatBody");
const typingRow = document.getElementById("typingRow");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const visitorCount = document.getElementById("visitorCount");
const siteName = document.getElementById("siteName");
const siteSubtitle = document.getElementById("siteSubtitle");
const modelChip = document.getElementById("modelChip");
const composerHint = document.getElementById("composerHint");
const headerSub = document.getElementById("headerSub");
const headerDot = document.getElementById("headerDot");
const newConversationButton = document.getElementById("newConversationButton");
const toggleSessionPanelButton = document.getElementById("toggleSessionPanelButton");
const sessionPanel = document.getElementById("sessionPanel");
const sessionModeText = document.getElementById("sessionModeText");
const conversationList = document.getElementById("conversationList");
const toggleCustomApiPanelButton = document.getElementById("toggleCustomApiPanelButton");
const customApiPanel = document.getElementById("customApiPanel");
const customImageBaseUrlInput = document.getElementById("customImageBaseUrlInput");
const customImageApiKeyInput = document.getElementById("customImageApiKeyInput");
const customImageModelInput = document.getElementById("customImageModelInput");
const customImageSizeInput = document.getElementById("customImageSizeInput");
const clearCustomApiButton = document.getElementById("clearCustomApiButton");
const closeCustomApiPanelButton = document.getElementById("closeCustomApiPanelButton");
const customApiStatus = document.getElementById("customApiStatus");
const openNoticeButton = document.getElementById("openNoticeButton");
const noticeModal = document.getElementById("noticeModal");
const noticeTitle = document.getElementById("noticeTitle");
const noticeContent = document.getElementById("noticeContent");
const noticeCloseButton = document.getElementById("noticeCloseButton");
const panelStatus = document.getElementById("panelStatus");
const characterSwitcher = document.getElementById("characterSwitcher");
const chatTitle = document.getElementById("chatTitle");
const visualPanel = document.querySelector(".visual-panel");
const visualPortrait = document.getElementById("visualPortrait");
const characterEyebrow = document.getElementById("characterEyebrow");
const characterQuoteLabel = document.getElementById("characterQuoteLabel");
const characterQuote = document.getElementById("characterQuote");
const characterTraitRow = document.getElementById("characterTraitRow");
const typingAvatar = document.getElementById("typingAvatar");

const toggleAvatarPanelButton = document.getElementById("toggleAvatarPanelButton");
const avatarPanel = document.getElementById("avatarPanel");
const headerUserAvatar = document.getElementById("headerUserAvatar");
const avatarPreview = document.getElementById("avatarPreview");
const avatarFileInput = document.getElementById("avatarFileInput");
const avatarFileText = document.getElementById("avatarFileText");
const avatarUrlInput = document.getElementById("avatarUrlInput");
const saveAvatarButton = document.getElementById("saveAvatarButton");
const closeAvatarPanelButton = document.getElementById("closeAvatarPanelButton");
const avatarStatus = document.getElementById("avatarStatus");

const CONVERSATION_KEY = "firefly-chat-conversation-v2";
const CHARACTER_KEY = "firefly-chat-character-v1";
const USER_AVATAR_KEY = "firefly-chat-user-avatar-v1";
const NOTICE_SEEN_PREFIX = "firefly-chat-announcement-seen-v1:";

let activeConversationId = localStorage.getItem(CONVERSATION_KEY) || "";
let activeCharacterId = localStorage.getItem(CHARACTER_KEY) || "";
let heartbeatTimer = null;
let assistantAvatarUrl = "/api/avatar/assistant";
let userAvatarUrl = localStorage.getItem(USER_AVATAR_KEY) || "/api/avatar/user";
let conversations = [];
let currentMessages = [];
let modelName = "";
let announcementConfig = { enabled: false, title: "公告", html: "", seenKey: "" };
let characters = [];
let activeCharacter = null;
let characterSwitchAnimationTimer = null;

function setPanelStatus(text, isError = false) {
  if (!panelStatus) return;
  panelStatus.textContent = text || "";
  panelStatus.classList.toggle("error", Boolean(isError));
}

function setSessionPanelOpen(open) {
  sessionPanel.classList.toggle("open", open);
  if (open) {
    avatarPanel.classList.remove("open");
    customApiPanel.classList.remove("open");
  }
}

function setAvatarPanelOpen(open) {
  avatarPanel.classList.toggle("open", open);
  if (open) {
    sessionPanel.classList.remove("open");
    customApiPanel.classList.remove("open");
    avatarPreview.src = userAvatarUrl;
    avatarUrlInput.value = "";
    avatarFileText.textContent = "未选择文件";
    avatarStatus.textContent = "";
  }
}

function setCustomApiPanelOpen(open) {
  customApiPanel.classList.toggle("open", open);
  if (open) {
    sessionPanel.classList.remove("open");
    avatarPanel.classList.remove("open");
    updateCustomApiStatus();
  }
}

function setAvatarStatus(text, isError = false) {
  if (!avatarStatus) return;
  avatarStatus.textContent = text || "";
  avatarStatus.style.color = isError ? "#d44" : "var(--accent)";
}

function setCustomApiStatus(text, isError = false) {
  if (!customApiStatus) return;
  customApiStatus.textContent = text || "";
  customApiStatus.style.color = isError ? "#d44" : "var(--accent)";
}

function getCustomImageApiPayload() {
  const baseUrl = customImageBaseUrlInput?.value.trim() || "";
  const apiKey = customImageApiKeyInput?.value.trim() || "";
  const model = customImageModelInput?.value.trim() || "";
  if (!baseUrl || !model) return null;
  return {
    baseUrl,
    apiKey,
    model,
    size: customImageSizeInput?.value || "1024x1024"
  };
}

function updateCustomApiStatus() {
  const baseUrl = customImageBaseUrlInput?.value.trim() || "";
  const apiKey = customImageApiKeyInput?.value.trim() || "";
  const model = customImageModelInput?.value.trim() || "";
  if (!baseUrl && !apiKey && !model) {
    setCustomApiStatus("");
    return;
  }
  if (!baseUrl || !model) {
    setCustomApiStatus("需要填写 Base URL 和模型名称后才会启用。", true);
    return;
  }
  setCustomApiStatus("图片生成会优先使用这组临时 API。");
}

function clearCustomApiFields() {
  if (customImageBaseUrlInput) customImageBaseUrlInput.value = "";
  if (customImageApiKeyInput) customImageApiKeyInput.value = "";
  if (customImageModelInput) customImageModelInput.value = "";
  if (customImageSizeInput) customImageSizeInput.value = "1024x1024";
  setCustomApiStatus("");
}

function setNoticeModalOpen(open, remember = true) {
  if (!noticeModal) return;
  if (open && !announcementConfig.html.trim()) {
    renderAnnouncement({ enabled: true, title: "公告", html: "<p>暂无公告。</p>" });
  }
  noticeModal.classList.toggle("open", open);
  if (open) {
    setSessionPanelOpen(false);
  } else if (remember && announcementConfig.seenKey) {
    localStorage.setItem(announcementConfig.seenKey, "1");
  }
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function isSafeAnnouncementUrl(name, value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("/")) return true;

  try {
    const url = new URL(trimmed, window.location.origin);
    if (name === "src" && url.protocol === "data:") {
      return /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(trimmed);
    }
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function sanitizeAnnouncementHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const blockedTags = new Set([
    "script", "iframe", "object", "embed", "link", "meta", "base",
    "form", "input", "button", "textarea", "select", "option"
  ]);

  for (const node of Array.from(template.content.querySelectorAll("*"))) {
    const tagName = node.tagName.toLowerCase();
    if (blockedTags.has(tagName)) {
      node.remove();
      continue;
    }

    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith("on") || name === "srcdoc") {
        node.removeAttribute(attr.name);
        continue;
      }
      if (["href", "src", "xlink:href"].includes(name) && !isSafeAnnouncementUrl(name, value)) {
        node.removeAttribute(attr.name);
      }
    }

    if (tagName === "a") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  }

  return template.innerHTML.trim();
}

function renderAnnouncement(announcement) {
  const title = String(announcement?.title || "公告").trim() || "公告";
  const html = sanitizeAnnouncementHtml(announcement?.html || "");
  const enabled = Boolean(announcement?.enabled) && Boolean(html);
  const seenKey = html ? `${NOTICE_SEEN_PREFIX}${hashText(`${title}\n${html}`)}` : "";
  announcementConfig = { enabled, title, html, seenKey };

  if (noticeTitle) {
    noticeTitle.textContent = title;
  }
  if (noticeContent) {
    noticeContent.innerHTML = html || "<p>暂无公告。</p>";
  }
  if (openNoticeButton) {
    openNoticeButton.hidden = !enabled;
  }
}

function shouldAutoShowAnnouncement() {
  return announcementConfig.enabled &&
    announcementConfig.seenKey &&
    localStorage.getItem(announcementConfig.seenKey) !== "1";
}

function formatMessageTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function autoResize() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 100)}px`;
}

function scrollToBottom(smooth = false) {
  if (smooth) {
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
  } else {
    chatBody.scrollTop = chatBody.scrollHeight;
  }
}

let currentVoiceAudio = null;
let currentVoiceBar = null;

function toggleVoicePlay(voiceBar, songUrl) {
  if (currentVoiceAudio && currentVoiceBar === voiceBar) {
    currentVoiceAudio.pause();
    currentVoiceAudio = null;
    currentVoiceBar = null;
    voiceBar.classList.remove("playing");
    return;
  }

  if (currentVoiceAudio) {
    currentVoiceAudio.pause();
    if (currentVoiceBar) {
      currentVoiceBar.classList.remove("playing");
    }
  }

  const audio = new Audio(songUrl);
  currentVoiceAudio = audio;
  currentVoiceBar = voiceBar;
  voiceBar.classList.add("playing");

  audio.addEventListener("ended", () => {
    voiceBar.classList.remove("playing");
    currentVoiceAudio = null;
    currentVoiceBar = null;
  });

  audio.addEventListener("error", () => {
    voiceBar.classList.remove("playing");
    currentVoiceAudio = null;
    currentVoiceBar = null;
  });

  audio.play().catch(() => {
    voiceBar.classList.remove("playing");
    currentVoiceAudio = null;
    currentVoiceBar = null;
  });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hexToRgb(hex) {
  const match = String(hex || "").trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return "46, 168, 122";
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ].join(", ");
}

function getActiveCharacter() {
  return characters.find((item) => item.id === activeCharacterId) || characters[0] || null;
}

function normalizePortraitOffsetX(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(320, Math.max(-320, Math.round(numeric)));
}

function normalizePortraitScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(1.6, Math.max(0.6, Math.round(numeric * 100) / 100));
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const url = String(src || "").trim();
    if (!url) {
      resolve();
      return;
    }
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
    if (image.complete) resolve();
  });
}

function playCharacterSwitchAnimation(onSwap) {
  if (!visualPanel || window.matchMedia("(max-width: 900px)").matches) {
    if (onSwap) onSwap();
    return;
  }

  const portrait = visualPortrait;
  const content = visualPanel.querySelector(".visual-content");
  const copyEls = content ? content.querySelectorAll(".eyebrow, h1, .visual-subtitle, .quote-card, .trait-row") : [];

  // Phase 1: fade out everything
  if (portrait) portrait.classList.add("portrait-fade-out");
  copyEls.forEach(el => el.classList.add("copy-fade-out"));

  // Phase 2: after fade-out, swap content, then fade in
  setTimeout(() => {
    if (onSwap) onSwap();

    // Remove fade-out, prep for fade-in
    if (portrait) {
      portrait.classList.remove("portrait-fade-out");
      portrait.classList.add("portrait-fade-in");
    }
    copyEls.forEach((el, i) => {
      el.classList.remove("copy-fade-out");
      el.classList.add("copy-fade-in");
      el.style.transitionDelay = `${0.06 + i * 0.06}s`;
    });

    // Phase 3: clean up
    setTimeout(() => {
      if (portrait) portrait.classList.remove("portrait-fade-in");
      copyEls.forEach(el => {
        el.classList.remove("copy-fade-in");
        el.style.transitionDelay = "";
      });
    }, 700);
  }, 320);
}

function applyTheme(theme = {}) {
  const root = document.documentElement;
  const pairs = {
    "--bg": theme.bg,
    "--bg-warm": theme.bgWarm,
    "--surface": theme.surface,
    "--border": theme.border,
    "--border-light": theme.borderLight,
    "--accent": theme.accent,
    "--accent-bright": theme.accentBright,
    "--accent-dim": theme.accentDim,
    "--accent-deep": theme.accentDeep,
    "--text": theme.text,
    "--text-mid": theme.textMid,
    "--text-dim": theme.textDim,
    "--visual-start": theme.visualStart,
    "--visual-mid": theme.visualMid,
    "--visual-end": theme.visualEnd
  };
  for (const [key, value] of Object.entries(pairs)) {
    if (value) root.style.setProperty(key, value);
  }
  if (theme.accent) {
    root.style.setProperty("--accent-rgb", hexToRgb(theme.accent));
  }
}

function updateAllAssistantAvatars() {
  document.querySelectorAll(".bot-group .msg-avatar, .typing-avatar").forEach((img) => {
    img.src = assistantAvatarUrl;
    img.alt = activeCharacter?.name || "角色";
  });
}

function renderCharacterSwitcher() {
  if (!characterSwitcher) return;
  if (!Array.isArray(characters) || characters.length <= 1) {
    characterSwitcher.hidden = true;
    characterSwitcher.innerHTML = "";
    return;
  }

  characterSwitcher.hidden = false;
  characterSwitcher.innerHTML = characters.map((character) => {
    const active = character.id === activeCharacterId ? " active" : "";
    return `
      <button class="character-tab${active}" type="button" role="tab" aria-selected="${active ? "true" : "false"}" data-character-id="${escapeHtml(character.id)}" title="${escapeHtml(character.name)}">
        <img src="${escapeHtml(character.avatarUrl || "/api/avatar/assistant")}" alt="${escapeHtml(character.name)}">
        <span>${escapeHtml(character.name)}</span>
      </button>
    `;
  }).join("");

  characterSwitcher.querySelectorAll("[data-character-id]").forEach((button) => {
    button.addEventListener("click", () => {
      switchCharacter(button.getAttribute("data-character-id") || "").catch((error) => {
        setPanelStatus(error.message || "角色切换失败", true);
      });
    });
  });
}

function applyCharacter(character) {
  if (!character) return;
  const previousCharacterId = activeCharacter?.id || "";
  const isSwitching = previousCharacterId && previousCharacterId !== character.id;

  const swapContent = () => {
    activeCharacter = character;
    activeCharacterId = character.id;
    localStorage.setItem(CHARACTER_KEY, activeCharacterId);
    assistantAvatarUrl = character.avatarUrl || "/api/avatar/assistant";

    applyTheme(character.theme || {});
    if (siteName) siteName.textContent = character.name || "角色";
    if (siteSubtitle) siteSubtitle.textContent = character.subtitle || "";
    if (chatTitle) chatTitle.textContent = character.title || `${character.name || "角色"} · 在线聊天`;
    document.title = `${character.name || "角色"} · 多角色聊天`;
    if (visualPortrait) {
      visualPortrait.src = character.portraitUrl || assistantAvatarUrl;
      visualPortrait.alt = character.name || "角色";
      visualPortrait.classList.toggle("mirrored", Boolean(character.portraitMirror));
      visualPortrait.style.setProperty("--portrait-offset-x", `${normalizePortraitOffsetX(character.portraitOffsetX)}px`);
      visualPortrait.style.setProperty("--portrait-scale", String(normalizePortraitScale(character.portraitScale)));
    }
    if (characterEyebrow) characterEyebrow.textContent = character.eyebrow || "Character Channel";
    if (characterQuoteLabel) characterQuoteLabel.textContent = character.quoteLabel || "角色介绍";
    if (characterQuote) characterQuote.textContent = character.quote || "";
    if (characterTraitRow) {
      const traits = Array.isArray(character.traits) ? character.traits : [];
      characterTraitRow.innerHTML = traits
        .map((trait) => `<span class="trait-tag">${escapeHtml(trait)}</span>`)
        .join("");
    }
    if (messageInput) {
      messageInput.placeholder = `给${character.name || "角色"}发一条消息……`;
    }
    if (typingAvatar) {
      typingAvatar.src = assistantAvatarUrl;
      typingAvatar.alt = character.name || "角色";
    }
    updateAllAssistantAvatars();
    renderCharacterSwitcher();
  };

  if (isSwitching) {
    playCharacterSwitchAnimation(swapContent);
  } else {
    swapContent();
  }
}

async function switchCharacter(characterId) {
  const nextCharacter = characters.find((item) => item.id === characterId);
  if (!nextCharacter || nextCharacter.id === activeCharacterId) return;
  await preloadImage(nextCharacter.portraitUrl || nextCharacter.avatarUrl || "");
  activeConversationId = "";
  applyCharacter(nextCharacter);
  setSessionPanelOpen(false);
  await loadSessionState();
}

function cleanVisibleText(text) {
  return String(text || "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*<\/think>\s*/i, "")
    .replace(/^[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff\ufffd\u25a1\u2612\u2610\u2611]+/u, "")
    .trim();
}

function getGreetingMessage() {
  return activeCharacter?.greeting || "你好，今天想聊些什么？";
}

function createMessageElement(role, content, createdAt = Date.now(), options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg-group ${role === "assistant" ? "bot-group" : "user-group"}`;
  if (options.animate === false) {
    wrapper.classList.add("no-animate");
  }
  if (options.stagger > 0 && options.stagger <= 5) {
    wrapper.classList.add(`msg-stagger-${options.stagger}`);
  }

  const avatar = document.createElement("img");
  avatar.className = "msg-avatar";
  avatar.src = role === "assistant" ? assistantAvatarUrl : userAvatarUrl;
  avatar.alt = role === "assistant" ? (activeCharacter?.name || "角色") : "用户";
  avatar.loading = "eager";
  avatar.decoding = "async";

  const column = document.createElement("div");
  column.className = "msg-column";

  const header = document.createElement("div");
  header.className = "group-header";

  const senderName = document.createElement("span");
  senderName.className = "sender-name";
  senderName.textContent = role === "assistant" ? (activeCharacter?.name || "角色") : "你";

  const time = document.createElement("span");
  time.className = "msg-time";
  time.textContent = formatMessageTime(createdAt);

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const visibleText = cleanVisibleText(content);
  if (visibleText || (!options.imageUrl && !options.songUrl)) {
    const paragraph = document.createElement("p");
    paragraph.textContent = visibleText;
    bubble.appendChild(paragraph);
  }

  if (options.imageUrl) {
    const imageLink = document.createElement("a");
    imageLink.href = options.imageUrl;
    imageLink.target = "_blank";
    imageLink.rel = "noopener noreferrer";

    const image = document.createElement("img");
    image.className = "generated-image";
    image.src = options.imageUrl;
    image.alt = options.imagePrompt || "生成图片";
    image.loading = "lazy";
    image.decoding = "async";

    imageLink.appendChild(image);
    bubble.appendChild(imageLink);
  }

  if (options.songUrl) {
    const voiceWrap = document.createElement("div");
    voiceWrap.className = "voice-message-wrap";

    const voiceBar = document.createElement("div");
    voiceBar.className = "voice-bar";
    voiceBar.setAttribute("data-song-url", options.songUrl);

    const voiceIcon = document.createElement("div");
    voiceIcon.className = "voice-icon";
    voiceIcon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

    const voiceWave = document.createElement("div");
    voiceWave.className = "voice-wave";
    for (let i = 0; i < 12; i++) {
      const bar = document.createElement("span");
      bar.style.animationDelay = `${i * 0.08}s`;
      voiceWave.appendChild(bar);
    }

    const voiceDuration = document.createElement("span");
    voiceDuration.className = "voice-duration";
    voiceDuration.textContent = options.songTitle || "歌曲";

    voiceBar.append(voiceIcon, voiceWave, voiceDuration);
    voiceWrap.appendChild(voiceBar);
    bubble.appendChild(voiceWrap);

    voiceBar.addEventListener("click", () => {
      toggleVoicePlay(voiceBar, options.songUrl);
    });
  }

  header.append(senderName, time);
  column.append(header, bubble);
  wrapper.append(avatar, column);
  return wrapper;
}

function renderMessages(messages) {
  const dateDivider = `<div class="date-divider"><span>今天</span></div>`;
  chatBody.innerHTML = dateDivider;
  currentMessages = Array.isArray(messages) ? messages.slice() : [];

  const greetingEl = createMessageElement(
    "assistant",
    getGreetingMessage(),
    Date.now(),
    { animate: false }
  );
  chatBody.appendChild(greetingEl);

  let lastRole = "assistant";
  for (const item of currentMessages) {
    if (!item || typeof item.role !== "string" || typeof item.content !== "string") continue;
    const hasSong = Boolean(item.songUrl);
    const visibleText = cleanVisibleText(item.content);
    if (hasSong && visibleText) {
      const textEl = createMessageElement(item.role, item.content, item.createdAt || Date.now(), {
        animate: false
      });
      if (item.role === lastRole) {
        textEl.classList.add("consecutive");
      }
      chatBody.appendChild(textEl);
      lastRole = item.role;

      const songEl = createMessageElement(item.role, "", (item.createdAt || Date.now()) + 1, {
        animate: false,
        songUrl: item.songUrl,
        songTitle: item.songTitle,
        songArtist: item.songArtist
      });
      songEl.classList.add("consecutive");
      chatBody.appendChild(songEl);
      lastRole = item.role;
      continue;
    }

    const el = createMessageElement(item.role, item.content, item.createdAt || Date.now(), {
      animate: false,
      imageUrl: item.imageUrl,
      imagePrompt: item.imagePrompt,
      songUrl: item.songUrl,
      songTitle: item.songTitle,
      songArtist: item.songArtist
    });
    if (item.role === lastRole) {
      el.classList.add("consecutive");
    }
    chatBody.appendChild(el);
    lastRole = item.role;
  }

  scrollToBottom();
}

function appendMessage(role, content, createdAt = Date.now(), options = {}) {
  const message = {
    role,
    content,
    createdAt,
    kind: options.kind,
    imageUrl: options.imageUrl,
    imagePrompt: options.imagePrompt,
    songUrl: options.songUrl,
    songTitle: options.songTitle,
    songArtist: options.songArtist
  };
  if (options.updateState !== false) {
    currentMessages.push(message);
  }
  const lastMsg = chatBody.querySelector(".msg-group:last-of-type");
  const lastRole = lastMsg?.classList.contains("user-group") ? "user" : "assistant";
  if (role === lastRole) {
    options.stagger = Math.min(5, (lastMsg?.dataset.stagger || 0) + 1);
  }
  const el = createMessageElement(role, content, createdAt, options);
  if (role === lastRole) {
    el.classList.add("consecutive");
  }
  if (options.stagger) {
    el.dataset.stagger = options.stagger;
  }
  chatBody.appendChild(el);
  scrollToBottom(true);
  return message;
}

function renderConversations() {
  if (!Array.isArray(conversations) || conversations.length === 0) {
    conversationList.innerHTML = `<div class="empty-mini">暂无对话</div>`;
    return;
  }

  conversationList.innerHTML = conversations
    .map((conversation) => {
      const active = conversation.id === activeConversationId ? "active" : "";
      const updatedAt = conversation.updatedAt
        ? formatMessageTime(conversation.updatedAt)
        : "--:--";
      return `
        <button class="conversation-item ${active}" type="button" data-conversation-id="${escapeHtml(conversation.id)}">
          <span class="conversation-top">
            <span class="conversation-title">${escapeHtml(conversation.title || "新对话")}</span>
            <span class="conversation-delete" data-delete-conversation-id="${escapeHtml(conversation.id)}" title="删除对话">
              <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z"/></svg>
            </span>
          </span>
          <span class="conversation-meta">${updatedAt} · ${conversation.messageCount || 0} 条</span>
        </button>
      `;
    })
    .join("");

  for (const button of conversationList.querySelectorAll("[data-conversation-id]")) {
    button.addEventListener("click", async () => {
      const targetId = button.getAttribute("data-conversation-id");
      if (!targetId || targetId === activeConversationId) return;
      activeConversationId = targetId;
      localStorage.setItem(CONVERSATION_KEY, activeConversationId);
      await loadConversation(activeConversationId);
      renderConversations();
      setPanelStatus("");
    });
  }

  for (const deleteButton of conversationList.querySelectorAll("[data-delete-conversation-id]")) {
    deleteButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const targetId = deleteButton.getAttribute("data-delete-conversation-id");
      if (!targetId) return;
      const confirmed = window.confirm("确认删除这个对话吗？");
      if (!confirmed) return;
      try {
        const data = await fetchJson("/api/conversation", {
          method: "DELETE",
          body: JSON.stringify({
            conversationId: targetId,
            characterId: activeCharacterId
          })
        });
        conversations = Array.isArray(data.conversations) ? data.conversations : [];
        activeConversationId = data.conversationId || "";
        localStorage.setItem(CONVERSATION_KEY, activeConversationId);
        renderConversations();
        await loadConversation(activeConversationId);
        setPanelStatus("对话已删除");
      } catch (error) {
        setPanelStatus(error.message || "删除对话失败", true);
      }
    });
  }
}

function updateSessionSummary() {
  if (sessionModeText) {
    sessionModeText.textContent = "当前对话记录保留 3 天";
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const plainText = text
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    throw new Error(plainText || `HTTP ${response.status} 返回了非 JSON 响应`);
  }
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollImageJob(imageJobId) {
  const startedAt = Date.now();
  const maxWaitMs = 16 * 60 * 1000;

  while (Date.now() - startedAt < maxWaitMs) {
    await wait(2500);
    const data = await fetchJson(`/api/image-job/${encodeURIComponent(imageJobId)}`);

    if (data.userAvatarUrl) {
      userAvatarUrl = data.userAvatarUrl;
      localStorage.setItem(USER_AVATAR_KEY, userAvatarUrl);
    }
    if (data.assistantAvatarUrl) {
      assistantAvatarUrl = data.assistantAvatarUrl;
      updateAllAssistantAvatars();
    }
    if (data.characterId && data.characterId !== activeCharacterId) {
      const serverCharacter = characters.find((item) => item.id === data.characterId);
      if (serverCharacter) applyCharacter(serverCharacter);
    }
    if (Array.isArray(data.conversations)) {
      conversations = data.conversations;
      renderConversations();
    }

    if (data.status === "pending" || data.status === "processing") {
      continue;
    }

    if (data.status === "done" && data.imageUrl) {
      appendMessage("assistant", data.reply || "我画好了……给你。", Date.now(), {
        kind: "image",
        imageUrl: data.imageUrl,
        imagePrompt: data.imagePrompt
      });
      return;
    }

    appendMessage("assistant", data.reply || `图片没有顺利生成……${data.error || "生成失败"}`, Date.now());
    return;
  }

  appendMessage("assistant", "图片生成还没有完成……可以稍后刷新对话看看。", Date.now());
}

async function fetchPublicConfig() {
  const config = await fetchJson("/api/config/public");
  renderAnnouncement(config.announcement || {});
  characters = Array.isArray(config.characters) ? config.characters : [];
  const configuredDefaultId = config.defaultCharacterId || characters[0]?.id || "";
  if (!characters.some((item) => item.id === activeCharacterId)) {
    activeCharacterId = configuredDefaultId;
  }
  applyCharacter(getActiveCharacter() || {
    id: configuredDefaultId || "firefly",
    name: config.siteName || "流萤",
    title: `${config.siteName || "流萤"} · 在线聊天`,
    subtitle: config.siteSubtitle || "会找到的，属于我的梦……",
    avatarUrl: config.assistantAvatarUrl || "/api/avatar/assistant",
    greeting: "你好，今天想聊些什么？"
  });
  userAvatarUrl = localStorage.getItem(USER_AVATAR_KEY) || config.userAvatarUrl || "/api/avatar/user";
  modelName = config.model || "";
  modelChip.textContent = modelName || "未配置模型";

  if (headerSub) {
    if (config.connectionOk) {
      headerSub.textContent = config.connectionMessage || "澪染制作 · 短信频道已接通";
      headerSub.style.color = "";
      if (headerDot) { headerDot.className = "header-dot ok"; }
    } else if (config.connectionTestedAt) {
      headerSub.textContent = config.connectionMessage || "短信频道未连通";
      headerSub.style.color = "#d44";
      if (headerDot) { headerDot.className = "header-dot fail"; }
    } else {
      headerSub.textContent = "澪染制作 · 短信频道未测试连通";
      headerSub.style.color = "";
      if (headerDot) { headerDot.className = "header-dot"; }
    }
  }
}

async function sendHeartbeat() {
  try {
    const data = await fetchJson("/api/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        page: "chat"
      })
    });
    visitorCount.textContent = `在线 ${data.onlineCount || 0} 人`;
  } catch {
    visitorCount.textContent = "在线人数读取失败";
  }
}

async function loadSessionState() {
  const data = await fetchJson("/api/session/state", {
    method: "POST",
    body: JSON.stringify({
      characterId: activeCharacterId
    })
  });

  if (data.characterId && data.characterId !== activeCharacterId) {
    const serverCharacter = characters.find((item) => item.id === data.characterId);
    if (serverCharacter) applyCharacter(serverCharacter);
  }
  if (data.assistantAvatarUrl) {
    assistantAvatarUrl = data.assistantAvatarUrl;
    updateAllAssistantAvatars();
  }
  activeConversationId = data.conversationId || "";
  conversations = Array.isArray(data.conversations) ? data.conversations : [];
  currentMessages = Array.isArray(data.messages) ? data.messages : [];
  userAvatarUrl = data.userAvatarUrl || userAvatarUrl;
  localStorage.setItem(USER_AVATAR_KEY, userAvatarUrl);

  localStorage.setItem(CONVERSATION_KEY, activeConversationId);

  // 更新头像
  if (headerUserAvatar) headerUserAvatar.src = userAvatarUrl;

  updateSessionSummary();
  renderConversations();
  renderMessages(currentMessages);
}

async function loadConversation(conversationId) {
  const params = new URLSearchParams({
    conversationId,
    characterId: activeCharacterId
  });
  const data = await fetchJson(`/api/conversation?${params.toString()}`);
  if (data.characterId && data.characterId !== activeCharacterId) {
    const serverCharacter = characters.find((item) => item.id === data.characterId);
    if (serverCharacter) applyCharacter(serverCharacter);
  }
  currentMessages = Array.isArray(data.messages) ? data.messages : [];
  renderMessages(currentMessages);
}

async function createConversation() {
  const data = await fetchJson("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      title: "新对话",
      characterId: activeCharacterId
    })
  });
  activeConversationId = data.conversationId;
  conversations = Array.isArray(data.conversations) ? data.conversations : [];
  currentMessages = [];
  localStorage.setItem(CONVERSATION_KEY, activeConversationId);
  renderConversations();
  renderMessages([]);
  setPanelStatus("已新建对话");
}

async function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !activeConversationId) return;

  appendMessage("user", content);
  messageInput.value = "";
  autoResize();
  sendButton.disabled = true;
  messageInput.disabled = true;
  typingRow.classList.remove("hidden");
  scrollToBottom(true);

  try {
    const requestBody = {
      conversationId: activeConversationId,
      characterId: activeCharacterId,
      message: content
    };
    const customImageApi = getCustomImageApiPayload();
    if (customImageApi) {
      requestBody.customImageApi = customImageApi;
    }

    const data = await fetchJson("/api/chat", {
      method: "POST",
      body: JSON.stringify(requestBody)
    });

    typingRow.classList.add("hidden");
    if (data.userAvatarUrl) {
      userAvatarUrl = data.userAvatarUrl;
      localStorage.setItem(USER_AVATAR_KEY, userAvatarUrl);
    }
    if (data.assistantAvatarUrl) {
      assistantAvatarUrl = data.assistantAvatarUrl;
      updateAllAssistantAvatars();
    }
    if (data.characterId && data.characterId !== activeCharacterId) {
      const serverCharacter = characters.find((item) => item.id === data.characterId);
      if (serverCharacter) applyCharacter(serverCharacter);
    }
    if (Array.isArray(data.conversations)) {
      conversations = data.conversations;
      renderConversations();
    }
    if (data.conversationId) {
      activeConversationId = data.conversationId;
      localStorage.setItem(CONVERSATION_KEY, activeConversationId);
    }

    if (data.kind === "song" && data.songUrl) {
      appendMessage("assistant", data.reply, Date.now(), { kind: "text" });
      appendMessage("assistant", "", Date.now() + 1, {
        kind: "song",
        songUrl: data.songUrl,
        songTitle: data.songTitle,
        songArtist: data.songArtist
      });
    } else if (data.kind === "image_pending" && data.imageJobId) {
      appendMessage("assistant", data.reply, Date.now(), {
        kind: "image_pending",
        imagePrompt: data.imagePrompt
      });
      pollImageJob(data.imageJobId).catch((error) => {
        appendMessage("assistant", `图片生成状态没有顺利接通……${error.message}`, Date.now());
      });
    } else {
      appendMessage("assistant", data.reply, Date.now(), {
        kind: data.kind,
        imageUrl: data.imageUrl,
        imagePrompt: data.imagePrompt
      });
    }
  } catch (error) {
    typingRow.classList.add("hidden");
    appendMessage("assistant", `我这边刚才没有顺利接通……${error.message}`, Date.now());
  } finally {
    sendButton.disabled = false;
    messageInput.disabled = false;
    messageInput.focus();
    sendHeartbeat();
  }
}

function clearAnonymousView() {
  createConversation().catch((error) => {
    setPanelStatus(error.message || "新建对话失败", true);
  });
}

function bindEvents() {
  sendButton.addEventListener("click", sendMessage);
  newConversationButton.addEventListener("click", () => {
    clearAnonymousView();
  });
  toggleSessionPanelButton.addEventListener("click", () => {
    setSessionPanelOpen(!sessionPanel.classList.contains("open"));
  });
  if (toggleAvatarPanelButton) {
    toggleAvatarPanelButton.addEventListener("click", () => {
      setAvatarPanelOpen(!avatarPanel.classList.contains("open"));
    });
  }
  if (toggleCustomApiPanelButton) {
    toggleCustomApiPanelButton.addEventListener("click", () => {
      setCustomApiPanelOpen(!customApiPanel.classList.contains("open"));
    });
  }

  // 点击空白处关闭面板
  document.addEventListener("click", (e) => {
    if (sessionPanel.classList.contains("open") && 
        !sessionPanel.contains(e.target) && 
        e.target !== toggleSessionPanelButton &&
        !toggleSessionPanelButton.contains(e.target)) {
      setSessionPanelOpen(false);
    }
    if (customApiPanel.classList.contains("open") &&
        !customApiPanel.contains(e.target) &&
        e.target !== toggleCustomApiPanelButton &&
        !toggleCustomApiPanelButton.contains(e.target)) {
      setCustomApiPanelOpen(false);
    }
    if (avatarPanel.classList.contains("open") && 
        !avatarPanel.contains(e.target) && 
        e.target !== toggleAvatarPanelButton &&
        !toggleAvatarPanelButton.contains(e.target)) {
      setAvatarPanelOpen(false);
    }
  });
  if (closeAvatarPanelButton) {
    closeAvatarPanelButton.addEventListener("click", () => {
      setAvatarPanelOpen(false);
    });
  }
  if (closeCustomApiPanelButton) {
    closeCustomApiPanelButton.addEventListener("click", () => {
      setCustomApiPanelOpen(false);
    });
  }
  if (clearCustomApiButton) {
    clearCustomApiButton.addEventListener("click", clearCustomApiFields);
  }
  [customImageBaseUrlInput, customImageApiKeyInput, customImageModelInput, customImageSizeInput]
    .filter(Boolean)
    .forEach((input) => {
      input.addEventListener("input", updateCustomApiStatus);
      input.addEventListener("change", updateCustomApiStatus);
    });
  if (avatarFileInput) {
    avatarFileInput.addEventListener("change", () => {
      const file = avatarFileInput.files?.[0];
      if (file) {
        avatarFileText.textContent = file.name;
        const reader = new FileReader();
        reader.onload = () => {
          avatarPreview.src = reader.result;
        };
        reader.readAsDataURL(file);
      } else {
        avatarFileText.textContent = "未选择文件";
      }
    });
  }
  if (avatarUrlInput) {
    avatarUrlInput.addEventListener("input", () => {
      const url = avatarUrlInput.value.trim();
      if (url) {
        avatarPreview.src = url;
      }
    });
  }
  if (saveAvatarButton) {
    saveAvatarButton.addEventListener("click", saveAvatar);
  }
  if (openNoticeButton) {
    openNoticeButton.addEventListener("click", () => {
      setNoticeModalOpen(true, false);
    });
  }
  if (noticeCloseButton) {
    noticeCloseButton.addEventListener("click", () => {
      setNoticeModalOpen(false);
    });
  }
  if (noticeModal) {
    noticeModal.addEventListener("click", (e) => {
      if (e.target === noticeModal) {
        setNoticeModalOpen(false);
      }
    });
  }
  messageInput.addEventListener("input", autoResize);
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

async function saveAvatar() {
  const file = avatarFileInput?.files?.[0];
  const url = avatarUrlInput?.value.trim() || "";

  if (!file && !url) {
    setAvatarStatus("请选择文件或输入图片链接", true);
    return;
  }

  setAvatarStatus("保存中...");
  saveAvatarButton.disabled = true;

  try {
    const body = {};

    if (file) {
      const dataUrl = await readFileAsDataUrl(file);
      body.userAvatarData = dataUrl;
    } else {
      body.userAvatarPath = url;
    }

    const data = await fetchJson("/api/user/profile", {
      method: "PUT",
      body: JSON.stringify(body)
    });

    if (data.userAvatarUrl) {
      userAvatarUrl = data.userAvatarUrl;
      localStorage.setItem(USER_AVATAR_KEY, userAvatarUrl);
      headerUserAvatar.src = userAvatarUrl;
      avatarPreview.src = userAvatarUrl;
      updateAllUserAvatars();
    }

    setAvatarStatus("头像已保存");
    setTimeout(() => {
      setAvatarPanelOpen(false);
    }, 1000);
  } catch (error) {
    setAvatarStatus(error.message || "保存失败", true);
  } finally {
    saveAvatarButton.disabled = false;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

function updateAllUserAvatars() {
  document.querySelectorAll('.msg-avatar').forEach(img => {
    if (img.alt === '用户') {
      img.src = userAvatarUrl;
    }
  });
}

async function init() {
  bindEvents();
  autoResize();
  updateSessionSummary();
  await fetchPublicConfig();
  await loadSessionState();
  await sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 15000);
  if (shouldAutoShowAnnouncement()) {
    setNoticeModalOpen(true, false);
  }
  messageInput.focus();
}

window.addEventListener("beforeunload", () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
});

init().catch((error) => {
  setPanelStatus(error.message || "初始化失败", true);
});
