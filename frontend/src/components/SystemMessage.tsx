import { memo } from "react";
import { formatTime } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";

interface SystemMessageProps {
  content: string;
  timestamp: number;
}

interface I18nContent {
  key: string;
  params?: Record<string, string>;
}

function parseI18nContent(raw: string): I18nContent | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.key === "string") {
      return parsed as I18nContent;
    }
  } catch {
    // Not JSON, treat as raw text
  }
  return null;
}

export const SystemMessage = memo(function SystemMessage({
  content,
  timestamp,
}: SystemMessageProps) {
  const { t } = useTranslation();
  const i18n = parseI18nContent(content);
  const displayText = i18n ? t(i18n.key, i18n.params) : content;

  return (
    <div
      className="flex items-center justify-center px-4 py-2 animate-fade-in"
      role="status"
      aria-label={displayText}
    >
      <div className="flex items-center gap-3 max-w-md">
        {/* Left line */}
        <div className="h-px flex-1 bg-accent" />

        {/* Content */}
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground/70 font-normal">
            {displayText}
          </span>
          <span className="mt-0.5 text-[10px] text-muted-foreground/40">
            {formatTime(timestamp)}
          </span>
        </div>

        {/* Right line */}
        <div className="h-px flex-1 bg-accent" />
      </div>
    </div>
  );
});
