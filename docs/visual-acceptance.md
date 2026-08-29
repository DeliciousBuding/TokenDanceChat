# 视觉验收笔记

TokenDanceChat 是 AgentHub 的技术验证项目与轻量公共聊天室 Demo。视觉工作应证明 AgentHub v4 聊天渲染、消息区、输入框和 AI 工作区能够像一个真正的聊天产品般可信，而不仅仅是协议能跑通。

## 产品方向

- 主基调：明亮、克制的企业聊天 UI，对齐 AgentHub Desktop/Web v4 的 transcript、composer、低阴影和受控圆角。
- 交互手感：Telegram 级的输入框人机工程、可读的消息流、充足的移动端点击目标；当前主合同只保留公共聊天室 + TokenBot 单 agent。
- 材质方向：light-first 的克制液态玻璃只作为真实 UI 面板和控件材料使用，不做装饰性玻璃拟态。
- 避免营销式 Hero 布局、装饰性卡片以及空洞的装饰空间。
- 控件优先使用 lucide 图标；文字标签仅保留给需要明确语义的命令。

## 多模态截图验收

每一次有意义的前端打磨增量，必须在声明完成前采集真实浏览器截图。生成的 mockup 可帮助设定方向，但不可作为验收证据。

必要工作流：

1. 通过 `npm run visual:acceptance` 或等效的 Playwright 流程采集真实浏览器截图。
2. 直接审阅截图中的布局、排版、按钮尺寸、图标平衡、密度、留白及视觉层级。
3. 有用时与明确的审美参考对比。`gpt-image-2` mockup 可作为参考目标，但仅当真实浏览器截图与指标通过时实现才算验收通过。
4. 对于有意义的前端打磨，将截图输出目录记录在 `ROADMAP.md` 或相关 PR/commit 说明中。

| 视口 | 主题 | 必要检查项 |
|---|---|---|
| 1440x900 | light | 头部密度、侧边栏宽度、AgentHub v4 transcript blocks、composer 16px 圆角、可见消息数、无旧 IM 入口。 |
| 1440x900 | light + TokenBot | AI 工作区、模型/assistant 选择、composer `@TokenBot` 上下文和消息区密度。 |
| 1440x900 | light + 设置抽屉 | 右侧通知设置抽屉宽度、全高对齐、内容可见、控件尺寸。 |
| 1440x900 | dark | 对比度与间距保持可用，避免成为黑色整块。 |
| 768x1024 | light | 平板在 `lg` 之前应保持聊天全宽；textarea 宽度应大于 360px。 |
| 390x844 | light | 输入框保持可用；标题可读，textarea 宽度应大于 180px 且控件可见，无旧入口。 |
| 390x844 | light + TokenBot | AI 工作区在移动端可见，composer 上下文不挤压消息区。 |
| 390x844 | dark | 点击目标在可行范围内保持至少 44px；无文字重叠。 |

截图时采集以下指标：

- 按钮总数及低于 44x44 的数量；
- 最小 textarea 宽度；
- 输入框高度占视口高度百分比；
- 移动端标题宽度及 `公共聊天` 是否被截断；
- 移动端可见消息字号；
- 首个有意义聊天内容的 y 坐标；
- 水平滚动条是否存在；
- 输入框上方可见消息数；
- Composer 卡片宽高、16px 圆角、移动端高度占比、textarea 宽度、发送控件可见性；
- AgentHub transcript block 数、气泡方向覆盖、气泡最大宽度比例；
- TokenBot 工作区可见性、composer assistant context 和 AI workflow chip 数；
- 桌面/移动侧边栏宽度、旧 IM 入口/旧命名可见文本数量；
- 设置抽屉桌面/移动尺寸、右对齐、内容区域可见性和抽屉内低于 44x44 的控件数；
- 认证弹窗桌面/移动尺寸、视口内 fit、tab 数量、tab label 裁剪情况、内容区域可见性、错误态可见性和弹窗内低于 44x44 的控件数（仅当认证入口发生可见改动时采集）；
- 控制台错误。

