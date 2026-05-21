import { useEffect, useCallback, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import {
  chatAPI,
  type WSMessage,
  type WSChatMessage,
  type WSHistoryMessage,
  type WSUserEvent,
  type WSTypingEvent,
  type WSStreamEvent,
} from "@/lib/api";

// --- Notification utilities ---

let notificationPermission: NotificationPermission = "default";
let lastNotificationTime = 0;
const NOTIFICATION_THROTTLE_MS = 5000;

function requestNotificationPermission(): void {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    notificationPermission = Notification.permission;
    return;
  }
  Notification.requestPermission().then((perm) => {
    notificationPermission = perm;
  });
}

function showNotification(title: string, body: string): void {
  if (!("Notification" in window)) return;
  if (notificationPermission !== "granted") return;
  const now = Date.now();
  if (now - lastNotificationTime < NOTIFICATION_THROTTLE_MS) return;
  lastNotificationTime = now;
  try {
    new Notification(title, { body });
  } catch {
    // Notification API not available.
  }
}

// --- Page title utilities ---

const BASE_TITLE = "TokenDanceChat";
let unreadTitleCount = 0;
let flashTitleTimer: ReturnType<typeof setInterval> | null = null;
let isTabActive = true;

function updatePageTitle(): void {
  if (!isTabActive && unreadTitleCount > 0) {
    document.title = `(${unreadTitleCount}) ${BASE_TITLE}`;
  } else {
    document.title = BASE_TITLE;
  }
}

function flashMentionTitle(username: string): void {
  if (flashTitleTimer) clearInterval(flashTitleTimer);
  let flashes = 0;
  const maxFlashes = 10;
  flashTitleTimer = setInterval(() => {
    if (flashes >= maxFlashes) {
      if (flashTitleTimer) {
        clearInterval(flashTitleTimer);
        flashTitleTimer = null;
      }
      updatePageTitle();
      return;
    }
    document.title = flashes % 2 === 0
      ? `@${username} mentioned you - ${BASE_TITLE}`
      : BASE_TITLE;
    flashes++;
  }, 500);
}

