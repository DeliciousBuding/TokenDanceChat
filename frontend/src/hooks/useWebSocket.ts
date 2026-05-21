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
import { playMessageSound, playMentionSound } from "@/lib/sound";

// --- Page title utilities ---

const BASE_TITLE = "TokenDanceChat";
let unreadTitleCount = 0;
let isTabActive = true;

function updatePageTitle(): void {
  if (!isTabActive && unreadTitleCount > 0) {
    document.title = `(${unreadTitleCount}) ${BASE_TITLE}`;
  } else {
    document.title = BASE_TITLE;
  }
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
    clearAllConversationUnreads,
    markMessagesReadBy,
    setLatestMention,
    setBlockedUsers,
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
    const state = useChatStore.getState();
    const chat = state.currentChat;
    if (chat.type === "dm") {
      chatAPI.sendMarkRead("dm", chat.username);
    } else if (chat.type === "group") {
      chatAPI.sendMarkRead("group", chat.name);
    } else {
      chatAPI.sendMarkRead("public");
    }
    setUnreadCount(0);
    clearAllConversationUnreads();
    unreadTitleCount = 0;
    updatePageTitle();
  }, [setUnreadCount, clearAllConversationUnreads]);

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
      const state = useChatStore.getState();
      const isImage = file.type.startsWith("image/");
      const fileMarkdown = isImage ? `![image](${url})` : `[${file.name}](${url})`;
      if (state.currentChat.type === "dm") {
        chatAPI.sendDMMessage(state.currentChat.username, fileMarkdown, state.replyTo || undefined);
      } else if (state.currentChat.type === "group") {
        chatAPI.sendGroupMessage(state.currentChat.name, fileMarkdown, state.replyTo || undefined);
      } else {
        chatAPI.sendMessage(fileMarkdown, state.replyTo || undefined);
      }
      state.setReplyTo(null);
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
        // Increment unread for public chat if not currently viewing it.
        const state = useChatStore.getState();
        if (state.currentChat.type !== "public") {
          useChatStore.getState().incrementConversationUnread("public");
          if (!isTabActive) playMessageSound();
        }
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
        // Increment unread for this DM if not currently viewing it.
        const state = useChatStore.getState();
        const partner = m.from || m.username;
        if (!(state.currentChat.type === "dm" && state.currentChat.username === partner)) {
          useChatStore.getState().incrementConversationUnread(`dm:${partner}`);
          playMessageSound();
        }
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
        // Increment unread for this group if not currently viewing it.
        const state = useChatStore.getState();
        const groupName = m.group || m.to;
        if (groupName && !(state.currentChat.type === "group" && state.currentChat.name === groupName)) {
          useChatStore.getState().incrementConversationUnread(`group:${groupName}`);
          playMessageSound();
        }
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
          const isFirstEvent = Object.keys(prevStatusRef.current).length === 0;
          if (!isFirstEvent) {
            for (const user of users) {
              const prevOnline = prevStatusRef.current[user.username];
              if (prevOnline === false && user.online === true) {
                addSystemMessage(
                  i18nSys("system.userOnline", { username: user.username }),
                  Date.now(),
                );
              }
            }
          }
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

    // Block list
    unsubs.push(
      chatAPI.on("block_list", (msg: WSMessage) => {
        const { blocked } = msg as { type: string; blocked: string[] };
        if (blocked) {
          setBlockedUsers(blocked);
        }
      }),
    );

    // Block confirmation
    unsubs.push(
      chatAPI.on("block", (msg: WSMessage) => {
        const { username: blockedUser } = msg as { type: string; username: string };
        if (blockedUser) {
          useChatStore.getState().addBlockedUser(blockedUser);
        }
      }),
    );

    // Unblock confirmation
    unsubs.push(
      chatAPI.on("unblock", (msg: WSMessage) => {
        const { username: unblockedUser } = msg as { type: string; username: string };
        if (unblockedUser) {
          useChatStore.getState().removeBlockedUser(unblockedUser);
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

    // Streaming bot response — accumulate and throttle chunks.
    const streamAcc = useRef<Map<string, { content: string; lastFlush: number }>>(new Map());
    unsubs.push(
      chatAPI.on("stream", (msg: WSMessage) => {
        const { username: streamUser, content, done } = msg as import("@/lib/api").WSStreamEvent;
        if (!streamUser || streamUser === useChatStore.getState().username) return;
        const streamId = `stream-${streamUser}`;
        const state = useChatStore.getState();
        const existing = state.messages.find((m) => m.id === streamId);

        let acc = streamAcc.current.get(streamId);
        if (!acc) {
          // New stream: clear any stale message from previous stream.
          if (existing) {
            useChatStore.setState({
              messages: state.messages.filter((m) => m.id !== streamId),
            });
          }
          acc = { content: "", lastFlush: 0 };
          streamAcc.current.set(streamId, acc);
        }
        acc.content += content || "";
        const now = Date.now();

        // Flush to store every 80ms or when done (avoids O(n^2) string concat and excessive re-renders).
        if (done || now - acc.lastFlush > 80) {
          acc.lastFlush = now;
          if (existing) {
            const updated = { ...existing, content: acc.content };
            useChatStore.setState({
              messages: state.messages.map((m) => (m.id === streamId ? updated : m)),
            });
          } else if (acc.content) {
            addMessage({
              id: streamId,
              username: streamUser,
              content: acc.content,
              timestamp: Date.now(),
            });
          }
          if (done) {
            removeTypingUser(streamUser);
            streamAcc.current.delete(streamId);
          }
        }
      }),
    );

    // Typing indicator — scoped to current chat context.
    unsubs.push(
      chatAPI.on("typing", (msg: WSMessage) => {
        const { username: typingUser, context: typingCtx, to: typingTarget } = msg as WSTypingEvent;
        // Filter by chat context: only show typing for matching scope.
        const state = useChatStore.getState();
        if (typingCtx) {
          if (typingCtx === "dm") {
            if (state.currentChat.type !== "dm" || state.currentChat.username !== typingUser) return;
          } else if (typingCtx === "group") {
            if (state.currentChat.type !== "group" || state.currentChat.name !== typingTarget) return;
          } else if (typingCtx === "public") {
            if (state.currentChat.type !== "public") return;
          }
        }
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

    // Typing stop — immediately remove user from typing list.
    unsubs.push(
      chatAPI.on("typing_stop", (msg: WSMessage) => {
        const { username: typingUser } = msg as WSTypingEvent;
        removeTypingUser(typingUser);
        const existing = typingTimers.current.get(typingUser);
        if (existing) clearTimeout(existing);
        typingTimers.current.delete(typingUser);
      }),
    );

    // Read receipt — someone read our messages.
    unsubs.push(
      chatAPI.on("read_receipt", (msg: WSMessage) => {
        const { from } = msg as { type: string; from: string };
        if (from) {
          markMessagesReadBy(from);
        }
      }),
    );

    // Mention notification — someone @mentioned us.
    unsubs.push(
      chatAPI.on("mention_notify", (msg: WSMessage) => {
        const { from, content, message_id, room_id, group: grp } = msg as {
          type: string;
          from: string;
          content: string;
          message_id: string;
          room_id?: string;
          group?: string;
        };
        if (from) {
          setLatestMention({
            from,
            content: (content || "").slice(0, 100),
            messageId: message_id || "",
            roomId: room_id,
            group: grp,
            timestamp: Date.now(),
          });
          playMentionSound();
          // Flash title if tab not active.
          if (!isTabActive) {
            unreadTitleCount++;
            updatePageTitle();
          }
        }
      }),
    );

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubs.forEach((unsub) => unsub());
      typingTimers.current.forEach((timer) => clearTimeout(timer));
      typingTimers.current.clear();
    };
  }, [addMessage, setHistory, setOnlineUsers, addSystemMessage, addTypingUser, removeTypingUser, setRooms, setCurrentRoomID, updateMessageReactions, editMessageInPlace, setUnreadCount, deleteMessage, setFriends, setGroupMembers, addFriendRequest, markMessagesReadBy, setLatestMention, setBlockedUsers]);

  return { connect, disconnect, sendMessage, sendDMMessage, sendGroupMessage, markRead, joinRoom, createRoom, leaveRoom, forwardMessage, sendReaction, sendMessageEdit, uploadImage };
}
