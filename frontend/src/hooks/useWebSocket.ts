import { useEffect, useCallback } from "react";
import { useChatStore } from "@/stores/chatStore";
import {
  chatAPI,
  type WSMessage,
  type WSChatMessage,
  type WSHistoryMessage,
  type WSUserEvent,
} from "@/lib/api";

export function useWebSocket() {
  const {
    setConnected,
    addMessage,
    setHistory,
    setOnlineUsers,
    addSystemMessage,
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
          `${username} 加入了聊天室`,
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
          `${username} 离开了聊天室`,
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
        addSystemMessage("连接已断开，正在尝试重新连接...", Date.now());
      }),
    );

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [addMessage, setHistory, setOnlineUsers, addSystemMessage]);

  return { connect, disconnect, sendMessage };
}
