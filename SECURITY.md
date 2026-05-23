# 安全审计报告 — TokenDanceChat

**日期**: 2026-05-21
**范围**: 全部代码（Go 后端、React/TypeScript 前端、Docker 部署）
**审计方**: 自动化安全审查

---

## 1. 发现摘要

| 严重程度 | 数量 | 说明 |
|----------|-------|-------------|
| **HIGH** | 5 | 路径穿越、缺失安全头、root 容器运行、无连接数限制、缺少后端内容校验 |
| **MEDIUM** | 5 | 开放 Origin 检查导致 CSWSH、CORS 通配符、DB 文件打入 Docker 镜像、未使用的 rehype-raw 依赖、webhook 密钥静态存储加固 |
| **LOW** | 5 | 硬编码 WS URL、localStorage 存储用户名、错误日志冗长、无 DB 连接池限制、Docker HEALTHCHECK 已修复 |

**HIGH 级别问题已在代码中修复。** 详见以下各节。

**2026-05-23 webhook 更新**: 传入 webhook 列表接口要求群组 owner/admin 角色并脱敏返回。`webhook_create` 仅向创建者返回一次高熵密钥，前端状态将一次性密钥与常规脱敏 webhook 列表分离存储，SQLite 仅存储带版本号的加盐 HMAC 哈希。存储层启动时自动将旧版明文 webhook 行迁移为哈希。

**2026-05-23 媒体存储更新**: 上传功能现在共享 `MediaStore` 抽象层，覆盖本地磁盘、WebDAV 和 S3-compatible 存储。普通上传和自定义表情均使用安全相对 object key，拒绝穿越路径段，并通过同源 `/uploads/...` 路由返回。production-server/S3 凭据必须保留在私有环境文件中。

**2026-05-23 部署更新**: 运行时 Docker 镜像现在定义了对 `/api/health` 的 `HEALTHCHECK`。检查端口从 `CHAT_ADDR` 派生，因此使用非默认监听端口（如 `:3000`）的部署也能正确检查。

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

### M-01: WebSocket Origin 检查限制 [已改进]

**位置**: `backend\handler\ws.go:16-18`
**说明**: `CheckOrigin` 现已验证同源请求，支持通过 `CHAT_ALLOWED_ORIGINS` 环境变量配置额外允许的域名（逗号分隔），并保留对 `vectorcontrol.tech` 子域名的历史兼容白名单。不再对任意来源放行，降低了跨站 WebSocket 劫持 (CSWSH) 风险。
**状态**: 已改进。如需更严格的单域名锁定，可在 `CHAT_ALLOWED_ORIGINS` 中仅配置生产域名。

---

### M-02: CORS 允许所有来源

**位置**: `backend\handler\handler.go:45`
**说明**: `Access-Control-Allow-Origin: *` 允许任意网站发起跨域 API 请求。在无认证的 Demo 中影响较低，但生产环境应加以限制。
**生产环境建议**: 将 `*` 替换为具体前端来源域名。
**状态**: Demo 阶段接受。

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

**位置**: `frontend\src\lib\api.ts:205`
**说明**: WebSocket URL 硬编码为 `ws://localhost:8080/ws`。在 Docker 部署中，Vite 开发代理不存在，生产环境需要相对或可配置的 URL。目前因 Go 二进制在容器同一端口同时提供 SPA 和 WebSocket 端点而工作正常，但方式脆弱。
**生产环境建议**: 使用相对 WebSocket URL（例如 `const url = \`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws\``），或通过构建时环境变量（Vite 的 `import.meta.env`）使其可配置。
**状态**: Demo 阶段接受。

---

### L-02: localStorage 存储用户名

