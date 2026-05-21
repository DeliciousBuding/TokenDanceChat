import { memo, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, formatTime, avatarGradient, usernameHue } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import type { ChatMessage } from "@/lib/api";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  /** Current user's username, used for self-mention highlighting. */
  currentUsername?: string;
  /** Hide avatar (for grouped messages after the first) */
  hideAvatar?: boolean;
  /** Hide username header (for grouped messages after the first) */
  hideUsername?: boolean;
  /** Show timestamp on the bubble (only for last in group or solo) */
  forceShowTimestamp?: boolean;
  /** Whether this message is part of a group (adjusts spacing) */
  isGrouped?: boolean;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  currentUsername,
  hideAvatar = false,
  hideUsername = false,
  forceShowTimestamp = false,
  isGrouped = false,
}: MessageBubbleProps) {
  const setSelectedProfileUser = useChatStore((s) => s.setSelectedProfileUser);
  const gradient = useMemo(() => avatarGradient(message.username), [message.username]);
  const hue = useMemo(() => usernameHue(message.username), [message.username]);
  const nameColor = `oklch(72% 0.16 ${hue})`;
  const bubbleBg = `oklch(72% 0.16 ${hue} / 0.10)`;
  const bubbleBorder = `oklch(72% 0.16 ${hue} / 0.18)`;

  const handleAvatarClick = useCallback(() => {
    setSelectedProfileUser(message.username);
  }, [message.username, setSelectedProfileUser]);

  const handleNameClick = useCallback(() => {
    setSelectedProfileUser(message.username);
  }, [message.username, setSelectedProfileUser]);

  // Parse @mentions and render with highlighting.
  const mentionContent = useMemo(() => {
    const content = message.content;
    const mentionRegex = /@(\w+)/g;
    const parts: ({ type: "text"; value: string } | { type: "mention"; username: string })[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
      }
      parts.push({ type: "mention", username: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push({ type: "text", value: content.slice(lastIndex) });
    }

    if (parts.length === 0) {
      // No mentions, render normally with ReactMarkdown.
      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
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
          // For text parts, render with ReactMarkdown (inline).
          return <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>{part.value}</ReactMarkdown>;
        })}
      </>
    );
  }, [message.content, currentUsername]);

  // In a group, non-first messages get tighter top padding
  const paddingY = isGrouped && hideAvatar ? "py-0.5" : "py-1.5";

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 animate-slide-up",
        isOwn ? "justify-end" : "justify-start",
        paddingY,
      )}
    >
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

      {/* Spacer (replaces hidden avatar to keep alignment) */}
      {!isOwn && hideAvatar && <div className="w-8 flex-shrink-0" aria-hidden="true" />}

      <div className={cn("max-w-[75%]", isOwn ? "items-end" : "items-start")}>
        {/* Username + timestamp header */}
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
            {/* Timestamp in header: only for solo messages (not first in group) */}
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
          </div>
        )}

        {/* Message content bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isOwn
              ? "rounded-br-md"
              : "rounded-bl-md bg-[hsl(231,4%,18%)]",
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

        {/* Timestamp shown below bubble for own messages (hover) or last in group */}
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

        {/* Timestamp for others: show below bubble when forced (last in group) */}
        {!isOwn && forceShowTimestamp && (
          <div className="mt-1 flex justify-start">
            <span className="text-[10px] text-muted-foreground/50">
              {formatTime(message.timestamp)}
            </span>
          </div>
        )}
      </div>

      {/* Avatar for own messages */}
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

      {isOwn && hideAvatar && <div className="w-8 flex-shrink-0" aria-hidden="true" />}
    </div>
  );
});
