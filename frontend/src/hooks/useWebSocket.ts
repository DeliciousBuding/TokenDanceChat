import { useEffect, useCallback, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import {
  chatAPI,
  type WSMessage,
  type ChatMessage,
  type ScheduledMessage,
  type ChatFolder,
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
  type WSCallIncoming,
  type WSCallAccepted,
  type WSCallRejected,
} from "@/lib/api";
import { normalizeGroupInfoMembers } from "@/lib/groupInfo";

// ─── Page title utilities ───

const BASE_TITLE = "TokenDanceChat";
let unreadTitleCount = 0;
let isTabActive = typeof document !== "undefined" ? !document.hidden : true;

function updatePageTitle(): void {
  document.title = getPageTitle(unreadTitleCount, isTabActive);
}

/** Pure computation — exported for testing. */
export function getPageTitle(unreadCount: number, tabActive: boolean): string {
  if (!tabActive && unreadCount > 0) {
    return `(${unreadCount}) ${BASE_TITLE}`;
  }
  return BASE_TITLE;
}

export function i18nSys(key: string, params?: Record<string, string>): string {
  if (params) {
    return JSON.stringify({ key, params });
  }
  return JSON.stringify({ key });
}

// Desktop notification helper
export function notifyMessage(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, icon: "/favicon.svg", silent: true });
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* ignore */ }
}

/** Check if a conversation is muted, considering both legacy mutedConversations
 *  and per-conversation notification preferences with time-based muting. */
export function isConversationMuted(key: string): boolean {
  const state = useChatStore.getState();
  if (state.mutedConversations.includes(key)) return true;
  const pref = state.notificationPrefs[key];
  if (pref && pref.mutedUntil > Date.now()) return true;
  return false;
}

