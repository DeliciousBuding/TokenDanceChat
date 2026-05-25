# 安全审计报告 — TokenDanceChat

**日期**: 2026-05-25
**范围**: 全部代码（Go 后端、React/TypeScript 前端、Docker 部署）
**审计方**: 自动化安全审查 + 持续迭代跟踪

---

## 1. 发现摘要

| 严重程度 | 数量 | 说明 |
|----------|-------|-------------|
| **HIGH** | 见 active register | `docs/security-risk-register.md` 是当前权威队列；session/search/group export、public preview 历史分页与 webhook ingress 已在仓库内缓解，剩余项按部署验证和产品策略继续收敛。 |
| **MEDIUM** | 见 active register | OIDC 边界、call room bearer、service worker API cache deploy verification、admin stats role policy、webhook sender/rate limit 等在 active register 持续跟踪。 |
| **LOW** | 见 active register | PWA stale asset、文档脱敏和 demo 阶段可接受项按 release checklist 复核。 |

**2026-05-23 安全更新**:

- **密码哈希升级为 bcrypt**: `store.go` 中的 `hashPassword`/`checkPassword` 从 SHA-256 迁移至 bcrypt（cost 12）。`VerifyUser` 在旧 SHA-256 哈希用户成功登录时自动升级为 bcrypt，实现无缝迁移。
- **Auth rate limiter**: `/api/login` 和 `/api/register` 新增独立 rate limiter（5 次/分钟/IP），防暴力破解。`ratelimit.go` 新增 `authEntries` 桶。
- **CORS 从通配符改为 origin-aware**: `handler.go` 的 CORS 中间件不再返回 `Access-Control-Allow-Origin: *`。同源请求允许（无 Origin 头），跨域只回显 `CHAT_ALLOWED_ORIGINS` 中配置的完整 origin。
- **WebSocket Origin 验证加强**: `ws.go` 的 `CheckOrigin` 现在验证同源请求，并通过 `CHAT_ALLOWED_ORIGINS` 配置额外允许的完整 origin。
- **CSP 头双重覆盖**: 前端 `index.html` 的 `<meta http-equiv="Content-Security-Policy">` 标签 + 后端 `SecurityHeadersMiddleware` 双保险。经浏览器 DevTools 和生产构建验证，CSP 头正确传递。
- **PDF iframe sandbox 加固**: `FileMessage.tsx` 中 PDF 预览 iframe 的 sandbox 属性从 `"allow-scripts allow-same-origin"` 收紧为 `"allow-scripts"`，防止 sandbox 逃逸。
- **PicoClaw 超时保护**: LLM 调用路径新增 60s `context.WithTimeout`，防止 goroutine 泄漏。
- **Session kick-off 机制**: 同名用户重新登录时，旧连接发送 "kicked" 消息并关闭，新连接接入。消除 "username already taken" 竞态，防止会话劫持。
- **WS rate limit 调整**: `wsMaxPerWindow` 从 5 提升至 50（每 10 秒），支持并行 E2E 测试 worker 同时接入并防御重连风暴。
- **WebSocket 重连加固**: `api.ts` 中重连逻辑在创建新连接前显式调用 `ws.close()` 并清空旧 handler 集合（`handlers.clear()` 移除），防止重连后事件处理器重复触发和旧连接资源泄漏。
- **mountedRef 生命周期守卫**: 重连定时器回调在操作 DOM/状态前检查 `mountedRef.current`，防止组件卸载后的 timeout 回调访问已销毁状态。
- **发送失败反馈**: WebSocket 断开时发送按钮进入红色闪烁错误态 + 警告 toast，用户可感知消息未成功发送而非静默丢失。
- **3 项 Opus 安全审查修复**: (1) 邀请码枚举泄露 — 注册/登录错误消息统一化，不再区分"用户不存在"与"密码错误"；(2) WritePump 挂起 — 发送 channel 满时增加超时 write，防止 goroutine 永久阻塞；(3) 密码 bcrypt 输入上限 — 前端限制密码长度，防止 bcrypt 72 字节截断攻击。
- **安全边界自检规则**: AGENTS.md 新增敏感信息 grep 自检 checklist 和违规响应协议，每次交接前强制扫描。
- **公开文档脱敏**: 从 ROADMAP、README、docs 中移除内部 server 别名、端口号和部署拓扑细节。

**2026-05-25 安全更新**:

