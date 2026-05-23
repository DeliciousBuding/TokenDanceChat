import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { Reply, Copy, Trash2, Forward, UsersRound } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { usePullDownGesture } from "@/hooks/useTouchGestures";
import { MessageBubble } from "./MessageBubble";
import { SystemMessage } from "./SystemMessage";
import { ScrollToBottom } from "./ScrollToBottom";
import { cn, formatDate, formatFullTime } from "@/lib/utils";
import { chatAPI } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";

const MAX_VISIBLE_MESSAGES = 200;
const GROUP_WINDOW_MS = 2 * 60 * 1000;

interface MessageTranscriptProps {
  className?: string;
  onReply?: (message: ChatMessage) => void;
  onDelete?: (messageId: string) => void;
  onForward?: (message: ChatMessage) => void;
  onOpenThread?: (message: ChatMessage) => void;
  highlight?: string;
  /** Ref that will be set to the scrollable container element. */
  scrollContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
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
  onOpenThread,
  highlight,
  scrollContainerRef,
}: MessageTranscriptProps) {
  const { t, lang } = useTranslation();
  const {
    messages,
    username,
    historyLoaded,
    typingUsers,
    currentChat,
    onlineUsers,
    groups: chatGroups,
    lastReadTimestamps,
    customEmojis,
  } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const hasMoreRef = useRef(true);
  const prevConversationRef = useRef("");
  const pendingScrollRestore = useRef(0);
  const firstMessageIdBeforeLoad = useRef("");
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const conversationKey = currentChat.type === "dm" ? `dm:${currentChat.username}` : currentChat.type === "group" ? `group:${currentChat.name}` : "public";

  // Track new messages that arrived while user is scrolled up for the FAB badge.
  const [newMessageCount, setNewMessageCount] = useState(0);
  const lastSeenMessageIdRef = useRef<string | null>(null);

  // Reset infinite scroll state when switching conversations.
  useEffect(() => {
    if (prevConversationRef.current !== conversationKey) {
      hasMoreRef.current = true;
      prevConversationRef.current = conversationKey;
      setNewMessageCount(0);
      lastSeenMessageIdRef.current = null;
      pendingScrollRestore.current = 0;
      firstMessageIdBeforeLoad.current = "";
      setLoadingOlder(false);
    }
  }, [conversationKey, setLoadingOlder]);

  // Listen for "no more history" events.
  useEffect(() => {
    const handler = () => {
      hasMoreRef.current = false;
      pendingScrollRestore.current = 0;
      firstMessageIdBeforeLoad.current = "";
      setLoadingOlder(false);
    };
    window.addEventListener("tdchat:no-more-history", handler);
    return () => window.removeEventListener("tdchat:no-more-history", handler);
  }, [setLoadingOlder]);
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

  // Drag-select: after long-press enters select mode, continue holding and drag
  // to select adjacent messages (Telegram-style gesture).
  const dragSelectRef = useRef(false);

  const handleDragSelectEnter = useCallback((messageId: string) => {
    if (!dragSelectRef.current) return;
    setSelectedIds((prev) => {
      if (prev.has(messageId)) return prev;
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
  }, []);



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
        firstMessageIdBeforeLoad.current = effectiveMessages[0]?.id ?? "";
        chatAPI.sendLoadHistory(oldest.timestamp);
        // Safety timeout: clear loadingOlder if server never responds
        setTimeout(() => {
          setLoadingOlder((prev) => {
            if (prev) {
              pendingScrollRestore.current = 0;
              firstMessageIdBeforeLoad.current = "";
              return false;
            }
            return prev;
          });
        }, 5000);
      }
    }
  }, [conversationKey, loadingOlder, effectiveMessages]);

  // Restore scroll position after older messages load and DOM updates.
  // useLayoutEffect runs synchronously after DOM commits, preventing races with live messages.
  useLayoutEffect(() => {
    if (pendingScrollRestore.current && containerRef.current) {
      // Guard against race condition: if a new live message arrives at the
      // bottom while waiting for older history, effectiveMessages.length
      // changes but the first message ID stays the same. Skip the scroll
      // restore until older messages are actually prepended.
      const currentFirstId = effectiveMessages[0]?.id ?? "";
      if (currentFirstId === firstMessageIdBeforeLoad.current && firstMessageIdBeforeLoad.current !== "") {
        return;
      }
      const afterScroll = containerRef.current.scrollHeight;
      containerRef.current.scrollTop += afterScroll - pendingScrollRestore.current;
      pendingScrollRestore.current = 0;
      firstMessageIdBeforeLoad.current = "";
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

  // Pre-compute custom emoji lookup structures once for all MessageBubble instances.
  const emojiPreprocess = useMemo(() => {
    if (customEmojis.length === 0) return null;
    const emojiMap = new Map(customEmojis.map((e) => [e.name, e.url]));
    const names = [...emojiMap.keys()].sort((a, b) => b.length - a.length);
    const escapedNames = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`:(${escapedNames.join('|')}):`, 'g');
    return { emojiMap, pattern };
  }, [customEmojis]);

  // Track render time for new-message animation detection
  const renderTimeRef = useRef(Date.now());
  renderTimeRef.current = Date.now();

  // Identify messages that arrived in the last 2 seconds (real-time incoming)
  const newMessageIds = useMemo(() => {
    const cutoff = renderTimeRef.current - 2000;
    const ids = new Set<string>();
    for (const msg of visibleMessages) {
      if (msg.timestamp > cutoff) {
        ids.add(msg.id);
      }
    }
    return ids;
  }, [visibleMessages]);

  // Compute where to show the "New messages" unread divider.
  const lastReadTimestamp = lastReadTimestamps[conversationKey];
  const newMessagesDividerIndex = useMemo(() => {
    if (!lastReadTimestamp) return -1;
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const groupTs =
        group.type === "system"
          ? group.message.timestamp
          : group.messages[0].timestamp;
      if (groupTs > lastReadTimestamp) return i;
    }
    return -1;
  }, [groups, lastReadTimestamp]);
  const currentGroupMemberCount = currentChat.type === "group"
    ? chatGroups[currentChat.name]?.members.length ?? 1
    : 0;

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
    if (shouldAutoScroll && containerRef.current) {
      // Use scrollTo on the container element to avoid scrollIntoView
      // cascading to ancestor scrollable elements.
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTo({ top: containerRef.current.scrollHeight });
        }
      });
    }
  }, [groups, shouldAutoScroll]);

  // Increment new-message counter when messages arrive while user is scrolled up.
  useEffect(() => {
    const msgs = effectiveMessages;
    if (msgs.length === 0) {
      lastSeenMessageIdRef.current = null;
      return;
    }
    const lastId = msgs[msgs.length - 1].id;
    const prevLastId = lastSeenMessageIdRef.current;
    lastSeenMessageIdRef.current = lastId;

    if (!prevLastId || lastId === prevLastId || shouldAutoScroll) return;

    const prevIdx = msgs.findIndex((m) => m.id === prevLastId);
    if (prevIdx === -1) return;

    const newMsgs = msgs.length - prevIdx - 1;
    if (newMsgs > 0) {
      setNewMessageCount((c) => c + newMsgs);
    }
  }, [effectiveMessages, shouldAutoScroll]);

  // Reset the new-message badge when the user scrolls back to the bottom.
  useEffect(() => {
    if (shouldAutoScroll) {
      setNewMessageCount(0);
    }
  }, [shouldAutoScroll]);

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
    if (contextMenu.message) {
      const time = formatFullTime(contextMenu.message.timestamp);
      const text = `[${contextMenu.message.username}] ${time}\n${contextMenu.message.content}`;
      navigator.clipboard.writeText(text).catch(() => {});
    }
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

  // Copy content of all selected messages with formatted output.
  const handleCopySelected = useCallback(async () => {
    const selectedMessages = effectiveMessages.filter((m) => selectedIds.has(m.id));
    const text = selectedMessages
      .map((m) => {
        const time = formatFullTime(m.timestamp);
        return `[${m.username}] ${time}\n${m.content}`;
      })
      .join("\n\n");
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

  // Drag-select: track pointer movement over messages during long-press.
  const handleContainerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragSelectRef.current) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const msgEl = (el as HTMLElement).closest('[id^="msg-"]');
    if (msgEl) {
      const id = msgEl.id.replace('msg-', '');
      handleDragSelectEnter(id);
    }
  }, [handleDragSelectEnter]);

  const handleContainerPointerUp = useCallback(() => {
    dragSelectRef.current = false;
  }, []);

  // Start drag-select (called by MessageBubble long-press).
  const startDragSelect = useCallback((messageId: string) => {
    dragSelectRef.current = true;
    setSelectMode(true);
    setSelectedIds(new Set([messageId]));
  }, []);

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
    <>
      <div
        ref={(node) => {
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (scrollContainerRef) scrollContainerRef.current = node;
        }}
        onScroll={handleScroll}
        onClick={handleContainerClick}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerCancel={handleContainerPointerUp}
        className={cn("flex-1 min-h-0 overflow-y-auto relative scrollbar-thin", className)}
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
            <button onClick={handleBatchForward} disabled={!batchForwardUser} className="rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">{t("transcript.contextSend")}</button>
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
                  className="mb-5 flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold text-white ring-1 ring-border shadow-sm"
                  style={{ background: `linear-gradient(135deg, oklch(65% 0.16 ${currentChat.username.charCodeAt(0) % 360}), oklch(58% 0.14 ${(currentChat.username.charCodeAt(0) + 45) % 360}))` }}
                >
                  {initial}
                </div>
                <h3 className="text-sm font-semibold text-foreground/80 mb-1.5">{t("transcript.emptyDmTitle")}</h3>
                <p className="text-xs text-muted-foreground/50 text-center max-w-xs leading-relaxed">{t("transcript.emptyDmDescription", { username: currentChat.username })}</p>
              </div>
            );
          }
          if (currentChat.type === "group") {
            return (
              <div data-visual="group-empty-state" className="flex h-full items-center justify-center px-4 py-10">
                <div className="w-full max-w-sm text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                    <UsersRound className="h-6 w-6" />
                  </div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    {t("transcript.emptyGroupMembers", { count: currentGroupMemberCount })}
                  </p>
                  <h3 className="mb-1.5 text-base font-semibold text-foreground/85">{t("transcript.emptyGroupTitle")}</h3>
                  <p className="mx-auto max-w-xs text-sm leading-6 text-muted-foreground">
                    {t("transcript.emptyGroupDescription", { name: currentChat.name })}
                  </p>
                </div>
              </div>
            );
          }
          /* Public chat empty state */
          return (
            <div className="flex flex-col items-center justify-center h-full py-12 px-4">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-accent ring-1 ring-border shadow-sm animate-chat-bubble">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary/50">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-foreground/80 mb-1.5">{t("transcript.emptyTitle")}</h3>
              <p className="text-xs text-muted-foreground/50 text-center max-w-xs leading-relaxed">{t("transcript.emptyDescription")}</p>
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
          className="mx-auto w-full max-w-7xl px-1 py-3 sm:px-3 sm:py-4"
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
              <div className="h-px flex-1 bg-primary/30" />
              <span className="text-[10px] font-medium text-primary whitespace-nowrap">
                {t("transcript.olderMessages")}
              </span>
              <div className="h-px flex-1 bg-primary/30" />
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
              <div className="flex items-center gap-3 px-4 py-1.5 sm:py-2">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-[11px] font-medium text-muted-foreground/40 whitespace-nowrap select-none">
                  {formatDate(groupTs, lang)}
                </span>
                <div className="h-px flex-1 bg-border/50" />
              </div>
            ) : null;

            if (group.type === "system") {
              return (
                <div key={group.message.id}>
                  {gi === newMessagesDividerIndex && (
                    <div className="flex items-center gap-3 py-2">
                      <div className="h-px flex-1 bg-primary/30" />
                      <span className="text-xs font-medium text-primary shrink-0">
                        {t("transcript.newMessagesDivider")}
                      </span>
                      <div className="h-px flex-1 bg-primary/30" />
                    </div>
                  )}
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
                {gi === newMessagesDividerIndex && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="h-px flex-1 bg-primary/30" />
                    <span className="text-xs font-medium text-primary shrink-0">
                      {t("transcript.newMessagesDivider")}
                    </span>
                    <div className="h-px flex-1 bg-primary/30" />
                  </div>
                )}
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
                        isNew={newMessageIds.has(msg.id)}
                        onReply={onReply}
                        onDelete={onDelete}
                        onForward={onForward}
                        replyCount={replyCounts[msg.id] || 0}
                        onOpenThread={onOpenThread}
                        selectMode={selectMode}
                        isSelected={selectedIds.has(msg.id)}
                        onToggleSelect={toggleSelect}
                        onLongPress={startDragSelect}
                        staggerDelay={gi * 50}
                        highlight={highlight}
                        onlineUsers={onlineUsers}
                        emojiPreprocess={emojiPreprocess}
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
    <ScrollToBottom containerRef={containerRef as React.RefObject<HTMLDivElement | null>} newCount={newMessageCount} onClearCount={() => setNewMessageCount(0)} />
  </>
);
}