`npm run visual:acceptance` 当前硬性门槛包括：

- 无水平溢出且无控制台/页面错误；
- 移动端 textarea 至少 180px 宽，平板 textarea 至少 360px 宽；
- 折叠态移动端公共房间输入框至多占视口高度的 18%，AI 工作区上下文场景至多占 25%；
- 移动端标题至少 120px 宽且公开聊天标题不得被截断；
- 移动端可见消息文字必须保持在 15px 或以下；
- 折叠态移动端与平板种子聊天视图中至少 4 条可见消息；
- 聊天场景必须展示 AgentHub transcript blocks，至少 4 个可见 block，消息气泡有当前用户和其他用户方向覆盖，气泡宽度比例不超过 0.88；
- Composer body 必须保持 16px 圆角，桌面宽度至少 760px，移动端宽度至少 320px；
- DOM 可见文本中旧入口/旧命名扫描为 0：`WebUIChat`、`WebUIBot`、好友、群组、私信、语音/视频通话、定时发送、Webhook；
- TokenBot 场景必须展示 AI workbench、assistant segmented switch 和 composer assistant context；不得出现 Open WebUI 的 `Knowledge` / `Tools` / `Prompts` 假工具芯片；
- 设置场景必须展示 320-420px 宽、全高右对齐通知抽屉，可见内容区域，且抽屉内无低于 44x44 的可视控件；
- 认证弹窗场景仅在认证入口发生可见改动时启用；届时必须展示桌面 340-420px 宽、移动端视口内 fit、3 个 tab、未裁剪 tab label、可见内容区域；错误态场景必须展示 alert，且弹窗内无低于 44x44 的可视控件。

针对本地生产构建运行可复用的 Playwright 验收脚本：

```powershell
cd D:\Code\TokenDance\tokendance-chat\frontend
npm run build

# 在另一 shell 中通过 Go 后端托管构建产物。
cd D:\Code\TokenDance\tokendance-chat\backend
$env:CHAT_DB_PATH = Join-Path $env:TEMP 'tdchat-visual-chat.db'
$env:CHAT_FRONTEND_DIR = 'D:\Code\TokenDance\tokendance-chat\frontend\dist'
$env:CHAT_ADDR = ':8091'
go run .

# 随后采集截图与指标。
cd D:\Code\TokenDance\tokendance-chat\frontend
$env:VISUAL_BASE_URL = 'http://127.0.0.1:8091'
npm run visual:acceptance
```

脚本将截图与 `metrics.json` 写入临时目录，如 `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-*`。除非设置 `VISUAL_ALLOW_NONLOCAL=1`，否则拒绝非本地目标——因其会写入 Demo 种子消息。不要仅凭生成参考图声称 UI 打磨通过；生成图像仅用作真实实现的审美参考。

## 2026-06-09 验收

最新通过的截图验收：