- **应用 session token 覆盖本地登录/注册**: 受保护 REST 端点要求 `Authorization: Bearer <session_token>`；本地注册用户 WebSocket join 绑定服务端签发的 app session token，OIDC 用户继续走 OIDC token 校验，游客仅允许 guest-only 路径。
- **Search/export 权限加固**: `/api/search` 按认证用户过滤公开、DM、群组成员和 deleted 状态；`/api/export?conversation=group:<name>` 现在在导出前验证群组成员身份，非成员返回 `NOT_IN_GROUP`。
- **Webhook ingress 加固**: HTTP 入口不再接受 query string secret，改为 `Authorization: Bearer <secret>`；请求体限制 8 KiB，`content` 限制 2000 字符，消息发送者固定为服务端 `webhook`。
- **OIDC provider/runtime 边界加固**: discovery、JWKS、token exchange、refresh 请求使用 5s HTTP client timeout，并对 provider 响应体设置大小上限；临时 state/redeem token store 有容量上限，满载时拒绝新建而不静默淘汰既有登录流程，cleanup loop 可关闭，`SetupOIDC` 失败不安装 transient store，重配置会关闭旧 store；OIDC endpoints 有独立 per-IP rate limit。
- **反代后限流客户端 IP 加固**: `CHAT_TRUSTED_PROXY_CIDRS` 显式控制哪些反代来源的 `X-Forwarded-For` / `X-Real-IP` 可驱动 REST、auth、OIDC 和 WebSocket 限流；rate limiter 会清理过期 IP entry，避免长生命周期进程无界保留来源桶。
- **部署与 CI smoke 加固**: `docker-compose.yml` 缺少 `CHAT_SESSION_SECRET` 时拒绝渲染配置，并透传 `CHAT_MEDIA_S3_*` / `CHAT_MEDIA_WEBDAV_*`；GitHub Actions 增加 public preview production build Playwright smoke、视觉验收和 artifact 上传。
- **本地 verify 防假绿**: `scripts/verify.ps1` 检查每个 native 命令的 `$LASTEXITCODE`，默认视觉验收路径会自行启动临时生产后端，不再因未预先启动 backend 而静默跳过。
- **Service Worker API cache 加固**: `/api/*` 请求改为 network-only，`CACHE_NAME` 提升到 `tdchat-v5`，旧 API-bearing cache 会在激活阶段清理；发布后仍需用真实浏览器确认 Cache Storage 中没有 `/api/*` 条目。
- **WebSocket 房间广播加固**: `handleChatMessage` 以当前房间快照为准，普通消息、`@all`、mention 通知和助手未配置反馈均只发送给同房间客户端，避免跨房间正文泄露。
- **Public preview 历史分页收窄**: `/api/messages` 保留游客最新消息预览，但匿名请求最多返回 20 条且不能使用 `before` 翻页；历史分页必须携带有效应用 session token。
- **CORS/WS origin 精确化**: CORS 与 WebSocket 共用同一套 origin allowlist；`CHAT_ALLOWED_ORIGINS` 必须使用完整 origin（如 `https://chat.example.com` 或 `https://*.example.com`），`*`、裸域和端口不匹配的子域 origin 不再放行。
- **Link preview SSRF 加固**: `/api/link-preview` 的 HTTP transport 使用受保护的 `DialContext`，在最终 TCP connect 前验证解析 IP，拒绝 loopback、link-local、private、unspecified 和空解析结果，降低 DNS rebinding/TOCTOU SSRF 风险。

---

## 2. 详细发现

### H-01: 静态文件服务路径穿越 [已修复]

**位置**: `backend\main.go:38-44`（原始行号）
**说明**: SPA fallback 处理器通过 `filepath.Clean` + `filepath.Join` 解析 `r.URL.Path`，在 Unix 上可能解析出绝对路径（例如 `/../../../etc/passwd` → `/etc/passwd`）。`http.Dir` 提供一定保护，但 `os.Stat` 检查会探测任意文件系统路径是否存在，泄漏文件存在信息。在 Windows 上，盘符相对路径带来额外风险。
**修复**: 新增显式路径包含验证，使用 `filepath.Abs()` 和 `strings.HasPrefix()` 确保解析路径不超出前端分发目录。越界路径返回 404。
**状态**: 已在 `backend\main.go` 修复。

---

### H-02: 缺失安全头 [已修复]

