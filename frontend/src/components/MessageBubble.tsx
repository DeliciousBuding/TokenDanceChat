import { memo, useMemo, useCallback, useState, useRef, useEffect } from "react";
import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Forward } from "lucide-react";
import { cn, formatTime, avatarGradient, usernameHue } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { chatAPI } from "@/lib/api";
import { playReactionSound } from "@/lib/sound";
import { EmojiPicker } from "@/components/EmojiPicker";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { ChatMessage, LinkPreviewData } from "@/lib/api";

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
  /** Callback for forward action */
  onForward?: (message: ChatMessage) => void;
  /** Number of replies to this message */
  replyCount?: number;
  /** Multi-select mode: whether the bubble is in selection mode */
  selectMode?: boolean;
  /** Multi-select mode: whether this message is currently selected */
  isSelected?: boolean;
  /** Multi-select mode: callback to toggle selection */
  onToggleSelect?: (id: string) => void;
  /** Long-press callback to enter select mode */
  onLongPress?: (id: string) => void;
}

/** Simple code block renderer with syntax highlighting and copy button */

/** Helper: detect if a URL points to an audio file */
const AUDIO_EXT_RE = /\.(webm|ogg|mp3|wav|m4a)(\?.*)?$/i;
const isAudioUrl = (url: string): boolean => AUDIO_EXT_RE.test(url);
/** Regex: detect image file extensions to skip link preview */
const IMAGE_EXT_RE = /\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i;

