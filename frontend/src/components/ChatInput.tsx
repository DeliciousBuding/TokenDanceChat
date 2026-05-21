import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Send, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import type { ChatMessage } from "@/lib/api";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
}

export function ChatInput({
  onSend,
  disabled,
  replyTo,
  onCancelReply,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [pulseButton, setPulseButton] = useState(false);
  const hadContentRef = useRef(false);
  const sendBtnRef = useRef<HTMLButtonElement>(null);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const newHeight = Math.min(textarea.scrollHeight, 160);
    textarea.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  // Focus textarea when component mounts
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Pulse send button when content goes from empty to non-empty
  useEffect(() => {
    const hasContent = content.trim().length > 0;
    if (!hadContentRef.current && hasContent) {
      setPulseButton(true);
      const timer = setTimeout(() => setPulseButton(false), 400);
      hadContentRef.current = true;
      return () => clearTimeout(timer);
    }
    if (!hasContent) {
      hadContentRef.current = false;
    }
  }, [content]);

  const handleSend = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setContent("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [content, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, isComposing],
  );

  const hasContent = content.trim().length > 0;

  return (
    <div className="relative border-t border-[hsl(220,2.5%,23.5%)] bg-[hsl(223,4%,13%)]">
      {/* Gradient overlay */}
      <div className="gradient-overlay-top absolute bottom-full left-0 right-0 h-8 pointer-events-none" />

      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 pt-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg bg-[hsl(231,4%,16%)] border border-[hsl(220,2.5%,23.5%)] px-3 py-1.5">
            <span className="text-xs text-muted-foreground">
              {t("input.replyTo")}{" "}
              <span className="font-medium text-foreground/70">{replyTo.username}</span>
            </span>
            <span className="text-xs text-muted-foreground truncate flex-1">
              {replyTo.content.slice(0, 60)}
              {replyTo.content.length > 60 ? "..." : ""}
            </span>
          </div>
          <button
            onClick={onCancelReply}
            aria-label={t("input.replyTo")}
            className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-[hsl(220,2.5%,18%)] hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 px-4 py-3">
        <div className="flex-1 relative input-glow">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={t("input.placeholder")}
            rows={1}
            maxLength={2000}
            disabled={disabled}
            aria-label={t("input.placeholder")}
            className="w-full resize-none rounded-xl border border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all duration-200 focus:border-[hsl(220,2.5%,35%)] focus:ring-1 focus:ring-[hsl(220,2.5%,35%)] disabled:opacity-50 max-h-[160px]"
            style={{ scrollbarWidth: "thin" }}
          />
        </div>

        {/* Send button */}
        <button
          ref={sendBtnRef}
          onClick={handleSend}
          disabled={disabled || !hasContent}
          aria-label={disabled ? t("join.buttonConnecting") : t("input.placeholder")}
          className={cn(
            "flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-xl transition-all duration-200",
            "disabled:opacity-30 disabled:cursor-not-allowed",
            pulseButton && "animate-pulse-once",
          )}
          style={{
            backgroundColor: hasContent ? "oklch(71.2% 0.194 13.428)" : "hsl(220,2.5%,20%)",
          }}
          onMouseEnter={(e) => {
            if (hasContent) {
              e.currentTarget.style.filter = "brightness(1.1)";
              e.currentTarget.style.transform = "scale(1.05)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "brightness(1)";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          {disabled ? (
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          ) : (
            <Send
              className="h-4 w-4"
              style={{ color: hasContent ? "#fff" : "hsl(240,2.5%,50%)" }}
            />
          )}
        </button>
      </div>

      {/* Character count */}
      {content.length > 0 && (
        <div className="flex justify-end px-4 pb-1">
          <span
            className={cn(
              "text-[10px] transition-colors",
              content.length > 1800
                ? "text-destructive/70"
                : "text-muted-foreground/40",
            )}
            aria-live="polite"
          >
            {t("input.characters", { current: content.length, max: 2000 })}
          </span>
        </div>
      )}
    </div>
  );
}