**位置**: `backend\main.go`（中间件链，原始版本）
**说明**: HTTP 服务器未发送任何安全头：
- 无 `Content-Security-Policy`（存在注入脚本 XSS 风险）
- 无 `X-Content-Type-Options: nosniff`（MIME 嗅探风险）
- 无 `X-Frame-Options`（点击劫持风险）
- 无 `Referrer-Policy`（referrer 泄漏）
- 无 `Permissions-Policy`（传感器/设备访问风险）

**修复**: 在 `backend\handler\handler.go` 中新增 `SecurityHeadersMiddleware`，设置：
- `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data: https:; font-src 'self'; base-uri 'self'; form-action 'self'`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-XSS-Protection: 0`（已废弃，但为旧浏览器纵深防御保留）

中间件按顺序应用：Logging → SecurityHeaders → CORS。
**状态**: 已在 `backend\handler\handler.go:115-127` 修复，在 `backend\main.go:301` 应用。

---

### H-03: Docker 容器以 root 运行 [已修复]

**位置**: `Dockerfile:35`（原始版本）、`docker-compose.yml`
**说明**: Alpine 运行时容器以 `root` 身份运行应用。Go 应用（或其依赖）的代码执行漏洞将直接获得容器内 root 权限，若结合容器逃逸则可能危及宿主机。
**修复**: 在 Docker 镜像中创建非特权用户 `appuser:appgroup`。`/app/data` 目录归该用户所有，确保 SQLite 可写入。`USER appuser` 指令确保进程在启动前完成降权。
**状态**: 已在 `Dockerfile:28-32` 修复。

---

### H-04: 无全局连接数限制 [已修复]

**位置**: `backend\handler\ws.go:16-18`（原始版本）、`backend\hub\hub.go`
**说明**: 未限制并发 WebSocket 连接数。攻击者可打开数百或数千个连接，每个连接消耗一个 goroutine 和内存（接收缓冲区、发送缓冲区 + channel），导致资源耗尽和服务拒绝。
**修复**: 在 `hub.go` 中新增 `MaxConnections = 100` 常量。Hub 新增 `IsFull()` 方法。`ws.go` 中的 WebSocket 处理器现在在 Hub 满载时以 HTTP 503 拒绝升级请求，在接受 TCP 连接升级之前即拦截。
**状态**: 已在 `backend\hub\hub.go:15` 和 `backend\handler\ws.go:25-28` 修复。

---

### H-05: 缺少后端内容校验 [已修复]

**位置**: `backend\hub\client.go:144-156`（原始版本）
**说明**: 后端仅检查内容是否为空（`msg.Content == ""`）。未在服务端强制长度限制。虽然前端通过 `maxLength={2000}` 限制输入为 2000 字符，但恶意 WebSocket 客户端可直接发送超大消息轻易绕过。这可能导致 SQLite 数据库膨胀，并在 JSON 序列化/广播期间消耗过量内存。
**修复**: 新增 `sanitizeContent()` 函数，剥离 null 字节、HTML 标签与 `javascript:` 协议字符串、修剪空白、强制 2000 字符最大长度限制。在 `handleChatMessage()` 中存储和广播前应用。
**状态**: 已在 `backend\hub\client.go:2076-2092` 修复。

---

### M-01: WebSocket Origin 检查已加强 [已修复]

**位置**: `backend\handler\ws.go:16-18`
**说明**: `CheckOrigin` 现已验证同源请求，并与 CORS 共用 `CHAT_ALLOWED_ORIGINS` 解析。跨源放行必须配置完整 origin（含 scheme，端口按 origin 语义匹配）；`https://*.example.com` 只匹配 HTTPS 子域，不匹配裸域或额外端口；`*` 不放行跨源请求。降低了跨站 WebSocket 劫持 (CSWSH) 风险。
**状态**: 已修复。

---

### M-02: CORS 已从通配符改为 Origin-Aware [已修复]

**位置**: `backend\handler\handler.go:45`
**说明**: CORS 中间件不再返回 `Access-Control-Allow-Origin: *`。同源请求正常允许（无 Origin 头），跨源请求只在 `CHAT_ALLOWED_ORIGINS` 配置完整 origin 或显式 scheme wildcard（如 `https://*.example.com`）时回显该请求 origin，其他来源不返回 `Access-Control-Allow-Origin` 头。
**状态**: 已修复。

---

### M-03: 数据库文件打入 Docker 镜像

