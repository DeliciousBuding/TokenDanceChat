import { memo, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, formatTime } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import type { ChatMessage } from "@/lib/api";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  currentUsername?: string;
  hideAvatar?: boolean;
  hideUsername?: boolean;
  forceShowTimestamp?: boolean;
  isGrouped?: boolean;
  /** Callback when reply button is clicked */
  onReply?: (message: ChatMessage) => void;
  /** Callback when delete button is clicked */
  onDelete?: (messageId: string) => void;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function avatarGradient(username: string): string {
  const baseHue = hashString(username) % 360;
  const hue1 = baseHue;
  const hue2 = (baseHue + 45) % 360;
  return `linear-gradient(135deg, oklch(65% 0.16 ${hue1}), oklch(58% 0.14 ${hue2}))`;
}

function usernameHue(username: string): number {
  return hashString(username) % 360;
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
}: MessageBubbleProps) {
  const { t } = useTranslation();
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

  const isDeleted = message.deleted === true;

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

    const mentionRegex = /@(\w+)/g;
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
      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      );
    }

    return (
      <>
        {parts.map((part, i) => {
          if (part.type === "mention") {
            const isSelfMention = currentUsername === part.username;
            return (
              <span
                key={i}
                className={isSelfMention ? "mention-self" : "mention-other"}
                style={{
                  color: "oklch(71.2% 0.194 13.428)",
                  fontWeight: 500,
                  cursor: "pointer",
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
              </span>
            );
          }
          return (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
              {part.value}
            </ReactMarkdown>
          );
        })}
      </>
    );
  }, [message.content, currentUsername, isDeleted, t]);

  const paddingY =
    isGrouped && hideAvatar ? "py-0.5" : "py-1.5";

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 animate-slide-up select-none",
        isOwn ? "justify-end" : "justify-start",
        paddingY,
      )}
      {...touchHandlers}
    >
      {/* Reply button (left side, appears on hover) */}
      {!isDeleted && onReply && !hideUsername && (
        <div
          className={cn(
            "flex items-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0",
            isOwn ? "order-last" : "-mr-1",
          )}
        >
          <button
            onClick={() => onReply(message)}
            aria-label={t("input.replyTo")}
            className="rounded-md p-1 text-muted-foreground/40 hover:text-muted-foreground hover:bg-[hsl(220,2.5%,18%)] transition-colors"
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

      <div className={cn("max-w-[75%]", isOwn ? "items-end" : "items-start")}>
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
              </span>
            )}
            {!isOwn && !isGrouped && (
              <span className="text-[10px] text-muted-foreground/50">
                {formatTime(message.timestamp)}
              </span>
            )}

            {/* Delete button for own messages (on hover) */}
            {isOwn && !isDeleted && onDelete && (
              <button
                onClick={() => onDelete(message.id)}
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

        {/* Reply preview (quoted message) */}
        {(message.reply_to_id || message.reply_to_content) && (
          <div className="mb-1 ml-0 border-l-2 border-[hsl(220,2.5%,30%)] pl-2 py-0.5 rounded-sm bg-[hsl(231,4%,14%)]">
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
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isOwn
              ? "rounded-br-md"
              : "rounded-bl-md bg-[hsl(231,4%,18%)]",
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
          <div className="markdown-body text-foreground/90">
            {mentionContent}
          </div>
        </div>

        {isOwn && (
          <div className="mt-1 flex justify-end">
            <span
              className={cn(
                "text-[10px] text-muted-foreground/50 transition-opacity",
                forceShowTimestamp
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
            >
              {formatTime(message.timestamp)}
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
  );
});
