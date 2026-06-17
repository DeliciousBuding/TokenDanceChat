import { memo, useMemo, useCallback, useState, useRef, useEffect, lazy, Suspense } from "react";
import type { CSSProperties } from "react";
import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Reply, Trash2, MoreHorizontal } from "lucide-react";
import { cn, formatTime, formatFullTime, usernameHue } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { chatAPI } from "@/lib/api";
import { MessageContextMenu } from "@/components/MessageContextMenu";
import { useSwipeableMessage } from "@/hooks/useTouchGestures";
import { Avatar } from "@/components/Avatar";
import type { ChatMessage } from "@/lib/api";
import { MessageLinkPreviews, extractURLs } from "@/components/LinkPreview";
import { PollMessage } from "@/components/PollMessage";

const EmojiPicker = lazy(() => import("@/components/EmojiPicker").then((m) => ({ default: m.EmojiPicker })));

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  currentUsername?: string;
  hideAvatar?: boolean;
  hideUsername?: boolean;
  forceShowTimestamp?: boolean;
  isGrouped?: boolean;
  /** Callback for reply action */
  onReply?: (message: ChatMessage) => void;
  /** Callback for delete action */
  onDelete?: (messageId: string) => void;
  /** Number of replies to this message */
  replyCount?: number;
  /** Callback to open the thread panel for this message */
  onOpenThread?: (message: ChatMessage) => void;
  /** Multi-select mode: whether the bubble is in selection mode */
  selectMode?: boolean;
  /** Multi-select mode: whether this message is currently selected */
  isSelected?: boolean;
  /** Multi-select mode: callback to toggle selection */
  onToggleSelect?: (id: string) => void;
  /** Long-press callback to enter select mode */
  onLongPress?: (id: string) => void;
  /** Stagger delay in ms for cascade entrance animation */
  staggerDelay?: number;
  /** Search highlight term — wraps matching text in <mark> */
  highlight?: string;
  /** Animate this message as a real-time incoming message */
  isNew?: boolean;
  /** Pre-computed online users list (hoisted from MessageTranscript) */
  onlineUsers?: string[];
  /** Pre-computed custom emoji lookup (hoisted from MessageTranscript) */
  emojiPreprocess?: { emojiMap: Map<string, string>; pattern: RegExp } | null;
}

/** Simple code block renderer with syntax highlighting and copy button */

function normalizeMentionDisplay(username: string): string {
  const lower = username.toLowerCase();
  if (["tokenbot", "webuichat", "webuibot", "webui"].includes(lower)) {
    return "TokenBot";
  }
  return username;
}

/** Regex: detect image file extensions to skip link preview */

/** Markdown components with link sanitization and message-link navigation. */
const safeMarkdownComponents = {
  a: ({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) => {
    if (href && /^(javascript|data|vbscript):/i.test(href)) {
      return <span {...(props as ComponentPropsWithoutRef<'span'>)}>{children}</span>;
    }
    // Detect message links: href contains #msg-<id> fragment
    const msgMatch = href?.match(/#msg-(.+)$/);
    if (msgMatch) {
      const targetId = msgMatch[1];
      return (
        <a
          href={href}
          onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            window.dispatchEvent(
              new CustomEvent("tdchat:scroll-to-message", { detail: { id: targetId } }),
            );
            const el = document.getElementById(`msg-${targetId}`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add("highlight-flash");
              setTimeout(() => el.classList.remove("highlight-flash"), 2000);
            }
          }}
          className="text-primary underline cursor-pointer"
          {...props}
        >
          {children}
        </a>
      );
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
  },
  img: ({ src, alt, ...props }: ComponentPropsWithoutRef<'img'>) => {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="max-w-full rounded cursor-pointer hover:brightness-90 transition-all duration-200"
        onClick={(e) => {
          e.stopPropagation();
          if (src) useChatStore.getState().setLightboxImage(src);
        }}
        {...props}
      />
    );
  },
};

