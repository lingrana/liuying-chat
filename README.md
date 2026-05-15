# Firefly Chat

一个以《崩坏：星穹铁道》流萤为主题的 AI 聊天站点。

项目提供前台聊天页和后台管理页，支持 OpenAI 兼容对话接口、图片生成、AI 流萤翻唱歌曲输出、在线统计、Token 统计、短期会话保存和角色提示词配置。

体验地址：https://liuying.lingrana.top/

## Features

- 流萤主题聊天界面，支持头像、会话列表、临时聊天和密码用户会话。
- OpenAI 兼容对话 API，可在后台配置 Base URL、API Key、模型和参数。
- 动态时间上下文，每次对话会注入当前北京时间，避免角色说出不符合当前时间的话。
- 真人化回复节奏，默认短句、短段，减少一次性长篇输出。
- 图片生成能力，可单独配置图片 API。
- 歌曲曲库功能，后台上传 AI 流萤翻唱歌曲后，聊天中提到已上传歌名时会输出播放器。
- 后台管理页，支持站点配置、模型获取、连通测试、管理密码、头像路径和系统提示词编辑。
- 在线人数、累计访问、对话 Token 和图片 Token 统计。
- 本地数据保存，无数据库依赖。
- 用户头像编辑，支持上传本地图片或输入图片链接。
- 按 IP 隔离用户数据，不同 IP 的用户拥有独立的聊天记录和会话。

## Quick Start

```bash
npm install
npm start
```

默认访问地址：

```text
http://127.0.0.1:3200
```

后台地址：

```text
http://127.0.0.1:3200/admin.html
```

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 服务监听地址 |
| `PORT` | `3200` | 服务监听端口 |
| `CONFIG_SECRET` | 项目根目录路径 | 用于加密保存的 API Key，部署后应保持不变 |

部署示例：

```bash
HOST=0.0.0.0 PORT=3200 CONFIG_SECRET=your-long-random-secret npm start
```

## Admin Panel

后台采用左侧菜单布局，包含以下功能模块：

### 仪表盘
- 实时在线人数
- 累计访问量
- 缓存命中率
- Token 概览统计

### Token 统计
- 对话 Token 详情（输入/输出/总计）
- 图片 Token 详情（输入/输出/总计）
- 支持按时间范围筛选（1天/7天/全部）

### IP 消耗与对话记录
- 按 IP 分类显示 Token 消耗
- 显示每个 IP 的会话数、请求数
- 对话记录摘要（用户消息数/AI回复数）
- 支持搜索、排序、分页
- 支持编辑/删除 IP、会话、消息

### API 配置
- 对话 API：Base URL、API Key、模型、Temperature、Max Tokens
- 图片 API：Base URL、API Key、图片模型、图片尺寸
- 自动获取模型列表
- 连通测试功能

### 站点配置
- 站点标题、副标题
- 角色头像、用户头像路径
- 系统提示词
- 管理密码
- 缓存设置

### 歌曲曲库
- 上传或删除 AI 流萤翻唱音频
- 在线播放预览

## User Features

### 会话管理
- 点击右上角对话图标打开会话面板
- 查看历史对话列表
- 新建对话
- 删除对话
- 切换对话

### 头像编辑
- 点击右上角用户头像打开编辑面板
- 支持上传本地图片
- 支持输入图片链接
- 实时预览

### 数据隔离
- 按 IP 地址隔离用户数据
- 不同 IP 的用户拥有独立的聊天记录
- 同一 IP 下的浏览器共享数据

## Song Library

歌曲只会从后台曲库输出。

上传歌曲时只需要填写歌名并选择音频文件，所有歌曲都会按"AI流萤翻唱"处理。用户在聊天中自然提到已上传的歌名时，系统会先调用对话 API 生成一条自然回复，然后在下一条连续消息气泡中发送播放器。

未上传的歌曲不会输出音频，也不会生成外部链接。

## Data Storage

运行数据保存在 `data/` 目录：

```text
data/
  config.json              # 站点配置、模型配置、系统提示词
  users/                   # 用户会话数据（按 IP 哈希存储）
  songs/                   # 上传的 AI 流萤翻唱歌曲和 songs.json 索引
  token-usage.json         # Token 使用记录
  assistant-avatar.png     # 默认角色头像
  lingran.png              # 默认头像资源
```

部署或迁移时建议保留整个 `data/` 目录。

`CONFIG_SECRET` 用于解密已保存的 API Key。生产环境中应显式设置固定值；如果更换部署路径或密钥，后台已保存的 API Key 可能需要重新填写。

## Project Structure

```text
firefly-chat/
  public/
    index.html             # 前台聊天页
    app.js                 # 前台交互逻辑
    admin.html             # 后台管理页
    admin.js               # 后台交互逻辑
    ly.png                 # 站点图标
  data/
    config.json            # 站点配置
    users/                 # 用户数据
    songs/                 # 歌曲文件
    token-usage.json       # Token 统计
    skills/                # 流萤角色资料与提示词素材
  server.js                # Node.js HTTP 服务与 API 路由
  package.json
  README.md
```

## Deployment Notes

推荐使用 Node.js 18 或更新版本。

部署到服务器或 1Panel 时：

1. 上传项目目录。
2. 执行 `npm install`。
3. 设置启动命令为 `npm start`。
4. 设置环境变量：`HOST=0.0.0.0`、`PORT=3200`、`CONFIG_SECRET=固定随机字符串`。
5. 使用 Nginx、1Panel 或其他反向代理将域名代理到 `http://127.0.0.1:3200`。

## Notes

- 本项目使用 Node.js 原生 HTTP 服务，不依赖数据库。
- 对话与图片能力取决于后台配置的 OpenAI 兼容接口。
- 默认不会内置真实 API Key。
- 上传到公开仓库前，请确认 `data/config.json` 中没有明文敏感信息。
- 用户数据按 IP 隔离，同一 IP 下的用户共享聊天记录。
