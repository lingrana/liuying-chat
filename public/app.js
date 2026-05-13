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
const avatarPanel = document.getElementById("avatarPanel");
const sessionModeText = document.getElementById("sessionModeText");
const conversationList = document.getElementById("conversationList");
const noMemoryToggle = document.getElementById("noMemoryToggle");
const passwordInput = document.getElementById("passwordInput");
const passwordSubmitButton = document.getElementById("passwordSubmitButton");
const openPasswordModalButton = document.getElementById("openPasswordModalButton");
const passwordModal = document.getElementById("passwordModal");
const passwordCancelButton = document.getElementById("passwordCancelButton");
const passwordModalStatus = document.getElementById("passwordModalStatus");
const openNoticeButton = document.getElementById("openNoticeButton");
const noticeModal = document.getElementById("noticeModal");
const noticeCloseButton = document.getElementById("noticeCloseButton");
const saveAvatarButton = document.getElementById("saveAvatarButton");
const userAvatarPathInput = document.getElementById("userAvatarPathInput");
const userAvatarFileInput = document.getElementById("userAvatarFileInput");
const userAvatarFileName = document.getElementById("userAvatarFileName");
const panelStatus = document.getElementById("panelStatus");
const avatarPanelStatus = document.getElementById("avatarPanelStatus");

const SESSION_KEY = "firefly-chat-session-v2";
const PASSWORD_KEY = "firefly-chat-password-v2";
const CONVERSATION_KEY = "firefly-chat-conversation-v2";
const NO_MEMORY_KEY = "firefly-chat-no-memory-v2";
const NOTICE_SEEN_KEY = "firefly-chat-notice-seen-v1";

let sessionId = localStorage.getItem(SESSION_KEY) || crypto.randomUUID();
let activePassword = localStorage.getItem(PASSWORD_KEY) || "";
let activeConversationId = localStorage.getItem(CONVERSATION_KEY) || "";
let statelessMode = localStorage.getItem(NO_MEMORY_KEY) === "1";
let heartbeatTimer = null;
let assistantAvatarUrl = "/api/avatar/assistant";
let userAvatarUrl = "/api/avatar/user";
let conversations = [];
let currentMessages = [];
let modelName = "";
let isPersistentUser = Boolean(activePassword);

localStorage.setItem(SESSION_KEY, sessionId);

function setPanelStatus(text, isError = false) {
  if (!panelStatus) return;
  panelStatus.textContent = text || "";
  panelStatus.classList.toggle("error", Boolean(isError));
}

function setAvatarPanelStatus(text, isError = false) {
  if (!avatarPanelStatus) return;
  avatarPanelStatus.textContent = text || "";
  avatarPanelStatus.classList.toggle("error", Boolean(isError));
}

function setSessionPanelOpen(open) {
  sessionPanel.classList.toggle("open", open);
}

function setAvatarPanelOpen(open) {
  avatarPanel.classList.toggle("open", open);
}