function hasMention(content: string, username: string): boolean {
  const regex = new RegExp(`@${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return regex.test(content);
}

function i18nSys(key: string, params?: Record<string, string>): string {
  if (params) {
    return JSON.stringify({ key, params });
  }
  return JSON.stringify({ key });
}

export function useWebSocket() {
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const {
    username,
    setConnected,
    addMessage,
    setHistory,
    setOnlineUsers,
    addSystemMessage,
    addTypingUser,
    removeTypingUser,
    appendStreamChunk,
    setUnreadCount,
  } = useChatStore();

  const connect = useCallback(
    async (name: string) => {
      try {
        await chatAPI.connect(name);
        setConnected(true);
        chatAPI.sendMarkRead();
      } catch (err) {
        setConnected(false);
        throw err;
      }
    },
    [setConnected],
  );

  const disconnect = useCallback(() => {
    chatAPI.disconnect();
    setConnected(false);
  }, [setConnected]);

  const sendMessage = useCallback((content: string) => {
    chatAPI.sendMessage(content);
  }, []);

  const markRead = useCallback(() => {
    chatAPI.sendMarkRead();
    setUnreadCount(0);
    unreadTitleCount = 0;
    updatePageTitle();
  }, [setUnreadCount]);

  useEffect(() => {
    // Tab visibility tracking.
    const handleVisibility = () => {
      isTabActive = !document.hidden;
      if (isTabActive) {
        unreadTitleCount = 0;
        updatePageTitle();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    const unsubs: (() => void)[] = [];

    unsubs.push(
      chatAPI.on("message", (msg: WSMessage) => {
        const { id, username: sender, content, timestamp } = msg as WSChatMessage;
        addMessage({
          id,
          username: sender,
          content,
          timestamp: timestamp || Date.now(),
        });
        // Remove typing indicator when a message from this user arrives.
        removeTypingUser(sender);

        // @mention detection.
        if (sender !== username && username && hasMention(content, username)) {
          flashMentionTitle(sender);
          showNotification("TokenDanceChat", `${sender} mentioned you in chat`);
        }

        // Page title: increment unread count when tab is inactive.
        if (!isTabActive && sender !== username && sender !== "system") {
          unreadTitleCount++;
          updatePageTitle();
        }
      }),
    );

    unsubs.push(
      chatAPI.on("history", (msg: WSMessage) => {
        const { messages } = msg as WSHistoryMessage;
        setHistory(messages || []);
      }),
    );

    unsubs.push(
      chatAPI.on("user_joined", (msg: WSMessage) => {
        const { username, online, timestamp } = msg as WSUserEvent;
        if (online) {
          setOnlineUsers(online);
        }
        addSystemMessage(
          i18nSys("system.userJoined", { username }),
          timestamp || Date.now(),
        );
      }),
    );

    unsubs.push(
      chatAPI.on("user_left", (msg: WSMessage) => {
        const { username, online, timestamp } = msg as WSUserEvent;
        if (online) {
          setOnlineUsers(online);
        }
        addSystemMessage(
          i18nSys("system.userLeft", { username }),
          timestamp || Date.now(),
        );
      }),
    );

    unsubs.push(
      chatAPI.on("online_users", (msg: WSMessage) => {
        const { users } = msg as { type: string; users: string[] };
        if (users) {
          setOnlineUsers(users);
        }
      }),
    );

    unsubs.push(
      chatAPI.on("connection_lost", () => {
        addSystemMessage(
          i18nSys("system.connectionLost"),
          Date.now(),
        );
      }),
    );

    // Unread count from server.
    unsubs.push(
      chatAPI.on("unread_count", (msg: WSMessage) => {
        const count = parseInt(msg.content as string, 10) || 0;
        setUnreadCount(count);
      }),
    );

    // Streaming bot response event.
    unsubs.push(
      chatAPI.on("stream", (msg: WSMessage) => {
        const { username: streamUser, content, done } = msg as WSStreamEvent;
        if (done) {
          return;
        }
        appendStreamChunk(content);
        addTypingUser(streamUser);
        const existing = typingTimers.current.get(streamUser);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          removeTypingUser(streamUser);
          typingTimers.current.delete(streamUser);
        }, 30000);
        typingTimers.current.set(streamUser, timer);
      }),
    );

    // Typing stop event.
    unsubs.push(
      chatAPI.on("typing_stop", (msg: WSMessage) => {
        const { username: typingUser } = msg as WSTypingEvent;
        removeTypingUser(typingUser);
        const timer = typingTimers.current.get(typingUser);
        if (timer) {
          clearTimeout(timer);
          typingTimers.current.delete(typingUser);
        }
      }),
    );

    // Typing indicator event
    unsubs.push(
      chatAPI.on("typing", (msg: WSMessage) => {
        const { username: typingUser } = msg as WSTypingEvent;
        addTypingUser(typingUser);

        // Clear any existing timer for this user.
        const existing = typingTimers.current.get(typingUser);
        if (existing) clearTimeout(existing);

        // Auto-remove after 10 seconds.
        const timer = setTimeout(() => {
          removeTypingUser(typingUser);
          typingTimers.current.delete(typingUser);
        }, 10000);
        typingTimers.current.set(typingUser, timer);
      }),
    );

    // Friend request notification.
    unsubs.push(
      chatAPI.on("friend_request", (msg: WSMessage) => {
        const { from } = msg as { type: string; from: string };
        if (from) {
          showNotification("TokenDanceChat", `${from} sent you a friend request`);
        }
      }),
    );

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (flashTitleTimer) {
        clearInterval(flashTitleTimer);
        flashTitleTimer = null;
      }
      unsubs.forEach((unsub) => unsub());
      // Clear all typing timers on unmount.
      typingTimers.current.forEach((timer) => clearTimeout(timer));
      typingTimers.current.clear();
    };
  }, [
    username,
    addMessage,
    setHistory,
    setOnlineUsers,
    addSystemMessage,
    addTypingUser,
    removeTypingUser,
    appendStreamChunk,
    setUnreadCount,
  ]);

  return { connect, disconnect, sendMessage, markRead, requestNotificationPermission };
}