**位置**: `.dockerignore`（原始版本）
**说明**: `.dockerignore` 缺少 `*.db`、`*.db-wal`、`*.db-shm` 匹配模式。Dockerfile 的 `COPY backend/ ./` 在构建阶段会将 `backend/` 中残留的 SQLite 数据库文件一并复制，导致镜像膨胀并可能将测试数据带入生产。
**修复**: 在 `.dockerignore` 中新增 `*.db`、`*.db-journal`、`*.db-wal`、`*.db-shm` 匹配模式。
**状态**: 已在 `.dockerignore` 修复。

---

### M-04: rehype-raw 依赖已移除 [已修复]

**位置**: `frontend\package.json`
**说明**: `rehype-raw`（v7.0.0）此前列为依赖但未在任何组件中导入或使用。这是死代码，增加了一个不必要的依赖及其自身安全面。若意外激活，`rehype-raw` 会解析 Markdown 中的原始 HTML，产生 XSS 向量。
**修复**: `rehype-raw` 已从 `package.json` 依赖中移除。
**状态**: 已修复。

---

### M-05: Webhook 密钥明文存储 [已修复]

**位置**: `backend\store\store.go`（`webhooks.secret`）
**说明**: 传入 webhook 密钥此前以明文持久化在 SQLite 中。WebSocket 控制面协议在 `webhook_list` 中避免返回密钥，且 `store.Webhook.Secret` 标记为 `json:"-"`，但数据库泄漏仍可暴露活跃 webhook 凭据。
**修复**: `webhook_create` 现在仅向创建者返回一次高熵密钥。`CreateWebhook` 存储带版本号的加盐 HMAC 哈希，`VerifyWebhookSecret` 以常量时间比较提交的密钥，存储层启动时迁移旧版明文行为哈希。`webhook_list` 仍限于群组 owner/admin 角色并返回脱敏 DTO。
**后续生产环境跟进**: 增加 webhook 密钥轮换和 create/delete 事件的审计日志。
**状态**: 已修复。

---

### L-01: 硬编码 WebSocket URL

**位置**: `frontend\src\lib\api.ts:420`
**说明**: WebSocket URL 硬编码为 `ws://localhost:8080/ws`。在 Docker 部署中，Vite 开发代理不存在，生产环境需要相对或可配置的 URL。目前因 Go 二进制在容器同一端口同时提供 SPA 和 WebSocket 端点而工作正常，但方式脆弱。
**生产环境建议**: 使用相对 WebSocket URL（例如 `const url = \`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws\``），或通过构建时环境变量（Vite 的 `import.meta.env`）使其可配置。
**状态**: Demo 阶段接受。

---

### L-02: localStorage 存储用户名

**位置**: `frontend\src\components\JoinScreen.tsx:12`
**说明**: 最近使用的用户名以 `tokendance:username` 键名持久化在 `localStorage` 中。命名空间恰当且数据不敏感（仅为用户名），影响极小。但 localStorage 可被同源的任何 JavaScript 访问。
**建议**: Demo 可接受。生产环境如引入认证，使用 HttpOnly cookie 存储 session token。
**状态**: Demo 阶段接受。

---

### L-03: 错误日志冗长

**位置**: `backend\hub\client.go:67-68`、`backend\hub\client.go:74`、`backend\store\store.go:119`
**说明**: WebSocket 读取错误、JSON 解析错误和 SQLite 查询错误以 `%v` 记录。虽然输出到 stdout（而非客户端），但可能在日志中暴露内部路径、查询结构和连接细节。
**建议**: 考虑在生产环境中降低日志冗长程度，或使用结构化日志并配合可配置级别。
**状态**: Demo 阶段接受。

---

### L-04: 无数据库连接池限制

**位置**: `backend\store\store.go:25`
**说明**: `sql.Open("sqlite", dbPath)` 使用默认驱动设置，`MaxOpenConns` 为 0（无限制）。由于纯 Go SQLite 驱动序列化写入，相比客户端-服务器数据库影响较小，但设置显式限制仍是良好实践。
**建议**: 对 SQLite（单写入者）设置 `s.db.SetMaxOpenConns(1)` 或较小值。增加 `s.db.SetMaxIdleConns(1)` 和 `s.db.SetConnMaxLifetime(5 * time.Minute)`。
**状态**: Demo 阶段接受。

---

### L-05: 无 Docker HEALTHCHECK [已修复]

