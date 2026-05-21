import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ArrowDown } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { MessageBubble } from "./MessageBubble";
import { SystemMessage } from "./SystemMessage";
import { LinkPreview } from "./LinkPreview";
import { ImageLightbox } from "./ImageLightbox";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/api";

/** Maximum messages to render by default before showing the "load earlier" button. */
const MAX_VISIBLE_MESSAGES = 200;
/** Messages from the same user within this window (ms) are grouped together. */
const GROUP_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

interface MessageTranscriptProps {
  className?: string;
  onForward?: (message: ChatMessage) => void;
}

interface UserMessageGroup {
  type: "user";
  username: string;
  isOwn: boolean;
  messages: ChatMessage[];
}

interface SystemMessageGroup {
  type: "system";
  message: ChatMessage;
}

type MessageGroup = UserMessageGroup | SystemMessageGroup;

function buildMessageGroups(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const msg of messages) {
    if (msg.username === "system") {
      groups.push({ type: "system", message: msg });
      continue;
    }

    const last = groups[groups.length - 1];

    if (
      last?.type === "user" &&
      last.username === msg.username &&
      msg.timestamp - last.messages[last.messages.length - 1].timestamp < GROUP_WINDOW_MS
    ) {
      last.messages.push(msg);
    } else {
      groups.push({
        type: "user",
        username: msg.username,
        isOwn: false,
        messages: [msg],
      });
    }
  }

  return groups;
}

export function MessageTranscript({ className }: MessageTranscriptProps) {
  const { t } = useTranslation();
  const { messages, username, historyLoaded, typingUsers } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevMessageCountRef = useRef(messages.length);

  // Truncate messages list to last MAX_VISIBLE_MESSAGES when not showing all.
  const visibleMessages = useMemo(() => {
    if (showAllMessages || messages.length <= MAX_VISIBLE_MESSAGES) {
      return messages;
    }
    return messages.slice(-MAX_VISIBLE_MESSAGES);
  }, [messages, showAllMessages]);

  const hiddenCount = messages.length - visibleMessages.length;

  // Build message groups with memoization.
  const groups = useMemo(() => {
    const raw = buildMessageGroups(visibleMessages);
    return raw.map((g) => {
      if (g.type === "user") {
        return { ...g, isOwn: g.username === username };
      }
      return g;
    });
  }, [visibleMessages, username]);

  // Track unread messages when scrolled up.
  useEffect(() => {
    const prev = prevMessageCountRef.current;
    const curr = messages.length;
    if (curr > prev && !shouldAutoScroll) {
      setUnreadCount((c) => c + (curr - prev));
    }
    if (shouldAutoScroll) {
      setUnreadCount(0);
    }
    prevMessageCountRef.current = curr;
  }, [messages.length, shouldAutoScroll]);

  // Detect if user has scrolled up.
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShouldAutoScroll(distanceFromBottom < 120);
  }, []);

  // Auto-scroll to bottom when new messages arrive (if near bottom).
  useEffect(() => {
    if (shouldAutoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [groups, shouldAutoScroll]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShouldAutoScroll(true);
    setUnreadCount(0);
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn(
        "flex-1 overflow-y-auto",
        "scrollbar-thin",
        className,
      )}
      style={{ willChange: "transform" }}
    >
      {!historyLoaded ? (
        /* Loading skeleton */
        <div className="flex flex-col items-center justify-center h-full gap-3 py-12" role="status" aria-label={t("transcript.loading")}>
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
          <p className="text-xs text-muted-foreground/60">{t("transcript.loading")}</p>
        </div>
      ) : messages.length === 0 ? (
        /* Empty state with animated chat bubble */
        <div className="flex flex-col items-center justify-center h-full py-12 px-4">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(231,4%,18%)] ring-1 ring-[hsl(220,2.5%,20%)] animate-chat-bubble">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="oklch(71.2% 0.194 13.428 / 0.6)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">
            {t("transcript.emptyTitle")}
          </h3>
          <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
            {t("transcript.emptyDescription")}
          </p>
        </div>
      ) : (
        /* Messages */
        <div
          role="log"
          aria-live="polite"
          aria-label={t("chat.roomName")}
          className="py-4"
        >
          {/* "Load earlier messages" button when truncated */}
          {hiddenCount > 0 && (
            <div className="flex justify-center pb-3">
              <button
                onClick={() => setShowAllMessages(true)}
                className="rounded-full border border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] px-4 py-1.5 text-xs text-muted-foreground hover:bg-[hsl(231,4%,20%)] hover:text-foreground transition-all"
              >
                {t("transcript.newMessages", { count: hiddenCount })}
              </button>
            </div>
          )}

          {groups.map((group) => {
            if (group.type === "system") {
              return (
                <SystemMessage
                  key={group.message.id}
                  content={group.message.content}
                  timestamp={group.message.timestamp}
                />
              );
            }

            // User message group
            const { messages: groupMessages, isOwn } = group;
            return (
              <div key={groupMessages[0].id} className="message-group">
                {groupMessages.map((msg, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === groupMessages.length - 1;
                  const isSolo = groupMessages.length === 1;

                  return (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isOwn={isOwn}
                      currentUsername={username}
                      hideAvatar={!isFirst}
                      hideUsername={!isFirst}
                      forceShowTimestamp={isLast}
                      isGrouped={!isSolo}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* Typing indicator */}
          {typingUsers.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-1 animate-fade-in">
              <div className="flex items-center gap-1">
                <span className="typing-dot" />
                <span className="typing-dot animation-delay-150" />
                <span className="typing-dot animation-delay-300" />
              </div>
              <span className="text-xs text-muted-foreground/60">
                {typingUsers
                  .map((u) => t("system.typing", { username: u }))
                  .join(", ")}
              </span>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={bottomRef} className="h-1" />
        </div>
      )}

      {/* Scroll-to-bottom button (when scrolled up) */}
      {!shouldAutoScroll && messages.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] px-4 py-2 text-xs text-muted-foreground shadow-lg hover:bg-[hsl(231,4%,20%)] hover:text-foreground transition-all animate-fade-in backdrop-blur-sm z-10"
          aria-label={t("transcript.scrollToBottom")}
        >
          <ArrowDown className="h-3.5 w-3.5" />
          {unreadCount > 0
            ? t("transcript.newMessages", { count: unreadCount })
            : t("transcript.scrollToBottom")}
        </button>
      )}
    </div>
  );
}
