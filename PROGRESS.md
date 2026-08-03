# PROGRESS.md — PR-0 合同收口 / PR-1 普通上传退休（执行者进度账本）

最后更新：2026-08-03

## 任务 2（PR-1：普通上传退休）

- 目标：普通上传/Giphy 从代码、配置、测试、文档彻底消失；被删路由必须真 404（修 SPA fallback 吞 API 404）；WriteTimeout 120s→30s；emoji 链路一行不删。
- 开工基线：`go test ./... -count=1` 5 包全绿，988 个测试函数（-v 计数），与 PR-0 一致。
- 顺序：main.go → handler.go → media.go → 测试清理 → 路由合同测试 → 配置与文档 → 反向验证（红→绿）→ 全量验收。
- 决策记录（偏差与理由）：
  1. emoji 测试 TestUploadEmojiStoresViaMediaStore / TestServeEmojiReadsViaMediaStore 原用 NewWebDAVMediaStore 当接口测试替身；WebDAV 删除后（验收 grep 硬要求 NewWebDAVMediaStore 零命中）测试无法编译。按「合同一致 > 功能删净 > 改动最小」，保留测试名与全部断言语义，测试替身改用 LocalMediaStore（t.TempDir()），字节/Content-Type/url 前缀断言逐一保留。
  2. TestMediaStoreRejectsTraversalKeys（领导点名保留）内含 S3 断言段；S3MediaStore 删除后该段无法编译，仅删 S3 段，Local 段原样保留。
  3. media_test.go 220 行起实际是「WebDAV/S3 段 + cleanMediaKey 段」：删 WebDAV/S3 段（~220-922），cleanMediaKey 测试（~924-1054）保留（cleanMediaKey 属保留清单，且被 LocalMediaStore 使用）。
  4. SPA fallback 守卫按任务书 `strings.HasPrefix(cleanPath, "/api/")`/`"/uploads/"` 写法在 Windows 上有洞：filepath.Clean 在 Windows 把斜杠转反斜杠且剥尾斜杠（"/uploads/" → `\uploads`），守卫会漏 → 验收假绿。改用对 r.URL.Path（原始 URL 路径，恒为正斜杠）判断：`p == "/api" || HasPrefix(p, "/api/") || p == "/uploads" || HasPrefix(p, "/uploads/")`，语义与任务书一致且覆盖 /uploads/ 尾斜杠与裸 /api 情形。
  5. capability-matrix.md 仅改目标两行（状态列 + 该行 HTTP 列「仍注册」表述改为「已删除，404」）及说明段 37/39 中直接描述这两个能力的句子——留「仍注册」会与代码事实矛盾（矩阵自称唯一事实来源）；其余行/段落一字未动。
- 进度（每处一个 commit，见提交序列）。

## 任务 0：基线（2026-08-03 实测）

| 命令 | 结果 |
|---|---|
| `cd backend && go test ./... -count=1` | 5 包全 ok（backend/handler/hub/llm/store），988 个测试函数（`-v` 计数 `^=== RUN`） |
| `cd frontend && npm test` | PASS，34 files / 658 tests，skipped = 0 |
| `cd frontend && npx tsc --noEmit` | 通过 |
| `cd frontend && npm run build` | 成功，asset `/assets/index-C40gUqtE.js`，built in 19.46s |
| `git status` | 干净（dist 等未跟踪文件无，工作树 clean） |

基线无异常，与任务书无冲突，开工。

## 开工回执

- 目标：唯一能力矩阵 `docs/capability-matrix.md` 定案，收口 README/ROADMAP/agenthub-validation/engineering-goal 中上传/GIF/附件合同表述，删 visual-acceptance 的「3 tab」硬断言，改 store.go welcome seed 为公共房间+AI 助手引导。
- 顺序：基线 → 矩阵 → 四文档 → visual-acceptance → store.go → 全量验收 → 4 个 commit。
- 最大风险：①任务书事实与代码不符（EmojiPicker 上传入口仍在）→ 已记 BLOCKED.md，矩阵按代码事实写；②visual-acceptance 实测无「附件图标」门禁，只有 `tabs !== 3` 一处可删；③验收 grep 命中 ROADMAP:384 历史基线「文件分享」，将删该字眼并在此记录理由。

## 进度

- [x] 任务 0 基线（见上表）
- [x] PROGRESS.md / BLOCKED.md 骨架提交
- [x] 事实核查（决定依据）：
  - 前端 `grep -rn "uploadImage|giphy|emoji/upload" frontend/src` **非零命中**：`lib/api.ts:571` 有 `fetch("/api/emoji/upload")`；`components/EmojiPicker.tsx:110` 调用 `chatAPI.uploadEmoji`，UI 有「上传表情」按钮+文件输入（:209-223），可删除自定义 emoji（:251-262）。→ 与任务书「零命中/无上传调用」不符，记 BLOCKED.md，矩阵按代码事实写「Compat，上传入口仍在」。
  - `/me` 命令：全仓（前端+后端）无任何命令处理，仅 welcome-3 文案提及 → welcome-3 按任务书「不是就删掉」处理：改写为仍为真的「↑ 编辑」提示（ChatInput.tsx:338 支持 ArrowUp 编辑），移除 `/me`、`:smile:` 失实表述。
  - visual-acceptance.mjs：只有 :597 `if (metrics.authModal.tabs !== 3)` 一处「3 tab」数量硬断言；**不存在**「Composer 必须有附件/图片图标」门禁（composer 门禁仅高度/圆角/宽度/比例；:187-189 登录/注册 tab 点击属流程可用性，保留）。→ 只删 :597 一行。
  - 后端运行面：`/api/upload`、`/api/emoji/upload`、`/api/giphy/search|trending`、`/api/webhook/`、`/uploads/` 仍注册（main.go:159-172）；hub 仍处理 call_*/schedule_*/forward/dm/group/friend 等 legacy WS 事件 → 除 GIF picker（前端已删）外，Archived 行统一标注「运行面清理中」。
  - 前端 composer 现状：ChatInput = textarea + 发送按钮，无任何附件/图片/emoji 工具（已读 render 确认）→ agenthub-validation.md:83「附件/图片预览」在「已迁移/对齐」列属失实表述，一并收口。
  - engineering-goal.md：无「上传/文件分享/图片/Giphy」表述（:23 的 GIF 在已退休清单内），无需改动。
