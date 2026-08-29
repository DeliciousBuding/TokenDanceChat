import { useState, useRef, useCallback, useEffect, useMemo, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react";
import { Loader2, Smile, X, ArrowUp } from "lucide-react";
import { cn, hashString } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { chatAPI, type TypingContext } from "@/lib/api";
import { mentionableAssistants, type AssistantDefinition } from "@/lib/assistantRegistry";
import { AssistantIcon } from "./AssistantIcon";
import { lazy, Suspense } from "react";

const EmojiPicker = lazy(() => import("@/components/EmojiPicker").then((m) => ({ default: m.EmojiPicker })));

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  assistantContext?: {
    assistant: AssistantDefinition;
    modelLabel: string;
  } | null;
}

const INPUT_MIN_HEIGHT = 44;
const INPUT_MAX_HEIGHT = 120;
export function ChatInput({
  onSend,
  disabled,
  assistantContext = null,
}: ChatInputProps) {
  const { t } = useTranslation();
  const { onlineUsers, username, setReplyTo, connected, replyTo } = useChatStore();
  const [content, setContent] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const draftStorageKey = "tdchat-draft-public";
  const draftLoadedRef = useRef(false);

  // Load draft when conversation changes.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftStorageKey);
      setContent(saved ?? "");
    } catch { setContent(""); }
    draftLoadedRef.current = true;
  }, [draftStorageKey]);

  // Cleanup mountedRef on unmount to prevent state updates after unmount.
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Save draft on content change (debounced via ref).
  const saveDraftRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    clearTimeout(saveDraftRef.current);
    saveDraftRef.current = setTimeout(() => {
      try {
        if (content.trim()) {
          localStorage.setItem(draftStorageKey, content);
        } else {
          localStorage.removeItem(draftStorageKey);
        }
      } catch { /* quota exceeded, ignore */ }
    }, 500);
    return () => clearTimeout(saveDraftRef.current);
  }, [content, draftStorageKey]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [pulseButton, setPulseButton] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [disconnectFeedback, setDisconnectFeedback] = useState(false);
  const hadContentRef = useRef(false);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const sendingRef = useRef(false);
  const typingSentRef = useRef(false);
  const mountedRef = useRef(true);

  // @mention autocomplete state
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionRef = useRef<HTMLDivElement>(null);

  // Emoji picker state
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Close the picker on the global close signal (Escape from ChatLayout).
  useEffect(() => {
    const handler = () => setEmojiOpen(false);
    window.addEventListener("tdchat:close-emoji-picker", handler);
    return () => window.removeEventListener("tdchat:close-emoji-picker", handler);
  }, []);

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
    const assistantNames = new Set(mentionableAssistants.map((assistant) => assistant.name));
    const assistants = mentionableAssistants.filter((assistant) => {
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
    const results = [...assistants, ...users];
    const allTargets = ["all", "everyone", "here"];
    for (const target of allTargets) {
      if (target.startsWith(lower) || lower === "") {
        results.unshift(target);
        break;
      }
    }
    return results.slice(0, 10);
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

  // Insert an emoji (or :custom_emoji: code) at the cursor position.
  const insertEmoji = useCallback(
    (emoji: string) => {
      const textarea = textareaRef.current;
      const start = textarea ? textarea.selectionStart : content.length;
      const end = textarea ? textarea.selectionEnd : content.length;
      const next = content.slice(0, start) + emoji + content.slice(end);
      setContent(next);
      const pos = start + emoji.length;
      requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(pos, pos);
        adjustHeight();
      });
    },
    [content, adjustHeight],
  );

  // Compute typing context from current chat
  const typingContext = useMemo((): TypingContext => {
    const base: TypingContext = { channel: "public" };
    const trimmed = content.trim();
    if (trimmed) {
      base.preview = trimmed.slice(0, 30);
    }
    return base;
  }, [content]);

  // Track latest typing context for unmount cleanup
  const typingContextRef = useRef(typingContext);
  typingContextRef.current = typingContext;

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

  // Clean up typing state on unmount.
  useEffect(() => {
    return () => {
      if (typingSentRef.current) {
        chatAPI.sendTypingStop(typingContextRef.current);
        typingSentRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleSend = useCallback((immediateContent?: string) => {
    // Prevent double-send from rapid clicks or Enter+click firing.
    if (sendingRef.current) return;
    const rawContent = immediateContent ?? textareaRef.current?.value ?? content;
    const trimmed = rawContent.trim();
    if (!trimmed || disabled) return;

    // Unauthenticated: show auth modal instead of sending.
    const { username } = useChatStore.getState();
    if (!username) {
      useChatStore.getState().setShowAuthModal(true);
      return;
    }

    if (!connected) {
      // Keep content in input so user can retry when reconnected.
      setDisconnectFeedback(true);
      setTimeout(() => { if (mountedRef.current) setDisconnectFeedback(false); }, 3000);
      return;
    }

    sendingRef.current = true;
    setIsSubmitting(true);

    // If editing a previous message, send edit instead
    if (editingMessageId) {
      chatAPI.sendMessageEdit(editingMessageId, trimmed);
      setEditingMessageId(null);
    } else {
      onSend(trimmed);
    }
    import("@/lib/sound").then((m) => m.playSentSound());
    setContent("");
    // Clear reply indicator after send
    setReplyTo(null);
    // Pulse the send button as visual confirmation of sent message.
    setPulseButton(true);
    setTimeout(() => setPulseButton(false), 400);
    // Clear draft.
    try { localStorage.removeItem(draftStorageKey); } catch { /* ignore */ }
    // Clear typing state.
    if (typingSentRef.current) {
      chatAPI.sendTypingStop(typingContext);
      typingSentRef.current = false;
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = `${INPUT_MIN_HEIGHT}px`;
      textareaRef.current.style.overflowY = "hidden";
    }
    // Allow sending again after a short delay.
    setTimeout(() => {
      sendingRef.current = false;
      if (mountedRef.current) setIsSubmitting(false);
    }, 500);
  }, [content, disabled, connected, onSend, typingContext, draftStorageKey, editingMessageId]);

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
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
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
        handleSend(e.currentTarget.value);
      }

      // ↑ key with empty input -> edit last sent message (Telegram-style).
      if (e.key === "ArrowUp" && !e.shiftKey && !content && !mentionActive) {
        e.preventDefault();
        const allMessages = useChatStore.getState().messages;
        for (let i = allMessages.length - 1; i >= 0; i--) {
          const m = allMessages[i];
          if (m.username !== username || m.deleted) continue;
          if (m.to) continue;
          setContent(m.content);
          setEditingMessageId(m.id);
          // Edit mode cancels reply.
          setReplyTo(null);
          requestAnimationFrame(() => {
            const ta = textareaRef.current;
            if (ta) {
              ta.focus();
              ta.setSelectionRange(ta.value.length, ta.value.length);
            }
          });
          break;
        }
      }

      // Clear editing state if user types something different
      if (editingMessageId && e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Shift" && e.key !== "Control" && e.key !== "Alt" && e.key !== "Meta") {
        // Will be cleared by the onChange handler
      }
    },
    [
      handleSend,
      isComposing,
      mentionActive,
      mentionFiltered,
      mentionIndex,
      insertMention,
      content,
      username,
      editingMessageId,
    ],
  );

  const handleSendPointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      handleSend(textareaRef.current?.value);
    },
    [handleSend],
  );

  const hasContent = content.trim().length > 0;

  // Determine placeholder based on chat context. Keep it short so it never
  // wraps on narrow mobile viewports.
  const placeholder = useMemo(() => {
    if (assistantContext) {
      return t("input.assistantPlaceholder", { name: assistantContext.assistant.name });
    }
    return t("input.placeholder");
  }, [assistantContext, t]);

  return (
    <div
      className="td-chat-composer relative z-30 flex-shrink-0 pb-safe"
      data-testid="chat-input"
      data-visual="composer-card"
    >
      {/* Reply indicator */}
      {replyTo && (
        <div className="reply-indicator-enter flex items-center gap-2 px-1 pt-1 pb-2">
          <div className="td-chat-stream-card td-chat-stream-card-muted flex-1 flex items-center gap-2 px-3 py-1.5">
            <span className="text-xs text-[var(--text-tertiary)]">
              {t("input.replyTo")}{" "}
              <span className="font-medium text-[var(--text-secondary)]">
                {replyTo.username}
              </span>
            </span>
            <span className="text-xs text-[var(--text-tertiary)] truncate flex-1">
              {replyTo.content.slice(0, 60)}
              {replyTo.content.length > 60 ? "..." : ""}
            </span>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            aria-label={t("input.cancel")}
            className="flex size-11 flex-shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Editing indicator */}
      {editingMessageId && !replyTo && (
        <div className="reply-indicator-enter flex items-center gap-2 px-1 pt-1 pb-2">
          <div className="td-chat-stream-card td-chat-stream-card-accent flex-1 flex items-center gap-2 px-3 py-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-[var(--accent)]">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            <span className="text-xs text-[var(--text-tertiary)]">
              {t("input.editingMessage")}
            </span>
          </div>
          <button
            onClick={() => { setEditingMessageId(null); setContent(""); }}
            aria-label={t("input.cancel")}
            className="flex size-11 flex-shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="td-chat-composer-body">
          {assistantContext && (
            <div className="td-chat-composer-context" data-visual="composer-ai-context">
              <AssistantIcon assistant={assistantContext.assistant} size="sm" />
              <span className="min-w-0 truncate text-[11px] font-semibold text-[var(--text-primary)]">
                {assistantContext.assistant.name}
              </span>
              <span className="min-w-0 truncate text-[10px] text-[var(--text-tertiary)]">
                {assistantContext.modelLabel}
              </span>
            </div>
          )}

          {/* ── Emoji button ── */}
          <button
            type="button"
            onClick={() => setEmojiOpen((open) => !open)}
            aria-label={t("emoji.openPicker")}
            aria-expanded={emojiOpen}
            data-visual="composer-emoji-button"
            className={cn(
              "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-colors",
              emojiOpen
                ? "bg-[var(--accent)]/12 text-[var(--accent)]"
                : "text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
            )}
          >
            <Smile className="h-5 w-5" />
          </button>

          {/* ── Textarea ── */}
          <div className="relative">
            {/* Emoji picker (self-renders as centered modal) */}
            {emojiOpen && (
              <Suspense fallback={null}>
                <EmojiPicker onSelect={insertEmoji} onClose={() => setEmojiOpen(false)} />
              </Suspense>
            )}

            {/* @mention autocomplete dropdown */}
            {mentionActive && (
              <div
                ref={mentionRef}
                className="td-chat-composer-popover absolute bottom-full left-0 right-0 z-20 mb-1 overflow-hidden rounded-[var(--radius-control)] animate-scale-in"
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
                        ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <span
                      className="chat-generated-avatar flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-[var(--td-surface)]"
                      style={{ "--chat-identity-hue": `${hashString(user) % 360}` } as CSSProperties}
                    >
                      {user.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{user}</span>
                    {mentionableAssistants.some((assistant) => assistant.name === user) && (
                      <span className="ml-auto rounded border border-[var(--border-base)]/50 px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                        {mentionableAssistants.find((assistant) => assistant.name === user)?.label}
                      </span>
                    )}
                    {user === username && (
                      <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
                        {t("sidebar.you")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              data-visual="composer-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder={placeholder}
              rows={1}
              maxLength={2000}
              aria-label={placeholder}
              className="td-chat-composer-field block w-full resize-none overflow-y-hidden bg-transparent border-none shadow-none outline-none text-[15px] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              style={{ scrollbarWidth: "thin", height: INPUT_MIN_HEIGHT, minHeight: INPUT_MIN_HEIGHT, maxHeight: INPUT_MAX_HEIGHT }}
            />
          </div>

          {/* ── AgentHub-style inline actions + send ── */}
          <div className="td-chat-composer-actions" data-visual="composer-bottom-row">
            <button
              ref={sendBtnRef}
              onPointerDown={handleSendPointerDown}
              onClick={() => handleSend()}
              disabled={disabled || isSubmitting || !hasContent}
              aria-label={
                disabled ? t("join.buttonConnecting") : t("input.placeholder")
              }
              data-visual="composer-send"
              data-submitting={isSubmitting ? "true" : "false"}
              className={cn(
                "td-chat-composer-send flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-out [&_svg]:h-[18px] [&_svg]:w-[18px]",
                hasContent
                  ? "bg-[var(--accent)] text-white hover:brightness-110"
                  : "text-[var(--text-tertiary)]",
                "disabled:cursor-not-allowed",
                pulseButton && "animate-pulse-once",
              )}
            >
              {disabled || isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" data-visual="composer-submit-state" />
              ) : (
                <ArrowUp size={16} strokeWidth={2.5} />
              )}
            </button>
          </div>

          {/* Character count */}
          {content.length > 0 && (
            <div className="flex justify-end mt-1">
              <span
                className={cn(
                  "text-[10px] transition-colors",
                  content.length > 1800
                    ? "text-[var(--danger)]/70"
                    : "text-[var(--text-tertiary)]/40",
                )}
                aria-live="polite"
              >
                {t("input.characters", { current: content.length, max: 2000 })}
              </span>
            </div>
          )}

          {/* Disconnect feedback */}
          {disconnectFeedback && (
            <div className="animate-fade-in mt-1">
              <p className="text-xs text-[var(--danger)]/70">
                {t("system.disconnected")}
              </p>
            </div>
          )}
      </div>

    </div>
  );
}