**位置**: `Dockerfile`、`Dockerfile.runtime`
**说明**: 未定义 `HEALTHCHECK` 指令。Docker 无法自动检测应用是否健康或在失败时重启。
**修复**: 在两个运行时镜像中新增 `HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3`。命令从 `CHAT_ADDR` 提取活跃端口并探测 `http://127.0.0.1:<port>/api/health`，同时兼容默认 `:8080` 和非默认部署监听端口。
**状态**: 已修复。

---

## 3. 已验证安全项

以下方面已审查并确认实现正确：

| 方面 | 验证 |
|------|-------------|
| **SQL 注入** | 所有查询使用参数化占位符（`?`）。无字符串拼接。`store.go:75-78`、`store.go:106-113`。 |
| **SQLite WAL 模式** | `PRAGMA journal_mode=WAL` 安全，改善并发，无安全风险。WAL/SHM 文件已从版本控制和 Docker 构建中排除。 |
| **用户名校验** | `hub.go:1032` -- 正则 `^[\p{Han}a-zA-Z0-9_]{1,20}$`。不支持 HTML 或特殊字符。前端 `JoinScreen.tsx:43` 有匹配检查。 |
| **消息大小限制** | `client.go:34` -- `maxMessageSize = 8192` 字节，通过 `SetReadLimit` 设置。防止超大帧造成内存炸弹。 |
| **频率限制** | `client.go:205-229` -- 每连接 5 条/秒滑动窗口。每次检查清理时间戳，内存有界。 |
| **Ping/Pong 保活** | `client.go:58-61`、`client.go:238-242` -- 54s ping 间隔，60s pong 超时。孤儿连接被清理。 |
| **react-markdown 安全** | `MessageBubble.tsx:131` -- 未使用 `rehype-raw` 插件。Markdown 渲染为 React 元素，非原始 HTML。XSS 安全。 |
| **优雅关闭** | `main.go:94-106` -- SIGINT/SIGTERM 处理器，`server.Shutdown()` 有 10s 超时。 |
| **HTTP 超时** | `main.go:308` -- ReadTimeout (15s)、WriteTimeout (120s)、IdleTimeout (60s)。WriteTimeout 设为 120s 以支持大体积媒体上传。防止 slowloris 类攻击。 |
| **发送缓冲区背压** | `hub.go:108-113`、`hub.go:123-129` -- 客户端发送缓冲区满时丢弃消息（system/user_left）或断开连接（broadcast）。防止内存无界增长。 |
| **WebSocket 错误消息** | 发给客户端的错误消息为通用描述（如 "rate limit exceeded"），不含堆栈跟踪或内部状态。 |
| **Webhook 列表脱敏** | `webhook_list` 为 owner/admin 专属，返回脱敏 webhook DTO 不含 `secret`；前端普通列表状态同样排除密钥。 |
| **媒体 Key 路径包含** | 本地/WebDAV/S3 媒体存储拒绝空路径段、`.` 和 `..`；自定义表情不再绕过媒体抽象层。 |
| **.env 已 Git 忽略** | `.gitignore:17-18` 覆盖 `.env` 和 `.env.local`。无凭据提交。 |
| **精简 Docker 镜像** | `alpine:3.21` 基础镜像仅含 `ca-certificates` 和 `tzdata`。构建使用多阶段，运行时排除 Go 工具链。 |
| **Docker Healthcheck** | `Dockerfile` 和 `Dockerfile.runtime` 探测同容器 `/api/health` 并跟随 `CHAT_ADDR`，覆盖默认和非默认监听端口。 |
| **WebSocket 重连安全** | `api.ts` 重连前显式 `ws.close()` + `handlers.clear()`，防止事件处理器重复绑定和旧连接泄漏。`mountedRef` 守卫防止卸载后 timeout 回调。发送失败时 UI 显式反馈（红色闪烁 + toast），不静默丢弃。 |
| **CSP 验证** | 前端 meta 标签 + 后端 SecurityHeadersMiddleware 双覆盖；经浏览器 DevTools 验证生产构建 CSP 头正确发送。 |
| **测试覆盖** | 前端 focused 基线 1078 tests / 52 文件；后端 `go test ./... -count=1` 全绿；public preview smoke、本地视觉验收和安全 focused tests 记录在 `ROADMAP.md` 验证台账。 |
| **持续安全实践** | 项目采用多轮交叉审查（cross-review）流程：每轮由独立视角审查 HIGH/MEDIUM/LOW 安全问题，修复后回归验证。`.agents/skills/cross-review.md` 记录审查维度与 checklist。AGENTS.md 安全边界 grep 自检规则每次交接前强制扫描。 |