- 输出目录：`C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-09T11-46-14-297Z`
- 基线：由 Go 后端在 `http://127.0.0.1:18180` 托管最新生产构建，使用临时干净 SQLite 数据库。
- 场景：十张截图，含 desktop/mobile light/dark、TokenBot desktop/mobile、mobile sidebar、desktop/mobile settings drawer。
- AgentHub Desktop chatview 对齐：消息区沿用 transcript/list/block 中心列；自发消息使用浅 TokenDance Blue token surface、细边框、深色正文和低阴影，不再使用深蓝实心高饱和气泡；own message stack 改为内容自适应宽度，短消息不再被固定 72% 宽容器撑出前置空白。
- Composer 收敛为 AgentHub `UnifiedComposer` 式单行 62px capsule，主视觉只保留 `+`、textarea、图片/文件附件图标和发送按钮；旧 Markdown 格式化、emoji、slash command、preview 和隐藏 toolbar 逻辑已从 `ChatInput` 删除。
- 桌面 light/dark 1440x900：composer body 820x62px，radius 16px，textarea 658x44px，可见 7 个 transcript blocks，`oldLabels=0`，无水平溢出。
- 桌面 TokenBot 1440x900：AI workbench 可见，assistant switch 可见，composer context 可见，composer body 820x62px，radius 16px，7 个 transcript blocks，`oldLabels=0`。
- 平板 768x1024：composer body 724x62px，textarea 562x44px，可见 9 个 transcript blocks，`oldLabels=0`。
- 移动 light/dark 390x844：composer body 346x62px，radius 16px，textarea 184x44px，公共房间和 TokenBot 场景 `oldLabels=0`。
- 设置抽屉：desktop 384x900px、mobile 384x844px，右对齐、内容可见。
- 截图审阅确认：桌面/移动 TokenBot 场景中，自发消息内容从气泡顶部自然排版，浅色 token 气泡与 AgentHub v4 低阴影/受控圆角一致；composer 不再出现两行工具栏挤压输入框，顶部只保留工作区 header 必要高度。
- 最终清理补充：`MessageBubble` 删除旧 voice/group seen-by 死分支后重新验收，desktop/mobile composer 仍为 820/346x62px，radius 16px，TokenBot blocks 7/6，`oldLabels=0`；生产 overlay 后公网首页加载 `/assets/index-CiZyZ0qs.js`，公开域名轻量聊天 + page-load E2E 6/6，HTML scan `WebUIChat=0`、`WebUIBot=0`、`webuichat=0`、`webuibot=0`、`token-dance-=0`。

继续收口验收：

- 输出目录：`C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-09T12-09-35-053Z`
- 变更：移除 bot 模式的独立顶部 AI workbench；助手选择保留在侧栏，当前助手只在 header 标题和 composer context 中低噪呈现，消息区不再被额外工作台向下顶开。
- 桌面 TokenBot 1440x900：聊天区从 header 后直接开始，`ai=false`，composer body 820x62px，radius 16px，textarea 658x44px，7 个 transcript blocks，`oldLabels=0`。
- 移动 TokenBot 390x844：移除 107px 顶部 AI workbench 后，聊天区从 y=61 开始，composer body 346x62px，radius 16px，textarea 184x44px，6 个 transcript blocks，`oldLabels=0`。
- E2E 补充：`lightweight-chat.test.ts` 现在覆盖 bot 模式下输入普通文本后自动带 `@TokenBot` 上屏，避免只验证 context 可见但实际发送路径失效。

上一轮通过的截图验收：

- 输出目录：`C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-06-09T09-19-25-222Z`
- 基线：由 Go 后端在 `http://127.0.0.1:18180` 托管最新生产构建，使用临时干净 SQLite 数据库。
- 场景：十张截图，含 desktop/mobile light/dark、TokenBot desktop/mobile、mobile sidebar、desktop/mobile settings drawer。
- 桌面 light/dark 1440x900：composer body 820x104px，radius 16px，textarea 748x44px，可见 transcript blocks，`oldLabels=0`，无水平溢出。
- 桌面 TokenBot 1440x900：AI workbench 可见，assistant switch 可见，composer context 可见，composer body 820x104px，radius 16px，`oldLabels=0`。
- 平板 768x1024：composer body 724x104px，textarea 652x44px，可见 transcript blocks，`oldLabels=0`。
- 移动 light/dark 390x844：composer body 346x104px，radius 16px，textarea 274x44px，公共房间和 TokenBot 场景 `oldLabels=0`。
- 设置抽屉：desktop 384x900px、mobile 384x844px，右对齐、内容可见。
- 截图审阅确认：当前主界面只出现公共聊天室、TokenBot；无复杂联系人、群组、语音/视频、GIF、定时发送、转发或 webhook 管理入口。
- 输入反馈补充：发送按钮具备 `data-submitting` / `composer-submit-state` 状态，由 `ChatInput.test.tsx` 覆盖 500ms 防双发窗口，`lightweight-chat.test.ts` 覆盖真实浏览器提交态；视觉验收继续门控 composer 尺寸、圆角、旧入口扫描和移动端可用性。
- 命名补充：旧 `@webuibot` 输入仅作为不可见兼容别名，运行态必须渲染为 `@TokenBot`，并保持 WebUI 旧名 DOM 可见计数为 0。
- AI 工作区补充：保留 compact assistant context strip 和 Ask 按钮；`Knowledge` / `Tools` / `Prompts` 不属于当前轻量合同，视觉脚本会把这些可见标签视为失败。