function setNoticeModalOpen(open, remember = true) {
  if (!noticeModal) return;
  noticeModal.classList.toggle("open", open);
  if (open) {
    setSessionPanelOpen(false);
    setAvatarPanelOpen(false);
  } else if (remember) {
    localStorage.setItem(NOTICE_SEEN_KEY, "1");
  }
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

function scrollToBottom() {
  chatBody.scrollTop = chatBody.scrollHeight;
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

function cleanVisibleText(text) {
  return String(text || "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*<\/think>\s*/i, "")
    .replace(/^[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff\ufffd\u25a1\u2612\u2610\u2611]+/u, "")
    .trim();
}

const GREETING_MESSAGE = "嗨，又见面啦……我的意思，很高兴见到你。今天也想和我聊聊吗？";

function createMessageElement(role, content, createdAt = Date.now(), options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg-group ${role === "assistant" ? "bot-group" : "user-group"}`;
  if (options.animate === false) {
    wrapper.classList.add("no-animate");
  }

  const avatar = document.createElement("img");
  avatar.className = "msg-avatar";
  avatar.src = role === "assistant" ? assistantAvatarUrl : userAvatarUrl;
  avatar.alt = role === "assistant" ? "流萤" : "用户";
  avatar.loading = "eager";
  avatar.decoding = "async";

  const column = document.createElement("div");
  column.className = "msg-column";

  const header = document.createElement("div");
  header.className = "group-header";

  const senderName = document.createElement("span");
  senderName.className = "sender-name";
  senderName.textContent = role === "assistant" ? "流萤" : "你";

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
    GREETING_MESSAGE,
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
  const el = createMessageElement(role, content, createdAt, options);
  if (role === lastRole) {
    el.classList.add("consecutive");
  }
  chatBody.appendChild(el);
  scrollToBottom();
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
            sessionId,
            password: activePassword,
            conversationId: targetId
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
    sessionModeText.textContent = isPersistentUser ? "密码用户 · 7天保存" : "当前为临时聊天模式，关闭页面后记录不会保留";
  }
  if (noMemoryToggle) {
    noMemoryToggle.checked = statelessMode;
  }
}

function updateAvatarFileName() {
  if (!userAvatarFileName) return;
  const file = userAvatarFileInput?.files?.[0];
  userAvatarFileName.textContent = file ? file.name : "未选择文件";
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
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

async function fetchPublicConfig() {
  const config = await fetchJson("/api/config/public");
  siteName.textContent = config.siteName || "流萤";
  siteSubtitle.textContent = config.siteSubtitle || "会找到的，属于我的梦……";
  assistantAvatarUrl = config.assistantAvatarUrl || "/api/avatar/assistant";
  userAvatarUrl = config.userAvatarUrl || "/api/avatar/user";
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
        sessionId,
        page: "chat"
      })
    });
    if (data.sessionId && data.sessionId !== sessionId) {
      sessionId = data.sessionId;
      localStorage.setItem(SESSION_KEY, sessionId);
    }
    visitorCount.textContent = `在线 ${data.onlineCount || 0} 人`;
  } catch {
    visitorCount.textContent = "在线人数读取失败";
  }
}

async function loadSessionState() {
  const data = await fetchJson("/api/session/state", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      password: activePassword
    })
  });

  isPersistentUser = Boolean(data.persistent);
  activeConversationId = data.conversationId || "";
  conversations = Array.isArray(data.conversations) ? data.conversations : [];
  currentMessages = Array.isArray(data.messages) ? data.messages : [];
  userAvatarUrl = data.userAvatarUrl || userAvatarUrl;

  localStorage.setItem(SESSION_KEY, data.sessionId || sessionId);
  localStorage.setItem(CONVERSATION_KEY, activeConversationId);
  if (activePassword) {
    localStorage.setItem(PASSWORD_KEY, activePassword);
  } else {
    localStorage.removeItem(PASSWORD_KEY);
  }

  updateSessionSummary();
  renderConversations();
  renderMessages(currentMessages);
}

async function loadConversation(conversationId) {
  const params = new URLSearchParams({
    sessionId,
    password: activePassword,
    conversationId
  });
  const data = await fetchJson(`/api/conversation?${params.toString()}`);
  currentMessages = Array.isArray(data.messages) ? data.messages : [];
  renderMessages(currentMessages);
}

async function createConversation() {
  const data = await fetchJson("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      password: activePassword,
      title: "新对话"
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

async function switchToPasswordMode() {
  const nextPassword = passwordInput.value.trim();
  if (!nextPassword) {
    if (passwordModalStatus) passwordModalStatus.textContent = "请输入密码";
    return;
  }
  activePassword = nextPassword;
  if (passwordModalStatus) passwordModalStatus.textContent = "正在读取…";
  await loadSessionState();
  if (passwordModal) passwordModal.classList.remove("open");
  if (passwordModalStatus) passwordModalStatus.textContent = "";
  passwordInput.value = "";
  setPanelStatus("已进入独立会话");
}

async function saveUserAvatar() {
  if (!isPersistentUser) {
    setAvatarPanelStatus("匿名模式不会保存用户头像，请先输入密码。", true);
    return;
  }

  let userAvatarData = "";
  const file = userAvatarFileInput?.files?.[0];
  if (file) {
    userAvatarData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("头像文件读取失败。"));
      reader.readAsDataURL(file);
    });
  }

  const data = await fetchJson("/api/user/profile", {
    method: "PUT",
    body: JSON.stringify({
      sessionId,
      password: activePassword,
      userAvatarPath: userAvatarPathInput.value.trim(),
      userAvatarData
    })
  });
  userAvatarUrl = data.userAvatarUrl || userAvatarUrl;
  if (userAvatarFileInput) {
    userAvatarFileInput.value = "";
  }
  updateAvatarFileName();
  renderMessages(currentMessages);
  setAvatarPanelStatus("用户头像已保存");
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
  scrollToBottom();

  try {
    const data = await fetchJson("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        password: activePassword,
        conversationId: activeConversationId,
        stateless: statelessMode,
        message: content
      })
    });

    typingRow.classList.add("hidden");
    if (data.userAvatarUrl) {
      userAvatarUrl = data.userAvatarUrl;
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
  if (statelessMode) {
    currentMessages = [];
    renderMessages([]);
    return;
  }

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
    setAvatarPanelOpen(false);
  });
  passwordSubmitButton.addEventListener("click", () => {
    switchToPasswordMode().catch((error) => {
      if (passwordModalStatus) passwordModalStatus.textContent = error.message || "切换失败";
    });
  });
  if (openPasswordModalButton) {
    openPasswordModalButton.addEventListener("click", () => {
      if (passwordModal) passwordModal.classList.add("open");
      setSessionPanelOpen(false);
    });
  }
  const openAvatarPanelButton = document.getElementById("openAvatarPanelButton");
  if (openAvatarPanelButton) {
    openAvatarPanelButton.addEventListener("click", () => {
      setSessionPanelOpen(false);
      setAvatarPanelOpen(true);
    });
  }
  if (passwordCancelButton) {
    passwordCancelButton.addEventListener("click", () => {
      if (passwordModal) passwordModal.classList.remove("open");
      if (passwordModalStatus) passwordModalStatus.textContent = "";
    });
  }
  if (passwordModal) {
    passwordModal.addEventListener("click", (e) => {
      if (e.target === passwordModal) {
        passwordModal.classList.remove("open");
        if (passwordModalStatus) passwordModalStatus.textContent = "";
      }
    });
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
  saveAvatarButton.addEventListener("click", () => {
    saveUserAvatar().catch((error) => {
      setAvatarPanelStatus(error.message || "保存头像失败", true);
    });
  });
  userAvatarFileInput?.addEventListener("change", updateAvatarFileName);
  noMemoryToggle.addEventListener("change", () => {
    statelessMode = noMemoryToggle.checked;
    localStorage.setItem(NO_MEMORY_KEY, statelessMode ? "1" : "0");
    if (composerHint) {
      composerHint.textContent = statelessMode
        ? "当前为无记忆模式 · Enter 发送 · Shift+Enter 换行"
        : "Enter 发送 · Shift+Enter 换行";
    }
  });

  messageInput.addEventListener("input", autoResize);
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

async function init() {
  bindEvents();
  autoResize();
  updateAvatarFileName();
  updateSessionSummary();
  await fetchPublicConfig();
  await loadSessionState();
  await sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 15000);
  if (localStorage.getItem(NOTICE_SEEN_KEY) !== "1") {
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