const CodeBlock = memo(function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available.
    }
  }, [code]);

  return (
    <div className="relative group/code my-2 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-2)]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)]">
        <span className="text-[11px] text-[var(--text-tertiary)] font-mono uppercase tracking-wider">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] opacity-0 group-hover/code:opacity-100 transition-opacity"
          aria-label={t("a11y.copyCode")}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? t("message.copied") : t("message.copy")}</span>
        </button>
      </div>
      {/* Code content */}
      <pre className="!bg-[var(--bg-2)] !p-3 !m-0 overflow-x-auto text-[0.8125rem] leading-relaxed">
        <code className={`language-${language || ""}`}>{code}</code>
      </pre>
    </div>
  );
});

/** Helper: extract code blocks from plain text and render with highlighting */
function parseContentForCodeBlocks(
  content: string,
): Array<{ type: "text"; value: string } | { type: "code"; language: string; code: string }> {
  const parts: Array<
    { type: "text"; value: string } | { type: "code"; language: string; code: string }
  > = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    parts.push({
      type: "code",
      language: match[1] || "",
      code: match[2].trimEnd(),
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }
  return parts;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  currentUsername,
  hideAvatar = false,
  hideUsername = false,
  forceShowTimestamp = false,
  isGrouped = false,
  onReply,
  onDelete,
  replyCount = 0,
  onOpenThread,
  selectMode = false,
  isSelected = false,
  onToggleSelect,
  onLongPress,
  staggerDelay,
  highlight,
  isNew = false,
  onlineUsers = [],
  emojiPreprocess,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const setSelectedProfileUser = useChatStore((s) => s.setSelectedProfileUser);
  const translations = useChatStore((s) => s.translations);
  const polls = useChatStore((s) => s.polls);
  const translatedText = translations[message.id];
  // Read reactions and read_by from O(1) lookup maps, falling back to message object for backward compat
  const reactionsByMessageId = useChatStore((s) => s.reactionsByMessageId);
  const readByMessageId = useChatStore((s) => s.readByMessageId);
  const reactions = reactionsByMessageId[message.id] || message.reactions;
  const readBy = readByMessageId[message.id] || message.read_by;
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [recentlyToggledReaction, setRecentlyToggledReaction] = useState<string | null>(null);
  const isDeleted = message.deleted === true;
  // Link previews: rendered below bubble for all detected URLs
  const hasUrls = useMemo(() => {
    if (isDeleted) return false;
    return extractURLs(message.content).length > 0;
  }, [message.content, isDeleted]);

  const handleAddReaction = useCallback(
    (emoji: string) => {
      import("@/lib/sound").then((m) => m.playReactionSound());
      chatAPI.sendReaction(message.id, emoji);
      setRecentlyToggledReaction(emoji);
      setTimeout(() => setRecentlyToggledReaction(null), 250);
    },
    [message.id],
  );

  // ─── Swipe gestures (mobile) ───
  const swipe = useSwipeableMessage({
    onReply: () => onReply?.(message),
    onCopy: async () => {
      try { await navigator.clipboard.writeText(message.content); } catch { /* noop */ }
    },
    onDelete: () => onDelete?.(message.id),
    isOwn,
    disabled: selectMode || isDeleted,
  });

  // ─── Context menu (long press / right click) ───
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });
  const contextMenuPosRef = useRef({ x: 0, y: 0 });

  // Long-press detection for entering select mode / context menu
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  // Track pointer position for context menu placement
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    contextMenuPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (selectMode || isDeleted) return;
    contextMenuPosRef.current = { x: e.clientX, y: e.clientY };
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      // Long press → enter drag-select mode (Telegram-style).
      if (onLongPress) {
        onLongPress(message.id);
      }
    }, 500);
  }, [selectMode, isDeleted, onLongPress, message.id]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  // Right-click (desktop context menu)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (selectMode || isDeleted) return;
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  }, [selectMode, isDeleted]);

  const openContextMenuFromButton = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (selectMode || isDeleted) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      visible: true,
      x: rect.right - 220,
      y: rect.bottom + 6,
    });
  }, [selectMode, isDeleted]);

  const handleBubbleClick = useCallback(
    (e: React.MouseEvent) => {
      // Close swipe actions if open
      if (swipe.showActions) {
        swipe.closeActions();
        return;
      }
      if (selectMode && onToggleSelect) {
        e.preventDefault();
        e.stopPropagation();
        onToggleSelect(message.id);
      }
    },
    [selectMode, onToggleSelect, swipe],
  );

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect?.(message.id);
    },
    [onToggleSelect],
  );

  // Clean up long-press timer on unmount
  useEffect(() => {
    return () => clearLongPress();
  }, [clearLongPress]);

  // Listen for global Escape to close emoji picker
  useEffect(() => {
    const handler = () => setShowEmojiPicker(false);
    window.addEventListener("tdchat:close-emoji-picker", handler);
    return () => window.removeEventListener("tdchat:close-emoji-picker", handler);
  }, []);

  const nameHue = useMemo(() => usernameHue(message.username), [message.username]);

  // Get profile info for display name and avatar.
  const userProfiles = useChatStore((s) => s.userProfiles);
  const userProfile = userProfiles[message.username];
  const messageDisplayName = userProfile?.display_name || message.username;
  const messageAvatarUrl = userProfile?.avatar_url || null;

  const handleAvatarClick = useCallback(() => {
    if (selectMode) return;
    setSelectedProfileUser(message.username);
  }, [message.username, setSelectedProfileUser, selectMode]);

  // Parse @mentions and render with highlighting.
  const mentionContent = useMemo(() => {
    const rawContent = isDeleted
      ? t("chat.deletedMessage")
      : message.content;
    if (isDeleted) {
      return (
        <span className="italic text-muted-foreground/50 line-through">
          {rawContent}
        </span>
      );
    }

    // Pre-process custom emoji :name: patterns, replacing them with img tags.
    let processedContent = rawContent;
    if (emojiPreprocess) {
      processedContent = processedContent.replace(emojiPreprocess.pattern, (_match: string, name: string) => {
        const url = emojiPreprocess.emojiMap.get(name);
        if (!url) return _match;
        return `<img src="${url}" alt=":${name}:" class="inline-custom-emoji" style="width:1.5em;height:1.5em;vertical-align:middle;display:inline-block;" />`;
      });
    }

    // Helper: render a plain text segment with mentions, code blocks, and markdown.
    const renderSegment = (text: string, key: number): React.ReactNode => {
      const mentionRegex = /@([\p{L}\p{N}_]+)/gu;
      const segParts: (
        | { type: "text"; value: string }
        | { type: "mention"; username: string }
      )[] = [];
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      while ((m = mentionRegex.exec(text)) !== null) {
        if (m.index > lastIdx) {
          segParts.push({ type: "text", value: text.slice(lastIdx, m.index) });
        }
        segParts.push({ type: "mention", username: m[1] });
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx < text.length) {
        segParts.push({ type: "text", value: text.slice(lastIdx) });
      }

      if (segParts.length === 0) {
        // No mentions, check for code blocks.
        const codeParts = parseContentForCodeBlocks(text);
        if (codeParts.length === 1 && codeParts[0].type === "text") {
          return (
            <ReactMarkdown key={key} remarkPlugins={[remarkGfm]} components={safeMarkdownComponents}>
              {text}
            </ReactMarkdown>
          );
        }
        return (
          <span key={key}>
            {codeParts.map((part, j) => {
              if (part.type === "code") {
                return <CodeBlock key={j} language={part.language} code={part.code} />;
              }
              return (
                <ReactMarkdown key={j} remarkPlugins={[remarkGfm]} components={safeMarkdownComponents}>
                  {part.value}
                </ReactMarkdown>
              );
            })}
          </span>
        );
      }

      // Has mentions.
      return (
        <span key={key}>
          {segParts.map((part, j) => {
            if (part.type === "mention") {
              const mentionDisplay = normalizeMentionDisplay(part.username);
              return (
                <button
                  key={j}
                  onClick={() => setSelectedProfileUser(mentionDisplay)}
                  className={cn(
                    "hover:underline cursor-pointer",
                    isOwn
                      ? "bg-[var(--accent)]/20 text-[var(--accent)] rounded-md px-1.5 py-0.5"
                      : "bg-[var(--accent)]/12 text-[var(--accent)] rounded-md px-1.5 py-0.5",
                  )}
                >
                  @{mentionDisplay}
                </button>
              );
            }
            const subParts = parseContentForCodeBlocks(part.value);
            return (
              <span key={j}>
                {subParts.map((sp, k) => {
                  if (sp.type === "code") {
                    return <CodeBlock key={k} language={sp.language} code={sp.code} />;
                  }
                  return (
                    <ReactMarkdown key={k} remarkPlugins={[remarkGfm]} components={safeMarkdownComponents}>
                      {sp.value}
                    </ReactMarkdown>
                  );
                })}
              </span>
            );
          })}
        </span>
      );
    };

    // Highlight mode: split content by search term, wrap matches in <mark>.
    if (highlight) {
      const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hlRegex = new RegExp(`(${escaped})`, 'gi');
      const segments = processedContent.split(hlRegex);
      const hlLower = highlight.toLowerCase();
      return (
        <>
          {segments.map((seg, i) => {
            if (seg.toLowerCase() === hlLower && seg.length > 0) {
              return (
                <mark key={i} className="bg-yellow-200 dark:bg-yellow-600 text-foreground/90 rounded-sm px-0.5">
                  {seg}
                </mark>
              );
            }
            return renderSegment(seg, i);
          })}
        </>
      );
    }

    // Normal path (no highlight): render using existing logic.
    return renderSegment(processedContent, 0);
  }, [message.content, currentUsername, isDeleted, t, emojiPreprocess, highlight, isOwn]);

  const paddingY =
    isGrouped && hideAvatar ? "py-0.5" : "py-0.5 sm:py-1";

  return (
    <>
      <div className="relative overflow-hidden">
        {/* Swipe action buttons (revealed behind on left swipe, Telegram-style) */}
        <div
          className={cn(
            "absolute inset-y-0 right-0 flex items-center gap-1 px-3 transition-opacity duration-200",
            swipe.showActions ? "opacity-100" : "opacity-0",
          )}
          aria-hidden={!swipe.showActions}
        >
          {onReply && (
            <button
              onClick={() => { onReply(message); swipe.closeActions(); }}
              aria-label={t("input.replyTo")}
              className="flex w-11 h-11 items-center justify-center rounded-full border border-[var(--border-base)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--brand)] hover:bg-[var(--brand-light)] transition-colors"
            >
              <Reply className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={async () => {
              try { await navigator.clipboard.writeText(message.content); } catch { /* noop */ }
              swipe.closeActions();
            }}
            aria-label={t("message.copy")}
            className="flex w-11 h-11 items-center justify-center rounded-full border border-[var(--border-base)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--brand)] hover:bg-[var(--brand-light)] transition-colors"
          >
            <Copy className="h-4 w-4" />
          </button>
          {isOwn && onDelete && (
            <button
              onClick={() => { onDelete(message.id); swipe.closeActions(); }}
              aria-label={t("message.delete")}
              className="flex w-11 h-11 items-center justify-center rounded-full border border-[var(--border-base)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--brand)] hover:bg-[var(--brand-light)] transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sliding message content */}
        <div
          className="transition-transform duration-200 ease-out touch-pan-y"
          style={{ transform: `translateX(${swipe.translateX}px)` }}
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
        >
      <div
      id={`msg-${message.id}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={clearLongPress}
      onClick={handleBubbleClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={() => {
        if (!selectMode && !isDeleted && onReply) {
          onReply(message);
        }
      }}
      data-visual="message-bubble"
      data-message-own={isOwn ? "true" : "false"}
      className={cn(
        "group td-ah-message-row flex gap-1.5 px-2.5 scroll-mt-16 sm:gap-3 sm:px-4",
        isNew && "animate-message-in",
        isOwn ? "justify-end" : "justify-start",
        paddingY,
        selectMode && "cursor-pointer",
        isSelected && "bg-primary/5",
      )}
      style={{
        animationDelay: !isNew && staggerDelay ? `${staggerDelay}ms` : undefined,
        ...(isNew ? { willChange: "transform, opacity" } : {}),
      }}
    >
      {/* Select checkbox (visible in select mode) */}
      {selectMode && (
        <div
          className={cn(
            "flex items-center flex-shrink-0",
            isOwn ? "order-last" : "",
          )}
        >
          <button
            onClick={handleCheckboxClick}
            className="flex items-center justify-center"
            aria-label={isSelected ? "Deselect message" : "Select message"}
          >
            {isSelected ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-primary">
                <circle cx="12" cy="12" r="10" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                <polyline points="8 12 11 15 16 9" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/40" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Avatar for others */}
      {!isOwn && !hideAvatar && (
        <div className="mt-0.5 flex-shrink-0">
          <Avatar
            src={messageAvatarUrl}
            name={messageDisplayName}
            size="md"
            onClick={handleAvatarClick}
            className="ring-1 ring-white/10 hover:ring-white/30 hover:scale-110 transition-all"
          />
        </div>
      )}

      {!isOwn && hideAvatar && (
        <div className="w-8 flex-shrink-0" aria-hidden="true" />
      )}

      <div
        className={cn(
          "td-ah-message-stack flex min-w-0 flex-col",
          "max-w-[82%] sm:max-w-[76%] xl:max-w-[68%]",
          isOwn ? "items-end" : "items-start",
        )}
      >
        {!hideUsername && !isOwn && (
          <div
            className={cn(
              "td-ah-message-header mb-0.5 flex items-baseline gap-2 sm:mb-1",
              "justify-start",
            )}
          >
            <span
              className="chat-name-token text-xs font-medium"
              style={{ "--chat-identity-hue": `${nameHue}` } as CSSProperties}
            >
              {messageDisplayName}
            </span>
            {!isGrouped && (
              <span
                data-visual="message-bubble-meta"
                className="text-[11px] text-[var(--text-tertiary)]"
                title={formatFullTime(message.timestamp)}
              >
                {formatTime(message.timestamp, t)}
                {(message as ChatMessage).mention_all && (
                  <span className="ml-1 text-[10px] font-medium text-[var(--td-amber)]">
                    @all
                  </span>
                )}
              </span>
            )}
          </div>
        )}

        {/* Reply preview (quoted message) — clickable to jump to original */}
        {!selectMode && (message.reply_to_id || message.reply_to_content) && (
          <div
            data-visual="message-bubble-reply-preview"
            className="td-chat-stream-card mb-1 ml-0 cursor-pointer border-l-2 border-l-[var(--accent)]/35 pl-2 py-0.5 transition-colors hover:border-[var(--accent)]/45"
            role="button"
            tabIndex={0}
            aria-label={`Jump to replied message from ${message.reply_to_user || "unknown"}`}
            onClick={() => {
              if (message.reply_to_id) {
                const el = document.getElementById(`msg-${message.reply_to_id}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.classList.add("highlight-flash");
                  setTimeout(() => el.classList.remove("highlight-flash"), 2000);
                }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                (e.currentTarget as HTMLDivElement).click();
              }
            }}
          >
            <span className="text-[10px] font-medium text-muted-foreground/70">
              {message.reply_to_user || "..."}
            </span>
            <span className="text-[10px] text-muted-foreground/50 block truncate max-w-[200px]">
              {(message.reply_to_content || "").slice(0, 80)}
              {(message.reply_to_content || "").length > 80 ? "..." : ""}
            </span>
          </div>
        )}

        <div
          data-visual="message-bubble-surface"
          className={cn(
            "td-chat-bubble relative border text-[15px] leading-relaxed",
            "px-3.5 py-2",
            isOwn
              ? "td-chat-bubble-own"
              : "td-chat-bubble-agent",
            isDeleted && "opacity-40",
          )}
        >
          {isEditing ? (
            <div className="flex flex-col gap-2 w-full min-w-[260px]">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (editContent.trim()) {
                      chatAPI.sendMessageEdit(message.id, editContent);
                      setIsEditing(false);
                    }
                  } else if (e.key === "Escape") {
                    setIsEditing(false);
                  }
                }}
                className="w-full rounded-[var(--radius-control)] border border-[var(--td-line)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring-focus)] resize-none"
                style={{ minHeight: "60px", scrollbarWidth: "thin" }}
                autoFocus
              />
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[10px] text-muted-foreground/50 flex-1">
                  {t("input.escapeToCancel")}
                </span>
                <button
                  onClick={() => setIsEditing(false)}
                  className="td-chat-list-row px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {t("input.cancel")}
                </button>
                <button
                  onClick={() => {
                    if (editContent.trim()) {
                      chatAPI.sendMessageEdit(message.id, editContent);
                      setIsEditing(false);
                    }
                  }}
                  className="rounded-full bg-[var(--brand)] text-white px-3 py-1 text-xs font-medium hover:brightness-110 transition-colors"
                >
                  {t("input.save")}
                </button>
              </div>
            </div>
          ) : (polls[message.id] || message.poll) ? (
            <PollMessage poll={(polls[message.id] || message.poll)!} messageId={message.id} />
          ) : (
            <div className="markdown-body td-message-markdown select-text">
              {mentionContent}
            </div>
          )}

          {/* Link previews: rendered below message text for all detected URLs */}
          {!isEditing && (hasUrls ?? false) && (
            <MessageLinkPreviews content={message.content} messageTimestamp={message.timestamp} />
          )}
          {!selectMode && !isEditing && (
            <div
              className={cn(
                "absolute top-1/2 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
                isOwn ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1",
              )}
            >
              <button
                type="button"
                onClick={openContextMenuFromButton}
                data-visual="message-bubble-menu"
                className="td-chat-popover flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] opacity-0 transition-all group-hover:opacity-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 [&_svg]:h-[18px] [&_svg]:w-[18px]"
                aria-label={t("message.contextMenu")}
                title={t("message.contextMenu")}
              >
                <MoreHorizontal strokeWidth={1.7} />
              </button>
            </div>
          )}
        </div>

        {/* Translation display */}
        {translatedText && (
          <div className="td-chat-info-card mt-1.5 px-3 py-1.5 text-sm text-foreground/80 italic">
            <span className="text-[10px] text-muted-foreground/50 block mb-0.5">Translated</span>
            {translatedText}
          </div>
        )}

        {/* Reaction bar */}
        {!isDeleted && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-1 mt-0.5 transition-opacity",
              (!reactions || Object.values(reactions).every((users) => users.length === 0)) && replyCount === 0
                ? "hidden"
                : "opacity-100",
            )}
          >
            {replyCount > 0 && (
              <button
                data-visual="message-bubble-thread"
                onClick={selectMode ? undefined : () => {
                  if (onOpenThread) {
                    onOpenThread(message);
                  } else {
                    // Legacy event-based fallback
                    window.dispatchEvent(
                      new CustomEvent("tdchat:view-thread", { detail: { messageId: message.id } }),
                    );
                  }
                }}
                className="td-chat-pill inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-xs border border-[var(--border-subtle)] bg-[var(--bg-1)] hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-secondary)]"
                aria-label={`${replyCount} replies`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 17 4 12 9 7" />
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                </svg>
                <span className="text-xs">{replyCount}</span>
              </button>
            )}
            {reactions &&
              Object.entries(reactions).map(
                ([emoji, users]) =>
                  users.length > 0 && (
                    <button
                      key={emoji}
                      data-visual="message-bubble-reaction"
                      onClick={selectMode ? undefined : () =>
                        handleAddReaction(emoji)
                      }
                      className={cn(
                        "td-chat-pill inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-xs border border-[var(--border-subtle)] bg-[var(--bg-1)] hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-secondary)]",
                        currentUsername &&
                          users.includes(currentUsername) &&
                          "bg-[var(--accent)]/10 border-[var(--accent)]/30",
                        recentlyToggledReaction === emoji && "animate-pop",
                      )}
                      aria-label={`${emoji} ${users.length} reactions`}
                      title={users.join(", ")}
                    >
                      <span className="text-base leading-none">{emoji}</span>
                      <span className="text-xs text-muted-foreground/70">
                        {users.length}
                      </span>
                    </button>
                  ),
              )}
          </div>
        )}

        {showEmojiPicker && (
          <Suspense fallback={null}>
            <EmojiPicker
              onSelect={(emoji: string) => handleAddReaction(emoji)}
              onClose={() => setShowEmojiPicker(false)}
            />
          </Suspense>
        )}

        {isOwn && (
          <div data-visual="message-bubble-meta" className="td-ah-message-meta mt-1 flex justify-end items-center gap-1">
            {/* Delivery status icons — Telegram-style checkmarks */}
            {readBy && readBy.length > 0 ? (
              <>
                <ReadReceipt
                  readers={readBy}
                  readByLabel={t("message.readBy")}
                  readLabel={t("message.read")}
                  onlineLabel={t("a11y.online")}
                  userProfiles={userProfiles}
                  onlineUsers={onlineUsers}
                />
              </>
            ) : message.id ? (
              <span className="inline-flex text-muted-foreground/40" aria-label={t("message.sent")}>
                <Check className="h-3 w-3" />
                <Check className="h-3 w-3 -ml-1.5" />
              </span>
            ) : null}
            <span
              className={cn(
                "text-[11px] text-[var(--text-tertiary)] transition-opacity",
                forceShowTimestamp
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
              title={formatFullTime(message.timestamp)}
            >
              {formatTime(message.timestamp, t)}
              {message.edited && (
                <span className="text-[10px] text-muted-foreground/40 ml-1">
                  {t("message.edited")}
                </span>
              )}
            </span>
          </div>
        )}

      </div>

    </div>
        </div>
      </div>
        {contextMenu.visible && (
          <MessageContextMenu
            message={message}
            isOwn={isOwn}
            position={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={() => setContextMenu({ visible: false, x: 0, y: 0 })}
            onReply={() => {
              setContextMenu({ visible: false, x: 0, y: 0 });
              onReply?.(message);
            }}
            onCopy={async () => {
              setContextMenu({ visible: false, x: 0, y: 0 });
              try { await navigator.clipboard.writeText(message.content); } catch { /* noop */ }
            }}
            onDelete={() => {
              setContextMenu({ visible: false, x: 0, y: 0 });
              onDelete?.(message.id);
            }}
            onSelect={() => {
              setContextMenu({ visible: false, x: 0, y: 0 });
              onLongPress?.(message.id);
            }}
            onEdit={isOwn ? () => {
              setContextMenu({ visible: false, x: 0, y: 0 });
              setIsEditing(true);
              setEditContent(message.content);
            } : undefined}
            onPin={() => {
              setContextMenu({ visible: false, x: 0, y: 0 });
              chatAPI.sendPinMessage(message.id);
            }}
            onReact={() => {
              setContextMenu({ visible: false, x: 0, y: 0 });
              setShowEmojiPicker(true);
            }}
            onTranslate={
              !isOwn && message.content && message.content.length < 500
                ? () => {
                    setContextMenu({ visible: false, x: 0, y: 0 });
                    chatAPI.sendTranslateMessage(message.id, message.content, "");
                  }
                : undefined
            }
          />
        )}
      </>
    );
});
// ── ReadReceipt: clickable tooltip showing who read a message ──