---

## 4. 整体安全评估

**评估**: 应用架构良好，作为 Demo 具备扎实的基础：参数化查询、消息大小限制、每连接频率限制、WebSocket ping/pong 保活、自动重连（指数退避 + mountedRef 守卫）、精简 Docker 镜像、规范的 Git 卫生。核心 WebSocket 协议处理和数据库层已有持续回归保护；当前测试与 smoke 证据以 `ROADMAP.md` 验证台账为准。项目采用多轮交叉审查（cross-review）作为持续安全实践，`.agents/skills/cross-review.md` 记录审查维度与 checklist。

**Demo 阶段风险画像**: 中低。游客 public preview 是明确产品能力，当前已收窄为最新少量样本且禁止匿名翻页；admin stats、call room bearer、webhook rate limit 等风险继续在 `docs/security-risk-register.md` 跟踪并按优先级收敛。WebSocket/CORS origin 检查已通过同源 Host 精确匹配 + explicit `CHAT_ALLOWED_ORIGINS` 收紧。

**生产环境风险画像**: 中等。大部分安全问题已修复。在面向真实用户部署前仍需关注：

1. **WebSocket 来源已加强** (`handler\ws.go`) -- 同源 Host 精确匹配 + explicit `CHAT_ALLOWED_ORIGINS`
2. **CORS 已改为 origin-aware** (`handler\handler.go`) -- 不再使用通配符或裸域 allowlist
3. **密码已使用 bcrypt** (`store\store.go`) -- SHA-256 → bcrypt (cost 12)，登录时自动升级旧哈希
4. **Auth rate limiter 已上线** (`handler\ratelimit.go`) -- login/register 5次/分钟/IP
5. **使 WebSocket URL 可配置** (`frontend\src\lib\api.ts`) -- 使用 `ws:`/`wss:` 协议推导
6. ~~**增加 nginx 安全头** 作为纵深防御~~（可后续优化）
7. **增加认证** 如需用户身份（JWT、带 HttpOnly/SameSite 的 session cookie）—— 当前 bcrypt + invite code 为 Demo 可接受
8. **设置显式 DB 连接池限制** (`store.go:25`)
9. ~~**增加 webhook 轮换/审计日志**~~（已实现：rotation + audit log）
10. **保持对象存储私密** -- S3-compatible 凭据属于部署环境变量，不应出现在公开文档或前端状态中

---

## 5. Demo 可接受 vs 生产必修复

| 类别 | Demo 可接受 | 生产必修复 |
|----------|---------------------|------------------------|
| WS origin 检查 | 已修复 -- 同源 Host 精确匹配 + explicit origin allowlist | 已修复 |
| CORS | 已修复 -- explicit origin allowlist，`*` 不放行跨源 | 已修复 |
| 无认证 | 是（bcrypt + invite code 为 Demo 可接受） | 是 -- 增加 JWT/session |
| 缺失安全头 | 已修复 | 已修复 |
| 路径穿越风险 | 已修复 | 已修复 |
| 无连接数限制 | 已修复 | 已修复 |
| 无后端内容校验 | 已修复 | 已修复 |
| Docker 以 root 运行 | 已修复 | 已修复 |
| DB 文件打入 Docker 镜像 | 已修复 | 已修复 |
| 硬编码 WS URL | 已修复 -- `ws:`/`wss:` 协议推导 | 已修复 |
| rehype-raw 依赖残留 | 已修复 | 已修复 |
| 无 Docker HEALTHCHECK | 已修复 | 已修复 |
| 无 DB 连接池限制 | 是 | 建议 |
| nginx 缺失安全头 | 是 | 建议（可后续优化） |
| Webhook 密钥明文存储 | 已修复 | 已修复；轮换和审计日志已实现 |
| 密码哈希强度不足 | 已修复 -- bcrypt cost 12 | 已修复 |
| Auth 无 rate limit | 已修复 -- 5次/分钟/IP | 已修复 |
| PDF sandbox 不安全 | 已修复 | 已修复 |
| PicoClaw 无超时 | 已修复 -- 60s context timeout | 已修复 |
