const fs = require("fs");
const path = require("path");
const { SONGS_DIR, SONGS_INDEX_PATH } = require("./constants");
const { normalizeSearchText } = require("./utils");

function loadSongs() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SONGS_INDEX_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed.filter((song) => song && song.id && song.fileName) : [];
  } catch {
    return [];
  }
}

function saveSongs(songs) {
  fs.writeFileSync(SONGS_INDEX_PATH, JSON.stringify(songs, null, 2), "utf8");
}

function sanitizeSong(song) {
  return {
    id: song.id,
    title: song.title,
    artist: "AI流萤翻唱",
    fileName: song.originalName || song.fileName,
    mimeType: song.mimeType || "audio/mpeg",
    size: song.size || 0,
    createdAt: song.createdAt || 0
  };
}

function getSongFilePath(song) {
  const fileName = path.basename(String(song.fileName || ""));
  return path.join(SONGS_DIR, fileName);
}

function findRequestedSong(message) {
  const songs = loadSongs();
  if (songs.length === 0) return null;
  const text = String(message || "").trim();
  const normalizedText = normalizeSearchText(text);
  const wantsSong = /歌|歌曲|音乐|播放|听|唱|来一首|放一首|输出/.test(text);
  if (!wantsSong) return null;

  return songs.find((song) => {
    const title = normalizeSearchText(song.title);
    const original = normalizeSearchText(song.originalName);
    return title && (normalizedText.includes(title) || (original && normalizedText.includes(original)));
  }) || null;
}

function buildSongsPromptContext() {
  const songs = loadSongs().map(sanitizeSong);
  if (songs.length === 0) {
    return [
      "# 歌曲输出规则",
      "你现在没有保存任何自己的 AI 翻唱。不能声称可以播放、输出或提供歌曲；如果用户想听歌，只能自然说明现在还没有准备好。"
    ].join("\n");
  }

  const names = songs.map((song) => `《${song.title}》`).join("、");
  return [
    "# 歌曲输出规则",
    `你只保存了这些自己的 AI 翻唱：${names}。`,
    "当用户自然提到想听其中某首歌时，可以像把歌发给开拓者一样自然回应。不要说“后台曲库”“功能”“音频文件”等生硬表述。",
    "不能编造未保存的歌曲、外部链接或未上传歌曲；没有保存的歌只能自然说明现在还唱不了那一首。"
  ].join("\n");
}

module.exports = {
  loadSongs,
  saveSongs,
  sanitizeSong,
  getSongFilePath,
  findRequestedSong,
  buildSongsPromptContext
};