function ReadReceipt({ readers, readByLabel, readLabel, onlineLabel, userProfiles, onlineUsers }: {
  readers: string[];
  readByLabel: string;
  readLabel: string;
  onlineLabel: string;
  userProfiles: Record<string, { display_name?: string; avatar_url?: string }>;
  onlineUsers: string[];
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        onClick={(e) => { e.stopPropagation(); setShowTooltip(!showTooltip); }}
        className="inline-flex cursor-pointer hover:opacity-80 transition-opacity"
        aria-label={readLabel}
      >
        <Check className="h-3 w-3 text-[var(--accent)]" />
        <Check className="h-3 w-3 text-[var(--accent)] -ml-1.5" />
      </button>
      {showTooltip && (
        <div className="td-chat-popover absolute bottom-full right-0 mb-1.5 z-50 p-2 min-w-[140px] animate-scale-in">
          <div className="text-[10px] text-muted-foreground/60 mb-1.5 px-1">{readByLabel}</div>
          {readers.map((r) => {
            const profile = userProfiles[r];
            const isOnline = onlineUsers.includes(r);
            return (
              <div key={r} className="flex items-center gap-2 px-1 py-0.5 text-xs text-foreground/80">
                <span className={`relative flex-shrink-0 h-4 w-4 rounded-full ${profile?.avatar_url ? '' : 'bg-muted'} overflow-hidden`}>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[7px] font-medium">
                      {(profile?.display_name || r)[0].toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="truncate">{profile?.display_name || r}</span>
                {isOnline && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-green-400 flex-shrink-0" title={onlineLabel} />}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
