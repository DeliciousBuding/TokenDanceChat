import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "@/stores/chatStore";
import { MessageBubble } from "./MessageBubble";
import { SystemMessage } from "./SystemMessage";
import { cn } from "@/lib/utils";

interface MessageTranscriptProps {
  className?: string;
}

export function MessageTranscript({ className }: MessageTranscriptProps) {
  const { messages, username, historyLoaded } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Detect if user has scrolled up
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShouldAutoScroll(distanceFromBottom < 120);
  }, []);

  // Auto-scroll to bottom when new messages arrive (if near bottom)
  useEffect(() => {
    if (shouldAutoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, shouldAutoScroll]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn(
        "flex-1 overflow-y-auto",
        "scrollbar-thin",
        className,
      )}
    >
      {!historyLoaded ? (
        /* Loading skeleton */
        <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-2 w-2 rounded-full animate-pulse"
                style={{
                  backgroundColor: "oklch(71.2% 0.194 13.428 / 0.6)",
                  animationDelay: `${i * 150}ms`,
                }}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground/60">加载消息中...</p>
        </div>
      ) : messages.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center h-full py-12 px-4">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(231,4%,18%)] ring-1 ring-[hsl(220,2.5%,20%)]">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="hsl(240,2.5%,64.9%)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">
            暂无消息
          </h3>
          <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
            成为第一个发送消息的人吧！
          </p>
        </div>
      ) : (
        /* Messages */
        <div className="py-4">
          {messages.map((msg) =>
            msg.username === "system" ? (
              <SystemMessage
                key={msg.id}
                content={msg.content}
                timestamp={msg.timestamp}
              />
            ) : (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.username === username}
              />
            ),
          )}
          {/* Scroll anchor */}
          <div ref={bottomRef} className="h-1" />
        </div>
      )}

      {/* Scroll-to-bottom button (when scrolled up) */}
      {!shouldAutoScroll && messages.length > 0 && (
        <button
          onClick={() => {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            setShouldAutoScroll(true);
          }}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] px-4 py-2 text-xs text-muted-foreground shadow-lg hover:bg-[hsl(231,4%,20%)] hover:text-foreground transition-all animate-fade-in backdrop-blur-sm"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
          回到底部
        </button>
      )}
    </div>
  );
}
