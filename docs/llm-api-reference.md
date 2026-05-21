# LLM API Reference

TokenDanceChat ChatBot adapter 统一供应商接口参考。截至 2026-05-21。

## 架构原则

- **不做强行同构**。Anthropic Messages 和 OpenAI Chat Completions 本质不同，adapter 保留各自的原生思维模型。
- 内部用 `UnifiedChatRequest` 抽象，provider adapter 各自映射到原生格式。
- ChatBot 场景只用到 text message + system prompt，不涉及 tool use / image / audio。

## 关键差异

| 维度 | Anthropic Messages | OpenAI Chat Completions |
|------|-------------------|------------------------|
| 端点 | `POST /v1/messages` | `POST /v1/chat/completions` |
| 认证 | `x-api-key` header | `Authorization: Bearer` header |
| 版本 | `anthropic-version: 2023-06-01` | 无 |
| system | 顶层 `system` 字段 | `role: "developer"` 或 `role: "system"` |
| 输出长度 | `max_tokens` (必填) | `max_completion_tokens` |
| 停止序列 | `stop_sequences` | `stop` |
| thinking | `thinking: {type: "enabled", budget_tokens}` | `reasoning_effort` |
| tool call | content block `{type: "tool_use"}` | `message.tool_calls[]` |
| tool result | `user` message 的 `{type: "tool_result"}` | `role: "tool"` message |
| 流式 | SSE: `message_start` → `content_block_delta` → `message_stop` | SSE: `chat.completion.chunk` → `[DONE]` |
| 结束原因 | `stop_reason` | `finish_reason` |
| prompt cache | block 级 `cache_control` | `prompt_cache_key` |

## 最小可用请求

### Anthropic

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "system": "You are a helpful chatbot.",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

### OpenAI

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.5",
    "messages": [
      {"role": "developer", "content": "You are a helpful chatbot."},
      {"role": "user", "content": "你好"}
    ],
    "max_completion_tokens": 1024
  }'
```

## 内部统一类型

```ts
type UnifiedChatRequest = {
  provider: "anthropic" | "openai";
  model: string;
  instructions?: string;
  messages: UnifiedMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  stream?: boolean;
};

type UnifiedMessage = {
  role: "user" | "assistant";
  content: string;
};
```

ChatBot 场景极简：只需要 text 往返，不涉及 tool use / image / thinking / stream。

## 容易踩的坑

1. **Anthropic `system` 是顶层字段，不是 message role**。不要写 `role: "system"` 的 message。
2. **Anthropic `max_tokens` 必填**，必须 >= 1。
3. **OpenAI Chat Completions 的 tool arguments 是 JSON 字符串，不是对象**。
4. **OpenAI Chat Completions 不返回 reasoning token**，不要读 `reasoning_content`。
5. **不要把 Anthropic `thinking` 映射成 OpenAI `reasoning_content`**。

## 官方文档

- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Anthropic Streaming](https://docs.anthropic.com/en/docs/build-with-claude/streaming)
- [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat/create)
- [OpenAI Streaming](https://platform.openai.com/docs/guides/streaming-responses?api-mode=chat)
- [OpenAI Reasoning](https://platform.openai.com/docs/guides/reasoning?api-mode=chat)
