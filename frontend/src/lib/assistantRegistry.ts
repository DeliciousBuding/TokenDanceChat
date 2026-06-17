export type AssistantKind = "bot" | "agent";
export type AssistantStatus = "online" | "available" | "disabled";

export interface AssistantModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  protocol: "openai" | "anthropic" | "pico";
  icon: string;
  context: string;
}

export interface AssistantDefinition {
  id: string;
  name: string;
  label: string;
  description: string;
  kind: AssistantKind;
  aliases: string[];
  mention: string;
  backendMention?: string;
  model: AssistantModel;
  status: AssistantStatus;
}

export const modelCatalog: AssistantModel[] = [
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "deepseek",
    providerName: "DeepSeek",
    protocol: "openai",
    icon: "deepseek",
    context: "1M",
  },
  {
    id: "picoclaw-deepseek-v4-flash",
    name: "PicoClaw + DeepSeek V4 Flash",
    provider: "deepseek",
    providerName: "DeepSeek",
    protocol: "pico",
    icon: "deepseek",
    context: "1M",
  },
  {
    id: "qwen3.6-plus",
    name: "Qwen 3.6 Plus",
    provider: "qwen",
    providerName: "Qwen",
    protocol: "openai",
    icon: "qwen",
    context: "1M",
  },
  {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    provider: "kimi",
    providerName: "Moonshot",
    protocol: "openai",
    icon: "kimi",
    context: "262K",
  },
  {
    id: "glm-5.1",
    name: "GLM 5.1",
    provider: "zhipu",
    providerName: "Zhipu",
    protocol: "openai",
    icon: "zhipu",
    context: "200K",
  },
  {
    id: "minimax-m2.7",
    name: "MiniMax M2.7",
    provider: "minimax",
    providerName: "MiniMax",
    protocol: "openai",
    icon: "minimax",
    context: "204K",
  },
];

export const assistants: AssistantDefinition[] = [
  {
    id: "tokenbot",
    name: "TokenBot",
    label: "Bot",
    description: "公共聊天 AI 助手，适合问答、总结和日常 AI 聊天。",
    kind: "bot",
    aliases: ["bot", "tokenbot", "webuichat", "webuibot", "webui"],
    mention: "@TokenBot",
    model: modelCatalog[0],
    status: "online",
  },
  {
    id: "picoclaw",
    name: "PicoClaw",
    label: "Agent",
    description: "工作流 Agent，适合执行任务、工具调用和多步操作。",
    kind: "agent",
    aliases: ["claw", "picoclaw"],
    mention: "@PicoClaw",
    model: modelCatalog[1],
    status: "online",
  },
];

export const mentionableAssistants = assistants.map((assistant) => ({
  name: assistant.name,
  label: assistant.label,
  aliases: assistant.aliases,
}));

const lobeIconNames: Record<string, string> = {
  deepseek: "deepseek",
  qwen: "qwen",
  kimi: "kimi",
  zhipu: "zhipu",
  minimax: "minimax",
  openai: "openai",
  anthropic: "anthropic",
};

export function getLobeIconURL(icon: string, variant: "color" | "avatar" = "color"): string {
  const name = lobeIconNames[icon] ?? icon.toLowerCase();
  return `https://unpkg.com/@lobehub/icons-static-svg@latest/icons/${name}-${variant}.svg`;
}

