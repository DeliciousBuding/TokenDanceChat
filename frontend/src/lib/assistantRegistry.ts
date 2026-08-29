export type AssistantKind = "bot";
export type AssistantStatus = "online" | "available" | "disabled";

export interface AssistantModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  protocol: "openai" | "anthropic";
  icon: string;
}

export interface AssistantDefinition {
  id: string;
  name: string;
  label: string;
  description: string;
  kind: AssistantKind;
  aliases: string[];
  mention: string;
  model: AssistantModel;
  status: AssistantStatus;
}

/**
 * Single-agent registry: TokenBot is the only assistant. The display model is a
 * static fallback; the real model name comes from GET /api/config at runtime
 * (backend CHAT_LLM_MODEL is the single source of truth).
 */
export const defaultModel: AssistantModel = {
  id: "deepseek-v4-flash-vision-exp",
  name: "DeepSeek V4 Flash Vision",
  provider: "deepseek",
  providerName: "DeepSeek",
  protocol: "openai",
  icon: "deepseek",
};

export const assistants: AssistantDefinition[] = [
  {
    id: "tokenbot",
    name: "TokenBot",
    label: "Bot",
    description: "公共聊天 AI 助手，适合问答、总结和日常 AI 聊天。",
    kind: "bot",
    aliases: ["bot", "tokenbot"],
    mention: "@TokenBot",
    model: defaultModel,
    status: "online",
  },
];

export const tokenBot = assistants[0];

export const mentionableAssistants = assistants.map((assistant) => ({
  name: assistant.name,
  label: assistant.label,
  aliases: assistant.aliases,
}));

/** Pretty names for known model IDs served by the gateway. */
const modelDisplayNames: Record<string, string> = {
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "deepseek-v4-flash-vision-exp": "DeepSeek V4 Flash Vision",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "glm-5.1": "GLM 5.1",
  "glm-4-flash": "GLM 4 Flash",
  "kimi-k2.6": "Kimi K2.6",
  "minimax-m2.7": "MiniMax M2.7",
  "qwen3.7-plus": "Qwen 3.7 Plus",
};

/** Human label for a backend model id; falls back to the raw id. */
export function modelDisplayName(modelId: string): string {
  return modelDisplayNames[modelId] ?? modelId;
}
