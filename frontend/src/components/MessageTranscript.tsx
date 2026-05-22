import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { Reply, Copy, Trash2, Forward } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { usePullDownGesture } from "@/hooks/useTouchGestures";
import { MessageBubble } from "./MessageBubble";
import { SystemMessage } from "./SystemMessage";
import { cn, formatDate } from "@/lib/utils";
import { chatAPI } from "@/lib/api";
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
    onlineUsers,
  } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [unreadLocalCount, setUnreadLocalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [unreadBounce, setUnreadBounce] = useState(false);
  const hasMoreRef = useRef(true);
  const prevConversationRef = useRef("");
  const prevMessageCountRef = useRef(0);
  const pendingScrollRestore = useRef(0);
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const conversationKey = currentChat.type === "dm" ? `dm:${currentChat.username}` : currentChat.type === "group" ? `group:${currentChat.name}` : "public";

  // Reset infinite scroll state when switching conversations.
  useEffect(() => {
    if (prevConversationRef.current !== conversationKey) {
      hasMoreRef.current = true;
      prevConversationRef.current = conversationKey;
    }
  }, [conversationKey]);

  // Listen for "no more history" events.
  useEffect(() => {
    const handler = () => { hasMoreRef.current = false; };
    window.addEventListener("tdchat:no-more-history", handler);
    return () => window.removeEventListener("tdchat:no-more-history", handler);
  }, []);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const saved = scrollPositions.current.get(conversationKey);
    if (saved !== undefined) {
      container.scrollTop = saved;
    }
  }, [conversationKey]);

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

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchForwardPicker, setShowBatchForwardPicker] = useState(false);
  const [batchForwardUser, setBatchForwardUser] = useState("");


  // Save scroll position on scroll + detect scroll-to-top for pagination.
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    scrollPositions.current.set(conversationKey, container.scrollTop);
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShouldAutoScroll(distanceFromBottom < 120);
    // Infinite scroll: load older messages when near top.
    if (scrollTop < 80 && hasMoreRef.current && !loadingOlder && effectiveMessages.length > 0) {
      const oldest = effectiveMessages[0];
      if (oldest) {
        setLoadingOlder(true);
        pendingScrollRestore.current = container.scrollHeight;
        chatAPI.sendLoadHistory(oldest.timestamp);
      }
    }
  }, [conversationKey, loadingOlder, effectiveMessages]);

  // Restore scroll position after older messages load and DOM updates.
  // useLayoutEffect runs synchronously after DOM commits, preventing races with live messages.
  useLayoutEffect(() => {
    if (pendingScrollRestore.current && containerRef.current) {
      const afterScroll = containerRef.current.scrollHeight;
      containerRef.current.scrollTop += afterScroll - pendingScrollRestore.current;
      pendingScrollRestore.current = 0;
      setLoadingOlder(false);
    }
  }, [effectiveMessages.length]);

  const visibleMessages = useMemo(() => {
    if (showAllMessages || effectiveMessages.length <= MAX_VISIBLE_MESSAGES) {
      return effectiveMessages;
    }
    return effectiveMessages.slice(-MAX_VISIBLE_MESSAGES);
  }, [effectiveMessages, showAllMessages]);

  const hiddenCount = effectiveMessages.length - visibleMessages.length;

  const groups = useMemo(() => buildMessageGroups(visibleMessages, username), [visibleMessages, username]);

  // Count replies for each message.
  const replyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of effectiveMessages) {
      if (m.reply_to_id) {
        counts[m.reply_to_id] = (counts[m.reply_to_id] || 0) + 1;
      }
    }
    return counts;
  }, [effectiveMessages]);

  useEffect(() => {
    const prev = prevMessageCountRef.current;
    const curr = effectiveMessages.length;
    if (curr > prev && !shouldAutoScroll) {
      setUnreadLocalCount((c) => {
        const next = c + (curr - prev);
        if (next > 0 && c === 0) setUnreadBounce(true);
        return next;
      });
    }
    if (shouldAutoScroll) {
      setUnreadLocalCount(0);
    }
    prevMessageCountRef.current = curr;
  }, [effectiveMessages.length, shouldAutoScroll]);

  useEffect(() => {
    if (shouldAutoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [groups, shouldAutoScroll]);

  // Listen for search result "jump to message" events.
  useEffect(() => {
    const handler = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      if (!id) return;
      const el = document.getElementById(`msg-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("highlight-flash");
        setTimeout(() => el.classList.remove("highlight-flash"), 2000);
      }
    };
    window.addEventListener("tdchat:scroll-to-message", handler);
    return () => window.removeEventListener("tdchat:scroll-to-message", handler);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShouldAutoScroll(true);
    setUnreadLocalCount(0);
    setUnreadBounce(false);
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

  const enterSelectMode = useCallback((messageId: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([messageId]));
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setShowBatchForwardPicker(false);
    setBatchForwardUser("");
  }, []);

  const toggleSelect = useCallback((messageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
        if (next.size === 0) setSelectMode(false);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const handleBatchDelete = useCallback(() => {
    const selectedMessages = effectiveMessages.filter((m) => selectedIds.has(m.id));
    const ownMessages = selectedMessages.filter((m) => m.username === username);
    for (const msg of ownMessages) chatAPI.deleteMessage(msg.id);
    exitSelectMode();
  }, [effectiveMessages, selectedIds, username, exitSelectMode]);

  const handleBatchForward = useCallback(() => {
    if (!batchForwardUser) return;
    const selectedMessages = effectiveMessages.filter((m) => selectedIds.has(m.id));
    for (const msg of selectedMessages) chatAPI.sendForward(msg.id, batchForwardUser);
    exitSelectMode();
  }, [effectiveMessages, selectedIds, batchForwardUser, exitSelectMode]);

  // Select all visible non-deleted messages
  const handleSelectAll = useCallback(() => {
    const ids = effectiveMessages.filter((m) => m.username !== "system" && !m.deleted).map((m) => m.id);
    setSelectedIds(new Set(ids));
  }, [effectiveMessages]);

  // Copy content of all selected messages
  const handleCopySelected = useCallback(async () => {
    const selectedMessages = effectiveMessages.filter((m) => selectedIds.has(m.id));
    const text = selectedMessages
      .map((m) => `[${m.username}] ${m.content}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch { /* Clipboard API may not be available */ }
  }, [effectiveMessages, selectedIds]);

  const handleContextSelect = useCallback(() => {
    if (contextMenu.message) enterSelectMode(contextMenu.message.id);
    closeContextMenu();
  }, [contextMenu.message, enterSelectMode, closeContextMenu]);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (!selectMode) return;
      if (e.target === e.currentTarget) exitSelectMode();
    },
    [selectMode, exitSelectMode],
  );

  // Listen for Escape key (or external exit-select-mode event)
  useEffect(() => {
    const handler = () => exitSelectMode();
    window.addEventListener("tdchat:exit-select-mode", handler);
    return () => window.removeEventListener("tdchat:exit-select-mode", handler);
  }, [exitSelectMode]);

  const menuStyle = useMemo(() => {
    const menuWidth = 180;
    const menuHeight = 200;
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
      onClick={handleContainerClick}
      className={cn("flex-1 overflow-y-auto relative scrollbar-thin", className)}
      style={{ willChange: "transform" }}
      {...pullDownHandlers}
    >
      {selectMode && (
        <div className="sticky top-0 left-0 right-0 z-50 bg-card border-b border-border px-4 py-3 flex items-center gap-3 shadow-lg">
          <span className="text-sm font-medium text-foreground">{t("transcript.selected", { count: selectedIds.size })}</span>
          <div className="flex-1" />
          <button onClick={handleSelectAll} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors" aria-label={t("transcript.selectAll")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
            {t("transcript.selectAll")}
          </button>
          <button onClick={handleCopySelected} disabled={selectedIds.size === 0} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed" aria-label={t("transcript.copySelected")}>
            <Copy className="h-4 w-4" />
            {t("transcript.copySelected")}
          </button>
          <button onClick={handleBatchDelete} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-colors" aria-label={t("transcript.contextDelete")}>
            <Trash2 className="h-4 w-4" />{t("transcript.contextDelete")}
          </button>
          <button onClick={() => setShowBatchForwardPicker((prev) => !prev)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors" aria-label={t("transcript.contextForward")}>
            <Forward className="h-4 w-4" />{t("transcript.contextForward")}
          </button>
          <button onClick={exitSelectMode} className="flex items-center gap-1 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="Exit select mode">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}
      {selectMode && showBatchForwardPicker && (
        <div className="sticky top-14 left-0 right-0 z-50 bg-card border-b border-border px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3 max-w-md mx-auto">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("transcript.contextForwardTo")}</span>
            <select value={batchForwardUser} onChange={(e) => setBatchForwardUser(e.target.value)} className="flex-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary/50">
              <option value="">{t("transcript.contextSelectRecipient")}</option>
              {onlineUsers.filter((u) => u !== username).map((u) => (<option key={u} value={u}>{u}</option>))}
            </select>
            <button onClick={handleBatchForward} disabled={!batchForwardUser} className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity" style={{ backgroundColor: "oklch(71.2% 0.194 13.428)" }}>{t("transcript.contextSend")}</button>
            <button onClick={() => { setShowBatchForwardPicker(false); setBatchForwardUser(""); }} className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">{t("transcript.contextCancel")}</button>
          </div>
        </div>
      )}
      {isLoadingMore && (
        <div className="flex justify-center py-2">
          <svg className="pull-down-spinner h-4 w-4 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
        </div>
      )}

      {loadingOlder && (
        <div className="flex justify-center py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            {t("transcript.loadingOlder")}
          </div>
        </div>
      )}

      {!historyLoaded ? (
        /* Loading skeleton with shimmer */
        <div
          className="flex flex-col items-center justify-center h-full gap-6 py-12"
          role="status"
          aria-label={t("transcript.loading")}
        >
          {/* Shimmer skeleton bubbles */}
          <div className="flex flex-col gap-4 w-full max-w-sm px-4">
            {/* Received message skeleton */}
            <div className="flex items-end gap-2">
              <div className="h-8 w-8 rounded-full animate-shimmer flex-shrink-0" />
              <div className="flex flex-col gap-1.5">
                <div className="h-3 w-16 rounded-md animate-shimmer" />
                <div className="h-8 w-48 rounded-2xl rounded-bl-md animate-shimmer" />
              </div>
            </div>
            {/* Sent message skeleton */}
            <div className="flex items-end gap-2 justify-end">
              <div className="flex flex-col gap-1.5 items-end">
                <div className="h-8 w-36 rounded-2xl rounded-br-md animate-shimmer" />
              </div>
              <div className="h-8 w-8 rounded-full animate-shimmer flex-shrink-0" />
            </div>
            {/* Received message skeleton */}
            <div className="flex items-end gap-2">
              <div className="h-8 w-8 rounded-full animate-shimmer flex-shrink-0" />
              <div className="flex flex-col gap-1.5">
                <div className="h-8 w-64 rounded-2xl rounded-bl-md animate-shimmer" />
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="typing-dot" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground/50">
            {t("transcript.loading")}
          </p>
        </div>
      ) : effectiveMessages.length === 0 ? (
        /* Empty state — context-aware per conversation type */
        (() => {
          if (currentChat.type === "dm") {
            const initial = currentChat.username.charAt(0).toUpperCase();
            return (
              <div className="flex flex-col items-center justify-center h-full py-12 px-4">
                <div
                  className="mb-4 flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold text-white ring-1 ring-white/10"
                  style={{ background: `linear-gradient(135deg, oklch(65% 0.16 ${currentChat.username.charCodeAt(0) % 360}), oklch(58% 0.14 ${(currentChat.username.charCodeAt(0) + 45) % 360}))` }}
                >
                  {initial}
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">{t("transcript.emptyDmTitle")}</h3>
                <p className="text-xs text-muted-foreground/60 text-center max-w-xs">{t("transcript.emptyDmDescription", { username: currentChat.username })}</p>
              </div>
            );
          }
          if (currentChat.type === "group") {
            return (
              <div className="flex flex-col items-center justify-center h-full py-12 px-4">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary ring-1 ring-border">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="oklch(71.2% 0.194 13.428 / 0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">{t("transcript.emptyGroupTitle")}</h3>
                <p className="text-xs text-muted-foreground/60 text-center max-w-xs">{t("transcript.emptyGroupDescription", { name: currentChat.name })}</p>
              </div>
            );
          }
          /* Public chat empty state */
          return (
            <div className="flex flex-col items-center justify-center h-full py-12 px-4">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary ring-1 ring-border animate-chat-bubble">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="oklch(71.2% 0.194 13.428 / 0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">{t("transcript.emptyTitle")}</h3>
              <p className="text-xs text-muted-foreground/60 text-center max-w-xs">{t("transcript.emptyDescription")}</p>
            </div>
          );
        })()
      ) : (
        <div
          role="log"
          aria-live="polite"
          aria-atomic="false"
          aria-relevant="additions"
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

          {hiddenCount > 0 && (
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="h-px flex-1 bg-[oklch(71.2%_0.194_13.428_/_0.3)]" />
              <span className="text-[10px] font-medium text-[oklch(71.2%_0.194_13.428)] whitespace-nowrap">
                {t("transcript.newMessagesDivider")}
              </span>
              <div className="h-px flex-1 bg-[oklch(71.2%_0.194_13.428_/_0.3)]" />
            </div>
          )}

          {groups.map((group, gi) => {
            const groupTs =
              group.type === "system"
                ? group.message.timestamp
                : group.messages[0].timestamp;
            const prevGroup = gi > 0 ? groups[gi - 1] : null;
            const prevTs = prevGroup
              ? prevGroup.type === "system"
                ? prevGroup.message.timestamp
                : prevGroup.messages[0].timestamp
              : null;
            const showDateSep =
              !prevTs ||
              new Date(prevTs).toDateString() !==
                new Date(groupTs).toDateString();

            const dateSep = showDateSep ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-[11px] font-medium text-muted-foreground/40 whitespace-nowrap select-none">
                  {formatDate(groupTs)}
                </span>
                <div className="h-px flex-1 bg-border/50" />
              </div>
            ) : null;

            if (group.type === "system") {
              return (
                <div key={group.message.id}>
                  {dateSep}
                  <SystemMessage
                    content={group.message.content}
                    timestamp={group.message.timestamp}
                  />
                </div>
              );
            }

            const { messages: groupMessages, isOwn } = group;
            return (
              <div key={groupMessages[0].id}>
                {dateSep}
                <div className="message-group">
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
                        replyCount={replyCounts[msg.id] || 0}
                        selectMode={selectMode}
                        isSelected={selectedIds.has(msg.id)}
                        onToggleSelect={toggleSelect}
                        onLongPress={enterSelectMode}
                        staggerDelay={gi * 50}
                      />
                    );
                  })}
                </div>
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
                  if (typingNames.length === 1) return t("system.typing", { username: typingNames[0] });
                  if (typingNames.length === 2) return t("system.typingTwo", { name1: typingNames[0], name2: typingNames[1] });
                  return t("system.typingMany", { name: typingNames[0], count: typingNames.length - 1 });
                })()}
              </span>
            </div>
          )}

          <div ref={bottomRef} className="h-1" />
        </div>
      )}

      {/* Jump-to-bottom floating button */}
      {!shouldAutoScroll && (
        <button
          onClick={scrollToBottom}
          className={cn(
            "absolute bottom-4 right-4 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-card border border-border shadow-lg hover:bg-accent hover:scale-105 hover:shadow-xl transition-all duration-200 text-muted-foreground hover:text-foreground",
            unreadBounce && "animate-bounce-in",
          )}
          onAnimationEnd={() => setUnreadBounce(false)}
          aria-label={t("transcript.scrollToBottom")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          {unreadLocalCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white px-1">
              {unreadLocalCount > 99 ? "99+" : unreadLocalCount}
            </span>
          )}
        </button>
      )}

      {/* Context menu */}
      {contextMenu.visible && (
        <>
          <div className="context-menu-backdrop" onClick={closeContextMenu} onTouchEnd={closeContextMenu} />
          <div className="context-menu border border-border bg-card shadow-2xl" style={menuStyle}>
            <button onClick={handleContextSelect} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground/80 hover:bg-accent hover:text-foreground touch-target">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
              <span>{t("transcript.contextSelect")}</span>
            </button>
            <div className="border-t border-border mx-3" />
            <button onClick={handleContextReply} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground/80 hover:bg-accent hover:text-foreground touch-target">
              <Reply className="h-4 w-4 text-muted-foreground" />
              <span>{t("input.replyTo")}</span>
            </button>
            <button onClick={handleContextCopy} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground/80 hover:bg-accent hover:text-foreground touch-target">
              <Copy className="h-4 w-4 text-muted-foreground" />
              <span>{t("transcript.contextCopy")}</span>
            </button>
            {contextMenu.isOwn && (
              <button onClick={handleContextDelete} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-destructive/80 hover:bg-destructive/20 hover:text-destructive touch-target">
                <Trash2 className="h-4 w-4" />
                <span>{t("transcript.contextDelete")}</span>
              </button>
            )}
            <button onClick={handleContextForward} className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground/80 hover:bg-accent hover:text-foreground touch-target">
              <Forward className="h-4 w-4 text-muted-foreground" />
              <span>{t("transcript.contextForward")}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
