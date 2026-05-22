import { useState } from "react";
import { Bot, Workflow } from "lucide-react";
import { getLobeIconURL, type AssistantDefinition, type AssistantModel } from "@/lib/assistantRegistry";
import { cn } from "@/lib/utils";

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

export function AssistantIcon({ assistant, model, size = "md", className }: AssistantIconProps) {
  const [failed, setFailed] = useState(false);
  const activeModel = model ?? assistant?.model;
  const icon = activeModel?.icon;

  if (icon && !failed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background",
          sizeClass[size],
          className,
        )}
      >
        <img
          src={getLobeIconURL(icon)}
          alt={activeModel?.providerName ?? assistant?.name ?? "model"}
          className="h-full w-full object-contain p-1"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  const Icon = assistant?.kind === "agent" ? Workflow : Bot;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-accent text-muted-foreground",
        sizeClass[size],
        className,
      )}
    >
      <Icon className={innerSizeClass[size]} />
    </span>
  );
}