生产 smoke：

- 目标：`https://chat.tokendancelab.com`
- 镜像：当前运行容器文件系统已 overlay 并 commit 为 `tokendancechat:codex-20260609-own-right-align`；`docker inspect .Config.Image` 仍显示基础镜像 `tokendancechat:codex-20260609-bot-fallback`。
- 资源：公网首页加载 `/assets/index-BK_YVSvU.js`。
- E2E：公开域名 `lightweight-chat.test.ts` 2/2 通过，`page-load.test.ts` 4/4 通过，合计 6/6；更新后的 `lightweight-chat.test.ts` 已覆盖 `composer-submit-state`、bot prefixed sends 和旧 `@webuibot` -> `@TokenBot` 归一。
- 自发消息几何：公网 1440px Playwright 探针 `bubbleToRegionRight=36`、`blockToRegionRight=20`，确认自己消息不再落在中间列；本地 390px 移动端探针 `scrollWidth=390`、`bubbleToRegionRight=30`。
- DOM 探针：`WebUIChat`、`WebUIBot`、`webuichat`、`webuibot`、`Friends`、`Groups`、`DM`、`Direct Message`、`Voice Call`、`Video Call`、`Schedule Message`、`Webhook`、`好友`、`群组`、`私信`、`语音通话`、`视频通话`、`定时发送` 可见计数均为 0。
- 发送可见性：公网 Playwright 探针自发消息 `visibleMs=30`，发送按钮 submitting 状态 `submitSeen=1`，未复现约 5s 延迟。
- 健康检查边界：容器内 `/api/health` 返回 ok；公网 `/api/health` 受当前 nginx OAuth2 保护层约束，会 302 到 TokenDanceID，因此生产 health 证据以容器/source 检查为准。

## 2026-05-23 验收

历史通过的截图验收：

- 输出目录：`C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-22T23-53-00-860Z`
- 基线：由 Go 后端托管的生产构建，使用干净的临时 SQLite 数据库，因此截图仅包含当前种子 Demo 对话，无此前运行的重复历史。
- 场景：七张历史截图，含当时的 `desktop-light-group-info`；该场景现仅作为 rich IM 兼容证据，不属于当前轻量主界面合同。
- 桌面 light/dark 1440x900：textarea 816x48px，输入框 130px，4 条可见种子消息，`smallControls=0`，侧边栏宽度 312px，侧边栏模型预览 4 张卡片，侧边栏在线用户区域顶部 561px，无水平溢出，无控制台错误。
- 桌面 light 群组信息 1440x900：右侧面板 384px 宽且全高，群主可见 Webhook 区域，1 行成员，`groupSmallControls=0`，桌面标题 169x24 单行，可见群组空状态，无水平溢出，无控制台错误。
- 平板 light 768x1024：textarea 456x48px，移动端标题宽度 580px，输入框 130px，4 条可见种子消息，`smallControls=0`，无水平溢出，无控制台错误。
- 移动端 light/dark 390x844：标题宽度 202px 且 `公共聊天` 未被截断，消息字号 13.5px，折叠态输入框 textarea 208x66px，输入框 87px，4 条可见种子消息，`smallControls=0`，无水平溢出，无控制台错误。
- 移动端 light 含格式工具栏：textarea 208x66px，输入框 144px，4 条可见种子消息，`smallControls=0`，无水平溢出，无控制台错误。
- 截图审阅确认当时桌面核心聊天、群组管理面板及移动端输入框保持可读且稳定；当前主界面验收以公共房间、TokenBot 单 agent 为准。

