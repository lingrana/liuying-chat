# 🔥 Firefly Chat

一个以《崩坏：星穹铁道》流萤为主题的 AI 聊天站点。

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/OpenAI-Compatible-412991?logo=openai&logoColor=white" alt="OpenAI Compatible">
</p>

<p align="center">
  <a href="https://liuying.lingrana.top/">🔗 在线体验</a> ·
  <a href="#快速开始">🚀 快速开始</a> ·
  <a href="#角色资料来源声明">📜 资料来源</a>
</p>

---

## ✨ 功能特性

| 分类 | 功能 |
|------|------|
| 💬 聊天 | OpenAI 兼容对话、流式回复、会话管理、动态时间上下文 |
| 🎨 图片 | 独立图片 API 配置、提示词生图 |
| 🎵 歌曲 | 后台上传 AI 翻唱、聊天中提到歌名自动输出播放器 |
| 👤 用户 | IP 隔离会话、头像上传/链接编辑 |
| 📊 后台 | Token 统计、IP 审计、缓存管理、模型自动获取、连通测试 |
| 🛡️ 安全 | API Key 加密存储、管理密码、Token 鉴权 |

## 📸 截图

<details>
<summary>点击展开</summary>

**前台聊天**
- 流萤主题界面、会话列表、头像编辑、歌曲播放器

**后台管理**  
- 仪表盘、Token 统计、IP 审计、API 配置、站点配置、歌曲曲库

</details>

## 🚀 快速开始

```bash
# 克隆仓库
git clone https://github.com/your-username/firefly-chat.git
cd firefly-chat

# 安装依赖
npm install

# 启动服务
npm start
```

访问：

| 页面 | 地址 |
|------|------|
| 💬 聊天 | http://127.0.0.1:3200 |
| ⚙️ 后台 | http://127.0.0.1:3200/admin |

## ⚙️ 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HOST` | `127.0.0.1` | 监听地址 |
| `PORT` | `3200` | 监听端口 |
| `CONFIG_SECRET` | 项目根目录路径 | API Key 加密密钥，部署后务必固定 |

```bash
HOST=0.0.0.0 PORT=3200 CONFIG_SECRET=your-random-secret npm start
```

## 📖 使用说明

### 后台管理

访问 `/admin`，输入管理密码登录。

- **仪表盘** — 在线人数、缓存命中率、Token 概览
- **Token 统计** — 对话/图片 Token 详情，支持 1d / 7d / 全部
- **IP 审计** — 按 IP 查看消耗和对话，支持搜索、排序、分页
- **API 配置** — 对话/图片 API 分开配置，自动获取模型，连通测试
- **站点配置** — 标题、头像、系统提示词、管理密码、缓存
- **歌曲曲库** — 上传 / 删除 / 预览 AI 翻唱

### 歌曲曲库

后台上传音频 → 填写歌名 → 聊天中提到歌名自动生成回复 + 播放器。未上传的歌曲不会输出音频。

### 数据存储

```
data/
├── config.json          # 站点配置（API Key 已加密）
├── users/               # 用户会话（按 IP 哈希）
├── songs/               # 歌曲文件及索引
├── token-usage.json     # Token 使用记录
├── skills/              # 流萤角色资料
└── lingran.png          # 默认头像
```

## 📁 项目结构

```
firefly-chat/
├── public/
│   ├── index.html       # 前台聊天页
│   ├── app.js           # 前台逻辑
│   ├── admin.html       # 后台管理页
│   └── admin.js         # 后台逻辑
├── server/
│   ├── index.js         # HTTP 服务入口
│   ├── routes.js        # 路由处理
│   ├── config.js        # 配置管理
│   ├── users.js         # 用户管理
│   ├── songs.js         # 歌曲管理
│   ├── api-client.js    # API 调用
│   ├── prompts.js       # 提示词构建
│   ├── crypto.js        # 加密工具
│   ├── cache.js         # 缓存管理
│   ├── visitors.js      # 访客统计
│   ├── token-usage.js   # Token 统计
│   ├── avatars.js       # 头像管理
│   ├── admin-audit.js   # 后台审计
│   ├── utils.js         # 工具函数
│   └── constants.js     # 常量定义
├── data/                # 运行数据
├── server.js            # 入口文件
└── package.json
```

## 🐳 Docker 部署

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3200
CMD ["node", "server.js"]
```

```bash
docker build -t firefly-chat .
docker run -d -p 3200:3200 -e CONFIG_SECRET=your-secret firefly-chat
```

## 🔧 生产部署

推荐 Node.js 18+，使用 PM2 或 systemd 管理进程：

```bash
# PM2
pm2 start server.js --name firefly-chat

# 或直接
HOST=0.0.0.0 PORT=3200 CONFIG_SECRET=your-secret node server.js
```

配合 Nginx 反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3200;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 📜 角色资料来源声明

`data/skills/` 目录下的流萤角色资料整合自以下开源项目：

| 来源 | 链接 |
|------|------|
| guilings/firefly.skill | [GitHub](https://github.com/guilings/firefly.skill) |
| HeartEase1/firefly-skill | [GitHub](https://github.com/HeartEase1/firefly-skill) |

> ⚠️ 角色资料版权归原作者所有，仅供学习交流使用。感谢原作者的贡献。

## ⚠️ 注意事项

- 对话和图片能力取决于后台配置的 OpenAI 兼容接口
- 部署前确认 `data/config.json` 无明文敏感信息
- `CONFIG_SECRET` 更换后已加密的 API Key 需重新填写
- 上传到公开仓库前请检查 `.gitignore` 是否排除了 `data/`

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ for 开拓者
</p>
