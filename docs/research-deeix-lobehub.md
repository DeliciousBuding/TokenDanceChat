# DEEIX-Chat & LobeHub Icons 调研报告

> 调研时间：2026-05-22  
> 目的：为 TokenDanceChat 多模型 Bot Agent 系统提供竞品参考和技术选型依据

---

## 一、DEEIX-Chat 项目分析

### 1.1 项目概况

| 项目 | 详情 |
|------|------|
| 仓库 | [github.com/DEEIX-AI/DEEIX-Chat](https://github.com/DEEIX-AI/DEEIX-Chat) |
| 最新版本 | v0.1.0（2026-05-21） |
| 许可证 | Apache 2.0 |
| 定位 | 面向企业的 AI 工作台 — 整合模型路由、多模态、文件管理、MCP 工具、计费、认证、运维 |
| 静态包大小 | 34 MB（Go 单体） |

### 1.2 技术栈

| 层级 | 选型 |
|------|------|
| 前端 | Next.js 16 (App Router)、React 19、TypeScript、Tailwind CSS、shadcn/ui、Motion（动画） |
| 后端 | Go 1.25、Gin、Gorm、PostgreSQL + pgvector、Redis、OpenTelemetry |
| 文件处理 | Apache Tika、Docling、OCR 多引擎、MinerU |
| 工具协议 | MCP Streamable HTTP JSON-RPC |

### 1.3 核心功能矩阵

**对 TokenDanceChat 有参考价值的功能：**

| 功能模块 | DEEIX 实现 | TokenDanceChat 可借鉴 |
|----------|-----------|----------------------|
| 模型选择器 | 平台模型目录 + 厂商映射 + 自动图标 + 熔断状态 | 侧边栏 Agent 列表 + 厂商 logo |
| 多分支会话 | 类似 ChatGPT 对话分支 | 每个 Bot/Agent 独立对话线程 |
| 上下文压缩 | 超窗口自动摘要 + Token 预算截断 | Bot 消息历史管理 |
| 长期记忆 | 跨会话用户偏好 | Bot memory 持久化 |
| 协议适配 | OpenAI + Anthropic + Gemini + xAI 统一路由 | Anthropic 协议适配层（国产模型通用） |
| 文件卡片 | 富媒体消息渲染 | 参考 MessageBubble 增强 |
| MCP 工具 | 工具发现、启用/停用、执行链路渲染 | Agent 工具注册系统 |

### 1.4 UI 路由结构

| DEEIX 路由 | 功能 | TokenDanceChat 对应 |
|-----------|------|-------------------|
| `/chat` | 主对话工作区 | 当前 ChatLayout |
| `/recent` | 对话列表、分享、收藏 | 未来：对话历史面板 |
| `/files` | 文件管理 | 已有图片上传，可扩展 |
| `/setting` | 账户/偏好/安全 | 未来：设置面板 |
| `/admin` | 模型路由/用户/计费 | 不在当前 scope |

---

## 二、LobeHub Icons — AI 模型厂商图标方案

### 2.1 项目概况

| 项目 | 详情 |
|------|------|
| GitHub | [github.com/lobehub/lobe-icons](https://github.com/lobehub/lobe-icons) |
| 图标浏览 | [lobehub.com/icons](https://lobehub.com/icons) |
| 图标数量 | 1400+ 款 AI/LLM 品牌 SVG |
| 许可证 | MIT |

### 2.2 TokenDanceChat 需要的图标

以下图标已确认存在，可直接使用：

| 品牌 | 图标名 | 变体类型 |
|------|--------|----------|
| DeepSeek | `DeepSeek` | Mono / Color / Text / Combine / Avatar |
| 智谱 GLM | `ChatGLM`, `Zhipu` | Mono / Color / Text / Combine |
| 通义千问 | `Qwen` | Mono / Color / Text / Combine |
| 月之暗面 Kimi | `Kimi`, `Moonshot` | Mono / Color / Text / Combine |
| 字节豆包 | `Doubao`, `ByteDance` | Mono / Color / Text / Combine |
| MiniMax | `MiniMax` | Mono / Color / Text / Combine |
| OpenAI | `OpenAI` | Mono / Color / Text / Combine / BrandColor |
| Anthropic | `Claude`, `Anthropic` | Mono / Color / Text / Combine |

### 2.3 集成方案

**推荐方案：npm 包（tree-shakable）**

```bash
npm install @lobehub/icons
```

```tsx
// 按需导入，仅打包实际使用的图标
import { DeepSeek, ChatGLM, Qwen, Kimi, MiniMax } from '@lobehub/icons';

function ModelIcon({ provider }: { provider: string }) {
  const size = 24;
  switch (provider) {
    case 'deepseek': return <DeepSeek size={size} />;
    case 'glm':      return <ChatGLM size={size} />;
    case 'qwen':     return <Qwen size={size} />;
    case 'kimi':     return <Kimi size={size} />;
    case 'minimax':  return <MiniMax size={size} />;
    default:         return null;
  }
}
```

**每个图标 6 种变体：**
- `Mono`（默认，单色 SVG）
- `Color`（全彩版本）
- `Text`（纯文字 Logo）
- `Combine`（图标+文字组合）
- `Avatar`（头像徽章样式）
- `BrandColor`（部分图标，纯品牌色块）

**CDN 动态加载（不打包进 bundle）：**

```tsx
import { getLobeIconCDN } from '@lobehub/icons';

const url = getLobeIconCDN('DeepSeek', {
  type: 'color',
  format: 'svg',
  cdn: 'unpkg',
});
// → "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepseek-color.svg"
```

国内镜像：`cdn: 'aliyun'` → `https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons/deepseek-color.svg`

**Vite 兼容性：** 零配置。`@lobehub/icons` 是 ESM 原生包，tree-shaking 自动生效。不需要 `optimizeDeps` 或特殊插件。

---

## 三、国产 AI 模型 API 现状（2026-05）

### 3.1 最新模型一览

| 厂商 | 模型 | TokenDanceChat 简称 | 上下文 | 发布时间 |
|------|------|---------------------|--------|----------|
| DeepSeek | `deepseek-v4-pro` / `deepseek-v4-flash` | DeepSeek V4 Pro / Flash | 100 万 | 2026-04 |
| 阿里 Qwen | `qwen3.6-plus` / `qwen3.6-max-preview` | Qwen 3.6 Plus / Max | 100 万 | 2026-04 |
| 月之暗面 | `kimi-k2.6` / `kimi-k2.6-thinking` | Kimi K2.6 | 262K 输入 | 2026-04-21 |
| 智谱 | `glm-5.1` | GLM 5.1 | 200K | 2026-04-07 |
| MiniMax | `MiniMax-M2.7` | MiniMax M2.7 | 204K | 2026-03-18 |

### 3.2 协议兼容性（关键发现）

**五家国产厂商全部同时支持 OpenAI 和 Anthropic 两种 API 协议。** 这意味着 TokenDanceChat 现有的 LLM adapter（支持 Anthropic + OpenAI）可以直接接入所有厂商，无需额外适配。

| 厂商 | Anthropic 端点 | OpenAI 端点 |
|------|---------------|-------------|
| DeepSeek | `https://api.deepseek.com/anthropic` | `https://api.deepseek.com/v1` |
| Qwen | `https://dashscope.aliyuncs.com/apps/anthropic` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Kimi | `https://api.moonshot.ai/anthropic` | `https://api.moonshot.ai/v1` |
| GLM | `https://open.bigmodel.cn/api/anthropic` | `https://open.bigmodel.cn/api/paas/v4/` |
| MiniMax | `https://api.minimax.io/anthropic` | `https://api.minimax.io/v1` |

### 3.3 注意事项

1. **DeepSeek 旧模型名即将停用**：2026-07-24 前必须从 `deepseek-chat` / `deepseek-reasoner` 迁移到 `deepseek-v4-flash` / `deepseek-v4-pro`
2. **Kimi K2 系列 2026-05-25 下线**：仅剩 3 天窗口
3. **GLM Coding Plan 端点不同**：Coding Plan 需 `/api/coding/paas/v4/`（标准端点是 `/api/paas/v4/`）
4. **定价差异巨大**：国产 $0.14-$4/百万 token vs Claude Opus $15-$75/百万 token，差 5-25 倍

---

## 四、对 TokenDanceChat 的实现建议

### 4.1 模型注册表设计

参考 DEEIX-Chat 的 Model Control Plane，设计一个可配置的模型注册表：

```go
// backend/registry/models.go
type ModelConfig struct {
    ID          string // "deepseek-v4-pro"
    Name        string // "DeepSeek V4 Pro"
    Provider    string // "deepseek"
    Icon        string // "DeepSeek" (lobehub icon name)
    BaseURL     string // "https://api.deepseek.com/anthropic"
    APIType     string // "anthropic" | "openai"
    APIKeyEnv   string // "CHAT_LLM_API_KEY_DEEPSEEK"
    MaxTokens   int    // 1000000
    Enabled     bool
}
```

### 4.2 集成优先级

| 优先级 | 任务 | 说明 |
|--------|------|------|
| **P0** | 修复 React #321 | 阻塞所有前端工作 |
| **P1** | 安装 @lobehub/icons | npm install + 模型图标组件 |
| **P1** | 模型注册表（后端） | Go config 定义厂商/端点/协议 |
| **P1** | 模型选择器 UI | 侧边栏 Agent 列表 + 图标 + 开关 |
| **P2** | 多模型 Bot 对话 | 每个模型独立 Agent + 上下文 |
| **P2** | Agent DM | 直接与 Agent 私聊 |
| **P3** | 上下文压缩 | Token 预算 + 自动摘要 |
| **P3** | 长期记忆 | 跨会话 Bot memory |

### 4.3 图标使用建议

- **侧边栏 Agent 列表**：`Avatar` 变体（48px），圆角头像风格
- **模型选择器**：`Combine` 变体（图标+文字），类似 ChatGPT 模型切换
- **消息气泡内 Bot 头像**：`Color` 变体（32px）
- **设置面板**：`Color` 变体（24px）

---

## 五、参考链接

- [DEEIX-Chat GitHub](https://github.com/DEEIX-AI/DEEIX-Chat)
- [LobeHub Icons GitHub](https://github.com/lobehub/lobe-icons)
- [LobeHub Icons 图标预览](https://lobehub.com/icons)
- [DeepSeek API 文档](https://api-docs.deepseek.com/)
- [阿里云 Anthropic API 兼容文档](https://www.alibabacloud.com/help/en/model-studio/anthropic-api-messages)
- [MiniMax Anthropic API 文档](https://platform.minimax.io/docs/api-reference/text-anthropic-api)
