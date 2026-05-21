import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
} from "react";
import { Send, Loader2, X } from "lucide-react";
import { cn, hashString } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const { t } = useTranslation();
  const { onlineUsers, username, replyTo, setReplyTo, currentChat } =
    useChatStore();
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [pulseButton, setPulseButton] = useState(false);
  const hadContentRef = useRef(false);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const typingSentRef = useRef(false);

  // @mention autocomplete state
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionRef = useRef<HTMLDivElement>(null);

  // Compute the current @mention query from cursor position.
  const mentionQuery = useMemo(() => {
    const textarea = textareaRef.current;
    if (!textarea) return { query: "", startPos: -1 };
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = content.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@(\w*)$/);
    if (!match) return { query: "", startPos: -1 };
    return {
      query: match[1] || "",
      startPos: match.index!,
    };
  }, [content]);

  // Derive filtered user list and whether dropdown should be open.
  const BOT_NAME = "bot";
  const mentionFiltered = useMemo(() => {
    const { query, startPos } = mentionQuery;
    if (startPos < 0) return [];
    const lower = query.toLowerCase();
    const users = onlineUsers
      .filter((u) => u.toLowerCase().includes(lower))
      .slice(0, 9);
    if (BOT_NAME.includes(lower) || lower === "") {
      return [BOT_NAME, ...users].slice(0, 10);
    }
    return users;
  }, [mentionQuery, onlineUsers]);

  // Sync mentionActive with whether we have matches.
  useEffect(() => {
    setMentionActive(mentionFiltered.length > 0);
    setMentionIndex(0);
  }, [mentionFiltered.length]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const newHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  // Dispatch typing_start / typing_stop events
  useEffect(() => {
    const hasContent = content.trim().length > 0;
    if (hasContent && !isComposing && !disabled && !typingSentRef.current) {
      // chatAPI.sendTypingStart();
      typingSentRef.current = true;
    } else if (!hasContent && typingSentRef.current) {
      // chatAPI.sendTypingStop();
      typingSentRef.current = false;
    }
  }, [content, isComposing, disabled]);

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
    // Clear typing state.
    if (typingSentRef.current) {
      // chatAPI.sendTypingStop();
      typingSentRef.current = false;
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [content, disabled, onSend]);

  // Insert @username at cursor position.
  const insertMention = useCallback(
    (selectedUser: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const { startPos } = mentionQuery;
      if (startPos < 0) return;

      const cursorPos = textarea.selectionStart;
      const before = content.slice(0, startPos);
      const after = content.slice(cursorPos);
      const newContent = `${before}@${selectedUser} ${after}`;
      setContent(newContent);
      setMentionActive(false);

      // Restore cursor after the inserted mention.
      const newCursor = startPos + selectedUser.length + 2;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursor, newCursor);
      });
    },
    [content, mentionQuery],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // @mention autocomplete keyboard handling
      if (mentionActive) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((prev) =>
            Math.min(prev + 1, mentionFiltered.length - 1),
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" && !e.shiftKey && !isComposing) {
          e.preventDefault();
          if (mentionFiltered[mentionIndex]) {
            insertMention(mentionFiltered[mentionIndex]);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionActive(false);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey && !isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [
      handleSend,
      isComposing,
      mentionActive,
      mentionFiltered,
      mentionIndex,
      insertMention,
    ],
  );

  const hasContent = content.trim().length > 0;

  // Determine placeholder based on chat context.
  const placeholder = useMemo(() => {
    if (currentChat.type === "dm") {
      return t("input.dmPlaceholder", {
        username: currentChat.username,
      });
    }
    if (currentChat.type === "group") {
      return t("input.groupPlaceholder", { name: currentChat.name });
    }
    return t("input.placeholder");
  }, [currentChat, t]);

  return (
    <div className="relative border-t border-[hsl(220,2.5%,23.5%)] bg-[hsl(223,4%,13%)]">
      {/* Gradient overlay */}


      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 pt-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg bg-[hsl(231,4%,16%)] border border-[hsl(220,2.5%,23.5%)] px-3 py-1.5">
            <span className="text-xs text-muted-foreground">
              {t("input.replyTo")}{" "}
              <span className="font-medium text-foreground/70">
                {replyTo.username}
              </span>
            </span>
            <span className="text-xs text-muted-foreground truncate flex-1">
              {replyTo.content.slice(0, 60)}
              {replyTo.content.length > 60 ? "..." : ""}
            </span>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            aria-label={t("input.replyTo")}
            className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-[hsl(220,2.5%,18%)] hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 px-4 py-3">
        <div className="flex-1 relative">
          {/* @mention autocomplete dropdown */}
          {mentionActive && (
            <div
              ref={mentionRef}
              className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,14%)] shadow-lg animate-scale-in z-20"
              style={{ maxHeight: "200px", overflowY: "auto" }}
            >
              {mentionFiltered.map((user, idx) => (
                <button
                  key={user}
                  onClick={() => insertMention(user)}
                  onMouseEnter={() => setMentionIndex(idx)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                    idx === mentionIndex
                      ? "bg-[hsl(220,2.5%,18%)] text-foreground"
                      : "text-muted-foreground hover:bg-[hsl(220,2.5%,16%)] hover:text-foreground",
                  )}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{
                      background: `linear-gradient(135deg, oklch(65% 0.16 ${hashString(user) % 360}), oklch(58% 0.14 ${(hashString(user) + 45) % 360}))`,
                    }}
                  >
                    {user.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{user}</span>
                  {user === username && (
                    <span className="ml-auto text-[10px] text-muted-foreground/50">
                      {t("sidebar.you")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={placeholder}
            rows={1}
            maxLength={2000}
            disabled={disabled}
            aria-label={placeholder}
            className="w-full resize-none rounded-xl border border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all duration-200 focus:border-[hsl(220,2.5%,35%)] focus:ring-1 focus:ring-[hsl(220,2.5%,35%)] disabled:opacity-50 max-h-[160px]"
            style={{ scrollbarWidth: "thin" }}
          />
        </div>

        {/* Send button */}
        <button
          ref={sendBtnRef}
          onClick={handleSend}
          disabled={disabled || !hasContent}
          aria-label={
            disabled ? t("join.buttonConnecting") : t("input.placeholder")
          }
          className={cn(
            "flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-xl transition-all duration-200",
            "disabled:opacity-30 disabled:cursor-not-allowed",
            pulseButton && "animate-pulse-once",
          )}
          style={{
            backgroundColor: hasContent
              ? "oklch(71.2% 0.194 13.428)"
              : "hsl(220,2.5%,20%)",
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
              style={{
                color: hasContent ? "#fff" : "hsl(240,2.5%,50%)",
              }}
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
