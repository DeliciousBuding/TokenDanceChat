import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, formatTime } from "@/lib/utils";
import type { ChatMessage } from "@/lib/api";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
}

// Deterministic color from username
function usernameColor(username: string): string {
  const colors = [
    "oklch(71.2% 0.194 13.428)",   // coral/orange (accent)
    "oklch(68% 0.18 250)",          // blue
    "oklch(65% 0.16 160)",          // green
    "oklch(70% 0.17 310)",          // purple
    "oklch(72% 0.15 60)",           // yellow
    "oklch(67% 0.18 190)",          // teal
    "oklch(70% 0.16 350)",          // pink
    "oklch(66% 0.15 30)",           // orange-red
  ];

  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const color = useMemo(() => usernameColor(message.username), [message.username]);

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 py-1.5 animate-slide-up",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      {/* Avatar for others */}
      {!isOwn && (
        <div className="mt-0.5 flex-shrink-0">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ring-1 ring-white/5"
            style={{
              backgroundColor: `${color}20`,
              color: color,
              borderColor: `${color}30`,
            }}
          >
            {message.username.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      <div className={cn("max-w-[75%]", isOwn ? "items-end" : "items-start")}>
        {/* Username + timestamp */}
        <div
          className={cn(
            "mb-1 flex items-baseline gap-2",
            isOwn ? "justify-end" : "justify-start",
          )}
        >
          {!isOwn && (
            <span
              className="text-xs font-medium"
              style={{ color }}
            >
              {message.username}
            </span>
          )}
          {isOwn && (
            <span className="text-xs text-muted-foreground/60">
              {formatTime(message.timestamp)}
            </span>
          )}
          {!isOwn && (
            <span className="text-[10px] text-muted-foreground/50">
              {formatTime(message.timestamp)}
            </span>
          )}
        </div>

        {/* Message content */}
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
                  backgroundColor: `${color}18`,
                  border: `1px solid ${color}25`,
                }
              : {
                  border: "1px solid hsl(220,2.5%,22%)",
                }
          }
        >
          <div className="markdown-body text-foreground/90">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Timestamp for own messages at bottom */}
        {isOwn && (
          <div className="mt-1 flex justify-end">
            <span className="text-[10px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
              {formatTime(message.timestamp)}
            </span>
          </div>
        )}
      </div>

      {/* Avatar for own messages */}
      {isOwn && (
        <div className="mt-0.5 flex-shrink-0">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ring-1 ring-white/5"
            style={{
              backgroundColor: `${color}25`,
              color: color,
              borderColor: `${color}35`,
            }}
          >
            {message.username.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
}
