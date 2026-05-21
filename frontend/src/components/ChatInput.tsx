import { useState, useRef, useCallback, useEffect, useMemo, type KeyboardEvent, type ClipboardEvent } from "react";
import { Send, Loader2, X, ImagePlus } from "lucide-react";
import { cn, hashString } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { chatAPI, type ChatMessage, type TypingContext } from "@/lib/api";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  onUpload?: (file: File) => void;
}

const INPUT_MIN_HEIGHT = 48;
const INPUT_MAX_HEIGHT = 160;
const ASSISTANTS = [
  { name: "TokenBot", label: "Bot", aliases: ["bot", "tokenbot"] },
  { name: "PicoClaw", label: "Agent", aliases: ["claw", "picoclaw"] },
];

export function ChatInput({
  onSend,
  disabled,
  replyTo,
  onCancelReply: _onCancelReply,
  onUpload,
}: ChatInputProps) {
  const { t } = useTranslation();
  const { onlineUsers, username, currentChat, pendingImage, setPendingImage, setReplyTo } = useChatStore();
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    const match = textBeforeCursor.match(/@([\p{L}\p{N}_]*)$/u);
    if (!match) return { query: "", startPos: -1 };
    return {
      query: match[1] || "",
      startPos: match.index!,
    };
  }, [content]);

  // Derive filtered mention list and whether dropdown should be open.
  const mentionFiltered = useMemo(() => {
    const { query, startPos } = mentionQuery;
    if (startPos < 0) return [];
    const lower = query.toLowerCase();
    const assistantNames = new Set(ASSISTANTS.map((assistant) => assistant.name));
    const assistants = ASSISTANTS.filter((assistant) => {
      if (lower === "") return true;
      return (
        assistant.name.toLowerCase().includes(lower) ||
        assistant.aliases.some((alias) => alias.includes(lower))
      );
    }).map((assistant) => assistant.name);
    const users = onlineUsers
      .filter((u) => !assistantNames.has(u))
      .filter((u) => u.toLowerCase().includes(lower))
      .slice(0, Math.max(0, 10 - assistants.length));
    return [...assistants, ...users].slice(0, 10);
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
    const newHeight = Math.min(
      Math.max(textarea.scrollHeight, INPUT_MIN_HEIGHT),
      INPUT_MAX_HEIGHT,
    );
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > INPUT_MAX_HEIGHT ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  // Compute typing context from current chat
  const typingContext = useMemo((): TypingContext => {
    if (currentChat.type === "dm") return { channel: "dm", target: currentChat.username };
    if (currentChat.type === "group") return { channel: "group", target: currentChat.name };
    return { channel: "public" };
  }, [currentChat]);

  // Dispatch typing_start / typing_stop events
  useEffect(() => {
    const hasContent = content.trim().length > 0;
    if (hasContent && !isComposing && !disabled && !typingSentRef.current) {
      chatAPI.sendTypingStart(typingContext);
      typingSentRef.current = true;
    } else if (!hasContent && typingSentRef.current) {
      chatAPI.sendTypingStop(typingContext);
      typingSentRef.current = false;
    }
  }, [content, isComposing, disabled, typingContext]);

  // Focus textarea when component mounts
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleInsertAssistant = (event: Event) => {
      const assistant = (event as CustomEvent<{ name?: string }>).detail?.name;
      if (!assistant) return;
      const textarea = textareaRef.current;
      const prefix = content.trim().length > 0 ? " " : "";
      const nextContent = `${content}${prefix}@${assistant} `;
      setContent(nextContent);
      requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(nextContent.length, nextContent.length);
        adjustHeight();
      });
    };
    window.addEventListener("tdchat:insert-mention", handleInsertAssistant);
    return () => {
      window.removeEventListener("tdchat:insert-mention", handleInsertAssistant);
    };
  }, [adjustHeight, content]);

  // Image paste handler
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            // Check file size (5MB limit).
            if (file.size > 5 * 1024 * 1024) {
              return;
            }
            // Check type.
            const validTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
            if (!validTypes.includes(file.type)) {
              return;
            }
            // Show preview.
            const reader = new FileReader();
            reader.onload = () => {
              setPendingImage(reader.result as string);
            };
            reader.readAsDataURL(file);
            break;
          }
        }
      }
    },
    [setPendingImage],
  );

  // File input handler
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return;
      const validTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
      if (!validTypes.includes(file.type)) return;

      const reader = new FileReader();
      reader.onload = () => {
        setPendingImage(reader.result as string);
      };
      reader.readAsDataURL(file);
      // Reset input.
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [setPendingImage],
  );

  // Cancel pending image
  const handleCancelImage = useCallback(() => {
    setPendingImage(null);
  }, [setPendingImage]);

  // Send pending image
  const handleSendImage = useCallback(() => {
    if (!pendingImage || !onUpload) return;
    // Convert data URL to File and upload.
    fetch(pendingImage)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], `paste-${Date.now()}.png`, { type: blob.type });
        onUpload(file);
      });
  }, [pendingImage, onUpload]);

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
      chatAPI.sendTypingStop();
      typingSentRef.current = false;
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = `${INPUT_MIN_HEIGHT}px`;
      textareaRef.current.style.overflowY = "hidden";
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
    <div className="relative border-t border-border bg-background">
      {/* Gradient overlay */}


      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 pt-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-1.5">
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
            className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Image preview */}
      {pendingImage && (
        <div className="flex items-center gap-2 px-4 pt-2">
          <div className="relative inline-block">
            <img
              src={pendingImage}
              alt="Preview"
              className="h-20 w-auto rounded-lg border border-border object-cover"
            />
            <button
              onClick={handleCancelImage}
              className="absolute -top-1 -right-1 rounded-full bg-[hsl(0,62.8%,50.6%)] p-0.5 text-white hover:bg-[hsl(0,62.8%,45%)] transition-colors"
              aria-label="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <button
            onClick={handleSendImage}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
            style={{
              backgroundColor: "oklch(71.2% 0.194 13.428)",
              color: "#fff",
            }}
          >
            <Send className="h-3 w-3" />
            Send
          </button>
        </div>
      )}

      {/* File input (hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />

      {/* Input area */}
      <div className="flex items-end gap-2 px-4 py-3">
        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label="Upload image"
          className={cn(
            "flex h-12 w-12 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border transition-colors duration-200",
            "bg-accent text-muted-foreground hover:bg-[hsl(220,2.5%,28%)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30",
          )}
        >
          <ImagePlus className="h-4 w-4" />
        </button>

        <div className="flex-1 relative input-glow">
          {/* @mention autocomplete dropdown */}
          {mentionActive && (
            <div
              ref={mentionRef}
              className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-scale-in z-20"
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
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
                  {ASSISTANTS.some((assistant) => assistant.name === user) && (
                    <span className="ml-auto rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/70">
                      {ASSISTANTS.find((assistant) => assistant.name === user)?.label}
                    </span>
                  )}
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
            onPaste={handlePaste}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={placeholder}
            rows={1}
            maxLength={2000}
            disabled={disabled}
            aria-label={placeholder}
            className="block h-12 max-h-[160px] min-h-12 w-full resize-none overflow-y-hidden rounded-xl border border-border bg-card px-4 py-[13px] text-sm leading-5 text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors duration-200 focus:border-[hsl(220,2.5%,35%)] focus:ring-1 focus:ring-[hsl(220,2.5%,35%)] disabled:opacity-50"
            style={{ scrollbarWidth: "thin", height: INPUT_MIN_HEIGHT }}
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
            "flex h-12 w-12 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border border-transparent transition-all duration-200",
            "disabled:cursor-not-allowed disabled:opacity-30",
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
