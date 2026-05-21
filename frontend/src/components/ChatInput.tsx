import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);

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

  const handleSend = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setContent("");
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [content, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Send on Enter (without Shift)
      if (e.key === "Enter" && !e.shiftKey && !isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, isComposing],
  );

  return (
    <div className="relative border-t border-[hsl(220,2.5%,23.5%)] bg-[hsl(223,4%,13%)]">
      {/* Gradient overlay */}
      <div className="gradient-overlay-top absolute bottom-full left-0 right-0 h-8 pointer-events-none" />

      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 pt-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg bg-[hsl(231,4%,16%)] border border-[hsl(220,2.5%,23.5%)] px-3 py-1.5">
            <span className="text-xs text-muted-foreground">
              回复 <span className="font-medium text-foreground/70">{replyTo.username}</span>
            </span>
            <span className="text-xs text-muted-foreground truncate flex-1">
              {replyTo.content.slice(0, 60)}
              {replyTo.content.length > 60 ? "..." : ""}
            </span>
          </div>
          <button
            onClick={onCancelReply}
            className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-[hsl(220,2.5%,18%)] hover:text-foreground transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 px-4 py-3">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder="输入消息... (Shift+Enter 换行)"
            rows={1}
            maxLength={2000}
            disabled={disabled}
            className="w-full resize-none rounded-xl border border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-[hsl(220,2.5%,35%)] focus:ring-1 focus:ring-[hsl(220,2.5%,35%)] disabled:opacity-50 max-h-[160px]"
            style={{ scrollbarWidth: "thin" }}
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={disabled || !content.trim()}
          className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            backgroundColor: content.trim() ? "oklch(71.2% 0.194 13.428)" : "hsl(220,2.5%,20%)",
          }}
          onMouseEnter={(e) => {
            if (content.trim()) {
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
              style={{ color: content.trim() ? "#fff" : "hsl(240,2.5%,50%)" }}
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
          >
            {content.length}/2000
          </span>
        </div>
      )}
    </div>
  );
}