- [x] 任务 1 全部步骤（5 个 commit：骨架 / 矩阵 / 四文档 / visual-acceptance / store.go seed）
- [x] 全量验收（见下表）

## 验收记录（2026-08-03 实测）

| 验收项 | 命令 | 结果 |
|---|---|---|
| 合同 grep | `grep -rn "文件分享\|图片上传\|拖拽上传\|GIPHY\|Giphy" README.md ROADMAP.md docs/agenthub-validation.md docs/engineering-goal.md` | 零命中（exit=1）；历史台账/带日期增量条目保留未动 |
| 后端测试 | `cd backend && go test ./... -count=1` | 5 包全 ok；988 个测试（`-v` 计数）≥ 基线 988 |
| 前端类型 | `cd frontend && npx tsc --noEmit` | 通过 |
| 前端测试 | `cd frontend && npm test` | 34 files / 658 passed，≥ 基线 658，skipped = 0 |
| 前端构建 | `cd frontend && npm run build` | 成功，asset `/assets/index-C40gUqtE.js` |
| git 状态 | `git status` | 干净 |
| frontend/src diff | `git diff HEAD -- frontend/src` | 空（业务代码一行未动） |
| visual-acceptance diff | `git diff master~4..HEAD -- frontend/scripts/visual-acceptance.mjs` | 仅删除 1 行（tabs!==3 断言） |
| 变更文件清单 | `git diff --stat master~4 HEAD` | 仅白名单：README/ROADMAP/agenthub-validation/capability-matrix/visual-acceptance/store.go（+PROGRESS/BLOCKED） |

提交序列：`b6f0476` 骨架 → `bd1929c` 矩阵 → `3dda26a` 四文档 → `2b25bee` visual-acceptance → `c5c7a17` store.go seed。

## 决策记录（理由）

- ROADMAP.md:384（已完成基线段）「高级功能：…文件分享」→ 删除「、文件分享」：该行无「历史/归档」标注、读作当前能力清单，且命中验收 grep；同段其他纯历史行（如 :383 转发/群组/通话不进入主界面）保留不动。验证台账（:238 起）与带日期增量条目（:54-71 等）属历史变更记录，一律保留。
- ROADMAP.md:52/118 的「文件」字眼：指历史媒体按 Markdown 链接/图片的只读渲染与 E2E 覆盖（仍真实存在），非上传合同表述，未列入点名改动 → 不改，避免超范围。
- agenthub-validation.md:81「附件 picker 的本地 agent 专用语义」在「明确不迁移」列（负向表述，仍准确）→ 保留；:83「附件/图片预览」在「已迁移/对齐」列（正向失实）→ 删除该短语。
- store.go welcome-3：任务书「/me 仍存在才保留」→ /me 无处理代码，故移除 `/me`、`:smile:`；「↑ 编辑上一条消息」经验证为真（ChatInput ArrowUp 逻辑），保留改写为独立提示，维持 4 条 seed 结构。
- BLOCKED.md 只记待裁决事实，不自行扩大代码改动范围。

## 任务 2 验收（管理者补录，2026-08-03 12:15）

| 命令 | 结果 |
|---|---|
| `cd backend && go test ./... -count=1` | 5 包全 ok |
| `go test . -run TestRetiredRoutesReturn404 -count=1 -v` | PASS（全方法×路径矩阵） |
| 反向验证（临时禁用 SPA 404 守卫） | 红：`FAIL GET /api/upload: expected 404, got 200` → 恢复后绿 PASS |
| `grep -rn "UploadImage\|GiphySearch\|GiphyTrending\|CHAT_MEDIA\|CHAT_GIPHY\|NewS3MediaStore\|NewWebDAVMediaStore\|maxUploadSize\|fetchGiphy" backend/ docker-compose.yml .env.example README.md` | 零命中 |
| emoji 链路 | `UploadEmoji`/`ServeEmoji` 4 处引用仍在；`TestEmojiServeThroughServer` 通过 |
| `cd frontend && npx tsc --noEmit` | 0 错误 |
| `cd frontend && npm test` | 658 passed，skipped 0 |
| `cd frontend && npm run build` | 成功（index-C40gUqtE.js） |
| `git status` | 干净（仅 PROGRESS/BLOCKED 待提交） |

**测试数裁决（管理者拍板）**：`go test ./... -v` 计数 974 < 任务书基线 988。原因：任务书同时要求「删 UploadImage/ServeUpload/S3/WebDAV/Giphy 测试」与「测试数 ≥ 基线」——二者必然冲突（删功能必删其测试）。减少的 ~15 个全部来自被删功能测试；新增 `TestRetiredRoutesReturn404`（全方法×路径矩阵）+ `TestEmojiServeThroughServer` 已补回合同覆盖。判为符合任务意图（防作弊针对的是「偷偷删测试假装完成」，本处删除与功能删除一一对应），非违规。
