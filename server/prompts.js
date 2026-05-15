const { CHAT_TIME_ZONE } = require("./constants");
const { buildSongsPromptContext } = require("./songs");

function buildHumanChatStyleContext() {
  return [
    "# 对话节奏",
    "回复要像真人短信聊天，不要一次发很长一大段。",
    "默认用 1 到 3 句短句回答；需要表达较多内容时，拆成 2 到 4 个很短的自然段，每段只说一个意思。",
    "除非用户明确要求详细解释、整理资料、写长文或列清单，否则不要长篇说明，也不要把设定、背景和规则一次性倒出来。",
    "语气保持自然、轻柔、克制，可以留一点停顿感。"
  ].join("\n");
}

function getCurrentChatTimeContext() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: CHAT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  })
    .formatToParts(now)
    .reduce((result, part) => {
      if (part.type !== "literal") {
        result[part.type] = part.value;
      }
      return result;
    }, {});

  const hour = Number(parts.hour);
  let period = "白天";
  if (hour >= 5 && hour < 9) {
    period = "清晨";
  } else if (hour >= 9 && hour < 12) {
    period = "上午";
  } else if (hour >= 12 && hour < 14) {
    period = "中午";
  } else if (hour >= 14 && hour < 18) {
    period = "下午";
  } else if (hour >= 18 && hour < 22) {
    period = "晚上";
  } else {
    period = "深夜";
  }

  return [
    "# 当前真实时间",
    `当前时间为北京时间（${CHAT_TIME_ZONE}）${parts.year}年${parts.month}月${parts.day}日 ${parts.weekday} ${parts.hour}:${parts.minute}，现在是${period}。`,
    "对话时必须以这个时间为准，不能说出与当前日期、星期、时段或昼夜相矛盾的话。",
    "如果提到今天、明天、昨晚、清晨、下午、夜晚、星空、睡觉、起床、用餐等时间相关内容，必须先核对当前时间再回答。",
    "除非用户明确要求虚构、回忆或角色剧情时间，否则不要把当前时间说成其他日期或时段。"
  ].join("\n");
}

function buildSystemPrompt(config) {
  return [
    config.systemPrompt || "",
    getCurrentChatTimeContext(),
    buildSongsPromptContext(),
    buildHumanChatStyleContext()
  ].filter(Boolean).join("\n\n");
}

function buildChatMessages(config, conversationMessages, latestUserMessage, stateless) {
  const preservedMessages = stateless
    ? []
    : conversationMessages
        .filter((item) => item && typeof item.role === "string" && typeof item.content === "string")
        .slice(-12)
        .map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content
        }));

  return [
    { role: "system", content: buildSystemPrompt(config) },
    ...preservedMessages,
    { role: "user", content: latestUserMessage }
  ];
}

module.exports = {
  buildHumanChatStyleContext,
  getCurrentChatTimeContext,
  buildSystemPrompt,
  buildChatMessages
};