export function useWebSocket() {
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const streamAcc = useRef<Map<string, { content: string; lastFlush: number }>>(
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
    setGroupMemberRole,
    removeMemberFromGroup,
    renameGroupInStore,
    addFriendRequest,
    clearAllConversationUnreads,
    markMessagesReadBy,
    setLatestMention,
    setBlockedUsers,
    setPinnedMessages,
    setPinnedConversations,
    setMutedConversations,
    setNotificationPrefs,
    setArchivedConversations,
    setScheduledMessages,
    removeScheduledMessage,
    setCustomEmojis,
    addCustomEmoji,
    removeCustomEmoji,
    setFolders,
    addFolder,
    removeFolder,
    updateFolder,
    addConversationToFolder,
    removeConversationFromFolder,
    setGroupWebhooks,
    setGroupWebhookAuditLogs,
    addGroupWebhook,
    rotateGroupWebhookSecret,
    removeGroupWebhook,
    setIncomingCall,
    setActiveCall,
    setGroupInfoPanel,
    setTranslation,
  } = useChatStore();

  const connect = useCallback(
    async (name: string) => {
      try {
        await chatAPI.connect(name);
        setConnected(true);
        useChatStore.getState().setGuest(false);
        chatAPI.sendMarkRead();
        chatAPI.sendBlockList();
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
      useChatStore.getState().clearConversationUnread(`dm:${chat.username}`);
    } else if (chat.type === "group") {
      chatAPI.sendMarkRead("group", chat.name);
      useChatStore.getState().clearConversationUnread(`group:${chat.name}`);
    } else {
      chatAPI.sendMarkRead("public");
      useChatStore.getState().clearConversationUnread("public");
    }
    setUnreadCount(0);
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

    // Request notification permission on first interaction.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

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
          if (!isTabActive && !isConversationMuted("public")) import("@/lib/sound").then((m) => m.playMessageSound());
          if (!isConversationMuted("public")) notifyMessage(username, content);
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
        const partner = m.username === state.username ? m.to : (m.from || m.username);
        if (partner && m.username !== state.username && !(state.currentChat.type === "dm" && state.currentChat.username === partner)) {
          useChatStore.getState().incrementConversationUnread(`dm:${partner}`);
          if (!isConversationMuted(`dm:${partner}`)) import("@/lib/sound").then((m) => m.playMessageSound());
          if (!isConversationMuted(`dm:${partner}`)) notifyMessage(partner, m.content);
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
        const state = useChatStore.getState();
        const groupName = m.group || m.to;
        if (groupName && !(state.currentChat.type === "group" && state.currentChat.name === groupName)) {
          useChatStore.getState().incrementConversationUnread(`group:${groupName}`);
          if (!isConversationMuted(`group:${groupName}`)) import("@/lib/sound").then((m) => m.playMessageSound());
          if (!isConversationMuted(`group:${groupName}`)) notifyMessage(groupName, `${m.username}: ${m.content}`);
        }
      }),
    );

    // History
    unsubs.push(
      chatAPI.on("history", (msg: WSMessage) => {
        const { messages, room_id } = msg as WSHistoryMessage;
        const state = useChatStore.getState();
        if (state.historyLoaded) {
          // Pagination: prepend older messages.
          useChatStore.getState().prependHistory(messages || []);
          // If fewer than 50 messages returned, we've hit the beginning.
          if (!messages || messages.length < 50) {
            window.dispatchEvent(new CustomEvent("tdchat:no-more-history"));
          }
        } else {
          setHistory(messages || []);
        }
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

    // Kicked — another session logged in with the same username.
    unsubs.push(
      chatAPI.on("kicked", (msg: WSMessage) => {
        const { content } = msg as { type: string; content: string };
        addSystemMessage(
          content || i18nSys("system.kicked"),
          Date.now(),
        );
        // Reset store state before redirecting to join screen.
        useChatStore.getState().reset();
        useChatStore.getState().setView("join");
        disconnect();
      }),
    );

    // User status / presence updates
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
                import("@/lib/sound").then((m) => m.playOnlineSound());
              }
            }
          }
          const newMap: Record<string, boolean> = {};
          for (const user of users) {
            newMap[user.username] = user.online;
          }
          prevStatusRef.current = newMap;

          setUserStatusList(users);

          // Also populate userProfiles from user_status data.
          const { setUserProfile } = useChatStore.getState();
          for (const user of users) {
            if (user.display_name || user.avatar_url || user.status) {
              setUserProfile({
                username: user.username,
                display_name: user.display_name ?? "",
                avatar_url: user.avatar_url ?? "",
                bio: "",
                status: user.status ?? "",
                last_seen: user.last_seen,
                created_at: 0,
              });
            }
          }
        }
      }),
    );

    // Profile updated broadcast
    unsubs.push(
      chatAPI.on("profile_updated", (msg: WSMessage) => {
        const { username, display_name, avatar_url, bio, status } =
          msg as unknown as { username: string; display_name?: string; avatar_url?: string; bio?: string; status?: string };
        if (username) {
          useChatStore.getState().setUserProfile({
            username,
            display_name: display_name ?? "",
            avatar_url: avatar_url ?? "",
            bio: bio ?? "",
            status: status ?? "",
            last_seen: Date.now(),
            created_at: 0,
          });
        }
      }),
    );

    // Profile get response
    unsubs.push(
      chatAPI.on("profile_get", (msg: WSMessage) => {
        const { username, display_name, avatar_url, bio, status, last_seen } =
          msg as unknown as { username: string; display_name?: string; avatar_url?: string; bio?: string; status?: string; last_seen?: number };
        if (username) {
          useChatStore.getState().setUserProfile({
            username,
            display_name: display_name ?? "",
            avatar_url: avatar_url ?? "",
            bio: bio ?? "",
            status: status ?? "",
            last_seen: last_seen ?? 0,
            created_at: 0,
          });
        }
      }),
    );

    // Status updated broadcast
    unsubs.push(
      chatAPI.on("status_updated", (msg: WSMessage) => {
        const { username, status } = msg as unknown as { username: string; status: string };
        if (username) {
          useChatStore.getState().updateUserProfileStatus(username, status ?? "");
        }
      }),
    );

    // Connection lost / reconnecting
    unsubs.push(
      chatAPI.on("reconnecting", (msg: WSMessage) => {
        const { attempt } = msg as { type: string; attempt: number };
        setConnected(false);
        addSystemMessage(
          i18nSys("system.reconnecting", { attempt: String(attempt + 1) }),
          Date.now(),
        );
      }),
    );

    unsubs.push(
      chatAPI.on("reconnected", () => {
        useChatStore.getState().setConnected(true);
        addSystemMessage(i18nSys("system.reconnected"), Date.now());
      }),
    );

    unsubs.push(
      chatAPI.on("reconnect_failed", () => {
        addSystemMessage(i18nSys("system.reconnectFailed"), Date.now());
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

    // Pinned messages list
    unsubs.push(
      chatAPI.on("pinned_list", (msg: WSMessage) => {
        const { messages } = msg as { type: string; messages: ChatMessage[] };
        if (messages) {
          setPinnedMessages(messages);
        }
      }),
    );

    // Pin event
    unsubs.push(
      chatAPI.on("pinned", (msg: WSMessage) => {
        const { id } = msg as { type: string; id: string; pinned_by: string; pinned_at: number };
        if (id) {
          const state = useChatStore.getState();
          const msgToPin = state.messages.find((m) => m.id === id);
          if (msgToPin) {
            setPinnedMessages([...state.pinnedMessages, msgToPin]);
          }
        }
      }),
    );

    // Unpin event
    unsubs.push(
      chatAPI.on("unpinned", (msg: WSMessage) => {
        const { id } = msg as { type: string; id: string };
        if (id) {
          const state = useChatStore.getState();
          setPinnedMessages(state.pinnedMessages.filter((m) => m.id !== id));
        }
      }),
    );

    // Pinned conversations list
    unsubs.push(
      chatAPI.on("pinned_conversations", (msg: WSMessage) => {
        const { keys } = msg as { type: string; keys: string[] };
        if (keys) {
          setPinnedConversations(keys);
        }
      }),
    );

    // Muted conversations list
    unsubs.push(
      chatAPI.on("muted_conversations", (msg: WSMessage) => {
        const { keys } = msg as { type: string; keys: string[] };
        if (keys) {
          setMutedConversations(keys);
        }
      }),
    );

    // Notification preferences — per-conversation mute duration + preview toggle.
    unsubs.push(
      chatAPI.on("notification_prefs", (msg: WSMessage) => {
        const data = msg as {
          type: string;
          key?: string;
          muted_until?: number;
          show_preview?: boolean;
          notif_prefs?: Array<{ key: string; muted_until: number; show_preview: boolean }>;
        };
        // Single conversation update (echo from notification_prefs_set)
        if (data.key) {
          useChatStore.getState().updateNotificationPref(data.key, {
            mutedUntil: data.muted_until ?? 0,
            showPreview: data.show_preview ?? true,
          });
          // Sync legacy muted conversations.
          const now = Date.now();
          if (data.muted_until && data.muted_until > now) {
            useChatStore.getState().addMutedConversation(data.key);
          } else {
            useChatStore.getState().removeMutedConversation(data.key);
          }
        }
        // Full list update (from notification_prefs_get or join handler)
        if (data.notif_prefs) {
          const prefs: Record<string, { mutedUntil: number; showPreview: boolean }> = {};
          for (const p of data.notif_prefs) {
            prefs[p.key] = { mutedUntil: p.muted_until, showPreview: p.show_preview };
          }
          setNotificationPrefs(prefs);
          // Sync legacy muted conversations from full list.
          const now = Date.now();
          const mutedKeys = data.notif_prefs
            .filter((p) => p.muted_until > now)
            .map((p) => p.key);
          setMutedConversations(mutedKeys);
        }
      }),
    );

    // Archived conversations list
    unsubs.push(
      chatAPI.on("archived_conversations", (msg: WSMessage) => {
        const { keys } = msg as { type: string; keys: string[] };
        if (keys) {
          setArchivedConversations(keys);
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
        if (group && from) {
          useChatStore.getState().addGroupInvite(group, from);
        }
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

    // Group member kicked
    unsubs.push(
      chatAPI.on("group_member_kicked", (msg: WSMessage) => {
        const { group, username, members, content } = msg as {
          type: string;
          group: string;
          username: string;
          members?: string[];
          content?: string;
        };
        if (!group) return;
        const state = useChatStore.getState();
        // If you were kicked, switch to public chat.
        if (username === state.username && content) {
          addSystemMessage(
            JSON.stringify({ key: "system.groupInvited", params: { username: "system", group: `${group}: ${content}` } }),
            Date.now(),
          );
          if (state.currentChat.type === "group" && state.currentChat.name === group) {
            useChatStore.getState().setCurrentChat({ type: "public" });
          }
        }
        if (members) {
          setGroupMembers(group, members);
        } else if (username && username !== state.username) {
          removeMemberFromGroup(group, username);
        }
      }),
    );

    // Group role changed
    unsubs.push(
      chatAPI.on("group_role_changed", (msg: WSMessage) => {
        const { group, username, role } = msg as {
          type: string;
          group: string;
          username: string;
          role: string;
        };
        if (group && username && role) {
          setGroupMemberRole(group, username, role);
        }
      }),
    );

    // Group renamed
    unsubs.push(
      chatAPI.on("group_renamed", (msg: WSMessage) => {
        const { group, content } = msg as {
          type: string;
          group: string;
          content: string;
        };
        if (group && content) {
          renameGroupInStore(content, group);
          // Update current chat if viewing the renamed group.
          const state = useChatStore.getState();
          if (state.currentChat.type === "group" && state.currentChat.name === content) {
            useChatStore.getState().setCurrentChat({ type: "group", name: group });
          }
        }
      }),
    );

    // Group owner changed
    unsubs.push(
      chatAPI.on("group_owner_changed", (msg: WSMessage) => {
        const { group, username } = msg as {
          type: string;
          group: string;
          username: string;
        };
        if (group && username) {
          setGroupMemberRole(group, username, "owner");
        }
      }),
    );

    // Group member left
    unsubs.push(
      chatAPI.on("group_member_left", (msg: WSMessage) => {
        const { group, username, members } = msg as {
          type: string;
          group: string;
          username: string;
          members?: string[];
        };
        if (!group || !username) return;
        if (members) {
          setGroupMembers(group, members);
        } else {
          removeMemberFromGroup(group, username);
        }
      }),
    );

    // Group info
    unsubs.push(
      chatAPI.on("group_info", (msg: WSMessage) => {
        const { group, content, timestamp } = msg as {
          type: string;
          group: string;
          content?: string;
          timestamp?: number;
        };
        const groupMembers = normalizeGroupInfoMembers(msg);
        if (!group || groupMembers.length === 0) return;
        const roles: Record<string, string> = {};
        const memberNames: string[] = [];
        for (const m of groupMembers) {
          memberNames.push(m.username);
          roles[m.username] = m.role;
        }
        const owner = content ?? "";
        const state = useChatStore.getState();
        const existing = state.groups[group];
        setGroupMembers(group, memberNames);
        // Update roles and owner in store.
        useChatStore.setState((s) => ({
          groups: {
            ...s.groups,
            [group]: {
              name: group,
              members: memberNames,
              roles,
              owner,
              created_at: timestamp ?? existing?.created_at ?? 0,
            },
          },
        }));
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
    unsubs.push(
      chatAPI.on("stream", (msg: WSMessage) => {
        const { username: streamUser, content, done } = msg as import("@/lib/api").WSStreamEvent;
        if (!streamUser || streamUser === useChatStore.getState().username) return;
        const streamId = `stream-${streamUser}`;

        let acc = streamAcc.current.get(streamId);
        if (!acc) {
          // New stream: clear any stale message from previous stream.
          const freshState = useChatStore.getState();
          const existing = freshState.messages.find((m) => m.id === streamId);
          if (existing) {
            useChatStore.setState({
              messages: freshState.messages.filter((m) => m.id !== streamId),
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
          const freshState = useChatStore.getState();
          const existing = freshState.messages.find((m) => m.id === streamId);
          if (existing) {
            const updated = { ...existing, content: acc.content };
            useChatStore.setState({
              messages: freshState.messages.map((m) => (m.id === streamId ? updated : m)),
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
            // Remove the stream placeholder so only the persisted
            // message card remains — otherwise the user sees two cards.
            useChatStore.setState({
              messages: useChatStore.getState().messages.filter((m) => m.id !== streamId),
            });
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
          import("@/lib/sound").then((m) => m.playMentionSound());
          // Flash title if tab not active.
          if (!isTabActive) {
            unreadTitleCount++;
            updatePageTitle();
          }
        }
      }),

      // @all / @everyone mention
      chatAPI.on("mention_all", (msg: WSMessage) => {
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
            from: `${from} (@all)`,
            content: (content || "").slice(0, 100),
            messageId: message_id || "",
            roomId: room_id,
            group: grp,
            timestamp: Date.now(),
          });
          import("@/lib/sound").then((m) => m.playMentionSound());
          if (!isTabActive) {
            unreadTitleCount++;
            updatePageTitle();
          }
        }
      }),
    );

    // Translation result
    unsubs.push(
      chatAPI.on("translate_result", (msg: WSMessage) => {
        const { message_id, content } = msg as {
          type: string; message_id: string; content: string;
        };
        if (message_id && content) {
          setTranslation(message_id, content);
        }
      }),
    );

    // Webhook management
    unsubs.push(
      chatAPI.on("webhook_created", (msg: WSMessage) => {
        const { group: grp, id, content, secret } = msg as {
          type: string;
          group: string;
          id: string;
          content: string;
          secret?: string;
        };
        if (grp && id && content && secret) {
          addGroupWebhook(grp, {
            id,
            group_name: grp,
            url: content,
            secret,
            created_by: useChatStore.getState().username,
            created_at: Date.now(),
          });
          setGroupInfoPanel(grp);
          chatAPI.sendWebhookList(grp);
          chatAPI.sendWebhookAuditList(grp);
        }
      }),
    );

    unsubs.push(
      chatAPI.on("webhook_deleted", (msg: WSMessage) => {
        const { group: grp, id } = msg as { type: string; group: string; id: string };
        if (grp && id) {
          removeGroupWebhook(grp, id);
          setGroupInfoPanel(grp);
          chatAPI.sendWebhookList(grp);
          chatAPI.sendWebhookAuditList(grp);
        }
      }),
    );

    unsubs.push(
      chatAPI.on("webhook_rotated", (msg: WSMessage) => {
        const { group: grp, id, content, secret, rotated_at, rotated_by } = msg as {
          type: string;
          group: string;
          id: string;
          content: string;
          secret?: string;
          rotated_at?: number;
          rotated_by?: string;
        };
        if (grp && id && content && secret) {
          rotateGroupWebhookSecret(grp, {
            id,
            group_name: grp,
            url: content,
            secret,
            created_by: "",
            created_at: 0,
            rotated_at,
            rotated_by,
          });
          setGroupInfoPanel(grp);
          chatAPI.sendWebhookList(grp);
          chatAPI.sendWebhookAuditList(grp);
        }
      }),
    );

    unsubs.push(
      chatAPI.on("webhook_list", (msg: WSMessage) => {
        const { group: grp, webhooks } = msg as {
          type: string;
          group: string;
          webhooks?: {
            id: string;
            group_name: string;
            url: string;
            created_by: string;
            created_at: number;
            rotated_at?: number;
            rotated_by?: string;
          }[];
        };
        if (grp && Array.isArray(webhooks)) {
          setGroupWebhooks(grp, webhooks);
        }
      }),
    );

    unsubs.push(
      chatAPI.on("webhook_audit_list", (msg: WSMessage) => {
        const { group: grp, audit_logs } = msg as {
          type: string;
          group: string;
          audit_logs?: {
            id: string;
            webhook_id: string;
            group_name: string;
            action: string;
            actor: string;
            created_at: number;
          }[];
        };
        if (grp && Array.isArray(audit_logs)) {
          setGroupWebhookAuditLogs(grp, audit_logs);
        }
      }),
    );

    // Scheduled message confirm
    unsubs.push(
      chatAPI.on("scheduled_message_confirm", (msg: WSMessage) => {
        const m = msg as {
          type: string; id: string; content: string; username: string;
          timestamp: number; room_id?: string; to?: string; group?: string;
        };
        if (m.id) {
          const newScheduled: ScheduledMessage = {
            id: m.id,
            username: m.username,
            content: m.content,
            room_id: m.room_id ?? "",
            to_user: m.to ?? "",
            group_name: m.group ?? "",
            reply_to_id: "",
            thread_id: "",
            send_at: m.timestamp,
            created_at: Date.now(),
            sent: 0,
          };
          const state = useChatStore.getState();
          setScheduledMessages([newScheduled, ...state.scheduledMessages]);
        }
      }),
    );

    // Scheduled messages list
    unsubs.push(
      chatAPI.on("scheduled_messages_list", (msg: WSMessage) => {
        const m = msg as { type: string; messages: ScheduledMessage[] };
        if (m.messages) {
          setScheduledMessages(m.messages);
        }
      }),
    );

    // Scheduled message sent by server
    unsubs.push(
      chatAPI.on("scheduled_message_sent", (msg: WSMessage) => {
        const m = msg as { type: string; id: string; content: string; username: string; timestamp: number };
        if (m.id) {
          removeScheduledMessage(m.id);
        }
      }),
    );

    // Scheduled message cancelled
    unsubs.push(
      chatAPI.on("scheduled_message_cancelled", (msg: WSMessage) => {
        const m = msg as { type: string; id: string };
        if (m.id) {
          removeScheduledMessage(m.id);
        }
      }),
    );

    // Folder events
    unsubs.push(
      chatAPI.on("folder_created", (msg: WSMessage) => {
        const { id, content } = msg as { type: string; id: string; content: string };
        if (id) {
          addFolder({ id, username: "", name: content, sort_order: 0, created_at: Date.now(), item_count: 0, items: [] });
        }
      }),
      chatAPI.on("folder_deleted", (msg: WSMessage) => {
        const { id } = msg as { type: string; id: string };
        if (id) removeFolder(id);
      }),
      chatAPI.on("folder_renamed", (msg: WSMessage) => {
        const { id, content } = msg as { type: string; id: string; content: string };
        if (id && content) updateFolder(id, { name: content });
      }),
      chatAPI.on("folder_conversation_added", (msg: WSMessage) => {
        const { id, key } = msg as { type: string; id: string; key: string };
        if (id && key) addConversationToFolder(id, key);
      }),
      chatAPI.on("folder_conversation_removed", (msg: WSMessage) => {
        const { id, key } = msg as { type: string; id: string; key: string };
        if (id && key) removeConversationFromFolder(id, key);
      }),
      chatAPI.on("folder_list", (msg: WSMessage) => {
        const { folders } = msg as { type: string; folders: ChatFolder[] };
        if (folders) setFolders(folders);
      }),
    );

    // ─── Call signaling ───

    // Incoming call
    unsubs.push(
      chatAPI.on("call_incoming", (msg: WSMessage) => {
        const m = msg as WSCallIncoming;
        if (!m.call_id || !m.from) return;
        // If already in a call, auto-reject with busy.
        const state = useChatStore.getState();
        if (state.activeCall || state.incomingCall) {
          chatAPI.sendCallReject(m.call_id);
          return;
        }
        setIncomingCall({
          callId: m.call_id,
          from: m.from,
          callType: (m.call_type as "video" | "voice") || "voice",
          sdp: m.sdp || "",
        });
        import("@/lib/sound").then((snd) => snd.playMentionSound());
      }),
    );

    // Call accepted (by callee — forwarded to caller)
    unsubs.push(
      chatAPI.on("call_accepted", (msg: WSMessage) => {
        const m = msg as WSCallAccepted;
        if (!m.call_id) return;
        // The VideoCall component handles the SDP; we don't need to set state here.
        // But the call_accepted is also consumed by VideoCall's internal listener.
      }),
    );

    // Call rejected
    unsubs.push(
      chatAPI.on("call_rejected", (msg: WSMessage) => {
        const m = msg as WSCallRejected;
        // The VideoCall component handles this via its internal listener.
        // If no VideoCall is mounted yet (e.g., caller gets rejected before mounting),
        // just clean up any active call state.
        const state = useChatStore.getState();
        if (m.call_id === state.activeCall?.callId) {
          setActiveCall(null);
        }
      }),
    );

    // Call ended
    unsubs.push(
      chatAPI.on("call_ended", () => {
        // The VideoCall component handles this via its internal listener.
        // Fallback cleanup if VideoCall is not mounted.
        const state = useChatStore.getState();
        if (state.activeCall || state.incomingCall) {
          setActiveCall(null);
          setIncomingCall(null);
        }
      }),
    );

    // ICE candidate relay
    unsubs.push(
      chatAPI.on("call_ice_candidate", (_msg: WSMessage) => {
        // Handled by VideoCall component's internal listener.
      }),
    );

    // Call history list
    unsubs.push(
      chatAPI.on("call_list", (_msg: WSMessage) => {
        // Handled by caller via chatAPI.sendCallList() — UI for history TBD.
      }),
    );

    // Periodic cleanup of stale stream accumulators (bot crash/disconnect).
    const streamCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, acc] of streamAcc.current) {
        if (now - acc.lastFlush > 120_000) {
          streamAcc.current.delete(id);
        }
      }
    }, 60_000);

    return () => {
      clearInterval(streamCleanupTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubs.forEach((unsub) => unsub());
      typingTimers.current.forEach((timer) => clearTimeout(timer));
      typingTimers.current.clear();
    };
  }, [addMessage, setHistory, setOnlineUsers, addSystemMessage, addTypingUser, removeTypingUser, setRooms, setCurrentRoomID, updateMessageReactions, editMessageInPlace, setUnreadCount, deleteMessage, setFriends, setGroupMembers, setGroupMemberRole, removeMemberFromGroup, renameGroupInStore, addFriendRequest, markMessagesReadBy, setLatestMention, setBlockedUsers, setPinnedMessages, setPinnedConversations, setMutedConversations, setArchivedConversations, setScheduledMessages, removeScheduledMessage, setCustomEmojis, addCustomEmoji, removeCustomEmoji, setFolders, addFolder, removeFolder, updateFolder, addConversationToFolder, removeConversationFromFolder, setGroupWebhooks, setGroupWebhookAuditLogs, addGroupWebhook, rotateGroupWebhookSecret, removeGroupWebhook, setIncomingCall, setActiveCall, setNotificationPrefs, setTranslation, setGroupInfoPanel, disconnect]);

  return { connect, disconnect, sendMessage, sendDMMessage, sendGroupMessage, markRead, joinRoom, createRoom, leaveRoom, forwardMessage, sendReaction, sendMessageEdit, uploadImage };
}
