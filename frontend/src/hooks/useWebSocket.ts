import { useEffect, useCallback, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import {
  chatAPI,
  type WSMessage,
  type ChatMessage,
  type WSChatMessage,
  type WSHistoryMessage,
  type WSUserEvent,
  type WSTypingEvent,
} from "@/lib/api";

function i18nSys(key: string, params?: Record<string, string>): string {
  if (params) {
    return JSON.stringify({ key, params });
  }
  return JSON.stringify({ key });
}

export function useWebSocket() {
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const {
    setConnected,
    addMessage,
    setHistory,
    setOnlineUsers,
    addSystemMessage,
    addTypingUser,
    removeTypingUser,
    setFriends,
    addFriendRequest,
    removeFriendRequest,
    setGroupMembers,
    addDMMessage,
    addGroupMessage,
    deleteMessage,
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

  const sendMessage = useCallback(
    (content: string) => {
      const state = useChatStore.getState();
      chatAPI.sendMessage(content, state.replyTo || undefined);
      // Clear reply after sending.
      useChatStore.getState().setReplyTo(null);
    },
    [],
  );

  const sendDMMessage = useCallback(
    (to: string, content: string) => {
      const state = useChatStore.getState();
      chatAPI.sendDMMessage(to, content, state.replyTo || undefined);
      useChatStore.getState().setReplyTo(null);
    },
    [],
  );

  const sendGroupMessage = useCallback(
    (group: string, content: string) => {
      const state = useChatStore.getState();
      chatAPI.sendGroupMessage(group, content, state.replyTo || undefined);
      useChatStore.getState().setReplyTo(null);
    },
    [],
  );

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // Public chat message
    unsubs.push(
      chatAPI.on("message", (msg: WSMessage) => {
        const { id, username, content, timestamp, reply_to_id, reply_to_content, reply_to_user } =
          msg as WSChatMessage;
        addMessage({
          id,
          username,
          content,
          timestamp: timestamp || Date.now(),
          reply_to_id,
          reply_to_content,
          reply_to_user,
        } as ChatMessage);
        removeTypingUser(username);
      }),
    );

    // DM message
    unsubs.push(
      chatAPI.on("dm_message", (msg: WSMessage) => {
        const m = msg as unknown as ChatMessage;
        addDMMessage({
          id: m.id,
          username: m.username,
          content: m.content,
          timestamp: m.timestamp || Date.now(),
          to: m.to,
          from: m.from || m.username,
          reply_to_id: m.reply_to_id,
          reply_to_content: m.reply_to_content,
          reply_to_user: m.reply_to_user,
        });
      }),
    );

    // Group message
    unsubs.push(
      chatAPI.on("group_message", (msg: WSMessage) => {
        const m = msg as unknown as ChatMessage & { group?: string };
        addGroupMessage({
          id: m.id,
          username: m.username,
          content: m.content,
          timestamp: m.timestamp || Date.now(),
          group: m.group || "",
          reply_to_id: m.reply_to_id,
          reply_to_content: m.reply_to_content,
          reply_to_user: m.reply_to_user,
        });
      }),
    );

    // History
    unsubs.push(
      chatAPI.on("history", (msg: WSMessage) => {
        const { messages } = msg as WSHistoryMessage;
        setHistory(messages || []);
      }),
    );

    // User joined
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

    // User left
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

    // Online users sync
    unsubs.push(
      chatAPI.on("online_users", (msg: WSMessage) => {
        const { online } = msg as { type: string; online: string[] };
        if (online) {
          setOnlineUsers(online);
        }
      }),
    );

    // Connection lost
    unsubs.push(
      chatAPI.on("connection_lost", () => {
        addSystemMessage(i18nSys("system.connectionLost"), Date.now());
      }),
    );

    // Friend request
    unsubs.push(
      chatAPI.on("friend_request", (msg: WSMessage) => {
        const { from } = msg as { type: string; from: string };
        addFriendRequest(from);
      }),
    );

    // Friend accept
    unsubs.push(
      chatAPI.on("friend_accept", (msg: WSMessage) => {
        const { friends } = msg as { type: string; friends: string[] };
        if (friends) {
          setFriends(friends);
        }
      }),
    );

    // Friend reject
    unsubs.push(
      chatAPI.on("friend_reject", (msg: WSMessage) => {
        const { from } = msg as { type: string; from: string };
        addSystemMessage(
          i18nSys("system.friendRejected", { username: from }),
          Date.now(),
        );
      }),
    );

    // Friend list
    unsubs.push(
      chatAPI.on("friend_list", (msg: WSMessage) => {
        const { friends } = msg as { type: string; friends: string[] };
        if (friends) {
          setFriends(friends);
        }
      }),
    );

    // Group create
    unsubs.push(
      chatAPI.on("group_create", (msg: WSMessage) => {
        const { group, members } = msg as {
          type: string;
          group: string;
          members: string[];
        };
        if (group && members) {
          setGroupMembers(group, members);
        }
      }),
    );

    // Group invite
    unsubs.push(
      chatAPI.on("group_invite", (msg: WSMessage) => {
        const { group, from } = msg as {
          type: string;
          group: string;
          from: string;
        };
        addSystemMessage(
          i18nSys("system.groupInvited", { group, username: from }),
          Date.now(),
        );
      }),
    );

    // Group join (membership update)
    unsubs.push(
      chatAPI.on("group_join", (msg: WSMessage) => {
        const { group, members } = msg as {
          type: string;
          group: string;
          members: string[];
        };
        if (group && members) {
          setGroupMembers(group, members);
        }
      }),
    );

    // Message delete
    unsubs.push(
      chatAPI.on("message_delete", (msg: WSMessage) => {
        const { id } = msg as { type: string; id: string };
        if (id) {
          deleteMessage(id);
        }
      }),
    );

    // Typing indicator
    unsubs.push(
      chatAPI.on("typing", (msg: WSMessage) => {
        const { username: typingUser } = msg as WSTypingEvent;
        addTypingUser(typingUser);

        const existing = typingTimers.current.get(typingUser);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
          removeTypingUser(typingUser);
          typingTimers.current.delete(typingUser);
        }, 10000);
        typingTimers.current.set(typingUser, timer);
      }),
    );

    return () => {
      unsubs.forEach((unsub) => unsub());
      typingTimers.current.forEach((timer) => clearTimeout(timer));
      typingTimers.current.clear();
    };
  }, [
    addMessage,
    setHistory,
    setOnlineUsers,
    addSystemMessage,
    addTypingUser,
    removeTypingUser,
    setFriends,
    addFriendRequest,
    removeFriendRequest,
    setGroupMembers,
    addDMMessage,
    addGroupMessage,
    deleteMessage,
  ]);

  return { connect, disconnect, sendMessage, sendDMMessage, sendGroupMessage };
}
