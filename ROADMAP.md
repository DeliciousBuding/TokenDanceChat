# TokenDanceChat ROADMAP

最后更新：2026-06-09

发布: [v0.2.13](https://github.com/TokenDanceLab/TokenDanceChat/releases/tag/v0.2.13) | Docker: `tokendancechat:v0.2.13` | 测试: **690** 前端 / 35 文件 / Backend **6/6** / Skills **6** 活跃 / CI 全绿 | OIDC + session auth

## 当前目标

TokenDanceChat 是 AgentHub Hub/IM 验证项目兼可玩 Demo。

当前产品目标是用轻量聊天原型验证 AgentHub 的 realtime Hub、SQLite 持久化、React 客户端状态、公共聊天室 + Agent-as-contact UX 和部署形态，同时将 Demo 向以下方向演进：

- 公共聊天室优先，保留 TokenBot 和 PicoClaw 两个 AI 工作区入口；
- Telegram 级别的消息流动、对话人体工学、移动端交互质量；
- 安全、可测试、可部署的工程基线，能将经验回流到 `D:\Code\AgentHub`。

`ROADMAP.md` 是面向未来 agent 的持久化目标账本。每次有意义的实现、验证、安全复核或范围决策后更新。

## 产品原则

1. **AgentHub first**
   TokenDanceChat 验证 AgentHub 的 IM 协作和 Hub 网络层。不得演化为独立的长期产品架构。

2. **轻量 Demo**
   应用应保持干净、可用和高效：主产品面只保留公共聊天室、TokenBot 和 PicoClaw。复杂联系人添加、联系人私聊、群组、语音/视频通话、GIF picker、定时发送、webhook 管理等旧 IM 压力测试能力不再进入主界面合同。

3. **Typed realtime protocol**
   新能力应使用显式 WebSocket message type、typed 前端 helper、store contract 和 focused tests。

4. **Security by default**
   Secret 应为一次性或在可行时脱敏；仅生产环境细节不进入公开文档；安全发现追踪于 `SECURITY.md` 和本 roadmap。

5. **Verified increments**
   每次代码变更需先过 focused check，再 broader verification，方可声称完成。

## 活跃工作流

| 优先级 | 工作流 | 目标 |
|---|---|---|
| P0 | AgentHub 验证对齐 | 保持 README、docs、roadmap、protocol 和 store contract 映射到 AgentHub 原语。 |
| P0 | 协议/存储加固 | 将 WebSocket event 和 SQLite 表视为可复用 Hub 证据；为安全敏感合约添加回归测试。 |
| P0 | 验证基线 | 保持 `go test ./...`、前端 focused tests、`npx tsc --noEmit`、`git diff --check` 全绿。 |
| P1 | 轻量聊天 UX | 公共消息流、文件/图片、threads、reactions、通知、搜索、移动端人体工学和 AI 工作区切换。 |
| P1 | Telegram UX | 快速消息列表、干净输入、移动端手势、copy/reply/edit 人体工学、打磨过渡、媒体查看器质量。 |
| P1 | Agent-as-contact | 让 TokenBot/PicoClaw 感觉像轻量 AI 私聊入口：通过公共协议 mention/前缀发送，保留模型/provider 可供性和工作流转移，不恢复真人私聊或复杂联系人系统。 |
| P2 | 运维/性能 | Health check、部署 checklist、bundle/runtime profiling、虚拟列表调优、WebSocket fanout/load check。 |
| P2 | OIDC / 会话鉴权 | TokenDance ID 统一登录：`CHAT_OIDC_ENABLED` 控制；本地/OIDC 登录签发应用 `session_token`，保护 REST 与注册用户 WS join。 |
| P2 | UI/美术方向 | 克制企业 UI + 流畅聊天交互；避免装饰性营销布局。 |

## 当前增量（dev）：测试覆盖 + 性能优化 + UI 打磨 + 工程基建

状态：持续推进。690 tests / 35 files / tsc 0 / CI 就绪 / E2E 本地 public preview PASS / Backend 6/6 PASS；当前前端矩阵聚焦公共房间、TokenBot/PicoClaw、消息渲染、composer、设置、搜索、文件、poll/reconnect 等核心聊天能力。

- [x] 2026-06-08 轻量聊天合同重构：主界面只保留公共聊天室、TokenBot 和 PicoClaw；移除主 UI 对旧 Sidebar、联系人/好友、群组创建/信息面板、转发入口、语音/视频通话、GIF picker 和定时发送的依赖。`ChatInput` 实际删除隐藏录音/GIF/定时代码，不再用 `false &&` 保留旧功能。E2E 旧 DM/群组/通话/GIF/webhook 套件移出测试矩阵，新增 `lightweight-chat.test.ts` 覆盖桌面/移动公共房间和 AI 工作区，并补 guest 自动加入、发送、刷新后持久化断言。v4 token 收敛：panel radius 10px、bubble radius 12px、composer shadow 更轻，AI workbench/message edit 改用已定义 `--td-*`/chat tokens。验证：`npx tsc --noEmit`、`npm test`（44 files / 861 tests）、`npm run build`、`go test ./hub`、`npx playwright test src/e2e/lightweight-chat.test.ts --project=chromium`、`.\scripts\verify-design-tokens.ps1`、`.\scripts\verify-design-hygiene.ps1`、`git diff --check` 均通过；生产：`chat.vectorcontrol.tech` 已运行 `tokendancechat:codex-20260608-tokenbot-normalize`，guest 自动加入后输入框等到 WebSocket connected 后启用，自发消息不再继承历史分组 stagger animation delay，公网首页 asset `index-xNcyymEk.js`，公开域名 `lightweight-chat.test.ts` 2/2 通过，发送可见性连续探针 `visibleMs=[1078,920,927]`，旧名 DOM 探针 `WebUIChat=0` / `WebUIBot=0`；截图：`frontend/artifacts/visual/lightweight-desktop.png`、`frontend/artifacts/visual/lightweight-mobile.png`、`frontend/artifacts/visual/tokenbot-desktop.png`。
- [x] 2026-06-09 AgentHub v4 聊天渲染迁移：聊天区改为 AgentHub transcript/list/block 布局，输入框压回 v4 composer row 视觉层，panel/bubble radius 统一到 16px，消息气泡和 composer 使用 v4 token 别名、低动效和受控阴影；消息渲染删除旧语音播放器、GIF canvas 与 sticker 专用控件，历史媒体只按普通 Markdown 链接/图片展示。同步更新 `docs/agenthub-validation.md`、`docs/engineering-goal.md`、`docs/governance-execution.md`、`docs/visual-acceptance.md`，明确 rich IM 为历史压力测试/后端兼容，当前前端合同只保留公共房间、TokenBot、PicoClaw。`frontend/scripts/visual-acceptance.mjs` 改为轻量合同验收，不再创建群组/Webhook 或要求 7 个旧工具入口；`page-load.test.ts` 和 E2E helper 改为自动 guest + 公共聊天室可发送合同；`SettingsPanel` 补当前通知抽屉 visual markers 和 44px 控件。阶段验证：`cd frontend; npx tsc --noEmit` PASS；`npm test -- --run src/components/ChatInput.test.tsx src/components/MessageBubble.test.tsx src/components/MessageTranscript.test.tsx src/components/ChatLayout.test.tsx` PASS（4 files / 103 tests）；`npm exec -- playwright test src/e2e/page-load.test.ts --project=chromium --reporter=line` PASS（4/4）；`npm run build` PASS，最新本地 asset `/assets/index-60VvBmUV.js`；干净本地 DB + `VISUAL_BASE_URL=http://127.0.0.1:18180 npm run visual:acceptance` PASS，输出 `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-08T17-49-54-966Z`，桌面 composer 820x66 radius 16px、移动 composer 346x66 radius 16px、`oldLabels=0`。
- [x] 2026-06-09 生产上线 v4 chat：hk2 禁用 `docker build`，本轮以 `tokendancechat:codex-20260608-tokenbot-normalize` 为 base 替换 `/app/tokendancechat` 和 `/app/frontend/dist` 后 `docker commit` 新镜像 `tokendancechat:codex-20260609-v4-chat`；生产容器沿用 `aihub-hk2` network、`:3221->8080`、`/var/lib/agenthub/chat:/app/data`、`gemini-web2api` LLM env，旧容器保留为 `tokendancechat-prev-20260609022000-v4-chat`。上线验证：hk2 Docker health `healthy`，容器内 `/api/health` 返回 ok，公网首页加载 `/assets/index-60VvBmUV.js`；公开域名 `lightweight-chat.test.ts` 2/2、`page-load.test.ts` 4/4；Playwright DOM 探针 `WebUIChat/WebUIBot/webuichat/webuibot/Friends/Groups/DM/Voice Call/Video Call/Schedule Message/Webhook=0`，自发消息可见延迟 `visibleMs=17`。公网 `/api/health` 仍按 nginx 当前策略受 OAuth2 保护并 302 到 TokenDanceID，health 证据以容器/source 检查为准。
- [x] 2026-06-09 前端旧 rich-IM 合同清理：删除不再可达的旧自定义表情管理、个人资料编辑、旧模型选择、群组信息 helper 和群组通话 store 测试；从 `chatStore` 移除 friends/pending invites/scheduled/webhook/call 状态和 mutators，继续清掉 `rooms`、`folders`、`currentRoomID` 以及对应 room/folder actions；从 `chatAPI` 移除客户端 DM/group/friend/schedule/call/webhook 发送方法，并继续移除 room join/create、conversation pin/mute/archive、folder API 和 export/search 的旧 scope；`useWebSocket` 不再处理 room/folder 事件，`sendMarkRead()` public-only；`SearchBar` 删除 `currentRoomID` prop，只搜索公共聊天室；i18n/test-utils 删除 schedule/gif/call/WebUIBot 等死 key 和 mock 残留。`CurrentChat` 的旧 `dm/group` 类型仅保留为历史状态清洗输入，`ChatLayout` 会强制回公共房间。验证：`cd frontend; pnpm exec tsc --noEmit` PASS；focused tests PASS（7 files / 306 tests）；`pnpm test` PASS（35 files / 689 tests）；`pnpm run build` PASS，asset `/assets/index-Bs8_bJyY.js`；`cd backend; go test ./...` PASS；临时 Go 后端 + `E2E_BASE_URL=http://127.0.0.1:18180 pnpm exec playwright test src/e2e/lightweight-chat.test.ts src/e2e/page-load.test.ts --project=chromium --reporter=line` PASS（6/6）；`VISUAL_BASE_URL=http://127.0.0.1:18180 pnpm run visual:acceptance` PASS，输出 `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-08T21-07-28-431Z`，desktop composer 820x104、mobile composer 346x104、textarea 44px、radius 16px、oldLabels=0；`..\scripts\verify-design-tokens.ps1` PASS；`..\scripts\verify-design-hygiene.ps1` PASS with unrelated `.worktrees` warnings；`git diff --check` PASS（仅 CRLF warning）。
- [x] 2026-06-09 生产上线 public-core-clean：以 `tokendancechat:codex-20260609-stale-guest-fix` 为 base 替换 `/app/tokendancechat` 和 `/app/frontend/dist` 后 `docker commit` 新镜像 `tokendancechat:codex-20260609-public-core-clean`；生产容器沿用 `aihub-hk2` network、`:3221->8080`、`/var/lib/agenthub/chat:/app/data` 和 `gemini-web2api` LLM env，旧容器保留为 `tokendancechat-prev-20260608211115-public-core-clean`。上线验证：hk2 Docker health `healthy`，源站 `/api/health` 返回 ok，源站和公网首页均加载 `/assets/index-Bs8_bJyY.js`；公开域名 `lightweight-chat.test.ts` + `page-load.test.ts` 6/6；Playwright DOM 探针 `WebUIChat/WebUIBot/webuichat/webuibot/Friends/Groups/DM/Direct Message/Voice Call/Video Call/Schedule Message/Webhook/好友/群组/私信/语音通话/视频通话/定时发送=0`，自发消息可见延迟 `visibleMs=34`，auth modal count 0。公网 `/api/health` 仍按 nginx 当前策略受 OAuth2 保护并 302 到 TokenDanceID，health 证据以容器/source 检查为准。
- [x] 2026-06-09 Open WebUI / AgentHub composer 对照补齐：对照 Open WebUI `open-webui/open-webui@02dc3e689ceac915a870b373318b99c029ddf603` 的 `MessageInput.svelte`、`Messages.svelte`、Markdown 渲染链，以及 AgentHub `TranscriptView` / `UnifiedComposer` / shared `MessageBubble`，保留 bottom composer、明确 submitting/generating feedback、附件/图片预览、Markdown 渲染和 AgentHub transcript block 模式；不迁移 Open WebUI 的工具服务器、语音、模型库、知识库、复杂队列和多会话侧栏。`ChatInput` 新增真实 `isSubmitting` UI 状态，发送按钮在 500ms 防双发窗口显示 spinner 并暴露 `data-submitting` / `composer-submit-state`，避免用户按 Enter 后误以为未发送。验证：`pnpm test -- --run src/components/ChatInput.test.tsx` PASS（46 tests）；`pnpm exec tsc --noEmit` PASS；`pnpm test` PASS（35 files / 690 tests）；`pnpm run build` PASS，asset `/assets/index-DAKnNnmA.js`；`cd backend; go test ./...` PASS；本地 Go server + `lightweight-chat.test.ts` / `page-load.test.ts` E2E 6/6 PASS；`VISUAL_BASE_URL=http://127.0.0.1:18180 pnpm run visual:acceptance` PASS，输出 `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-08T21-24-10-324Z`，composer radius 16px、oldLabels=0。
- [x] 2026-06-09 开发/测试/文档收口审计：确认 Open WebUI 最新 HEAD 仍为 `02dc3e689ceac915a870b373318b99c029ddf603`，本地参考 clone 与远端一致；`lightweight-chat.test.ts` 增加真实浏览器断言，发送后必须出现 `composer-submit-state`，并验证旧 `@webuibot` 输入在渲染层归一为 `@TokenBot`、DOM 中不出现 WebUI 旧名。README 修正 OIDC/design 文档路径和“无限滚动”措辞。验证：`pnpm exec tsc --noEmit` PASS；`pnpm test -- --run src/components/ChatInput.test.tsx src/components/MessageBubble.test.tsx` PASS（2 files / 83 tests）；`pnpm test` PASS（35 files / 690 tests）；`pnpm run build` PASS，asset `/assets/index-DAKnNnmA.js`；`cd backend; go test ./...` PASS；本地 Go server + `E2E_BASE_URL=http://127.0.0.1:18180 pnpm exec playwright test src/e2e/lightweight-chat.test.ts src/e2e/page-load.test.ts --project=chromium --reporter=line` PASS（6/6）；公开生产 `https://chat.vectorcontrol.tech` 加载 `/assets/index-DAKnNnmA.js`，同一 E2E 合同 PASS（6/6），覆盖新增提交态和旧别名归一断言；`VISUAL_BASE_URL=http://127.0.0.1:18180 pnpm run visual:acceptance` PASS，输出 `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-08T21-35-35-298Z`，desktop composer 820x104、mobile composer 346x104、textarea 44px、radius 16px、oldLabels=0。
- [x] 2026-06-09 AgentHub Desktop chatview 深度对齐：消息区进一步贴近 AgentHub `TranscriptView` / `UserMessage` / `UnifiedComposer` 规则；自发消息从深蓝实心气泡改为浅 TokenDance Blue token surface、深色正文、细边框和 `e-1` 低阴影，气泡内容从顶部自然排版，不再把时间/meta 行挤进气泡顶部；composer 收敛为单行 62px capsule，保留 `+`、textarea、发送按钮主视觉，旧 Markdown/图片/文件/emoji 工具不再作为第二行主工具栏挤压输入区。验证：`pnpm test -- --run src/components/MessageBubble.test.tsx src/components/ChatInput.test.tsx src/components/ChatLayout.test.tsx` PASS（3 files / 90 tests）；`pnpm exec tsc --noEmit` PASS；`pnpm run build` PASS，asset `/assets/index-DZUo_Snz.js`；重启本地 Go server 后 `VISUAL_BASE_URL=http://127.0.0.1:18180 pnpm run visual:acceptance` PASS，输出 `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-09T10-56-07-693Z`，desktop composer 820x62、mobile composer 346x62、textarea 44px、radius 16px、oldLabels=0；同一服务 `E2E_BASE_URL=http://127.0.0.1:18180 pnpm exec playwright test src/e2e/lightweight-chat.test.ts src/e2e/page-load.test.ts --project=chromium --reporter=line` PASS（6/6）。
- [x] 2026-06-09 AgentHub composer / 浅色气泡收口：`ChatInput` 不再保留被 CSS 隐藏的旧 toolbar、Markdown 格式化弹层、preview、slash command、emoji shortcut 和重复 Enter capture/keyUp 发送逻辑；composer 对齐 AgentHub `UnifiedComposer` 的单行结构，只保留图片/文件附件入口、textarea、发送按钮和 TokenBot/PicoClaw mention。`index.css` 将 own message stack 从固定 72% 改为 `fit-content` + 最大宽度，修复用户短消息前方大块空白；自发消息 token 从 10% 蓝降到 6% 蓝、边框降到 14% 蓝，整体更浅。`visual-acceptance.mjs` 补足 TokenBot seed 密度并支持 mention 拆分后的正文等待。验证：`pnpm exec tsc --noEmit` PASS；`pnpm exec vitest run src/components/ChatInput.test.tsx src/components/MessageBubble.test.tsx` PASS（83 tests）；`pnpm test` PASS（35 files / 690 tests）；`go test ./...` PASS；`pnpm run build` PASS，asset `/assets/index-4Stay-2G.js`；本地 E2E `lightweight-chat.test.ts` + `page-load.test.ts` PASS（6/6，含发送后立即上屏）；`VISUAL_BASE_URL=http://127.0.0.1:18180 pnpm run visual:acceptance` PASS，输出 `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-09T11-27-54-332Z`，desktop/mobile composer 820/346x62、TokenBot blocks 7/6、oldLabels=0；人工审阅 desktop/mobile TokenBot 截图确认浅色 token、顶部高度和 own bubble 空白已收敛。
- [x] 2026-06-09 生产上线 AgentHub chatview：按用户要求未部署 Gateway；hk2 当前 `tokendancechat` running container 原位替换 `/app/tokendancechat` 和 `/app/frontend/dist`，保留 network、`:3221->8080`、data volume 和 LLM env，部署前 commit `tokendancechat:codex-20260609-pre-agenthub-chatview`，部署后 commit `tokendancechat:codex-20260609-agenthub-chatview`。生产 Docker health `healthy`，source `/api/health` ok，source 和公网首页均加载 `/assets/index-DZUo_Snz.js`；公开域名 `E2E_BASE_URL=https://chat.vectorcontrol.tech pnpm exec playwright test src/e2e/lightweight-chat.test.ts src/e2e/page-load.test.ts --project=chromium --reporter=line` PASS（6/6）；cache-busting HTML scan：`WebUIChat=0`、`WebUIBot=0`、`webuichat=0`、`webuibot=0`、`token-dance-=0`。私有运行证据已同步到 `C:\Users\Ding\server\projects\gateway\STATE.md`。
- [x] 2026-06-09 生产上线 AgentHub light final：按用户要求未部署 Gateway；最终只替换当前 `tokendancechat` running container 的 `/app/frontend/dist`，保留原 network、`:3221->8080`、data volume、backend binary 和 LLM env。部署前 commit `tokendancechat:codex-20260609-pre-agenthub-light-final`（`sha256:d0e1699fee8873a7caab324da072f99fd4c5f70acb2db609afb7704f3ee1a8e4`），部署后 commit `tokendancechat:codex-20260609-agenthub-light-final`（`sha256:0aa898ad0c243b2a339bdc36c91da1c0ae19a5b4e792f184ab3fead62f255862`）。生产 Docker health `healthy`，source `/api/health` ok，公网 cache-busting 首页加载 `/assets/index-CiZyZ0qs.js`；公开域名 `lightweight-chat.test.ts` + `page-load.test.ts` 6/6；HTML scan：`WebUIChat=0`、`WebUIBot=0`、`webuichat=0`、`webuibot=0`、`token-dance-=0`。本轮最终清理删除 `MessageBubble` 旧 voice/group seen-by 死分支，并重新验证本地 full test/build/E2E/visual。
- [x] 2026-06-09 TokenBot/PicoClaw 顶部收口：删除独立 `AIChatWorkbench` active path 和文件，助手模式不再在 header 下方额外占 59px/107px 顶部工作台；TokenBot/PicoClaw 入口保留在 `LightChatSidebar`，composer context 低噪显示当前助手并继续由 `ChatLayout.buildOutgoingContent()` 自动加 `@TokenBot` / `@PicoClaw`。`lightweight-chat.test.ts` 补真实浏览器断言：分别选中 TokenBot/PicoClaw 后输入普通文本，消息流必须立即出现对应 mention 和正文。验证：`pnpm exec vitest run src/components/ChatLayout.test.tsx src/components/ChatInput.test.tsx` PASS（53 tests）；`pnpm exec tsc --noEmit` PASS；`pnpm run build` PASS，asset `/assets/index-BtZZ4AzG.js`；本地 Go server + `lightweight-chat.test.ts` / `page-load.test.ts` E2E PASS（6/6）；`VISUAL_BASE_URL=http://127.0.0.1:18182 pnpm run visual:acceptance` PASS，输出 `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-09T12-09-35-053Z`，desktop/mobile composer 820/346x62、TokenBot blocks 7/6、`ai=false`、`oldLabels=0`；`pnpm test` PASS（35 files / 690 tests）；`cd backend; go test ./...` PASS。
- [x] 2026-06-09 生产上线 no-ai-workbench：按用户要求未部署 Gateway；仅替换当前 `tokendancechat` running container 的 `/app/frontend/dist`，保留 network、`:3221->8080`、data volume、backend binary 和 LLM env。部署前 commit `tokendancechat:codex-20260609-pre-no-ai-workbench`（`sha256:094753e4c028f080e76ece1de25d2678d8e3241b0993a5b2f34d6d12ff4b8ddb`），部署后 commit `tokendancechat:codex-20260609-no-ai-workbench`（`sha256:68c75f88b2eaffce237503c4ced6a2dd9b567035d6d654c89200f8888cea2e84`）。生产 Docker health `healthy`，source `/api/health` ok，公网 cache-busting 首页加载 `/assets/index-BtZZ4AzG.js`，HTML scan `WebUIChat=0`、`WebUIBot=0`、`webuichat=0`、`webuibot=0`、`token-dance-=0`；公开域名 `lightweight-chat.test.ts` + `page-load.test.ts` PASS（6/6，含 TokenBot/PicoClaw prefixed sends）。
- [x] 2026-06-09 自发消息右对齐修复并上线：根因是 `.message-group { display:block }` 覆盖 transcript 分组规则，`li.td-ah-transcript-block` 不是真实 flex item，自己的消息只在左侧/中间 820px 列里右对齐；修复为在 `MessageTranscript` 给消息组写入 `data-message-own`，CSS 让 own group 在 transcript 内容区 `margin-left:auto`，并删除自己消息右侧头像/占位，使气泡贴近右侧内边距。验证：本地 1440px Playwright 几何探针 `bubbleToRegionRight=36`、`blockToRegionRight=20`；390px 移动端 `scrollWidth=390`、`bubbleToRegionRight=30`；`pnpm exec vitest run src/components/MessageTranscript.test.tsx src/components/MessageBubble.test.tsx` PASS（51 tests）；`pnpm exec tsc --noEmit` PASS；`pnpm test` PASS（35 files / 690 tests）；`pnpm run build` PASS，asset `/assets/index-BK_YVSvU.js`；`cd backend; go test ./...` PASS；本地 E2E `lightweight-chat.test.ts` + `page-load.test.ts` PASS（6/6）；`VISUAL_BASE_URL=http://127.0.0.1:18183 pnpm run visual:acceptance` PASS，输出 `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-09T12-37-57-148Z`。生产仅替换 `/app/frontend/dist`，未部署 Gateway；rollback 镜像 `tokendancechat:codex-20260609-pre-own-right-align`（`sha256:fb0c0103a460...`），final 镜像 `tokendancechat:codex-20260609-own-right-align`（`sha256:e18037a68fbc74ece2d4b85360dcd268659717a5eeb73458638c67e23f57f89c`）；Docker health `healthy`，source `/api/health` ok，公网首页加载 `/assets/index-BK_YVSvU.js`，公网 E2E 6/6，HTML scan `WebUIChat/WebUIBot/webuichat/webuibot/token-dance-` 全 0，公网几何探针 `bubbleToRegionRight=36`、`blockToRegionRight=20`。
- [x] 2026-06-09 标题栏和侧栏 TokenDance logo 修复并上线：浏览器 tab favicon 从白底 rounded 版改为透明三蓝条 `TokenDance mark`，`index.html` 使用 `/favicon.svg?v=20260609-tokendance-mark` 破浏览器 favicon 缓存；侧栏标题图标从蓝底 `Sparkles` 改为 `/tokendance-mark-transparent.svg`，不再出现旧蓝底图标。验证：`pnpm exec vitest run src/components/ChatLayout.test.tsx src/components/Avatar.test.tsx` PASS（18 tests）；`pnpm exec tsc --noEmit` PASS；`pnpm run build` PASS，asset `/assets/index-J_-nSRXy.js`；本地 DOM 探针确认 `faviconHref=/favicon.svg?v=20260609-tokendance-mark`、`logoSrc=/tokendance-mark-transparent.svg`、`hasSparkles=false`。生产仅替换 `/app/frontend/dist`，未部署 Gateway；rollback 镜像 `tokendancechat:codex-20260609-pre-logo-favicon`（`sha256:d4ed5f6bb791569fe60cf958f1e6aafd1dd98e9add244794a183b6eab852b480`），final 镜像 `tokendancechat:codex-20260609-logo-favicon`（`sha256:1e905b6b39a0ceef0298027d5af5ae0412158ecebc81822beb0bbd7a67c2d1bc`）；Docker health `healthy`，source `/api/health` ok，公网首页加载 `/assets/index-J_-nSRXy.js`，公网 favicon 白底计数 0、蓝条计数 3，公网 DOM 探针确认侧栏 logo src 与 `hasSparkles=false`，公网轻量聊天 + page-load E2E 6/6。
- [x] 2026-06-09 stale guest 状态修复并上线：`App.tsx` 清理旧 `tokendance:username` 但没有 auth/session token 的本地状态后直接进入自动 guest，不再把 `AuthModal` backdrop 留在已连接聊天层上。新增 `App.test.tsx` 回归覆盖 username-only localStorage；前端矩阵更新为 35 files / 709 tests。生产以 `tokendancechat:codex-20260609-light-contract` 为 base 派生 `tokendancechat:codex-20260609-stale-guest-fix`，只替换 `/app/frontend/dist`，旧容器保留为 `tokendancechat-prev-20260609040900-stale-guest-fix`；公网首页 asset `/assets/index-CV7cpuwu.js`。验证：`pnpm test -- --run src/App.test.tsx` PASS（7/7）；`pnpm exec tsc --noEmit` PASS；`pnpm test` PASS（35 files / 709 tests）；`pnpm run build` PASS；`cd backend; go test ./...` PASS；生产 Docker health `healthy`，容器 `/api/health` ok；公网 `lightweight-chat.test.ts` + `page-load.test.ts` PASS（6/6）；DOM 探针 `WebUIChat/WebUIBot/webuichat/webuibot/Friends/Groups/DM/Voice Call/Video Call/Schedule Message/Webhook/好友/群组/私信/语音通话/视频通话/定时发送=0`，正常首访发送可见 `visibleMs=1017`，stale username-only 状态发送可见 `visibleMs=1174`。
- [x] 应用会话鉴权：login/register/OIDC redeem/exchange 返回 HMAC `session_token`；受保护 REST 端点要求 `Authorization: Bearer <session_token>`；本地注册用户 WebSocket join 发送应用 session token，OIDC 用户仍发送 OIDC access token，游客不发送 token。
- [x] REST 权限加固：search/export/upload/emoji/invite/admin stats 不再信任 query/body username；search 按认证用户过滤公开、DM、群组成员和 deleted 状态。
- [x] Group export 权限加固：`conversation=group:<name>` 导出前验证调用者群组成员身份，非成员返回 `NOT_IN_GROUP`，并补 focused regression。
- [x] Webhook ingress 权限/资源边界加固：HTTP 入口仅接受 `Authorization: Bearer <secret>`，拒绝 query secret；请求体 8 KiB、content 2000 字符；sender 固定为服务端 `webhook`，前端/E2E 改为 header 调用。
- [x] Webhook ingress 实时链路修复：HTTP POST 现在持久化为群组消息、携带真实消息 ID，并通过 `SendToGroup` 只分发给在线群成员；浏览器 E2E 验证群组消息中只显示一次。
- [x] 前端 WebSocket 重复投递修复：`useWebSocket()` 多消费者共享一套事件订阅，`chatStore.addMessage` 按持久化 message ID 去重，避免 App/ChatLayout/AuthModal 多处挂载导致重复气泡。
- [x] CI/部署验证基线加固：GitHub Actions 增加 public-preview production build smoke、视觉验收和 artifact 上传；`docker-compose.yml` 和 `scripts/verify.ps1` 显式建模 `CHAT_DB_PATH`、`CHAT_SESSION_SECRET`、OIDC 开关和 frontend dist。
- [x] Compose 部署 fail-closed：`docker-compose.yml` 缺少 `CHAT_SESSION_SECRET` 时拒绝渲染配置，并透传 `CHAT_MEDIA_S3_*` / `CHAT_MEDIA_WEBDAV_*`；`.env.example` 默认不再 copy-enable 空 S3/OIDC 配置。
- [x] OIDC provider 资源边界加固：discovery、JWKS、token exchange、refresh 统一走 5s timeout HTTP client，并对 provider 响应体设置大小上限；focused tests 覆盖 timeout 和 oversized response。
- [x] OIDC runtime 资源边界加固：state/redeem token store 设置容量上限，满载时拒绝新建而不静默淘汰既有登录流程；store cleanup loop 可关闭，`SetupOIDC` 失败不安装 transient store，重配置会关闭旧 store；OIDC endpoint 独立 per-IP rate limit 提升为完整 redirect flow 预算；rate limiter 清理过期 IP entry。
- [x] 可信反代客户端 IP：新增 `CHAT_TRUSTED_PROXY_CIDRS`，只有可信反代来源的 `X-Forwarded-For` / `X-Real-IP` 会参与 REST、auth、OIDC 和 WS 限流，避免 nginx 后所有用户共享同一 `RemoteAddr` bucket。
- [x] 本地验证脚本防假绿：`scripts/verify.ps1` 在每个 native 命令后检查 `$LASTEXITCODE`，避免 `Select-Object`/`Out-Null` 管道吞掉 `go`/`npm`/`npx`/`docker`/`git` 失败状态；已用故意失败的 `GOFLAGS=-badflag` 反向烟测确认脚本会 exit 1。
- [x] 本地视觉门不再静默跳过：`scripts/verify.ps1` 未提供 `VISUAL_BASE_URL` 时会自行启动临时生产后端、等待 `/api/health`，运行 `npm run visual:acceptance`，并在结束后清理临时 DB 和进程。
- [x] 移动侧栏触控视觉门：`visual-acceptance.mjs` 新增 `mobile-light-sidebar-open` 场景，打开移动侧栏后对侧栏内可见控件做 44px hard gate；`Sidebar.tsx` 同步提升关闭、搜索、建群、主行、三点菜单和底部工具栏命中区。
- [x] 交接报告脱敏：`docs/handoff-report-2026-05-25.md` 删除具体主机别名、内网 IP、宿主机端口、真实域名、容器路径和 SSH 命令，改为部署运行契约与本地/占位验证命令。
- [x] 游客只读预览 P0：未登录首页通过 `GET /api/messages?limit=100` 拉取公开历史，接口失败时也结束骨架屏；保持不设置 username、不打开 WebSocket，点击「加入聊天」再进入 AuthModal 游客加入流程。
- [x] 为游客预览添加 focused App/API 测试和当前 UI 的 Playwright 生产 smoke，避免旧认证入口 E2E 选择器误报。
- [x] 修复未登录公共预览输入框聚焦时的全屏格式化遮罩拦截问题：composer popover 仅在已登录且输入框可用时打开，并以 ChatInput focused regression test 固化。
- [x] 对齐前端 `index.html` 与 Go 后端 runtime CSP：移除 Google Fonts 外链，改用系统字体，避免视觉验收控制台 CSP 报错。
- [x] 更新视觉验收脚本以适配当前 AuthModal 文案、composer selector 和 group-info Webhook/audit 场景。
- [x] 完成 2026-05-25 视觉验收复核：desktop/tablet/mobile light/dark + group-info 截图和 metrics 全部无 issues，详见 `docs/visual-acceptance.md`。
- [x] 历史 SettingsModal macOS/liquid-glass 增量已归档；当前主界面只保留轻量 `SettingsPanel` 通知抽屉，并由 desktop/mobile settings 场景门控 44px 控件和 v4 卡片样式。
- [x] AuthModal macOS/liquid-glass 增量：认证卡片、tab、关闭、密码显示、主按钮、inline switch 和 OIDC 链接纳入 44px 触控目标；`visual-acceptance.mjs` 新增 desktop login 与 mobile register error 场景，门控 modal fit、tab label 裁剪、错误态可见性和弹窗内小控件。
- [x] ChatInput composer macOS/liquid-glass 增量：composer 保持单一 v4 玻璃卡片，当前工具只保留 Markdown/图片/文件/emoji/发送；GIF、定时、录音入口已从主界面移除；桌面/移动端工具按钮和发送按钮保持 44px 触控目标。
- [x] AgentHub Desktop IM/聊天流 v4 美术迁移：对照 `AgentHub/app/desktop/src/styles/tokens.css`、`themes.css`、IM composer/contact list 和 TeamRun 卡片样式，将 TokenDanceChat 原型收敛到 charcoal/light glass token、紧凑 13/15px 字阶、8px control、16px panel/card/bubble、普通卡片 hairline/e-1、popover/menu e-3、modal e-4；当前主界面由 `td-chat-*` v4 迁移层支撑公共房间、TokenBot、PicoClaw、消息区、输入框、设置抽屉和认证弹窗，通话/管理/复杂联系人面板已归档为历史能力。
- [x] SW 缓存修复：CACHE_NAME tdchat-v3 + stale-while-revalidate 策略，防止部署后浏览器加载旧 JS/CSS。
- [x] api.ts connect 竞态修复：connectGeneration 计数器替代 intentionalClose 布尔值，消除旧 onclose 在新 onopen 后触发的竞态。
- [x] E2E 修复：back button label "Back" → "返回"（zh-CN context），3 个测试恢复。
- [x] 历史 group-call E2E 证据已归档；当前轻量合同已删除群组通话主界面入口。
- [x] 测试覆盖扩展：useWebSocket 3.37%→44.56%（+30 tests）、AuthModal/public preview 回归、ChatInput +14 tests（875 total）。
- [x] PM 审计全修复 (P1+P2)：AI 助手默认展开、文件上传错误提示、麦克风权限反馈、Sidebar 空状态 CTA 提示、分页超时重试按钮、移动端工具栏按钮可见、zh-CN 字符串全部中文化、录音提示 i18n。
- [x] Utils i18n 重构：formatTime/formatDate/formatLastSeen 从 lang 参数改为 t() 函数，消除 8 处内联双语三元，新增 profile.today/yesterday 键。
- [x] E2E 真实用户流历史覆盖（emoji reaction、message edit、search、settings、GIF picker）；当前矩阵已删除 GIF picker 主界面入口。
- [x] MessageBubble 测试覆盖代码块、历史语音/GIF/sticker 兼容渲染、编辑标记、搜索高亮、回复预览、历史转发标记、删除消息；当前主界面不恢复语音/GIF/sticker/转发入口。
- [x] 后端测试扩展 +12：handler 边界用例（CORS、rate limit、login/register/DM/group/upload）、ws 边界、hub 边界（含 Stop 幂等性验证）。
- [x] 交叉审查驱动修复：api.ts gen guard 补全（onerror/onopen/onmessage/timeout）、ReadReceipt t 作用域、VideoCall formatTime 参数数量、SW activate clients.claim()。
- [x] 历史 Sidebar 测试覆盖上下文菜单、好友和在线用户；当前主界面改用 `LightChatSidebar`，只保留公共房间、TokenBot、PicoClaw。
- [x] 历史 VideoCall 测试已归档；视频/语音通话不属于当前轻量主界面合同。
- [x] E2E 边界用例 +8：Poll 长问题/单选拒绝/特殊字符、Sidebar 去重/离开/清除搜索、多用户跨标签。
- [x] Backend store +18：Message CRUD、Profile 更新、Friend 操作、Search 分页、Room CRUD。
- [x] Kick 重连循环修复：kicked 后清空 reconnectUsername，阻止 ping-pong 重连。
- [x] E2E production fixes x3（target 47/52）。
- [x] nginx production fix：agenthub-chat.conf 冲突修复。
- [x] 前端测试从 237 → 779 (+542 tests / +31 文件 / 51.86% 行覆盖率)。
- [x] 历史 handler +10、旧自定义表情管理 +13、旧个人资料编辑 +18 focused tests 已归档；当前轻量前端已删除这些旧组件和用例。
- [x] E2E 47/52 pass against production（3 fixes 进行中，target 47/52）。
- [x] 历史 E2E 曾覆盖 auth、dm、group、poll、reconnect、sidebar、webhook；当前轻量矩阵只保留公共房间、TokenBot/PicoClaw、设置抽屉、文件、搜索、poll/reconnect 等核心公共聊天室能力。
- [x] 后端测试扩展：store +7、hub +8、handler +34、llm +8、ratelimit 更新、ws +2。
- [x] PM 产品审计 P0 历史修复已归档；当前侧栏不再提供复杂对话预览、DM/群组或移动端语音按钮。
- [x] PM 产品审计 P1 历史修复已归档；当前 IA 为公共房间优先，TokenBot/PicoClaw AI 助手常驻。
- [x] PM 产品审计 P2 修复：桌面 header「更多」下拉菜单、相对时间戳（刚刚/X分钟前/日期/年）。
- [x] 交叉审查 HIGH/MEDIUM 全部修复（ForwardModal CSS 脆弱性、PollMessage error paths、ThreadPanel onSendReply、MessageTranscript i18n masking）。
- [x] ScrollToBottom FAB（Telegram 风格，200px 阈值，ChevronDown 图标，opacity+scale 动画）。
- [x] LoginScreen 错误 i18n 映射（auth.loginFailed / auth.registerFailed）。
- [x] RegisterScreen i18n 修复（auth.fillAllFields）。
- [x] Settings 按钮标签修复（notificationPrefs → openSettings）。
- [x] product-gap-analysis.md 陈旧条目修正（置顶/归档/静音/↑编辑）。
- [x] 3 项安全修复（邀请码枚举泄露、WritePump 挂起、密码 bcrypt 上限）。
- [x] CI/CD: GitHub Actions（backend-test / frontend-test / lint）。
- [x] 项目 Skills: `.agents/skills/verify.md`、`.agents/skills/pm-audit.md`。
- [x] api.ts 测试（142 tests，覆盖 send 方法、事件调度、ErrorCode、disconnect）。
- [x] 消息送达状态（Telegram 双勾风格：已读蓝✓✓ / 已送达灰✓✓ / 已发送无勾）。
- [x] AGENTS.md 新增 dev-loop 工作流、模型分配策略、分支策略。
- [x] 安全泄露 3 条 grep 自检 + 违规响应协议。
- [x] 覆盖率达 40%+（40.47% 行覆盖率）。
- [x] Opus 审查 MEDIUM/LOW 修复：无界内存 map 清理、CORS/WS 硬编码域名移除。
- [x] Opus 交叉审查第二轮修复（2 HIGH + 5 MEDIUM）：Sidebar previewMap 记忆化、i18n key 冲突、未读清理、屏蔽用户过滤、年份消除歧义、user-scoped localStorage。
- [x] 历史群组视频通话 E2E 已归档；当前轻量主界面删除通话入口。
- [x] 性能优化：O(1) reaction/read_by 查找表（Map 预索引）、onlineUsers prop 下沉至 MessageBubble、emoji 预处理提升。
- [x] WebSocket 自动重连：指数退避 + jitter（1s/2s/4s/8s/16s 上限），重连期间 banner 提示。
- [x] 发送失败反馈：WebSocket 断开时发送按钮红色闪烁 + 警告 toast。
- [x] URL 预览卡片：紧凑型，500ms 防抖，年龄分级过滤，加载/错误/溢出状态覆盖。
- [x] 历史 E2E dm-flow 测试已归档；真人 DM 不属于当前轻量主界面合同。
- [x] 在线用户加载骨架屏。
- [x] FAB 未读计数徽章。
- [x] 历史 SettingsModal 测试已归档；当前保留 SettingsPanel 通知抽屉测试。
- [x] 项目 Skills 扩展至 5 个：verify、pm-audit、deploy、cross-review、i18n-scan（`.agents/skills/`）。
- [x] a11y i18n 补全：28 keys，~20 文件，无障碍翻译全覆盖。
- [x] 性能优化：lastPreviews O(1) 查找、replyCounts 缓存。
- [x] Hub.Stop()：goroutine-safe test cleanup，消除测试间资源泄露。
- [x] formatTime/formatLastSeen lang 参数（i18n P3 完成）。
- [x] 滚动修复（4 轮迭代：scrollIntoView→min-h-0→willChange→flex flex-col on parent）：根因是父容器须为 flex 容器，子元素 flex-1 才能约束高度供 overflow-y-auto 使用。浏览器实测验证（double rAF），E2E 8/8 全绿。
- [x] 源码 bug 修复：Register 保留用户名检测 + HealthCheck 方法强制实施。
- [x] isReservedUsername 导出供 handler 层使用。
- [x] WebSocket connect 竞态修复：连接建立与 kicked 事件处理间的 race condition。
- [x] intentionalClose 异步窗口修复：重连流程中 intentionalClose 必须保持 true 直到新 onopen 触发，防止重连期间的 close 被误判为非预期断开。

## 当前增量：Webhook 安全 + 媒体存储 + Screenshot 驱动 UI 验收

状态：已实现、已文档化、已测试、已通过浏览器 screenshot 验收。

- [x] 将明文 webhook secret 持久化替换为 SQLite 中 versioned salted HMAC hash。
- [x] 添加 store 启动迁移以处理旧版明文 webhook secret 行。
- [x] 添加 `store.VerifyWebhookSecret`，将 HTTP webhook ingress 路由通过 constant-time hash 验证。
- [x] 将生成的一次性 webhook secret 强化到超出短 UUID 片段的熵值。
- [x] 为 hashed webhook 持久化、迁移、脱敏、权限检查和 HTTP ingress 添加 focused store、hub、handler 测试。
- [x] 添加 S3-compatible `MediaStore` 支持，含 AWS SigV4 签名和 env 驱动配置。
- [x] 将 S3 置于同源 `/uploads/...` 路由之后，前端状态永不见 bucket URL 或凭证。
- [x] 将自定义 emoji 上传/服务路径迁移到共享 `MediaStore` 抽象。
- [x] 加固 media key 以拒绝空段、`.`、`..` 和路径穿越，覆盖 local/WebDAV/S3 访问。
- [x] 为 S3 PUT/GET、emoji 媒体存储、emoji 服务和穿越拒绝添加 focused 后端测试。
- [x] 记录 S3-compatible 部署形态，不含私有 hostname、bucket、key、端口或日志。
- [x] 添加 Docker runtime HEALTHCHECK 探针 `/api/health`，跟随 `CHAT_ADDR`（包括非默认部署监听地址）。
- [x] 将 light mode 设为首次运行的默认姿态，面向飞书/Lark 风格验收。
- [x] 重做移动端 composer，Markdown 工具收起为图标，textarea 保持可用。
- [x] 添加 `docs/visual-acceptance.md`，含 screenshot metrics 和 `gpt-image-2` 参考 prompt。
- [x] 添加 `npm run visual:acceptance`，覆盖 desktop/tablet/mobile light/dark screenshot 和 JSON metrics。
- [x] 修复生产构建静态资源被计入 REST API rate limit 的问题；`/api/...` 保持限流，静态 SPA 资源不限。
- [x] 完成 desktop、tablet、mobile light/dark 模式的 Playwright screenshot 复核。
- [x] 在 screenshot 显示 768px 平板 textarea 被挤压至 144px 后，将桌面布局断点从 `md` 移至 `lg`；最终平板 textarea 为 456px。
- [x] 将移动端辅助操作收入更多菜单，确保「公共聊天」可读而非截断为「公...」。
- [x] 收紧移动端消息密度：更小的移动端气泡字号、更窄的气泡内边距、减少记录/日期分隔线内边距，移除非本人底部重复时间戳。
- [x] 加固 `npm run visual:acceptance`：种子消息等待输入发送守卫后上屏，若验收消息少于 4 条则快速失败。
- [x] 为移动端标题截断、移动端消息字号、最低可见消息密度添加视觉硬门槛。
- [x] 将每条消息的 hover 操作合并为单个 44px 操作菜单，保留 copy、forward、translate、react、pin、edit、delete、select 流程。
- [x] 将 header 操作、Markdown 工具栏控件、定时消息入口、侧栏工具按钮、可点击头像和消息操作按钮提升至 44px 视觉验收目标。
- [x] 收紧视觉验收 metrics，正确处理隐藏/屏外控件和祖先透明度。
- [x] 在干净的临时 SQLite DB 上重新运行视觉验收，确保最终 screenshot 仅包含种子 Demo 记录。
- [x] 收紧桌面侧栏首屏密度：4 张 model preview card、紧凑空状态、online-user 区位置的视觉门槛。
- [x] 经 screenshot 复核后减轻核心聊天界面视觉重量：message bubble 使用更轻的边框，composer 工具按钮不再渲染为粗边框块，可点击头像使用 46px 安全底板以确保稳定 44px 验收。
- [x] 添加真实 group-info 视觉验收场景：创建群组、打开右侧管理面板、验证仅 owner 可见的 Webhook 区、以 44px 目标对面板控件做硬门槛。
- [x] 将 group-info 管理控件、Webhook 操作、成员行、右键菜单、确认操作和可见群组侧栏行提升到稳定的 44px 目标。
- [x] 修复前端 `group_info` 处理以读取后端 `group_members` role payload，owner/admin 状态在真实 WebSocket round trip 后正确驱动群组信息和 Webhook 管理。
- [x] 在 screenshot 复核发现 header 挤压和空群内容稀疏后，为 group-info 截图门槛添加桌面标题单行稳定性和群组首屏空状态可见检查。
- [x] 添加浏览器 E2E 覆盖完整 Webhook ingress 闭环：群组管理员通过 UI 创建一次性 webhook，对生成的 HTTP URL 发 POST，在群组记录中可见外部消息。
- [x] 重申多模态 UI 验收：有意义的 UI 打磨需要真实浏览器 screenshot 和 metrics；`gpt-image-2` mockup 仅允许作为美学参考。
- [x] 添加 webhook secret rotation：store 级 `RotateWebhookSecret`，含 SQLite 事务化 audit logging（created/rotated/deleted），旧 secret 即时失效，新一次性 secret 仅返回创建者。
- [x] 添加 `webhook_rotate` 和 `webhook_audit_list` typed WebSocket event，含 owner/admin 权限检查和脱敏 audit DTO。
- [x] 添加前端 rotation UI：每 webhook 行的 rotate 按钮（44px）、带刷新的 audit log 面板、轮换时一次性 secret 显示、rotated-at/rotated-by 元数据。
- [x] 扩展视觉验收：group-info 场景现在创建 webhook 并对 webhook 行、rotate 按钮、audit log 条目和 created-secret 显示做硬门槛。
- [x] 为 rotation secret 失效、audit log 脱敏和权限检查添加 focused store 和 hub 测试。
- [x] 为 rotation state（一次性 secret 隔离、rotated 元数据、audit log 存储）添加前端 store 测试，及 rotate 按钮和 audit 渲染的 GroupInfoPanel 测试。

## 历史增量：Poll 前端集成 + AdminPanel i18n + 后端测试扩展 + i18n-scan skill

状态：已实现、已测试、已通过。

- [x] Poll 前端集成：创建/投票/结果展示 UI，typed WebSocket event 前后端闭环。
- [x] AdminPanel 完整 i18n 曾用于历史管理面板验证；当前轻量主界面不暴露管理面板。
- [x] 后端测试扩展：main 模块集成测试 + media 模块 focused 测试。
- [x] i18n-scan skill：沉淀 i18n 扫描、键值校验、未翻译检测为可复用 SOP（`.agents/skills/i18n-scan.md`）。
- [x] 前端测试从 644 扩展至 695（46 文件），后端测试保持全量 PASS。

## 后续产品任务

1. 继续收紧公共房间、TokenBot、PicoClaw 的消息渲染、流式回复、搜索、文件/图片、reaction、thread 和移动端输入体验。
2. 保持 AgentHub v4/OpenWebUI 风格的 transcript、message block、composer 和 assistant workbench 对齐，新增 UI 必须先补 token/视觉验收。
3. 性能 pass：消息列表 profiling、bundle/chunk review、WebSocket fanout/load check。
4. 后端历史 rich IM 协议只做兼容、安全回归和迁移证据维护；不要把群组、真人 DM、通话、GIF、定时、转发或 webhook 管理重新接回主界面。

## 2026-06-09 收口审计

| 用户要求 | 当前状态 | 证据 |
|---|---|---|
| 参考 AgentHub Desktop/Web v4 与 Open WebUI chat | 已收口到 AgentHub v4 为主合同，Open WebUI 只迁移 bottom composer、Markdown-first 消息流和 submitting feedback | `docs/agenthub-validation.md` 的源参考表；Open WebUI 最新 HEAD `02dc3e689ceac915a870b373318b99c029ddf603`；`TranscriptView` / `UnifiedComposer` / `MessageBubble` 对照记录 |
| 删除复杂 IM 功能，只保留公共聊天室、TokenBot、PicoClaw | 前端主合同已删除复杂联系人、真人私聊、群组、语音/视频、GIF picker、定时、转发和 webhook 管理入口；后端历史协议只作为兼容/安全回归存在 | `frontend/src/e2e/lightweight-chat.test.ts`、`docs/agenthub-validation.md` 当前前端合同、`docs/visual-acceptance.md` 旧入口 DOM 扫描 |
| TokenBot 命名统一 | 运行态旧 `@webuibot` 兼容别名渲染为 `@TokenBot`，WebUI 旧名不出现在可见 DOM | 更新后的 `lightweight-chat.test.ts`；本地和生产 E2E 6/6 |
| 聊天渲染、聊天区、输入框对齐设计系统 | transcript block、message bubble、composer、AI workbench 走 v4 视觉合同；composer 16px 圆角、textarea 44px、oldLabels=0；own bubble 内容自适应宽度并使用浅 TokenDance Blue token surface | `VISUAL_BASE_URL=http://127.0.0.1:18180 pnpm run visual:acceptance` PASS，输出 `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-09T11-46-14-297Z` |
| 修复发送后延迟/无反馈问题 | 自发消息线上可见探针为 30ms；发送按钮有 `data-submitting` / `composer-submit-state`，并阻止 500ms 短重复发送 | `ChatInput.test.tsx`、更新后的 `lightweight-chat.test.ts`、生产验证台账 |
| 部署并验证线上 | 当前生产 overlay 已提交为 `tokendancechat:codex-20260609-agenthub-light-final`，公网首页加载 `/assets/index-CiZyZ0qs.js`，更新后的公开 E2E 合同 6/6 | `https://chat.vectorcontrol.tech` 公开 E2E，生产 smoke 记录 |
| 完善开发/测试/文档 | README、AGENTS、agenthub-validation、visual-acceptance、ROADMAP 均记录当前合同、测试矩阵、视觉门槛和生产证据 | `pnpm test` 35 files / 690 tests；`go test ./...`；`verify-governance.ps1 -SkipDiffCheck` PASS |

## 验证台账

记录当前增量的实际运行命令。

| 日期 | 命令 | 结果 |
|---|---|---|
| 2026-06-09 | Production deploy `tokendancechat:codex-20260609-logo-favicon` on `chat.vectorcontrol.tech`; hk2 Docker health + source `/api/health`; public cache-busting HTML asset hash; public favicon scan; public sidebar logo DOM probe; public `lightweight-chat.test.ts` + `page-load.test.ts` | PASS, rollback image `sha256:d4ed5f6bb791569fe60cf958f1e6aafd1dd98e9add244794a183b6eab852b480`, final image `sha256:1e905b6b39a0ceef0298027d5af5ae0412158ecebc81822beb0bbd7a67c2d1bc`, Docker health `healthy`, source `/api/health` ok, public `/` with `/assets/index-J_-nSRXy.js`, favicon href `/favicon.svg?v=20260609-tokendance-mark`, favicon white fill count 0, blue bar count 3, sidebar logo `/tokendance-mark-transparent.svg`, `hasSparkles=false`, public E2E 6/6 |
| 2026-06-09 | Production deploy `tokendancechat:codex-20260609-own-right-align` on `chat.vectorcontrol.tech`; hk2 Docker health + source `/api/health`; public cache-busting HTML asset hash; public old-name HTML probe; public `lightweight-chat.test.ts` + `page-load.test.ts`; live own-message geometry probe | PASS, rollback image `sha256:fb0c0103a460...`, final image `sha256:e18037a68fbc74ece2d4b85360dcd268659717a5eeb73458638c67e23f57f89c`, Docker health `healthy`, source `/api/health` ok, public `/` with `/assets/index-BK_YVSvU.js`, public E2E 6/6, old WebUI/token-dance labels all zero, live `bubbleToRegionRight=36`, `blockToRegionRight=20` |
| 2026-06-09 | Production deploy `tokendancechat:codex-20260609-submit-feedback` on `chat.vectorcontrol.tech`; hk2 Docker health + source `/api/health`; source/public HTML asset hash; public old-label DOM probe; message visibility + submit-state probe; updated public E2E with submitting and legacy `@webuibot` -> `@TokenBot` assertions | PASS, Docker health `healthy`, source `/api/health` ok, source/public `/` with `/assets/index-DAKnNnmA.js`, public E2E 6/6 before and after the stricter assertions, visible old labels all zero, own message visible in 30ms, submitSeen=1, auth modal count 0 |
| 2026-06-09 | Production final overlay `tokendancechat:codex-20260609-agenthub-light-final` on `chat.vectorcontrol.tech`; hk2 Docker health + source `/api/health`; public cache-busting HTML asset hash; public old-name HTML probe; public `lightweight-chat.test.ts` + `page-load.test.ts` | PASS, rollback image `sha256:d0e1699fee8873a7caab324da072f99fd4c5f70acb2db609afb7704f3ee1a8e4`, final image `sha256:0aa898ad0c243b2a339bdc36c91da1c0ae19a5b4e792f184ab3fead62f255862`, Docker health `healthy`, source `/api/health` ok, public `/` with `/assets/index-CiZyZ0qs.js`, public E2E 6/6, `WebUIChat/WebUIBot/webuichat/webuibot/token-dance-` all zero |
| 2026-06-09 | Local TokenBot/PicoClaw top-workbench removal; focused ChatLayout/ChatInput tests; typecheck; build; local lightweight/page-load E2E; visual acceptance; frontend full tests; backend tests | PASS, focused 53 tests, tsc 0, build asset `/assets/index-BtZZ4AzG.js`, local E2E 6/6 including TokenBot/PicoClaw prefixed sends, visual output `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-09T12-09-35-053Z`, `ai=false`, old labels zero, frontend 35 files / 690 tests, backend all PASS |
| 2026-06-09 | Production deploy `tokendancechat:codex-20260609-no-ai-workbench` on `chat.vectorcontrol.tech`; hk2 Docker health + source `/api/health`; public cache-busting HTML asset hash; public old-name HTML probe; public `lightweight-chat.test.ts` + `page-load.test.ts` | PASS, rollback image `sha256:094753e4c028f080e76ece1de25d2678d8e3241b0993a5b2f34d6d12ff4b8ddb`, final image `sha256:68c75f88b2eaffce237503c4ced6a2dd9b567035d6d654c89200f8888cea2e84`, Docker health `healthy`, source `/api/health` ok, public `/` with `/assets/index-BtZZ4AzG.js`, public E2E 6/6, old WebUI/token-dance labels all zero |
| 2026-06-09 | Open WebUI/AgentHub composer feedback pass; `pnpm test -- --run src/components/ChatInput.test.tsx`; `pnpm exec tsc --noEmit`; `pnpm test`; `pnpm run build`; `cd backend; go test ./...`; local Go server + lightweight/page-load E2E; local visual acceptance | PASS, ChatInput 46 tests, frontend 35 files / 690 tests, backend all PASS, local E2E 6/6, visual output `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-08T21-24-10-324Z`, build asset `/assets/index-DAKnNnmA.js`, old labels zero |
| 2026-06-09 | Production deploy `tokendancechat:codex-20260609-public-core-clean` on `chat.vectorcontrol.tech`; hk2 Docker health + source `/api/health`; source/public HTML asset hash; public old-label DOM probe; message visibility probe; `E2E_BASE_URL=https://chat.vectorcontrol.tech pnpm exec playwright test src/e2e/lightweight-chat.test.ts src/e2e/page-load.test.ts --project=chromium --reporter=line` | PASS, Docker health `healthy`, source `/api/health` ok, source/public `/` with `/assets/index-Bs8_bJyY.js`, public E2E 6/6, visible old labels all zero, own message visible in 34ms, auth modal count 0 |
| 2026-06-09 | Local public-only frontend/API/store cleanup candidate; `cd frontend; pnpm exec tsc --noEmit`; focused lightweight tests; `pnpm test`; `pnpm run build`; `cd backend; go test ./...`; local Go server + lightweight/page-load E2E; local visual acceptance; root design token/hygiene checks; `git diff --check` | PASS, frontend 35 files / 689 tests, focused 7 files / 306 tests, backend all PASS, local E2E 6/6, visual output `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-08T21-07-28-431Z`, build asset `/assets/index-Bs8_bJyY.js`, old labels zero; design hygiene warnings only from unrelated `.worktrees`; diff check only CRLF warnings |
| 2026-06-09 | Production deploy `tokendancechat:codex-20260609-stale-guest-fix` on `chat.vectorcontrol.tech`; hk2 container health + container `/api/health`; public HTML asset hash; public old-label DOM probe; normal and stale username-only message visibility probes; `E2E_BASE_URL=https://chat.vectorcontrol.tech pnpm exec playwright test src/e2e/lightweight-chat.test.ts src/e2e/page-load.test.ts --project=chromium --reporter=line` | PASS, Docker health `healthy`, container `/api/health` ok, public `/` 200 with `/assets/index-CV7cpuwu.js`, public E2E 6/6, visible old labels all zero, normal own message visible in 1017ms, stale username-only own message visible in 1174ms, auth modal count 0 |
| 2026-06-09 | Production deploy `tokendancechat:codex-20260609-v4-chat` on `chat.vectorcontrol.tech`; hk2 container health + container `/api/health`; public HTML asset hash; old-label DOM probe; message visibility probe; `E2E_BASE_URL=https://chat.vectorcontrol.tech npm exec -- playwright test src/e2e/lightweight-chat.test.ts --project=chromium --reporter=line`; `E2E_BASE_URL=https://chat.vectorcontrol.tech npm exec -- playwright test src/e2e/page-load.test.ts --project=chromium --reporter=line` | PASS, Docker health `healthy`, container `/api/health` ok, public `/` 200 with `/assets/index-60VvBmUV.js`, public lightweight E2E 2/2, public page-load E2E 4/4, visible old labels all zero, own message visible in 17ms; public `/api/health` is intentionally behind oauth2-proxy and returns 302 |
| 2026-06-08 | Production deploy `tokendancechat:codex-20260608-tokenbot-normalize` on `chat.vectorcontrol.tech`; hk2 container health + source `/api/health`; public HTML asset hash; TokenBot naming DOM probe; `E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/lightweight-chat.test.ts --project=chromium` | PASS, Docker health `healthy`, source `/api/health` ok, public `/` 200 with `/assets/index-xNcyymEk.js`, guest auto-join/send/reload persistence covered, public lightweight E2E 2/2, visible UI keeps TokenBot and has no WebUIChat/WebUIBot DOM text |
| 2026-05-30 | Production deploy `tokendancechat:codex-20260530-000303-clean-send` on `chat.vectorcontrol.tech`; Playwright guest join/send + direct WS TokenBot smoke | PASS, `/api/health` ok; unauthenticated composer disabled; guest first message visible in ~145ms and persisted once; TokenBot streamed and finalized via `gemini-web2api` |
| 2026-05-29 | Production deploy `tokendancechat:codex-20260529-174740-optimistic` on `chat.vectorcontrol.tech`; browser guest send smoke with `codex_live_1780048929917` | PASS, `/api/health` ok and own message visible within 100ms after Enter |
| 2026-05-23 | `cd backend; go test ./store -run "Test(CreateWebhookDoesNotPersistPlaintextSecret|WebhookPlaintextSecretMigrationHashesExistingRows|RotateWebhookSecretInvalidatesOldSecretAndAudits)"` | PASS |
| 2026-05-23 | `cd backend; go test ./hub -run "TestWebhook(CreateReturnsSecretToCreator|ListDoesNotExposeSecrets|ListRequiresGroupAdmin|AuditListRedactsMetadataAndRequiresGroupAdmin)"` | PASS |
| 2026-05-23 | `cd backend; go test ./handler -run "TestWebhookHandlerVerifiesHashedSecret|TestHealthCheck|Test(RateLimitMiddleware|ShouldRateLimitAPI|WSAllow)"` | PASS |
| 2026-05-23 | `cd backend; go test ./...` | PASS |
| 2026-05-23 | Historical frontend group-info/webhook UI focused tests before lightweight cleanup | PASS; archived, no longer part of current frontend matrix |
| 2026-05-23 | `cd frontend; npm test` | PASS, 43 files / 672 tests |
| 2026-05-23 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-23 | `cd frontend; npm run build` | PASS |
| 2026-05-23 | `docker build --check -f Dockerfile . && docker build --check -f Dockerfile.runtime .` | PASS |
| 2026-05-23 | `docker build -f Dockerfile.runtime ... && docker run ... -e CHAT_ADDR=:3000` → `docker inspect .State.Health.Status` | PASS, healthy |
| 2026-05-23 | `cd frontend; VISUAL_BASE_URL=http://127.0.0.1:8091 npm run visual:acceptance` | PASS。完整 UI 验收 history 见 v0.2.5 CHANGELOG |
| 2026-05-23 | `cd frontend; E2E_BASE_URL=http://127.0.0.1:8102 npx playwright test src/e2e/webhook-ingress.test.ts --project=chromium` | PASS |
| 2026-05-23 | `cd frontend; E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/ --project=chromium` | PASS, 18/18 |
| 2026-05-23 | `git diff --check` | PASS |
| 2026-05-23 | 搜索已删除交接文件的所有过期引用，排除 `node_modules`、`.git` 和 `.worktrees` | PASS，无匹配 |
| 2026-05-24 | `cd frontend; npm test` | PASS, 47 files / 716 tests |
| 2026-05-24 | `cd backend; go test ./...` | PASS |
| 2026-05-24 | `cd backend; go test ./hub -run "TestRegister"` | PASS（保留用户名检测 + HealthCheck 强制实施） |
| 2026-05-24 | `cd frontend; npx playwright test src/e2e/ --project=chromium` | PASS（E2E 修复后） |
| 2026-05-24 | `cd frontend; npm test` | PASS, 50 files / 779 tests, 51.86% lines |
| 2026-05-24 | `cd backend; go test ./...` | PASS |
| 2026-05-24 | `cd frontend; E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/ --project=chromium` | 47/52 pass（3 fixes pending） |
| 2026-05-24 | `cd frontend; npm test` | PASS, 50 files / 794 tests, 51.86% lines |
| 2026-05-24 | `cd backend; go test ./...` | PASS |
| 2026-05-24 | `cd frontend; npm test` | PASS, 50 files / 896 tests |
| 2026-05-24 | `cd backend; go test ./...` | PASS, 6/6 (handler +12 tests) |
| 2026-05-24 | `cd frontend; E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/ --project=chromium` | 105/108 pass（3 group-call timing, 17 skipped, +7 real-user-flows） |
| 2026-05-24 | `cd frontend; npm test` | PASS, 50 files / 1078 tests |
| 2026-05-24 | `cd backend; go clean -testcache && go test ./...` | PASS, 6/6 (handler media +28, main +20, hub +19, store +18, picoclaw +23, llm +22) |
| 2026-05-24 | `cd frontend; npx playwright test src/e2e/ --project=chromium` | 160/166 pass (3 group-call timing, 3 skipped) |
| 2026-05-24 | `git checkout master && git merge dev && git push` | Merged (23x), 60+ files changed |
| 2026-05-25 | `cd frontend; npm test -- --run src/App.test.tsx src/lib/api.test.ts` | PASS, 2 files / 176 tests |
| 2026-05-25 | `cd frontend; npm test -- --run src/App.test.tsx -t StrictMode` | PASS, 1 focused test |
| 2026-05-25 | `cd frontend; npm test -- --run src/App.test.tsx src/lib/api.test.ts src/components/ChatLayout.test.tsx src/components/Sidebar.test.tsx` | PASS, 4 files / 297 tests |
| 2026-05-25 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | `cd frontend; E2E_BASE_URL=http://127.0.0.1:18080 npx playwright test src/e2e/public-preview-smoke.test.ts --project=chromium --workers=1` | PASS, 1/1 |
| 2026-05-25 | `cd backend; go test ./...` | PASS, cached |
| 2026-05-25 | `cd frontend; npm test -- --run src/components/ChatInput.test.tsx` | PASS, 44 tests |
| 2026-05-25 | `cd frontend; npm test -- --run src/components/ChatInput.test.tsx src/components/Sidebar.test.tsx` | PASS, 2 files / 134 tests |
| 2026-05-25 | `cd frontend; VISUAL_BASE_URL=http://127.0.0.1:18082 npm run visual:acceptance` | PASS, output `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-24T19-07-39-625Z`, all scenarios no issues |
| 2026-05-25 | `cd backend; go test ./store -run TestSearchMessagesForUserFiltersPrivateAndDeletedResults` | PASS |
| 2026-05-25 | `cd backend; go test ./handler -run TestSearchUsesAuthenticatedUserScope` | PASS |
| 2026-05-25 | `cd backend; go test ./...` | PASS, backend/handler/store/hub/llm/picoclaw |
| 2026-05-25 | `cd frontend; npm test -- --run` | PASS, 52 files / 1078 tests |
| 2026-05-25 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | `cd frontend; npx eslint .` | PASS, 0 errors / 91 warnings |
| 2026-05-25 | `git diff --check` | PASS, CRLF warnings only |
| 2026-05-25 | submit-time leak scan (`git grep` x3 + `git log --grep`) | PASS, zero output |
| 2026-05-25 | `cd backend; go test ./handler -run "TestExportMessages(GroupRequiresMembership|GroupAllowsMember|DMUsesSessionUsername|JSON|Text|InvalidFormat|WrongMethod|VeryLargeLimit|WithinLimit|ZeroLimit)$" -count=1` | PASS |
| 2026-05-25 | `cd backend; go test ./... -count=1` | PASS |
| 2026-05-25 | `docker compose config` | PASS |
| 2026-05-25 | `cd backend; go test ./handler -run "TestWebhookHandler(VerifiesHashedSecret|RejectsQuerySecret|RejectsOversizedBody|RejectsOversizedContent|UsesServerDerivedSender)$" -count=1` | PASS |
| 2026-05-25 | `cd backend; go test ./... -count=1` | PASS, backend/handler/store/hub/llm/picoclaw |
| 2026-05-25 | Historical frontend group-info/webhook UI focused tests before lightweight cleanup | PASS, 3 files / 151 tests; archived, no longer part of current frontend matrix |
| 2026-05-25 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-25 | `cd frontend; npx eslint .` | PASS, 0 errors / 90 warnings |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | local Go backend serving latest `frontend/dist` + `E2E_BASE_URL=http://127.0.0.1:18135 npx playwright test src/e2e/webhook-ingress.test.ts --project=chromium --workers=1 --reporter=line` | PASS, webhook message visible once as `webhook` |
| 2026-05-25 | `docker compose config` | PASS |
| 2026-05-25 | `rg -n "secret=|请立即复制，密钥|Copy now; the secret|Webhook secrets are passed|sender spoof|ci-webhook"` | PASS, only intentional test assertions/body-spoof fixture remain |
| 2026-05-25 | `git diff --check` | PASS, CRLF warnings only |
| 2026-05-25 | `$env:GOFLAGS='-badflag'; .\scripts\verify.ps1 -SkipVisual -SkipDocker` | EXPECTED FAIL, script exited 1 at `go test ./...`, proving native exit-code failures are no longer hidden by PowerShell pipelines |
| 2026-05-25 | `cd frontend; npm test -- --run src/components/Sidebar.test.tsx` | PASS, 1 file / 91 tests |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | `cd backend; go build -o backend.exe .` | PASS |
| 2026-05-25 | local Go backend serving latest `frontend/dist` + `VISUAL_BASE_URL=http://127.0.0.1:18137 npm run visual:acceptance` | PASS, added `mobile-light-sidebar-open`; `sidebarSmallControls=0` |
| 2026-05-25 | `.\scripts\verify.ps1 -SkipVisual -SkipDocker` | PASS, backend tests, frontend tests, tsc, frontend build, backend build, `git diff --check` |
| 2026-05-25 | `Get-NetTCPConnection -LocalPort 18136,18137 -State Listen` | PASS, no lingering visual-test backend listeners |
| 2026-05-25 | `rg -n "hk2|Tailscale|100\.|chat\.vectorcontrol\.tech|ssh |/app/data|/app/frontend|C:\\Users\\Ding\\server|生产 URL|容器日志|scp |docker exec|docker logs" docs\handoff-report-2026-05-25.md` | PASS, no matches after handoff report sanitization |
| 2026-05-25 | `git diff --check` | PASS, CRLF warnings only |
| 2026-05-25 | `cd backend; go test ./handler -run "Test(OIDCHTTPClientHasBoundedTimeout|ReadOIDCResponseBodyRejectsOversizedResponse|OIDCConfigHandler|OIDCLoginRedirect|OIDCCallbackSuccess|OIDCRefresh|OIDCExchange|VerifyOIDCJoinToken)$" -count=1` | PASS, OIDC provider timeout/body-cap regression |
| 2026-05-25 | Compose env rendering check: missing `CHAT_SESSION_SECRET` then with `CHAT_SESSION_SECRET=compose-config-test-secret docker compose config` | PASS, missing secret exit 1; configured render exit 0 with S3/WebDAV/session envs present |
| 2026-05-25 | `.\scripts\verify.ps1 -SkipDocker` | PASS, backend tests, frontend tests, tsc, frontend build, backend build, `git diff --check`, self-started visual backend on 8198; `mobile-light-sidebar-open sidebarSmallControls=0` |
| 2026-05-25 | `rg -n "http\.Get|http\.PostForm|io\.ReadAll\(resp\.Body\)" backend\handler\oidc.go` | PASS, no unbounded OIDC provider calls remain |
| 2026-05-25 | `cd backend; go test ./handler -run "Test(OIDCStateStoreRejectsNewEntriesAtCapacity|OIDCTokenStoreRejectsNewEntriesAtCapacity|RequestIPUsesForwardedForFromTrustedProxy|RequestIPIgnoresSpoofedForwardedForPrefix|RequestIPIgnoresForwardedForFromUntrustedRemote|OIDCAllowBudgetsFourCompleteRedirectFlows|RateLimiterPrunesExpiredIPEntries|OIDCLoginRateLimitedByIP|OIDCRefreshWrongMethodDoesNotConsumeOIDCRateLimit|OIDC(LoginRedirect|CallbackSuccess|Refresh|Exchange|VerifyOIDCJoinToken)|RateLimit|AuthAllow|WSAllow)$" -count=1` | PASS, OIDC runtime bounds + trusted proxy IP + rate-limit cleanup |
| 2026-05-25 | `cd backend; go test ./handler -run "Test(OIDC|RateLimit|AuthAllow|WSAllow)" -count=5 -shuffle=on` | PASS, OIDC/rate-limit tests stable under shuffle/repeat |
| 2026-05-25 | `cd backend; go test ./handler -count=1` | PASS, handler package full regression after spoofed XFF parser update |
| 2026-05-25 | `cd backend; go test ./... -count=1` | PASS, backend/handler/store/hub/llm/picoclaw |
| 2026-05-25 | `CHAT_SESSION_SECRET=compose-config-test-secret CHAT_TRUSTED_PROXY_CIDRS=127.0.0.1/32 docker compose config` | PASS, compose renders session secret and trusted proxy CIDRs |
| 2026-05-25 | OIDC stale wording scan over root docs and `docs/` | PASS, no stale OIDC-open wording; new spoofed-prefix regression appears in handoff test lists |
| 2026-05-25 | `git diff --check` | PASS, CRLF warnings only |
| 2026-05-25 | `gofmt -w backend\handler\oidc.go backend\handler\oidc_test.go backend\handler\ratelimit.go backend\handler\ratelimit_test.go` | PASS |
| 2026-05-25 | `cd backend; go test ./handler -run "Test(OIDCStateStoreCloseStopsCleanupLoop|OIDCTokenStoreCloseStopsCleanupLoop|SetupOIDCFailureDoesNotInstallTransientStores|SetupOIDCReconfigureClosesPreviousTransientStores|OIDCStateStoreRejectsNewEntriesAtCapacity|OIDCTokenStoreRejectsNewEntriesAtCapacity|RequestIPUsesForwardedForFromTrustedProxy|RequestIPIgnoresSpoofedForwardedForPrefix|RequestIPIgnoresForwardedForFromUntrustedRemote|OIDCAllowBudgetsFourCompleteRedirectFlows|RateLimiterPrunesExpiredIPEntries|OIDCLoginRateLimitedByIP|OIDCRefreshWrongMethodDoesNotConsumeOIDCRateLimit|OIDC(LoginRedirect|CallbackSuccess|CallbackInvalidState|Refresh|Exchange|VerifyOIDCJoinToken|ConfigHandler)|RateLimit|AuthAllow|WSAllow)$" -count=1` | PASS, OIDC store lifecycle + runtime bounds + trusted proxy IP + rate-limit cleanup |
| 2026-05-25 | `cd backend; go test ./handler -run "Test(OIDC|RateLimit|AuthAllow|WSAllow)" -count=5 -shuffle=on` | PASS, OIDC/rate-limit tests stable under shuffle/repeat after store lifecycle changes |
| 2026-05-25 | `cd backend; go test ./handler -count=1` | PASS, handler package full regression after store lifecycle changes |
| 2026-05-25 | `cd backend; go test ./... -count=1` | PASS, backend/handler/store/hub/llm/picoclaw |
| 2026-05-25 | `CHAT_SESSION_SECRET=compose-config-test-secret CHAT_TRUSTED_PROXY_CIDRS=127.0.0.1/32 docker compose config` | PASS, compose renders session secret and trusted proxy CIDRs |
| 2026-05-25 | OIDC provider/static stale wording scans | PASS, no unbounded OIDC provider calls and no stale OIDC-open wording |
| 2026-05-25 | `git diff --check` | PASS, CRLF warnings only |
| 2026-05-25 | `cd frontend; npm test -- src/components/SettingsModal.test.tsx` | PASS, 1 file / 23 tests; historical modal now archived outside the current lightweight UI contract |
| 2026-05-25 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | `cd backend; go build -o backend.exe .` | PASS |
| 2026-05-25 | local Go backend serving latest `frontend/dist` + `VISUAL_BASE_URL=http://127.0.0.1:8198 npm run visual:acceptance` | PASS, output `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-24T23-17-29-081Z`; settings scenarios `720x560` desktop / `366x720` mobile, `settingsSmallControls=0`, tab labels not clipped |
| 2026-05-25 | `Get-NetTCPConnection -LocalPort 8198 -State Listen` | PASS, no lingering visual-test backend listener |
| 2026-05-25 | `node --check frontend\scripts\visual-acceptance.mjs` | PASS |
| 2026-05-25 | `cd frontend; npm test -- src/components/AuthModal.test.tsx src/components/OidcLoginButton.test.tsx` | PASS, 2 files / 10 tests |
| 2026-05-25 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | `cd backend; go build -o backend.exe .` | PASS |
| 2026-05-25 | local Go backend serving latest `frontend/dist` + `VISUAL_BASE_URL=http://127.0.0.1:8198 npm run visual:acceptance` | PASS, output `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-24T23-50-02-927Z`; auth scenarios `380x346` desktop login / `358x502` mobile register error, `authSmallControls=0`, error alert visible |
| 2026-05-25 | `Get-NetTCPConnection -LocalPort 8198 -State Listen` | PASS, no lingering visual-test backend listener |
| 2026-05-25 | subagent read-only design review for next gap | Completed, recommended ChatInput composer convergence + dedicated visual gates |
| 2026-05-25 | `node --check frontend\scripts\visual-acceptance.mjs` | PASS |
| 2026-05-25 | `cd frontend; npm test -- src/components/ChatInput.test.tsx src/components/ScheduleButton.test.tsx` | PASS, 2 files / 50 tests |
| 2026-05-25 | `cd frontend; npx tsc --noEmit` | PASS |
| 2026-05-25 | `cd frontend; npm run build` | PASS, Vite chunk-size warning only |
| 2026-05-25 | `cd backend; go build -o backend.exe .` | PASS |
| 2026-05-25 | local Go backend serving latest `frontend/dist` + `VISUAL_BASE_URL=http://127.0.0.1:8198 npm run visual:acceptance` | PASS, output `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-25T00-15-30-088Z`; all 12 scenarios `composerTools=7/7`, `composerSmallControls=0`, no issues |
| 2026-05-25 | `Get-NetTCPConnection -LocalPort 8198 -State Listen` | PASS, no lingering visual-test backend listener |
| 2026-05-25 | `git diff --check` | PASS, CRLF warnings only |

## Review Gates

提交或交接有意义的变更前：

- [x] `git diff --check`
- [x] `cd backend && go test ./...`
- [x] `cd frontend && npx tsc --noEmit`
- [x] 涉及文件的 Focused 前后端测试
- [x] 文档更新（protocol、security、用户可见行为和 AgentHub validation 笔记）
- [x] `tmp_*` 或无关本地文件不暂存

## 已完成基线

- 历史核心聊天快照：公共房间、DM、群组、好友、reactions、在线状态、typing。当前前端主合同只保留公共房间、TokenBot、PicoClaw。
- 历史数据完整性快照：SQLite 持久化、离线 DM、历史 reactions、消息上限、作用域 typing。当前 UI 只消费公开房间与基础消息状态。
- 当前 IM 打磨：未读角标、草稿、滚动记忆、搜索跳转、流式节流、中文 mentions、CSP/XSS 加固；转发、群组、通话、GIF/sticker、webhook 管理不再进入主界面。
- 高级功能：已读回执、最后在线、@mention 通知、通知声音、屏蔽、文件分享。
- 进阶历史 IM：置顶/书签、群组邀请流程、threaded replies、范围搜索、无限历史、typing 预览、自定义 emoji。当前只保留能服务轻量公共聊天室的子集。
- 平台：PWA shell、前端单元测试、后端 WebSocket/store 测试、无障碍基线、Bot/Agent mention 路由。