截图验收捕获了实际实现问题：

- 768px 平板被强制使用桌面布局，textarea 被压缩至 144px；通过验收的布局在 `lg` 之前保持平板/移动端顶栏。
- 移动端标题将 `公共聊天` 显示为 `公...`；移动端次要操作现已收入更多菜单。
- 桌面侧边栏此前显示六张模型卡片加在线用户前的高空状态行；通过验收的侧边栏现已保持四张模型预览卡片，并将在线用户提升至距顶部 561px。
- 一次跟进验收发现像素舍入导致 43px 平板头像按钮；可点击头像现使用 46px 最小目标。
- 群组信息截图最初隐藏了群主专属 Webhook 控件，因前端读取旧版 `members` 而非后端 `group_info.group_members` 数据；通过验收的流程验证了真实 WebSocket 往返后的类型化角色数据。
- 打开群组信息面板挤压了桌面标题图标按钮，导致定宽控件缩至约 30px；标题按钮现已通过 `flex-shrink-0` 保持 44px 下限。
- 手动截图审阅随后发现桌面群组标题换行及首次群组空状态过于稀疏；最终脚本门控桌面标题单行稳定性及可见群组空状态内容。

## 2026-05-25 验收

历史通过的截图验收：

- 输出目录：`C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-25T00-15-30-088Z`
- 基线：由 Go 后端在 `http://127.0.0.1:8198` 托管最新生产构建，使用干净临时 SQLite 数据库，验收后停止临时后端。
- 场景：十二张历史截图，含当时的 `desktop-light-group-info`、`desktop-light-settings`、`desktop-light-auth-login`、`mobile-light-sidebar-open`、`mobile-light-settings`、`mobile-light-auth-register-error`、`mobile-light-format`；group-info/webhook 场景现仅作历史兼容证据。
- 桌面 light 1440x900：textarea 1102x24px，输入框 106px，9 条可见消息，`composerTools=7/7`，`composerSmallControls=0`，侧边栏模型预览 4 张，在线用户区域顶部 416px，无水平溢出，无控制台错误。
- 桌面 light 群组信息 1440x900：右侧面板 384x900px 且右对齐，Webhook 行、rotate 按钮、audit log 均为 1，一次性 secret 可见，群组空状态可见，`groupSmallControls=0`，`composerSmallControls=0`，无控制台错误。
- 桌面 light 设置弹窗 1440x900：`settingsModal=720x560`，3 个 tab 与内容区域可见，`settingsSmallControls=0`，`composerTools=7/7`，tab label 未裁剪，无控制台错误。
- 桌面 light 认证登录弹窗 1440x900：`authModal=380x346`，3 个 tab 与内容区域可见，`authSmallControls=0`，登录态无 alert，tab label 未裁剪，无控制台错误。
- 桌面 dark 1440x900：textarea 1102x24px，输入框 106px，8 条可见消息，`composerTools=7/7`，`composerSmallControls=0`，侧边栏模型预览 4 张，在线用户区域顶部 416px，无水平溢出，无控制台错误。
- 平板 light 768x1024：textarea 742x24px，输入框 106px，移动端标题宽度 580px，8 条可见消息，`composerTools=7/7`，`composerSmallControls=0`，无水平溢出，无控制台错误。
- 移动端 light/dark/format 390x844：textarea 364x24px，输入框 106px，标题宽度 202px 且 `公共聊天` 未截断，6 条可见消息，`composerTools=7/7`，`composerSmallControls=0`，无水平溢出，无控制台错误。
- 移动端侧栏 390x844：侧栏模型预览 2 张，`sidebarSmallControls=0`，无水平溢出，无控制台错误。
- 移动端设置弹窗 390x844：`settingsModal=366x720`，三枚顶部 tab 完整可见且 label 未裁剪，`settingsSmallControls=0`，无水平溢出，无控制台错误。
- 移动端认证注册错误态 390x844：`authModal=358x502`，三枚顶部 tab 完整可见且 label 未裁剪，错误 alert 可见，`authSmallControls=0`，无水平溢出，无控制台错误。
- 截图审阅确认：当时公共聊天、群组管理、移动侧栏、设置弹窗、认证弹窗和 composer 常驻工具条在桌面/移动端均保持可读；当前主界面已删除群组管理和旧 GIF/定时/录音工具，保留轻量 SettingsPanel 和核心 composer。

