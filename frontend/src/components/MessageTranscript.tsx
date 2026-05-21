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
  onReply?: (message: ChatMessage) => void;
  onDelete?: (messageId: string) => void;
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

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  message: ChatMessage | null;
  isOwn: boolean;
}

function buildMessageGroups(messages: ChatMessage[], currentUsername: string): MessageGroup[] {
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
      !msg.deleted &&
      msg.timestamp - last.messages[last.messages.length - 1].timestamp <
        GROUP_WINDOW_MS
    ) {
      last.messages.push(msg);
    } else {
      groups.push({
        type: "user",
        username: msg.username,
        isOwn: msg.username === currentUsername,
        messages: [msg],
      });
    }
  }
  return groups;
}

/**
 * Decode a system message JSON payload into a human-readable string.
 * Falls back to the raw content if parsing fails.
 */
function decodeSystemMessage(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && typeof parsed.key === "string") {
      const key = parsed.key as string;
      const params = (parsed.params || {}) as Record<string, string>;
      const known: Record<string, string> = {
        "system.userJoined": "{username} joined the chat",
        "system.userLeft": "{username} left the chat",
        "system.connectionLost": "Connection lost. Reconnecting...",
        "system.friendRejected": "{username} rejected your friend request",
        "system.groupInvited": "{username} invited you to {group}",
        "system.userOnline": "{username} is now online",
      };
      const template = known[key] || `[${key}]`;
      return template.replace(/\{(\w+)\}/g, (_, k) => params[k] || `{${k}}`);
    }
  } catch {
    // Not JSON, return raw content
  }
  return content;
}

