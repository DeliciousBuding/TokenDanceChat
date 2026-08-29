import { Bot } from "lucide-react";
import { DeepSeek, Qwen, Kimi, Zhipu, Minimax, OpenAI, Anthropic } from "@lobehub/icons";
import { cn } from "@/lib/utils";
import { type AssistantDefinition, type AssistantModel } from "@/lib/assistantRegistry";

interface AssistantIconProps {
  assistant?: AssistantDefinition;
  model?: AssistantModel;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClass = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
};

const innerSizeClass = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

const knownProviders = new Set(["deepseek", "qwen", "kimi", "zhipu", "minimax", "openai", "anthropic"]);

function ProviderColorIcon({ icon, sizePx }: { icon: string; sizePx: number }) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const icons: Record<string, any> = { DeepSeek, Qwen, Kimi, Zhipu, Minimax, OpenAI, Anthropic };
  const key = { deepseek: "DeepSeek", qwen: "Qwen", kimi: "Kimi", zhipu: "Zhipu", minimax: "Minimax", openai: "OpenAI", anthropic: "Anthropic" }[icon];
  if (!key) return null;
  const Provider = icons[key];
  return <Provider.Color size={sizePx} />;
}

export function AssistantIcon({ assistant, model, size = "md", className }: AssistantIconProps) {
  const activeModel = model ?? assistant?.model;
  const icon = activeModel?.icon;
  const px = size === "sm" ? 16 : size === "md" ? 20 : 24;

  if (icon && knownProviders.has(icon)) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-base)] bg-[var(--bg-base)]",
          sizeClass[size],
          className,
        )}
      >
        <ProviderColorIcon icon={icon} sizePx={px} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--border-base)] bg-[var(--bg-2)] text-[var(--text-secondary)]",
        sizeClass[size],
        className,
      )}
    >
      <Bot className={innerSizeClass[size]} />
    </span>
  );
}
