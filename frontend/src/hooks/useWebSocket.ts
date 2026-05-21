import { useEffect, useCallback, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import {
  chatAPI,
  type WSMessage,
  type WSChatMessage,
  type WSHistoryMessage,
  type WSUserEvent,
  type WSTypingEvent,
  type WSRoomList,
  type WSRoomJoin,
  type WSForwardEvent,
} from "@/lib/api";

function i18nSys(key: string, params?: Record<string, string>): string {
  if (params) {
    return JSON.stringify({ key, params });
  }
  return JSON.stringify({ key });
}

export function useWebSocket() {
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const {
    setConnected,
    addMessage,
    setHistory,
    setOnlineUsers,
    addSystemMessage,
    addTypingUser,
    removeTypingUser,
    setRooms,
    setCurrentRoomID,
    setPendingImage,
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

  const joinRoom = useCallback((roomID: string) => {
    chatAPI.sendRoomJoin(roomID);
  }, []);

  const createRoom = useCallback((name: string) => {
    chatAPI.sendRoomCreate(name);
  }, []);

  const leaveRoom = useCallback(() => {
    chatAPI.sendRoomLeave();
  }, []);

  const forwardMessage = useCallback((messageID: string, toUsername: string) => {
    chatAPI.sendForward(messageID, toUsername);
  }, []);

  const uploadImage = useCallback(async (file: File) => {
    const url = await chatAPI.uploadImage(file);
    if (url) {
      // Send as markdown image.
      const imageMarkdown = `![image](${url})`;
      chatAPI.sendMessage(imageMarkdown);
    }
    setPendingImage(null);
  }, [setPendingImage]);

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
        const { messages, room_id } = msg as WSHistoryMessage;
        setHistory(messages || []);
        if (room_id) {
          setCurrentRoomID(room_id);
        }
      }),
    );

    unsubs.push(
      chatAPI.on("room_list", (msg: WSMessage) => {
        const { rooms } = msg as WSRoomList;
        if (rooms) {
          setRooms(rooms);
        }
      }),
    );

    unsubs.push(
      chatAPI.on("room_join", (msg: WSMessage) => {
        const { room_id } = msg as WSRoomJoin;
        if (room_id) {
          setCurrentRoomID(room_id);
        }
      }),
    );

    unsubs.push(
      chatAPI.on("forward", (msg: WSMessage) => {
        const { id, from, content, timestamp } = msg as WSForwardEvent;
        addMessage({
          id: id || `fwd-${Date.now()}`,
          username: from,
          content: `[Forwarded] ${content}`,
          timestamp: timestamp || Date.now(),
        });
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
  }, [addMessage, setHistory, setOnlineUsers, addSystemMessage, addTypingUser, removeTypingUser, setRooms, setCurrentRoomID]);

  return { connect, disconnect, sendMessage, joinRoom, createRoom, leaveRoom, forwardMessage, uploadImage };
}