export function MessageTranscript({
  className,
  onReply,
  onDelete,
  onForward,
}: MessageTranscriptProps) {
  const { t } = useTranslation();
  const {
    messages,
    username,
    historyLoaded,
    typingUsers,
    currentChat,
  } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [unreadLocalCount, setUnreadLocalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const prevMessageCountRef = useRef(0);

  // Filter messages based on current chat context.
  const effectiveMessages = useMemo(() => {
    if (currentChat.type === "dm") {
      const partner = currentChat.username;
      return messages.filter((m) => {
        const msgSender = m.from || m.username;
        const msgRecipient = m.to;
        return (
          (msgSender === partner && msgRecipient === username) ||
          (msgSender === username && msgRecipient === partner)
        );
      });
    }
    if (currentChat.type === "group") {
      return messages.filter((m) => m.to === currentChat.name || (m as ChatMessage & { group?: string }).group === currentChat.name);
    }
    return messages;
  }, [currentChat, messages, username]);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false, x: 0, y: 0, message: null, isOwn: false,
  });

  const visibleMessages = useMemo(() => {
    if (showAllMessages || effectiveMessages.length <= MAX_VISIBLE_MESSAGES) {
      return effectiveMessages;
    }
    return effectiveMessages.slice(-MAX_VISIBLE_MESSAGES);
  }, [effectiveMessages, showAllMessages]);

  const hiddenCount = effectiveMessages.length - visibleMessages.length;

  const groups = useMemo(() => buildMessageGroups(visibleMessages, username), [visibleMessages, username]);

  // Suppress TS6133: decodeSystemMessage is available as a fallback decoder for system messages.
  void (decodeSystemMessage as unknown);

  useEffect(() => {
    const prev = prevMessageCountRef.current;
    const curr = effectiveMessages.length;
    if (curr > prev && !shouldAutoScroll) {
      setUnreadLocalCount((c) => c + (curr - prev));
    }
    if (shouldAutoScroll) {
      setUnreadLocalCount(0);
    }
    prevMessageCountRef.current = curr;
  }, [effectiveMessages.length, shouldAutoScroll]);

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
    setUnreadLocalCount(0);
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

  const handleContextReply = useCallback(() => {
    if (contextMenu.message && onReply) onReply(contextMenu.message);
    closeContextMenu();
  }, [contextMenu.message, onReply, closeContextMenu]);

  const handleContextCopy = useCallback(() => {
    if (contextMenu.message) navigator.clipboard.writeText(contextMenu.message.content).catch(() => {});
    closeContextMenu();
  }, [contextMenu.message, closeContextMenu]);

  const handleContextDelete = useCallback(() => {
    if (contextMenu.message && onDelete) onDelete(contextMenu.message.id);
    closeContextMenu();
  }, [contextMenu.message, onDelete, closeContextMenu]);

  const handleContextForward = useCallback(() => {
    if (contextMenu.message && onForward) onForward(contextMenu.message);
    closeContextMenu();
  }, [contextMenu.message, onForward, closeContextMenu]);

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
        /* Loading skeleton */
        <div
          className="flex flex-col items-center justify-center h-full gap-3 py-12"
          role="status"
          aria-label={t("transcript.loading")}
        >
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: "oklch(71.2% 0.194 13.428 / 0.6)", animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground/60">
            {t("transcript.loading")}
          </p>
        </div>
      ) : effectiveMessages.length === 0 ? (
        /* Empty state with animated chat bubble */
        <div className="flex flex-col items-center justify-center h-full py-12 px-4">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary ring-1 ring-[hsl(220,2.5%,20%)] animate-chat-bubble">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="oklch(71.2% 0.194 13.428 / 0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">{t("transcript.emptyTitle")}</h3>
          <p className="text-xs text-muted-foreground/60 text-center max-w-xs">{t("transcript.emptyDescription")}</p>
        </div>
      ) : (
        <div
          role="log"
          aria-live="polite"
          aria-label={t("chat.roomName")}
          className="mx-auto w-full max-w-5xl py-4"
        >
          {hiddenCount > 0 && (
            <div className="flex justify-center pb-3">
              <button
                onClick={() => { setShowAllMessages(true); setIsLoadingMore(false); }}
                className="touch-target rounded-full border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
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
                      onReply={onReply}
                      onDelete={onDelete}
                      onForward={onForward}
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
                {(() => {
                  const typingNames = typingUsers.filter(u => u !== username);
                  if (typingNames.length === 0) return '';
                  if (typingNames.length === 1) return `${typingNames[0]} 正在输入...`;
                  if (typingNames.length === 2) return `${typingNames[0]} 和 ${typingNames[1]} 正在输入...`;
                  return `${typingNames[0]} 和另外 ${typingNames.length - 1} 人正在输入...`;
                })()}
              </span>
            </div>
          )}

          <div ref={bottomRef} className="h-1" />
        </div>
      )}

      {/* Scroll-to-bottom button (when scrolled up) */}
      {!shouldAutoScroll && effectiveMessages.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="fab animate-fade-in md:hidden"
          style={{ background: "oklch(71.2% 0.194 13.428)", color: "#fff" }}
          aria-label={t("transcript.scrollToBottom")}
        >
          <ArrowDown className="h-5 w-5" />
          {unreadLocalCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white px-1">
              {unreadLocalCount > 99 ? "99+" : unreadLocalCount}
            </span>
          )}
        </button>
      )}

      {/* Desktop scroll-to-bottom */}
      {!shouldAutoScroll && messages.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="hidden md:flex absolute bottom-4 left-1/2 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground shadow-lg hover:bg-accent hover:text-foreground transition-all animate-fade-in backdrop-blur-sm z-10"
          aria-label={t("transcript.scrollToBottom")}
        >
          <ArrowDown className="h-3.5 w-3.5" />
          {unreadLocalCount > 0 ? t("transcript.newMessages", { count: unreadLocalCount }) : t("transcript.scrollToBottom")}
        </button>
      )}

      {/* Context menu */}
      {contextMenu.visible && (
        <>
          <div className="context-menu-backdrop" onClick={closeContextMenu} onTouchEnd={closeContextMenu} />
          <div className="context-menu border border-border bg-card shadow-2xl" style={menuStyle}>
            <button onClick={handleContextReply} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground/80 hover:bg-accent hover:text-foreground touch-target">
              <Reply className="h-4 w-4 text-muted-foreground" />
              <span>{t("input.replyTo")}</span>
            </button>
            <button onClick={handleContextCopy} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground/80 hover:bg-accent hover:text-foreground touch-target">
              <Copy className="h-4 w-4 text-muted-foreground" />
              <span>Copy</span>
            </button>
            {contextMenu.isOwn && (
              <button onClick={handleContextDelete} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-destructive/80 hover:bg-[hsl(0,62%,20%)] hover:text-destructive touch-target">
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </button>
            )}
            <button onClick={handleContextForward} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground/80 hover:bg-accent hover:text-foreground touch-target">
              <Forward className="h-4 w-4 text-muted-foreground" />
              <span>Forward</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
