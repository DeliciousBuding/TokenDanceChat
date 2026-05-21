import { useEffect, useCallback, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import {
  chatAPI,
  type WSMessage,
  type WSChatMessage,
  type WSHistoryMessage,
  type WSUserEvent,
  type WSTypingEvent,
  type WSUserStatus,
} from "@/lib/api";

function i18nSys(key: string, params?: Record<string, string>): string {
  if (params) {
    return JSON.stringify({ key, params });
  }
  return JSON.stringify({ key });
}

export function useWebSocket() {
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const prevStatusRef = useRef<Record<string, boolean>>({});
  const {
    setConnected,
    addMessage,
    setHistory,
    setOnlineUsers,
    setUserStatusList,
    addSystemMessage,
    addTypingUser,
    removeTypingUser,
  } = useChatStore();

  const connect = useCallback(
    async (username: string) => {
      try {
        await chatAPI.connect(username);
        setConnected(true);
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

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      chatAPI.on("message", (msg: WSMessage) => {
        const { id, username, content, timestamp } = msg as WSChatMessage;
        addMessage({
          id,
          username,
          content,
          timestamp: timestamp || Date.now(),
        });
        // Remove typing indicator when a message from this user arrives.
        removeTypingUser(username);
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
      chatAPI.on("user_status", (msg: WSMessage) => {
        const { users } = msg as WSUserStatus;
        if (users && users.length > 0) {
          // Detect online/offline transitions and show system messages.
          for (const user of users) {
            const prevOnline = prevStatusRef.current[user.username];
            if (prevOnline === false && user.online === true) {
              // User came online.
              addSystemMessage(
                i18nSys("system.userOnline", { username: user.username }),
                Date.now(),
              );
            }
          }
          // Update tracking ref.
          const newMap: Record<string, boolean> = {};
          for (const user of users) {
            newMap[user.username] = user.online;
          }
          prevStatusRef.current = newMap;

          setUserStatusList(users);
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

    // Typing indicator event
    unsubs.push(
      chatAPI.on("typing", (msg: WSMessage) => {
        const { username } = msg as WSTypingEvent;
        addTypingUser(username);

        // Clear any existing timer for this user.
        const existing = typingTimers.current.get(username);
        if (existing) clearTimeout(existing);

        // Auto-remove after 10 seconds.
        const timer = setTimeout(() => {
          removeTypingUser(username);
          typingTimers.current.delete(username);
        }, 10000);
        typingTimers.current.set(username, timer);
      }),
    );

    return () => {
      unsubs.forEach((unsub) => unsub());
      // Clear all typing timers on unmount.
      typingTimers.current.forEach((timer) => clearTimeout(timer));
      typingTimers.current.clear();
    };
  }, [addMessage, setHistory, setOnlineUsers, setUserStatusList, addSystemMessage, addTypingUser, removeTypingUser]);

  return { connect, disconnect, sendMessage };
}
