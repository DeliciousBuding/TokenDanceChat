# TokenDanceChat vs 飞书/Telegram 功能对照表

> 产品经理视角 — 2026-05-23（更新）
> 目标：1:1 复刻飞书聊天 + Telegram 体验

> 历史快照：本审计早于 2026-06 轻量聊天合同。它保留为产品研究证据，不代表当前主界面要恢复 DM、群组、语音/视频、GIF/sticker、转发、定时发送或 webhook 管理。当前主界面合同是公共房间 + TokenBot 单 agent。

## 本轮交付摘要

**PM 审计修复（P0-P2）**：侧栏对话预览、未读「新消息」分隔线、移动端语音按钮可见、侧栏 IA 重排（DM/群组优先，AI 折叠）、侧栏对话搜索/过滤、桌面 header「更多」下拉菜单、相对时间戳（刚刚/X分钟前/日期/年）。

**UX 打磨**：群组消息已读回执（N 人已读）、在线用户排序（好友/DM 优先）、消息过渡动画（fade-in slide-up）、在线用户加载骨架屏、回到底部 FAB（Telegram 风格，带未读计数徽章）、聊天输入可见性加固（flex-shrink-0，滚动修复）、移动端 composer 重做（Markdown 工具收起为图标）、消息操作菜单合并为 44px 触摸目标、移动端消息密度收紧、light mode 首次默认。

**工程基线**：前端 624 tests / 40 文件 / tsc 0 / ESLint 0 / CI 就绪（GitHub Actions backend-test + frontend-test + lint）。后端 `go test ./...` 全绿。E2E 54 条（含 webhook ingress 闭环）。覆盖率达 40%+ 行覆盖率。

**安全与可靠性**：WebSocket 自动重连（指数退避）、静默发送失败反馈（断开警告 + 红色闪烁）、webhook secret salted HMAC hash 持久化 + 轮换 + audit log、S3-compatible MediaStore（同源代理，前端不可见 bucket/凭证）、消息送达状态（Telegram 双勾：已读蓝✓✓ / 已送达灰✓✓ / 已发送无勾）。

**连线**：群组信息管理面板、Webhook rotation UI + audit log 面板、群组视频通话 E2E。

## 消息交互

| 功能 | 飞书 | Telegram | 我们 | 差距 |
|------|------|----------|------|------|
| 文本选择 | ✅ | ✅ | ✅ | OK |
| Ctrl+C 复制 | ✅ | ✅ | ✅ | OK |
| 双击回复 | ✅ | ✅ | 🔧 agent 开发中 | |
| 右键复制 | ✅ | ✅ | ✅ | OK |
| 消息 reaction | ✅ | ✅ | ✅ | OK |
| 消息编辑 | ✅ | ✅ | ✅ | OK |
| 消息删除 | ✅ | ✅ | ✅ | OK |
| 消息转发 | ✅ | ✅ | ✅ | OK |
| 消息引用回复 | ✅ | ✅ | ✅ | OK |
| 消息置顶 | ✅ | ✅ | ✅ | OK |
| 多选批量操作 | ✅ | ✅ | ✅ selectMode | OK |
| 消息链接跳转 | ✅ | ✅ | 🔧 agent 开发中 | |
| URL 预览卡片 | ✅ | ❌ | 🔧 agent 开发中 | |
| 代码块复制 | ✅ | ✅ | ✅ | OK |
| 图片预览/缩放 | ✅ | ✅ | 🔧 agent 开发中 | |
| 消息送达状态 | ✅ | ✅ | ✅ 双勾 | OK |
| 合并操作菜单 44px | ❌ | ❌ | ✅ | **领先** |

## 输入体验

| 功能 | 飞书 | Telegram | 我们 | 差距 |
|------|------|----------|------|------|
| @mention 补全 | ✅ | ✅ | ✅ | OK |
| Emoji picker | ✅ | ✅ | ✅ | OK |
| 图片粘贴 | ✅ | ✅ | ✅ | OK |
| 文件拖拽 | ✅ | ✅ | ✅ | OK |
| 语音消息 | ✅ | ✅ | ✅ | OK |
| 消息草稿 | ✅ | ✅ | ✅ | OK |
| 输入状态 | ✅ | ✅ | ✅ | OK |
| Shift+Enter 换行 | ✅ | ✅ | ✅ | OK |
| ↑ 编辑上一条 | ✅ | ✅ | ✅ | OK |
| 斜杠命令 | ✅ | ✅ | ✅ | OK |
| Emoji 快捷输入 `:smile:` | ✅ | ✅ | ✅ | OK |
| 输入框可见性加固 | ❌ | ❌ | ✅ flex-shrink-0 | OK |
| 移动端 composer 重做 | ❌ | ❌ | ✅ 工具收起为图标 | OK |

## 消息列表

| 功能 | 飞书 | Telegram | 我们 | 差距 |
|------|------|----------|------|------|
| 无限滚动历史 | ✅ | ✅ | ✅ | OK |
| 新消息分隔线 | ✅ | ✅ | ✅ 蓝色强调线 | OK |
| 回到底部 FAB | ✅ | ✅ | ✅ 200px 阈值 + 未读计数 | OK |
| 消息高亮（搜索跳转） | ✅ | ✅ | ✅ | OK |
| 已读回执 | ✅ | ✅ | ✅ N 人已读 | OK |
| 相对时间戳 | ✅ | ✅ | ✅ 刚刚/X分钟前 | OK |
| 日期分隔线 | ✅ | ✅ | ✅ | OK |
| 系统消息样式 | ✅ | ✅ | ✅ | OK |
| 消息过渡动画 | ✅ | ✅ | ✅ fade-in slide-up | OK |

## 会话管理

