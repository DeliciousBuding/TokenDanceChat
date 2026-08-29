# MASTER.md — TokenDanceChat UIUX/清理/单 agent 改造

最后更新：2026-08-30
状态：进行中

## 目标（领导原话收口）

1. 只保留 TokenBot，旧第二 Agent 工作区彻底删干净；TokenBot 配置干净、实际能用、简单的一个 agent。
2. 前端 UIUX/美术设计/具体使用综合测试和优化，消灭低质量/不美学 bug。
3. 整理清理屎山，前后端都往下推进。
4. 项目要安全。
5. 分工：主 agent 亲自写 UIUX 前端；sonnet subagent 干杂活/批量活。

## 已验证基线（2026-08-30）

- `go build ./...` 过；`npm run build` 过。
- 本地跑通：TokenBot @mention → 网关 deepseek-v4-flash 流式回复 ✅（截图证据）。
- 网关测试 key：运维侧密钥库内的 NewAPI 测试 key（$10 配额，本地开发用；路径不进公开仓）。
- 浏览器 QA 基线已采（桌面明/暗 + 移动）。

## 关键发现（决策依据）

| # | 发现 | 处置 |
|---|------|------|
| F1 | 后端不读 `.env.local`（无 dotenv loader）；docker-compose 也没传 `CHAT_LLM_*` → bot 配置面断裂 | 后端加极简 .env 加载；compose 补 LLM env |
| F2 | 前端 modelCatalog/模型选择是纯装饰——后端只用 `CHAT_LLM_MODEL` | 删假模型选择器，UI 展示后端真实模型（新增 /api/config 暴露 bot 名+模型） |
| F3 | 设置抽屉背景过透明，内容透出底层 → 明暗主题都看着像坏掉 | UIUX 修复（主 agent） |
| F4 | 移动端 composer placeholder 换行撑高、bot 上下文三层冗余（header+chip+placeholder） | UIUX 修复（主 agent） |
| F5 | composer 左侧假「+」按钮（CSS content 伪元素，无功能） | 删除（主 agent） |
| F6 | 根 AGENTS.md 是 bot system prompt 生成物（main.go writeAgentsMD 写到 data/，根目录这份是误入的历史拷贝）→ 项目没有真 agent 交接文档 | 重写根 AGENTS.md 为项目 SSOT；生成物限定 data/ 且不入 git |
| F7 | 旧第二 Agent 工作区散布 32 文件 159 处（前端 registry/组件/i18n/测试 + 后端 hub/client/main + 文档） | 后端+测试+文档→sonnet；前端 UI 重构→主 agent |
| F8 | LobeHub 图标走 unpkg CDN（可靠性+CSP 面） | vendor 到本地 public/ |
| F9 | hub/client.go 3533 行、store.go 2812 行、hub.go 1682 行为屎山主体 | 本轮只做旧第二 Agent 工作区切除+安全相关收紧，不做大重构（防漂移） |

## Lane 分工

- **Lane A（主 agent 亲自）**：前端 UIUX——旧第二 Agent 工作区前端移除与侧边栏重构、composer 简化、设置抽屉修复、移动端修复、模型展示真实化、美术一致性。
- **Lane B（sonnet）**：后端旧第二 Agent 工作区切除 + F1 配置链路（.env loader、compose、.env.example）+ /api/config。
- **Lane C（sonnet）**：文档面同步（README/ROADMAP/capability-matrix/SECURITY/AGENTS.md 怪象）+ CHANGELOG。
- **Lane D（sonnet）**：测试面修复（后端 _test.go 旧第二 Agent 工作区断言、前端测试更新、e2e）。

## 验收命令（明卷）

```
cd backend && go test ./...
cd frontend && npx tsc --noEmit
cd frontend && npm run build
git diff --check
```

## 暗卷（主 agent 自留复跑）

1. 浏览器实测 @TokenBot 流式回复仍工作（改造后）。
2. 全仓扫描旧 bot 相关命名，仅允许 CHANGELOG 历史条目命中。
3. 截图 QA：桌面明/暗 + 移动端，设置抽屉内容可读、composer 无假按钮无换行。

## 防漂移

- 不做 backend 大重构（F9 只切旧第二 Agent 工作区）；不改 OIDC/Turnstile 逻辑；不动部署形态。
- 每 lane 完成后主 agent 亲自复跑暗卷再收。