**位置**: `frontend\src\components\JoinScreen.tsx:16-21`
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
| **用户名校验** | `hub.go:202` -- 正则 `^[\p{Han}a-zA-Z0-9_]{1,20}$`。不支持 HTML 或特殊字符。前端 `JoinScreen.tsx:43` 有匹配检查。 |
| **消息大小限制** | `client.go:24` -- `maxMessageSize = 4096` 字节，通过 `SetReadLimit` 设置。防止超大帧造成内存炸弹。 |
| **频率限制** | `client.go:205-229` -- 每连接 5 条/秒滑动窗口。每次检查清理时间戳，内存有界。 |
| **Ping/Pong 保活** | `client.go:58-61`、`client.go:238-242` -- 54s ping 间隔，60s pong 超时。孤儿连接被清理。 |
| **react-markdown 安全** | `MessageBubble.tsx:131` -- 未使用 `rehype-raw` 插件。Markdown 渲染为 React 元素，非原始 HTML。XSS 安全。 |
| **优雅关闭** | `main.go:94-106` -- SIGINT/SIGTERM 处理器，`server.Shutdown()` 有 10s 超时。 |
| **HTTP 超时** | `main.go:54-57` -- ReadTimeout (15s)、WriteTimeout (15s)、IdleTimeout (60s)。防止 slowloris 类攻击。 |
| **发送缓冲区背压** | `hub.go:108-113`、`hub.go:123-129` -- 客户端发送缓冲区满时丢弃消息（system/user_left）或断开连接（broadcast）。防止内存无界增长。 |
| **WebSocket 错误消息** | 发给客户端的错误消息为通用描述（如 "rate limit exceeded"），不含堆栈跟踪或内部状态。 |
| **Webhook 列表脱敏** | `webhook_list` 为 owner/admin 专属，返回脱敏 webhook DTO 不含 `secret`；前端普通列表状态同样排除密钥。 |
| **媒体 Key 路径包含** | 本地/WebDAV/S3 媒体存储拒绝空路径段、`.` 和 `..`；自定义表情不再绕过媒体抽象层。 |
| **.env 已 Git 忽略** | `.gitignore:17-18` 覆盖 `.env` 和 `.env.local`。无凭据提交。 |
| **精简 Docker 镜像** | `alpine:3.21` 基础镜像仅含 `ca-certificates` 和 `tzdata`。构建使用多阶段，运行时排除 Go 工具链。 |
| **Docker Healthcheck** | `Dockerfile` 和 `Dockerfile.runtime` 探测同容器 `/api/health` 并跟随 `CHAT_ADDR`，覆盖默认和非默认监听端口。 |

---

## 4. 整体安全评估

**评估**: 应用架构良好，作为 Demo 具备扎实的基础：参数化查询、消息大小限制、每连接频率限制、WebSocket ping/pong 保活、精简 Docker 镜像、规范的 Git 卫生。核心 WebSocket 协议处理和数据库层是安全的。

**Demo 阶段风险画像**: 低。剩余的 MEDIUM 问题（开放 CORS、开放 WebSocket origin）是公开 Demo 无认证的有意设计选择。仅在超出 Demo 范围的场景下才可能被利用（例如引入敏感数据或认证但未相应限制来源）。

**生产环境风险画像**: 高。在面向真实用户部署前：

1. **限制 WebSocket 来源** (`handler\ws.go:16-18`) -- 验证 `Origin` 头
2. **限制 CORS** (`handler\handler.go:45`) -- 使用具体来源，非 `*`
3. **使 WebSocket URL 可配置** (`frontend\src\lib\api.ts:205`) -- 使用相对/协议相对 URL
4. **在 HTTP/nginx 层增加频率限制** -- 每 IP 连接频率限制
5. **设置规范日志** -- 结构化日志配合轮转，避免错误信息泄漏
6. **移除 `rehype-raw`** 前端依赖
7. **增加 nginx 安全头** 作为纵深防御 (`nginx\tokendance.conf`)
8. **增加认证** 如需用户身份（JWT、带 HttpOnly/SameSite 的 session cookie）
9. **设置显式 DB 连接池限制** (`store.go:25`)
10. **增加 webhook 轮换/审计日志** -- 支持密钥轮换并记录 create/delete 事件
11. **保持对象存储私密** -- S3-compatible 端点、bucket、access key 和 secret key 属于部署环境变量，不应出现在公开文档或前端状态中

---

## 5. Demo 可接受 vs 生产必修复

| 类别 | Demo 可接受 | 生产必修复 |
|----------|---------------------|------------------------|
| WS origin 检查 = 允许全部 | 是 | 否 -- 限制为已知域名 |
| CORS = 通配符 | 是 | 否 -- 限制为具体来源 |
| 无认证 | 是 | 是 -- 增加认证 |
| 缺失安全头 | 否（已修复） | 已修复 |
| 路径穿越风险 | 否（已修复） | 已修复 |
| 无连接数限制 | 否（已修复） | 已修复 |
| 无后端内容校验 | 否（已修复） | 已修复 |
| Docker 以 root 运行 | 否（已修复） | 已修复 |
| DB 文件打入 Docker 镜像 | 否（已修复） | 已修复 |
| 硬编码 WS URL | 是 | 否 -- 改为可配置 |
| rehype-raw 依赖残留 | 是 | 否 -- 移除未使用依赖 |
| 无 Docker HEALTHCHECK | 否（已修复） | 已修复 |
| 无 DB 连接池限制 | 是 | 建议 |
| nginx 缺失安全头 | 是 | 建议 |
| Webhook 密钥明文存储 | 否（已修复） | 已修复；轮换和审计日志仍建议 |
