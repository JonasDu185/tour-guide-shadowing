# Tour Guide Shadowing — 项目备忘
# 导游词阅读 · 影子跟读 · 背诵练习 APP

## 技术栈与启动

- 前端: 原生 HTML/CSS/JS + PWA（单页面应用），不要引入 React/Vue 等框架
- 后端: Express 5.x (Node.js) 做代理中转
- 部署: 本地 `npm start` → HTTPS 端口 3443 + HTTP 3000 重定向
- 测试: `npm test` → 18 个单元测试（Node 20 自带 test runner）
- 手机测试: Safari 打开 `https://<Mac-IP>:3443` → 添加到主屏幕
- 不要新增依赖，保持轻量

## 环境变量 (.env)

- VOLC_API_KEY = 火山引擎 API Key（同时用于 TTS + ASR V3）
- VOLC_RESOURCE_ID = seed-tts-2.0（TTS 资源 ID）
- VOLC_SPEAKER = TTS 音色 ID
- ASR 使用 V3 协议（`volc.seedasr.sauc.duration`），与 TTS 共用 API Key，无需单独配置

## 项目结构

```
server.js          Express 主入口 + API 路由
data/              6 篇导游词 JSON (gugong, tiantan, yiheyuan, shisanling, changcheng, beihai)
public/            前端静态文件
  index.html       首页 (6 个景点卡片)
  scenic.html      景点详情页 (阅读模式 + 跟读模式)
  css/style.css    全局样式 (中国风暖色调, 移动优先)
  js/common.js     通用工具
  js/home.js       首页逻辑
  js/reading.js    阅读模式 + 点词翻译 popover
  js/shadowing.js  影子跟读 (TTS 播放 + 录音 + ASR + LCS diff 对比) ✅ 已实现
  manifest.json    PWA
  sw.js            Service Worker
cache/             音频缓存目录
scripts/           数据清洗脚本
test/              单元测试
```

## API 路由

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | /api/scripts | 列出所有导游词 |
| GET | /api/scripts/:id | 获取单篇 |
| GET | /api/dict/:word | 查词典 (Free Dictionary API 代理) |
| GET | /api/tts/:scriptId/:index | 获取已缓存的 TTS 音频 |
| POST | /api/tts | 语音合成 (火山引擎 TTS) |
| POST | /api/stt | 语音识别 (火山引擎 ASR V3) |

## 设计规范

- 配色: 底色 `#fdf6ee`, 主色 `#c43a31` (朱砂红), 文字 `#2c2c2c`
- 卡片: 圆角 12px, 2-3 列网格
- 移动优先: 768px 断点, safe-area-inset 适配
- 中国风暖色调，不要用冷色系

## 开发流程（7 步）

```
1. 设计蓝图 → 2. 写测试 → 3. 写代码 → 4. 跑测试 → 5. 审查 → 6. commit → 7. push
```

| 步骤 | 做什么 | 谁主导 |
|------|--------|--------|
| 1. 设计 | 明确需求，更新 CLAUDE.md 蓝图 | 用户确认 |
| 2. 测试 | 先写失败的测试用例（`test/` 目录） | Claude 写 |
| 3. 代码 | 实现功能，让测试通过 | Claude 写 |
| 4. 验证 | `npm test` 确保全部通过 | Claude 跑 |
| 5. 审查 | `/simplify` + `/security-review` 检查质量安全 | Claude 跑 |
| 6. commit | 本地提交，中文 commit message | Claude 做 |
| 7. push | `git push origin main` 推到 GitHub | Claude 做（需用户确认） |

## 待实现

- 背诵模式
- Vercel 部署

## Claude 行为规则

- 严格遵循 7 步开发流程，每步完成后等待确认
- 修改代码前先确认方案，不要直接动手
- 保持原生技术栈，不要引入新框架或依赖
- 前端改动后提醒用户在浏览器测试
- .env 和 cert.key/cert.crt 绝对不能提交
