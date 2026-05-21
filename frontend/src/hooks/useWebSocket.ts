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
  type WSUserStatus,
  type WSRoomList,
  type WSRoomJoin,
  type WSForwardEvent,
  type WSReactionUpdate,
  type WSMessageEditBroadcast,
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
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
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
    setRooms,
    setCurrentRoomID,
    setPendingImage,
    updateMessageReactions,
    editMessageInPlace,
    setUnreadCount,
    deleteMessage,
    setFriends,
    setGroupMembers,
    addFriendRequest,
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

  const markRead = useCallback(() => {
    chatAPI.sendMarkRead();
    setUnreadCount(0);
    unreadTitleCount = 0;
    updatePageTitle();
  }, [setUnreadCount]);

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

  const sendReaction = useCallback((messageId: string, emoji: string) => {
    chatAPI.sendReaction(messageId, emoji);
  }, []);

  const sendMessageEdit = useCallback((messageId: string, content: string) => {
    chatAPI.sendMessageEdit(messageId, content);
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
        addMessage({
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
        addMessage({
          id: m.id,
          username: m.username,
          content: m.content,
          timestamp: m.timestamp || Date.now(),
          to: m.group || "",
          reply_to_id: m.reply_to_id,
          reply_to_content: m.reply_to_content,
          reply_to_user: m.reply_to_user,
        });
      }),
    );

    // History
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

    // Reaction update
    unsubs.push(
      chatAPI.on("reaction_update", (msg: WSMessage) => {
        const { id, reactions } = msg as WSReactionUpdate;
        if (id && reactions) {
          updateMessageReactions(id, reactions);
        }
      }),
    );

    // Message edit
    unsubs.push(
      chatAPI.on("message_edit", (msg: WSMessage) => {
        const { id, content, edited } = msg as WSMessageEditBroadcast;
        if (id && content && edited) {
          editMessageInPlace(id, content);
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
      document.removeEventListener("visibilitychange", handleVisibility);
      if (flashTitleTimer) {
        clearInterval(flashTitleTimer);
        flashTitleTimer = null;
      }
      unsubs.forEach((unsub) => unsub());
      typingTimers.current.forEach((timer) => clearTimeout(timer));
      typingTimers.current.clear();
    };
  }, [addMessage, setHistory, setOnlineUsers, addSystemMessage, addTypingUser, removeTypingUser, setRooms, setCurrentRoomID, updateMessageReactions, editMessageInPlace, setUnreadCount, deleteMessage, setFriends, setGroupMembers, addFriendRequest]);

  return { connect, disconnect, sendMessage, sendDMMessage, sendGroupMessage, markRead, joinRoom, createRoom, leaveRoom, forwardMessage, sendReaction, sendMessageEdit, uploadImage };
}
