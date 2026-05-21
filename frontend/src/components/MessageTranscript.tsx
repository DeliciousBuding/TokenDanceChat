import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ArrowDown, Reply, Copy, Trash2, Forward } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { usePullDownGesture } from "@/hooks/useTouchGestures";
import { MessageBubble } from "./MessageBubble";
import { SystemMessage } from "./SystemMessage";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/api";

const MAX_VISIBLE_MESSAGES = 200;
const GROUP_WINDOW_MS = 2 * 60 * 1000;

interface MessageTranscriptProps {
  className?: string;
  onReplyToMessage?: (message: ChatMessage) => void;
  onDeleteMessage?: (messageId: string) => void;
  onForwardMessage?: (content: string) => void;
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
      groups.push({ type: "user", username: msg.username, isOwn: false, messages: [msg] });
    }
  }
  return groups;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  message: ChatMessage | null;
  isOwn: boolean;
}

export function MessageTranscript({
  className,
  onReplyToMessage,
  onDeleteMessage,
  onForwardMessage,
}: MessageTranscriptProps) {
  const { t } = useTranslation();
  const { messages, username, historyLoaded, typingUsers } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const prevMessageCountRef = useRef(messages.length);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false, x: 0, y: 0, message: null, isOwn: false,
  });

  const visibleMessages = useMemo(() => {
    if (showAllMessages || messages.length <= MAX_VISIBLE_MESSAGES) return messages;
    return messages.slice(-MAX_VISIBLE_MESSAGES);
  }, [messages, showAllMessages]);

  const hiddenCount = messages.length - visibleMessages.length;

  const groups = useMemo(() => {
    const raw = buildMessageGroups(visibleMessages);
    return raw.map((g) => {
      if (g.type === "user") return { ...g, isOwn: g.username === username };
      return g;
    });
  }, [visibleMessages, username]);

  useEffect(() => {
    const prev = prevMessageCountRef.current;
    const curr = messages.length;
    if (curr > prev && !shouldAutoScroll) setUnreadCount((c) => c + (curr - prev));
    if (shouldAutoScroll) setUnreadCount(0);
    prevMessageCountRef.current = curr;
  }, [messages.length, shouldAutoScroll]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShouldAutoScroll(distanceFromBottom < 120);
  }, []);

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

  const handleLoadOlder = useCallback(() => {
    if (!showAllMessages && hiddenCount > 0) {
      setIsLoadingMore(true);
      setShowAllMessages(true);
      setTimeout(() => setIsLoadingMore(false), 500);
    }
  }, [showAllMessages, hiddenCount]);

  const pullDownHandlers = usePullDownGesture(containerRef, { onPullDown: handleLoadOlder }, isLoadingMore);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  const createLongPressHandler = useCallback(
    (message: ChatMessage, isOwn: boolean) => {
      return () => {
        const x = window.innerWidth / 2;
        const y = window.innerHeight / 2;
        setContextMenu({ visible: true, x, y, message, isOwn });
      };
    },
    [],
  );

  const handleContextReply = useCallback(() => {
    if (contextMenu.message && onReplyToMessage) onReplyToMessage(contextMenu.message);
    closeContextMenu();
  }, [contextMenu.message, onReplyToMessage, closeContextMenu]);

  const handleContextCopy = useCallback(() => {
    if (contextMenu.message) navigator.clipboard.writeText(contextMenu.message.content).catch(() => {});
    closeContextMenu();
  }, [contextMenu.message, closeContextMenu]);

  const handleContextDelete = useCallback(() => {
    if (contextMenu.message && onDeleteMessage) onDeleteMessage(contextMenu.message.id);
    closeContextMenu();
  }, [contextMenu.message, onDeleteMessage, closeContextMenu]);

  const handleContextForward = useCallback(() => {
    if (contextMenu.message && onForwardMessage) onForwardMessage(contextMenu.message.content);
    closeContextMenu();
  }, [contextMenu.message, onForwardMessage, closeContextMenu]);

  const menuStyle = useMemo(() => {
    const menuWidth = 180;
    const menuHeight = 160;
    let { x, y } = contextMenu;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    return { left: x, top: y };
  }, [contextMenu]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn("flex-1 overflow-y-auto relative scrollbar-thin", className)}
      style={{ willChange: "transform" }}
      {...pullDownHandlers}
    >
      {isLoadingMore && (
        <div className="flex justify-center py-2">
          <svg className="pull-down-spinner h-4 w-4 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
        </div>
      )}

      {!historyLoaded ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 py-12" role="status" aria-label={t("transcript.loading")}>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: "oklch(71.2% 0.194 13.428 / 0.6)", animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground/60">{t("transcript.loading")}</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full py-12 px-4">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(231,4%,18%)] ring-1 ring-[hsl(220,2.5%,20%)] animate-chat-bubble">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="oklch(71.2% 0.194 13.428 / 0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">{t("transcript.emptyTitle")}</h3>
          <p className="text-xs text-muted-foreground/60 text-center max-w-xs">{t("transcript.emptyDescription")}</p>
        </div>
      ) : (
        <div role="log" aria-live="polite" aria-label={t("chat.roomName")} className="py-4">
          {hiddenCount > 0 && (
            <div className="flex justify-center pb-3">
              <button
                onClick={() => { setShowAllMessages(true); setIsLoadingMore(false); }}
                className="touch-target rounded-full border border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] px-4 py-1.5 text-xs text-muted-foreground hover:bg-[hsl(231,4%,20%)] hover:text-foreground transition-all"
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
                      onSwipeRight={isOwn ? undefined : (() => onReplyToMessage?.(msg))}
                      onSwipeLeft={isOwn ? (() => onDeleteMessage?.(msg.id)) : undefined}
                      onLongPress={createLongPressHandler(msg, isOwn)}
                    />
                  );
                })}
              </div>
            );
          })}

          {typingUsers.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-1 animate-fade-in">
              <div className="flex items-center gap-1">
                <span className="typing-dot" />
                <span className="typing-dot animation-delay-150" />
                <span className="typing-dot animation-delay-300" />
              </div>
              <span className="text-xs text-muted-foreground/60">
                {typingUsers.map((u) => t("system.typing", { username: u })).join(", ")}
              </span>
            </div>
          )}

          <div ref={bottomRef} className="h-1" />
        </div>
      )}

      {/* FAB scroll-to-bottom (mobile) */}
      {!shouldAutoScroll && messages.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="fab animate-fade-in md:hidden"
          style={{ background: "oklch(71.2% 0.194 13.428)", color: "#fff" }}
          aria-label={t("transcript.scrollToBottom")}
        >
          <ArrowDown className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Desktop scroll-to-bottom */}
      {!shouldAutoScroll && messages.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="hidden md:flex absolute bottom-4 left-1/2 -translate-x-1/2 items-center gap-1.5 rounded-full border border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,16%)] px-4 py-2 text-xs text-muted-foreground shadow-lg hover:bg-[hsl(231,4%,20%)] hover:text-foreground transition-all animate-fade-in backdrop-blur-sm z-10"
          aria-label={t("transcript.scrollToBottom")}
        >
          <ArrowDown className="h-3.5 w-3.5" />
          {unreadCount > 0 ? t("transcript.newMessages", { count: unreadCount }) : t("transcript.scrollToBottom")}
        </button>
      )}

      {/* Context menu */}
      {contextMenu.visible && (
        <>
          <div className="context-menu-backdrop" onClick={closeContextMenu} onTouchEnd={closeContextMenu} />
          <div className="context-menu border border-[hsl(220,2.5%,23.5%)] bg-[hsl(231,4%,14%)] shadow-2xl" style={menuStyle}>
            <button onClick={handleContextReply} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground/80 hover:bg-[hsl(220,2.5%,18%)] hover:text-foreground touch-target">
              <Reply className="h-4 w-4 text-muted-foreground" />
              <span>{t("input.replyTo")}</span>
            </button>
            <button onClick={handleContextCopy} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground/80 hover:bg-[hsl(220,2.5%,18%)] hover:text-foreground touch-target">
              <Copy className="h-4 w-4 text-muted-foreground" />
              <span>Copy</span>
            </button>
            {contextMenu.isOwn && (
              <button onClick={handleContextDelete} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-destructive/80 hover:bg-[hsl(0,62%,20%)] hover:text-destructive touch-target">
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </button>
            )}
            <button onClick={handleContextForward} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground/80 hover:bg-[hsl(220,2.5%,18%)] hover:text-foreground touch-target">
              <Forward className="h-4 w-4 text-muted-foreground" />
              <span>Forward</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