| 功能 | 飞书 | Telegram | 我们 | 差距 |
|------|------|----------|------|------|
| 公共频道 | ✅ | ✅ | ✅ | OK |
| 私信 DM | ✅ | ✅ | ✅ | OK |
| 群组 | ✅ | ✅ | ✅ | OK |
| 未读徽章 | ✅ | ✅ | ✅ | OK |
| 会话置顶 | ✅ | ✅ | ✅ | OK |
| 会话归档 | ✅ | ✅ | ✅ | OK |
| 会话静音 | ✅ | ✅ | ✅ | OK |
| 侧栏对话预览 | ✅ | ✅ | ✅ 最后消息 + 时间戳 | OK |
| 侧栏 IA 重排 | ❌ | ❌ | ✅ DM/群组优先，AI 折叠 | OK |
| 侧栏搜索/过滤 | ✅ | ✅ | ✅ | OK |
| 群组信息管理面板 | ✅ | ✅ | ✅ 成员/Webhook/audit | OK |

## 通知

| 功能 | 飞书 | Telegram | 我们 | 差距 |
|------|------|----------|------|------|
| 桌面通知 | ✅ | ✅ | ✅ | OK |
| 声音提示 | ✅ | ✅ | ✅ | OK |
| @mention 通知 | ✅ | ✅ | ✅ | OK |
| 免打扰 | ✅ | ✅ | ❌ **缺失** | P2 |
| 音效开关 | ✅ | ✅ | ✅ | OK |

## UI/UX

| 功能 | 飞书 | Telegram | 我们 | 差距 |
|------|------|----------|------|------|
| 暗色/亮色主题 | ✅ | ✅ | ✅ light 首次默认 | OK |
| 响应式布局 | ✅ | ✅ | ✅ 断点 lg 优化 | OK |
| 动画过渡 | ✅ | ✅ | ✅ fade-in slide-up | OK |
| 无障碍 | ✅ | ✅ | 🔧 agent 开发中 | |
| 移动端适配 | ✅ | ✅ | ✅ 密度/字号/标题收紧 | OK |
| 滑动手势 | ✅ | ✅ | 🔧 agent 开发中 | |
| 长按菜单 | ✅ | ✅ | ✅ | OK |
| 离线 PWA | ❌ | ❌ | ✅ | OK |
| 桌面 header「更多」菜单 | ❌ | ❌ | ✅ 语言/主题/导出/设置 | OK |
| 在线用户排序 | ❌ | ❌ | ✅ 好友/DM 优先 | OK |
| 在线用户加载骨架屏 | ❌ | ❌ | ✅ | OK |
| 44px 触摸目标基线 | ❌ | ❌ | ✅ header/工具栏/操作/FAB | **领先** |

## 连接与可靠性

| 功能 | 飞书 | Telegram | 我们 | 差距 |
|------|------|----------|------|------|
| WebSocket 自动重连 | ✅ | ✅ | ✅ 指数退避 | OK |
| 发送失败反馈 | ✅ | ✅ | ✅ 断开警告 + 红色闪烁 | OK |
| Docker HEALTHCHECK | ❌ | ❌ | ✅ /api/health | OK |
| 消息离线持久化 | ✅ | ✅ | ✅ SQLite | OK |

## 群组与 Webhook

| 功能 | 飞书 | Telegram | 我们 | 差距 |
|------|------|----------|------|------|
| 群组信息管理 | ✅ | ✅ | ✅ owner/admin 角色 | OK |
| Webhook 创建 | ✅ | ✅ | ✅ 一次性 secret | OK |
| Webhook secret 轮换 | ❌ | ❌ | ✅ audit log | **领先** |
| Webhook ingress E2E | ❌ | ❌ | ✅ 浏览器闭环 | OK |
| 群组视频通话 | ✅ | ✅ | ✅ 基础 signaling | OK |

## AI/Agent

| 功能 | 飞书 | Telegram | 我们 | 差距 |
|------|------|----------|------|------|
| Bot 对话 | ✅ | ✅ | ✅ | OK |
| 多模型 | ✅ | ❌ | ✅ | **领先** |
| Agent 工作流 | ❌ | ❌ | ✅ 单 agent | **领先** |
| 自动回复 | ❌ | ❌ | ✅ | **领先** |

## 工程基线

| 指标 | 状态 |
|------|------|
| 前端测试 | 624 tests / 40 文件 / 全绿 |
| 后端测试 | `go test ./...` 全绿 |
| 行覆盖率 | 40%+ |
| TypeScript | tsc --noEmit 零错误 |
| ESLint | 零警告 |
| E2E | 54 条（含 webhook ingress） |
| CI/CD | GitHub Actions backend-test + frontend-test + lint |
| 视觉验收 | desktop/tablet/mobile light/dark screenshot + metrics |

---

## 剩余差距（按优先级）

**本轮 agent 开发中**：
1. 双击回复
2. 消息链接跳转
3. URL 预览卡片
4. 图片预览/缩放（Lightbox）
5. 无障碍（a11y）
6. 移动端滑动手势

**P2 待排期**：
1. 免打扰/勿扰模式

**工程待办（ROADMAP 后续任务）**：
1. 群组视频通话浏览器 smoke/E2E（双会话或 mock WebRTC）
2. 消息列表性能 pass（profiling、虚拟列表调优、bundle/chunk review）
3. 管理/安全界面：2FA 方案、管理仪表盘、邀请码管理加固
4. AgentHub 反馈笔记：webhook/group/call/media 原语迁移评估

**跨审查发现的系统级 gaps**：
1. i18n 完整性：仍有 key 冲突和 masking 边界 case（MessageTranscript 已修，需全量扫描）
2. localStorage 用户隔离：已修复为 user-scoped，需验证所有 store 均已收敛
3. 屏蔽用户过滤一致性：已修复，需回归覆盖