截图验收捕获并修复了实际实现问题：

- 未登录公共预览聚焦输入框时会打开全屏透明格式化遮罩，阻断 header 的「加入聊天」；现在 composer popover 只在已登录且输入框可用时打开。
- 前端 `index.html` 引入 Google Fonts，但 Go 后端 runtime CSP 不允许该来源；现在前端和后端 CSP 对齐为系统字体，不再产生字体相关控制台错误。
- 桌面侧边栏在线用户区域低于视觉门槛；将在线用户区移到 AI 助手区之前后，最新验收中桌面顶部稳定在 392px，group-info 场景为 400px。
- 桌面设置弹窗从带 `transform` 的 Sidebar 内渲染时，`position: fixed` 被侧栏 containing block 捕获，实际宽度只有 264px；现在通过 React portal 挂到 `document.body`，恢复全视口居中。
- 移动端设置 tab 最初需要横向滚动才完整露出第三项；现在改为三等分顶部 tab，并由视觉脚本硬门槛检查 tab label 不裁剪。
- 认证视觉脚本最初用宽泛按钮名点击 `注册`，与实际 tab 文案 `注册账号` 不匹配；后续又因页面侧栏存在同名 `邀请码管理` 按钮而误命中。现在 Auth 场景所有 tab 与表单操作都限定在 `[data-visual='auth-modal']` 内。
- ChatInput 底部工具过去分散在 `+` 附件弹层和默认自动弹出的 Markdown 浮层里；现在常用工具收敛为 composer 内一排常驻图标，桌面/移动端都保持 44px 命中区。focused test 还捕获了默认聚焦后旧 Markdown 浮层与新工具条重复的问题，已改为选中文本或点击 Markdown 按钮时才打开浮层。

## 当前参考 Prompt

在图像生成工具与 API Key 可用时，与 `gpt-image-2` 配合使用。将输出视为视觉方向参考，而非直接照搬的源素材，且绝不替代真实浏览器截图验收。

```text
Use case: ui-mockup
Asset type: product UI reference for a web chat app
Primary request: create a polished desktop and mobile chat interface reference for TokenDanceChat, an AgentHub validation demo where AI agents are contacts in an enterprise IM.
Style/medium: high-fidelity SaaS product UI mockup, restrained Feishu/Lark enterprise workspace with Telegram-like message flow.
Composition/framing: show one desktop 1440x900 chat workspace and one mobile 390x844 chat screen side by side; desktop has sidebar, conversation header, message transcript, and composer; mobile focuses on readable transcript and compact composer.
Color palette: light mode first, cool neutral canvas, white translucent UI materials, TokenDance Blue and moss accents, subtle borders, dark mode variant hinted but not dominant.
Typography: system UI, readable 14-16px body text, compact metadata, no tiny unreadable labels.
Controls: lucide-style icon buttons, 44px mobile tap targets, compact but not cramped composer, clear send button, restrained toolbar.
Constraints: no marketing hero, no decorative blob backgrounds, restrained liquid glass only as functional UI material, no decorative glassmorphism, no fake brand logos, no unreadable microtext, no overlapping UI, no emoji as primary icons.
```

## 审查说明

若截图仍感觉薄弱，按以下顺序调整：

1. 移动端输入框行与格式工具栏折叠。
2. 标题动作溢出与次要操作。
3. 侧边栏首屏信息密度。
4. 消息列表内边距与空状态缩放。
5. banner、元数据与徽章中残留的 `text-[10px]` 局部。