/** Markdown components with link sanitization and audio player for voice messages */
const safeMarkdownComponents = {
  a: ({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) => {
    if (href && /^(javascript|data|vbscript):/i.test(href)) {
      return <span {...(props as ComponentPropsWithoutRef<'span'>)}>{children}</span>;
    }
    if (href && isAudioUrl(href)) {
      return (
        <div className="flex items-center gap-2 my-1">
          <audio controls src={href} className="h-8 max-w-[240px]">
            <track kind="captions" />
          </audio>
        </div>
      );
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
  },
  img: ({ src, alt, ...props }: ComponentPropsWithoutRef<'img'>) => {
    if (src && isAudioUrl(src)) {
      return (
        <div className="flex items-center gap-2 my-1">
          <audio controls src={src} className="h-8 max-w-[240px]">
            <track kind="captions" />
          </audio>
        </div>
      );
    }
    return <img src={src} alt={alt} loading="lazy" className="max-w-full rounded" {...props} />;
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
    <div className="relative group/code my-2 rounded-lg overflow-hidden border border-border">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-muted px-3 py-1.5 border-b border-border">
        <span className="text-[10px] text-muted-foreground/60 font-mono uppercase tracking-wider">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/50 hover:text-foreground hover:bg-accent opacity-0 group-hover/code:opacity-100 transition-opacity"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? t("message.copied") : t("message.copy")}</span>
        </button>
      </div>
      {/* Code content */}
      <pre className="!bg-muted !p-3 !m-0 overflow-x-auto text-[0.8125rem] leading-relaxed">
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
  onForward,
  replyCount = 0,
  selectMode = false,
  isSelected = false,
  onToggleSelect,
  onLongPress,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const setSelectedProfileUser = useChatStore((s) => s.setSelectedProfileUser);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [recentlyToggledReaction, setRecentlyToggledReaction] = useState<string | null>(null);
  const isDeleted = message.deleted === true;
  // Link preview: fetch OpenGraph metadata for URLs in message content
  const [linkPreview, setLinkPreview] = useState<LinkPreviewData | null>(null);
  const linkPreviewCache = useRef<Map<string, LinkPreviewData | null>>(new Map());

  useEffect(() => {
    if (isDeleted) return;
    const urlMatch = message.content.match(/https?:\/\/[^\s)]+/);
    if (!urlMatch) {
      setLinkPreview(null);
      return;
    }
    const url = urlMatch[0];
    // Skip image URLs
    if (IMAGE_EXT_RE.test(url)) {
      setLinkPreview(null);
      return;
    }

    // Check cache first to avoid re-fetching the same URL
    const cached = linkPreviewCache.current.get(url);
    if (cached !== undefined) {
      setLinkPreview(cached);
      return;
    }

    let cancelled = false;
    chatAPI.fetchLinkPreview(url).then((preview) => {
      if (cancelled) return;
      linkPreviewCache.current.set(url, preview);
      if (preview?.title) {
        setLinkPreview(preview);
      } else {
        setLinkPreview(null);
      }
    });
    return () => { cancelled = true; };
  }, [message.content, isDeleted]);

  const handleAddReaction = useCallback(
    (emoji: string) => {
      playReactionSound();
      chatAPI.sendReaction(message.id, emoji);
      setRecentlyToggledReaction(emoji);
      setTimeout(() => setRecentlyToggledReaction(null), 250);
    },
    [message.id],
  );

  // Long-press detection for entering select mode
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const handlePointerDown = useCallback(() => {
    if (selectMode || isDeleted) return;
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress?.(message.id);
    }, 500);
  }, [selectMode, isDeleted, onLongPress]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  const handleBubbleClick = useCallback(
    (e: React.MouseEvent) => {
      if (selectMode && onToggleSelect) {
        e.preventDefault();
        e.stopPropagation();
        onToggleSelect(message.id);
      }
    },
    [selectMode, onToggleSelect],
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

  const gradient = useMemo(
    () => avatarGradient(message.username),
    [message.username],
  );
  const hue = useMemo(
    () => usernameHue(message.username),
    [message.username],
  );
  const nameColor = `oklch(72% 0.16 ${hue})`;
  const bubbleBg = `oklch(72% 0.16 ${hue} / 0.10)`;
  const bubbleBorder = `oklch(72% 0.16 ${hue} / 0.18)`;

  const handleAvatarClick = useCallback(() => {
    if (selectMode) return;
    setSelectedProfileUser(message.username);
  }, [message.username, setSelectedProfileUser, selectMode]);

  const handleNameClick = useCallback(() => {
    if (selectMode) return;
    setSelectedProfileUser(message.username);
  }, [message.username, setSelectedProfileUser, selectMode]);

  // Parse @mentions and render with highlighting.
  const mentionContent = useMemo(() => {
    const content = isDeleted
      ? t("chat.deletedMessage")
      : message.content;
    if (isDeleted) {
      return (
        <span className="italic text-muted-foreground/50 line-through">
          {content}
        </span>
      );
    }

    // Detect audio URLs for voice messages
    const audioMatch = content.match(/!?\[(?:audio|voice)\]\(([^)]+)\)/);
    const audioUrl = audioMatch?.[1] || null;
    const isAudio = audioUrl && AUDIO_EXT_RE.test(audioUrl);

    if (isAudio && audioUrl) {
      return (
        <div className="flex items-center gap-2 my-1">
          <audio controls src={audioUrl} className="h-8 max-w-[240px] audio-player-compact">
            <track kind="captions" />
          </audio>
        </div>
      );
    }

    const mentionRegex = /@([\p{L}\p{N}_]+)/gu;
    const parts: (
      | { type: "text"; value: string }
      | { type: "mention"; username: string }
    )[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: "text",
          value: content.slice(lastIndex, match.index),
        });
      }
      parts.push({ type: "mention", username: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push({ type: "text", value: content.slice(lastIndex) });
    }

    if (parts.length === 0) {
      // No mentions, check for code blocks.
      const codeParts = parseContentForCodeBlocks(content);
      if (codeParts.length === 1 && codeParts[0].type === "text") {
        // No code blocks: render with ReactMarkdown.
        return (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={safeMarkdownComponents}>{content}</ReactMarkdown>
        );
      }

      // Has code blocks: render parts.
      return (
        <>
          {codeParts.map((part, i) => {
            if (part.type === "code") {
              return (
                <CodeBlock
                  key={i}
                  language={part.language}
                  code={part.code}
                />
              );
            }
            return (
              <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={safeMarkdownComponents}>
                {part.value}
              </ReactMarkdown>
            );
          })}
        </>
      );
    }

    // Has mentions: render parts with mentions and code blocks.
    return (
      <>
        {parts.map((part, i) => {
          if (part.type === "mention") {
            const isSelfMention = currentUsername === part.username;
            return (
              <button
                key={i}
                onClick={() => setSelectedProfileUser(part.username)}
                className={cn(
                  "hover:underline cursor-pointer",
                  isSelfMention ? "mention-self" : "mention-other",
                )}
                style={{
                  color: "oklch(71.2% 0.194 13.428)",
                  fontWeight: 500,
                  ...(isSelfMention
                    ? {
                        backgroundColor: "oklch(71.2% 0.194 13.428 / 0.12)",
                        borderRadius: "3px",
                        padding: "0 2px",
                      }
                    : {}),
                }}
              >
                @{part.username}
              </button>
            );
          }
          // Text parts: may contain code blocks.
          const subParts = parseContentForCodeBlocks(part.value);
          return (
            <span key={i}>
              {subParts.map((sp, j) => {
                if (sp.type === "code") {
                  return (
                    <CodeBlock
                      key={j}
                      language={sp.language}
                      code={sp.code}
                    />
                  );
                }
                return (
                  <ReactMarkdown key={j} remarkPlugins={[remarkGfm]} components={safeMarkdownComponents}>
                    {sp.value}
                  </ReactMarkdown>
                );
              })}
            </span>
          );
        })}
      </>
    );
  }, [message.content, currentUsername, isDeleted, t]);

  const paddingY =
    isGrouped && hideAvatar ? "py-0.5" : "py-1.5";

  return (
    <>
      <div
      id={`msg-${message.id}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={clearLongPress}
      onClick={handleBubbleClick}
      className={cn(
        "group flex gap-3 px-4 animate-slide-up scroll-mt-16",
        isOwn ? "justify-end" : "justify-start",
        paddingY,
        selectMode && "cursor-pointer",
        isSelected && "bg-primary/5",
      )}
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
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="oklch(71.2% 0.194 13.428)" stroke="oklch(71.2% 0.194 13.428)" strokeWidth="2" />
                <polyline points="8 12 11 15 16 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/40" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Reply button (left side, appears on hover) */}
      {!selectMode && !isDeleted && onReply && !hideUsername && (
        <div
          className={cn(
            "flex items-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0",
            isOwn ? "order-last" : "-mr-1",
          )}
        >
          <button
            onClick={() => onReply(message)}
            aria-label={t("input.replyTo")}
            className="rounded-md p-1 text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 17 4 12 9 7" />
              <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
            </svg>
          </button>
        </div>
      )}

      {/* Avatar for others */}
      {!isOwn && !hideAvatar && (
        <div className="mt-0.5 flex-shrink-0">
          <button
            onClick={handleAvatarClick}
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-1 ring-white/10 hover:ring-white/30 hover:scale-110 transition-all cursor-pointer"
            style={{ background: gradient }}
            aria-label={`View ${message.username}'s profile`}
          >
            {message.username.charAt(0).toUpperCase()}
          </button>
        </div>
      )}

      {!isOwn && hideAvatar && (
        <div className="w-8 flex-shrink-0" aria-hidden="true" />
      )}

      <div
        className={cn(
          "flex min-w-0 max-w-[min(75%,42rem)] flex-col",
          isOwn ? "items-end" : "items-start",
        )}
      >
        {!hideUsername && (
          <div
            className={cn(
              "mb-1 flex items-baseline gap-2",
              isOwn ? "justify-end" : "justify-start",
            )}
          >
            {!isOwn && (
              <button
                onClick={handleNameClick}
                className="text-xs font-medium hover:underline cursor-pointer"
                style={{ color: nameColor }}
              >
                {message.username}
              </button>
            )}
            {isOwn && !isGrouped && (
              <span className="text-xs text-muted-foreground/60">
                {formatTime(message.timestamp)}
                {message.edited && (
                  <span className="text-[10px] text-muted-foreground/40 ml-1">
                    {t("message.edited")}
                  </span>
                )}
              </span>
            )}
            {!isOwn && !isGrouped && (
              <span className="text-[10px] text-muted-foreground/50">
                {formatTime(message.timestamp)}
              </span>
            )}

            {/* Edit & Delete buttons for own messages (on hover) */}
            {!selectMode && isOwn && !isDeleted && (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => { setIsEditing(true); setEditContent(message.content); }}
                  aria-label="Edit message"
                  className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground/30 hover:text-foreground hover:bg-accent transition-all"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                {onDelete && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Delete message"
                    className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Reply preview (quoted message) — clickable to jump to original */}
        {!selectMode && (message.reply_to_id || message.reply_to_content) && (
          <div
            className="mb-1 ml-0 border-l-2 border-[hsl(220,2.5%,30%)] pl-2 py-0.5 rounded-sm bg-card cursor-pointer hover:border-[hsl(220,2.5%,45%)] transition-colors"
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
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed relative",
            isOwn
              ? "rounded-br-md"
              : "rounded-bl-md bg-secondary",
            isDeleted && "opacity-40",
          )}
          style={
            isOwn
              ? {
                  backgroundColor: bubbleBg,
                  border: `1px solid ${bubbleBorder}`,
                }
              : {
                  border: "1px solid hsl(220,2.5%,22%)",
                }
          }
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
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-[hsl(220,2.5%,35%)] focus:ring-1 focus:ring-[hsl(220,2.5%,35%)] resize-none"
                style={{ minHeight: "60px", scrollbarWidth: "thin" }}
                autoFocus
              />
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[10px] text-muted-foreground/50 flex-1">
                  {t("input.escapeToCancel")}
                </span>
                <button
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
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
                  className="rounded-lg px-3 py-1 text-xs font-medium text-white transition-colors"
                  style={{ backgroundColor: "oklch(71.2% 0.194 13.428)" }}
                >
                  {t("input.save")}
                </button>
              </div>
            </div>
          ) : (
            <div className="markdown-body text-foreground/90">
              {mentionContent}
            </div>
          )}

          {/* Link preview card — inline OG metadata preview below message text */}
          {!isEditing && linkPreview && (
            <a
              href={linkPreview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block rounded-lg border border-border overflow-hidden hover:border-[hsl(220,2.5%,35%)] transition-colors no-underline"
              onClick={(e) => e.stopPropagation()}
            >
              {linkPreview.image && (
                <img
                  src={linkPreview.image}
                  alt={linkPreview.title || "Link preview"}
                  loading="lazy"
                  className="w-full h-32 object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="p-2.5">
                <div className="text-xs font-medium text-foreground/80 truncate">
                  {linkPreview.title}
                </div>
                {linkPreview.description && (
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5 line-clamp-2">
                    {linkPreview.description}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground/40 mt-1 truncate">
                  {new URL(linkPreview.url).hostname}
                </div>
              </div>
            </a>
          )}
                    {/* Forward button (appears on hover) */}
          {!selectMode && onForward && (
            <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onForward(message);
                }}
                className="flex items-center gap-1 rounded-lg bg-accent border border-[hsl(220,2.5%,28%)] px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-[hsl(231,4%,26%)] transition-colors shadow-md"
                aria-label={t("message.forward")}
              >
                <Forward className="h-3 w-3" />
                {t("message.forward")}
              </button>
            </div>
          )}
        </div>

        {/* Reaction bar */}
        {!isDeleted && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-1 mt-0.5 transition-opacity",
              (!message.reactions || Object.values(message.reactions).every((users) => users.length === 0)) && replyCount === 0
                ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                : "opacity-100",
            )}
          >
            {replyCount > 0 && (
              <button
                onClick={selectMode ? undefined : () => {
                  const el = document.getElementById(`msg-${message.id}`);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                  // Dispatch event to filter thread view.
                  window.dispatchEvent(
                    new CustomEvent("tdchat:view-thread", { detail: { messageId: message.id } }),
                  );
                }}
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs border border-[hsl(220,2.5%,20%)] bg-card hover:bg-accent transition-colors text-muted-foreground/70"
                aria-label={`${replyCount} replies`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 17 4 12 9 7" />
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                </svg>
                <span className="text-[10px]">{replyCount}</span>
              </button>
            )}
            {message.reactions &&
              Object.entries(message.reactions).map(
                ([emoji, users]) =>
                  users.length > 0 && (
                    <button
                      key={emoji}
                      onClick={selectMode ? undefined : () =>
                        handleAddReaction(emoji)
                      }
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs border border-[hsl(220,2.5%,20%)] bg-card hover:bg-accent transition-colors",
                        currentUsername &&
                          users.includes(currentUsername) &&
                          "border-[hsl(220,2.5%,30%)] bg-[hsl(231,4%,24%)]",
                        recentlyToggledReaction === emoji && "animate-pop",
                      )}
                      aria-label={`${emoji} ${users.length} reactions`}
                      title={users.join(", ")}
                    >
                      <span className="text-sm leading-none">{emoji}</span>
                      <span className="text-[10px] text-muted-foreground/70">
                        {users.length}
                      </span>
                    </button>
                  ),
              )}
            {!selectMode && (
              <>
                <button
                  onClick={() => setShowEmojiPicker(true)}
                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs border border-transparent hover:border-[hsl(220,2.5%,20%)] hover:bg-card text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
                  aria-label="Add reaction"
                >
                  <span className="text-xs">+</span>
                </button>
                <button
                  onClick={() => chatAPI.sendPinMessage(message.id)}
                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs border border-transparent hover:border-[hsl(220,2.5%,20%)] hover:bg-card text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
                  aria-label="Pin message"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22" />
                    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                  </svg>
                </button>
              </>
            )}
          </div>
        )}

        {showEmojiPicker && (
          <EmojiPicker
            onSelect={(emoji) => handleAddReaction(emoji)}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}

        {isOwn && (
          <div className="mt-1 flex justify-end items-center gap-1">
            {/* Delivery status icons */}
            {message.read_by && message.read_by.length > 0 ? (
              <svg
                width="16"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-blue-400/70"
                aria-label={t("message.read")}
              >
                <polyline points="20 6 9 17 4 12" />
                <polyline points="22 6 13 17 8 12" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground/40"
                aria-label={t("message.sent")}
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            <span
              className={cn(
                "text-[10px] text-muted-foreground/50 transition-opacity",
                forceShowTimestamp
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
            >
              {formatTime(message.timestamp)}
              {message.edited && (
                <span className="text-[10px] text-muted-foreground/40 ml-1">
                  (edited)
                </span>
              )}
            </span>
          </div>
        )}

        {!isOwn && forceShowTimestamp && (
          <div className="mt-1 flex justify-start">
            <span className="text-[10px] text-muted-foreground/50">
              {formatTime(message.timestamp)}
            </span>
          </div>
        )}
      </div>

      {isOwn && !hideAvatar && (
        <div className="mt-0.5 flex-shrink-0">
          <button
            onClick={handleAvatarClick}
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-1 ring-white/10 hover:ring-white/30 hover:scale-110 transition-all cursor-pointer"
            style={{ background: gradient }}
            aria-label={`View ${message.username}'s profile`}
          >
            {message.username.charAt(0).toUpperCase()}
          </button>
        </div>
      )}

      {isOwn && hideAvatar && (
        <div className="w-8 flex-shrink-0" aria-hidden="true" />
      )}
    </div>
        <ConfirmDialog
          open={confirmDelete}
          title={t("message.deleteConfirm")}
          message={t("message.deleteWarning")}
          confirmLabel={t("message.delete")}
          variant="destructive"
          onConfirm={() => { onDelete?.(message.id); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
        />
      </>
    );
});
