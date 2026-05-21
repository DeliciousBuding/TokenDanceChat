import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, formatTime } from "@/lib/utils";
import { useTouchGestures } from "@/hooks/useTouchGestures";
import type { ChatMessage } from "@/lib/api";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  currentUsername?: string;
  hideAvatar?: boolean;
  hideUsername?: boolean;
  forceShowTimestamp?: boolean;
  isGrouped?: boolean;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onLongPress?: () => void;
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
  onSwipeLeft,
  onSwipeRight,
  onLongPress,
}: MessageBubbleProps) {
  const gradient = useMemo(() => avatarGradient(message.username), [message.username]);
  const hue = useMemo(() => usernameHue(message.username), [message.username]);
  const nameColor = `oklch(72% 0.16 ${hue})`;
  const bubbleBg = `oklch(72% 0.16 ${hue} / 0.10)`;
  const bubbleBorder = `oklch(72% 0.16 ${hue} / 0.18)`;

  const touchHandlers = useTouchGestures({
    onSwipeLeft,
    onSwipeRight,
    onLongPress,
  });

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
          return <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>{part.value}</ReactMarkdown>;
        })}
      </>
    );
  }, [message.content, currentUsername]);

  const paddingY = isGrouped && hideAvatar ? "py-0.5" : "py-1.5";

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 animate-slide-up select-none",
        isOwn ? "justify-end" : "justify-start",
        paddingY,
      )}
      {...touchHandlers}
    >
      {!isOwn && !hideAvatar && (
        <div className="mt-0.5 flex-shrink-0">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-1 ring-white/10"
            style={{ background: gradient }}
            aria-hidden="true"
          >
            {message.username.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {!isOwn && hideAvatar && <div className="w-8 flex-shrink-0" aria-hidden="true" />}

      <div className={cn("max-w-[75%]", isOwn ? "items-end" : "items-start")}>
        {!hideUsername && (
          <div
            className={cn(
              "mb-1 flex items-baseline gap-2",
              isOwn ? "justify-end" : "justify-start",
            )}
          >
            {!isOwn && (
              <span
                className="text-xs font-medium"
                style={{ color: nameColor }}
              >
                {message.username}
              </span>
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
          </div>
        )}

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
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-1 ring-white/10"
            style={{ background: gradient }}
            aria-hidden="true"
          >
            {message.username.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {isOwn && hideAvatar && <div className="w-8 flex-shrink-0" aria-hidden="true" />}
    </div>
  );
});
