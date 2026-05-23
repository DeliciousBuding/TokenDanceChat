import { create } from "zustand";
import type { ChatMessage, RoomInfo, UserStatus, ScheduledMessage, CustomEmoji, ChatFolder, PollData } from "@/lib/api";

const MESSAGE_CAP = 500;

function getLSLastReadKey(username: string): string {
  return `tokendance:lastReadTimestamps:${username}`;
}

function loadLastReadTimestamps(username: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(getLSLastReadKey(username));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export type ViewState = "join" | "chat";

export interface DM {
  username: string;
  messages: ChatMessage[];
}

export interface GroupInfo {
  name: string;
  members: string[];
  roles: Record<string, string>;
  owner: string;
  created_at: number;
}

export type CurrentChat =
  | { type: "public" }
  | { type: "dm"; username: string }
  | { type: "group"; name: string };

export interface PendingFriendRequest {
  from: string;
  timestamp: number;
}

export interface PendingGroupInvite {
  group: string;
  from: string;
  timestamp: number;
}

export interface MentionNotification {
  from: string;
  content: string;
  messageId: string;
  roomId?: string;
  group?: string;
  timestamp: number;
}

export interface UserProfile {
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  status: string;
  last_seen: number;
  created_at: number;
}

export interface NotificationPref {
  mutedUntil: number;
  showPreview: boolean;
}

export interface WebhookInfo {
  id: string;
  group_name: string;
  url: string;
  created_by: string;
  created_at: number;
  rotated_at?: number;
  rotated_by?: string;
}

export interface CreatedWebhookInfo extends WebhookInfo {
  secret: string;
}

export interface WebhookAuditLog {
  id: string;
  webhook_id: string;
  group_name: string;
  action: "created" | "rotated" | "deleted" | string;
  actor: string;
  created_at: number;
}

export interface IncomingCall {
  callId: string;
  from: string;
  callType: "video" | "voice";
  sdp: string;
}

export interface ActiveCall {
  callId: string;
  peer: string;
  callType: "video" | "voice";
  startTime: number;
  // Group call fields
  roomId?: string;
  participants?: string[];
  isGroupCall?: boolean;
  groupName?: string;
}

interface ChatState {
  // Connection state
  view: ViewState;
  username: string;
  connected: boolean;
  isGuest: boolean;

  // Messages
  messages: ChatMessage[];
  historyLoaded: boolean;
  // Lookup maps for O(1) reaction and read receipt updates (avoid O(n) array copies)
  reactionsByMessageId: Record<string, Record<string, string[]>>;
  readByMessageId: Record<string, string[]>;
  // Per-conversation last message preview cache (avoids O(n) reverse scan)
  lastPreviews: Record<string, { content: string; timestamp: number; sender: string }>;

  // Online users
  onlineUsers: string[];

  // User status list (all known users with online/offline status)
  userStatusList: UserStatus[];

  // Profile card
  selectedProfileUser: string | null;

  // Typing users
  typingUsers: string[];
  typingPreviews: Record<string, string>;

  // Rooms
  rooms: RoomInfo[];
  currentRoomID: string;

  // Chat context
  currentChat: CurrentChat;
  replyTo: ChatMessage | null;

  // Friends
  friends: string[];

  // Pending friend requests
  pendingFriendRequests: PendingFriendRequest[];

  // Pending group invites
  pendingGroupInvites: PendingGroupInvite[];

  // Groups
  groups: Record<string, GroupInfo>;

  // Group info panel
  groupInfoPanel: string | null;

  // Image preview (before sending)
  pendingImage: string | null;

  // Unread count
  unreadCount: number;
  unreadByConversation: Record<string, number>;

  // Last read timestamps (per conversation) for "New messages" unread divider
  lastReadTimestamps: Record<string, number>;

  // Mention notifications
  latestMention: MentionNotification | null;

  // Blocked users
  blockedUsers: string[];

  // Pinned messages
  pinnedMessages: ChatMessage[];

  // Pinned conversations
  pinnedConversations: string[];

  // Muted conversations (legacy)
  mutedConversations: string[];

  // Notification preferences (per-conversation mute duration + preview toggle)
  notificationPrefs: Record<string, NotificationPref>;

  // Archived conversations
  archivedConversations: string[];

  // Lightbox
  lightboxImage: string | null;

  // User profiles
  userProfiles: Record<string, UserProfile>;

  // Scheduled messages
  scheduledMessages: ScheduledMessage[];
  customEmojis: CustomEmoji[];
  folders: ChatFolder[];
  groupWebhooks: Record<string, WebhookInfo[]>;
  groupWebhookAuditLogs: Record<string, WebhookAuditLog[]>;
  latestCreatedWebhook: CreatedWebhookInfo | null;
  translations: Record<string, string>; // messageId -> translated text

  // Call state
  incomingCall: IncomingCall | null;
  activeCall: ActiveCall | null;

  // Polls
  polls: Record<string, PollData>;

  // Actions
  setView: (view: ViewState) => void;
  setUsername: (username: string) => void;
  setConnected: (connected: boolean) => void;
  setGuest: (isGuest: boolean) => void;
  addMessage: (message: ChatMessage) => void;
  deleteMessage: (id: string) => void;
  addSystemMessage: (content: string, timestamp: number) => void;
  setHistory: (messages: ChatMessage[]) => void;
  prependHistory: (messages: ChatMessage[]) => void;
  setOnlineUsers: (users: string[]) => void;
  setUserStatusList: (users: UserStatus[]) => void;
  setSelectedProfileUser: (username: string | null) => void;
  setTypingUsers: (users: string[]) => void;
  addTypingUser: (username: string, preview?: string) => void;
  removeTypingUser: (username: string) => void;
  setRooms: (rooms: RoomInfo[]) => void;
  setCurrentRoomID: (roomID: string) => void;
  setCurrentChat: (chat: CurrentChat) => void;
  setReplyTo: (message: ChatMessage | null) => void;
  setFriends: (friends: string[]) => void;
  addFriendRequest: (from: string) => void;
  addGroupInvite: (group: string, from: string) => void;
  removeGroupInvite: (group: string) => void;
  setGroupMembers: (group: string, members: string[]) => void;
  setGroupMemberRole: (group: string, username: string, role: string) => void;
  removeMemberFromGroup: (group: string, username: string) => void;
  renameGroupInStore: (oldName: string, newName: string) => void;
  setGroupInfoPanel: (groupName: string | null) => void;
  setPendingImage: (imageDataUrl: string | null) => void;
  setUnreadCount: (count: number) => void;
  incrementConversationUnread: (key: string) => void;
  clearConversationUnread: (key: string) => void;
  clearAllConversationUnreads: () => void;
  markConversationRead: (key: string) => void;
  updateMessageReactions: (messageId: string, reactions: Record<string, string[]>) => void;
  editMessageInPlace: (messageId: string, content: string) => void;
  markMessagesReadBy: (reader: string) => void;
  setLatestMention: (mention: MentionNotification | null) => void;
  setBlockedUsers: (users: string[]) => void;
  addBlockedUser: (username: string) => void;
  removeBlockedUser: (username: string) => void;
  setPinnedMessages: (messages: ChatMessage[]) => void;
  setPinnedConversations: (keys: string[]) => void;
  addPinnedConversation: (key: string) => void;
  removePinnedConversation: (key: string) => void;
  setMutedConversations: (keys: string[]) => void;
  addMutedConversation: (key: string) => void;
  removeMutedConversation: (key: string) => void;
  setNotificationPrefs: (prefs: Record<string, NotificationPref>) => void;
  updateNotificationPref: (key: string, pref: NotificationPref) => void;
  setArchivedConversations: (keys: string[]) => void;
  addArchivedConversation: (key: string) => void;
  removeArchivedConversation: (key: string) => void;
  setLightboxImage: (url: string | null) => void;
  setUserProfile: (profile: UserProfile) => void;
  removeUserProfile: (username: string) => void;
  updateUserProfileStatus: (username: string, status: string) => void;
  setScheduledMessages: (messages: ScheduledMessage[]) => void;
  removeScheduledMessage: (id: string) => void;
  setCustomEmojis: (emojis: CustomEmoji[]) => void;
  addCustomEmoji: (emoji: CustomEmoji) => void;
  removeCustomEmoji: (name: string) => void;
  setFolders: (folders: ChatFolder[]) => void;
  addFolder: (folder: ChatFolder) => void;
  removeFolder: (id: string) => void;
  updateFolder: (id: string, data: Partial<ChatFolder>) => void;
  addConversationToFolder: (folderId: string, key: string) => void;
  removeConversationFromFolder: (folderId: string, key: string) => void;
  setGroupWebhooks: (group: string, webhooks: WebhookInfo[]) => void;
  setGroupWebhookAuditLogs: (group: string, logs: WebhookAuditLog[]) => void;
  addGroupWebhook: (group: string, webhook: CreatedWebhookInfo) => void;
  rotateGroupWebhookSecret: (group: string, webhook: CreatedWebhookInfo) => void;
  removeGroupWebhook: (group: string, id: string) => void;
  clearLatestCreatedWebhook: () => void;
  setTranslation: (messageId: string, text: string) => void;
  setIncomingCall: (call: IncomingCall | null) => void;
  setActiveCall: (call: ActiveCall | null) => void;
  updatePoll: (pollId: string, poll: PollData) => void;
  removePoll: (pollId: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  view: "join",
  username: "",
  connected: false,
  isGuest: false,
  messages: [],
  historyLoaded: false,
  reactionsByMessageId: {},
  readByMessageId: {},
  lastPreviews: {},
  onlineUsers: [],
  userStatusList: [],
  selectedProfileUser: null,
  typingUsers: [],
  typingPreviews: {},
  rooms: [],
  currentRoomID: "",
  currentChat: { type: "public" },
  replyTo: null,
  friends: [],
  pendingFriendRequests: [],
  pendingGroupInvites: [],
  groups: {},
  groupInfoPanel: null,
  pendingImage: null,
  unreadCount: 0,
  unreadByConversation: {},
  lastReadTimestamps: loadLastReadTimestamps(""),
  latestMention: null,
  blockedUsers: [],
  pinnedMessages: [],
  pinnedConversations: [],
  mutedConversations: [],
  notificationPrefs: {},
  archivedConversations: [],
  lightboxImage: null,
  userProfiles: {},
  scheduledMessages: [],
  customEmojis: [],
  folders: [],
  groupWebhooks: {},
  groupWebhookAuditLogs: {},
  latestCreatedWebhook: null,
  translations: {},
  incomingCall: null,
  activeCall: null,
  polls: {},

  setView: (view) => set({ view }),
  setUsername: (username) => set({ username, lastReadTimestamps: loadLastReadTimestamps(username) }),
  setConnected: (connected) => set({ connected }),
  setGuest: (isGuest) => set({ isGuest }),
  addMessage: (message) =>
    set((state) => {
      // Filter out messages from blocked users.
      if (state.blockedUsers.includes(message.username)) return state;
      const messages = [...state.messages, message];
      if (messages.length > MESSAGE_CAP) {
        messages.splice(0, messages.length - MESSAGE_CAP);
      }

      // Update lastPreviews cache (O(1) map lookup instead of O(n) reverse scan).
      if (!message.deleted && message.username !== "system" && message.content) {
        const msgSender = message.from || message.username;
        const msgRecipient = message.to;
        let key: string;
        if (message.group) {
          key = `group:${message.group}`;
        } else if (message.to) {
          // Distinguish group (to is a known group name) from DM (to is a username).
          if (state.groups[message.to]) {
            key = `group:${message.to}`;
          } else {
            const partner = msgSender === state.username ? msgRecipient : msgSender;
            key = `dm:${partner}`;
          }
        } else {
          key = "public";
        }
        let content = message.content;
        if (content.length > 50) {
          content = content.slice(0, 47) + "...";
        }
        if (message.username === state.username) {
          content = "You: " + content;
        }
        state.lastPreviews[key] = { content, timestamp: message.timestamp, sender: message.username };
      }

      return { messages };
    }),
  deleteMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    })),
  addSystemMessage: (content, timestamp) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: `sys-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
          username: "system",
          content,
          timestamp,
        },
      ],
    })),
  setHistory: (incoming) =>
    set((state) => {
      const existingIDs = new Set(state.messages.map((m) => m.id));
      const newMessages = incoming.filter((m) => !existingIDs.has(m.id));
      // Populate lastPreviews from history messages (chronological, so last wins).
      for (const m of newMessages) {
        if (m.deleted || m.username === "system" || !m.content) continue;
        const msgSender = m.from || m.username;
        const msgRecipient = m.to;
        let key: string;
        if (m.group) {
          key = `group:${m.group}`;
        } else if (m.to) {
          if (state.groups[m.to]) {
            key = `group:${m.to}`;
          } else {
            const partner = msgSender === state.username ? msgRecipient : msgSender;
            key = `dm:${partner}`;
          }
        } else {
          key = "public";
        }
        let content = m.content;
        if (content.length > 50) {
          content = content.slice(0, 47) + "...";
        }
        if (m.username === state.username) {
          content = "You: " + content;
        }
        state.lastPreviews[key] = { content, timestamp: m.timestamp, sender: m.username };
      }
      return {
        messages: [...state.messages, ...newMessages],
        historyLoaded: true,
      };
    }),
  prependHistory: (incoming) =>
    set((state) => {
      const existingIDs = new Set(state.messages.map((m) => m.id));
      const newMessages = incoming.filter((m) => !existingIDs.has(m.id));
      if (newMessages.length === 0) return state;
      const merged = [...newMessages, ...state.messages];
      // Cap total messages at 1000 to prevent unbounded growth from pagination.
      if (merged.length > 1000) {
        merged.length = 1000;
      }
      return { messages: merged };
    }),
  setOnlineUsers: (onlineUsers) => set({ onlineUsers }),
  setUserStatusList: (userStatusList) => set({ userStatusList }),
  setSelectedProfileUser: (selectedProfileUser) => set({ selectedProfileUser }),
  setTypingUsers: (typingUsers) => set({ typingUsers }),
  addTypingUser: (username) =>
    set((state) => ({
      typingUsers: state.typingUsers.includes(username)
        ? state.typingUsers
        : [...state.typingUsers, username],
    })),
  removeTypingUser: (username) =>
    set((state) => ({
      typingUsers: state.typingUsers.filter((u) => u !== username),
    })),
  setRooms: (rooms) => set({ rooms }),
  setCurrentRoomID: (currentRoomID) => set({ currentRoomID }),
  setCurrentChat: (currentChat) =>
    set((state) => {
      // Mark the conversation being left as read up to this point.
      const oldKey =
        state.currentChat.type === "dm"
          ? `dm:${state.currentChat.username}`
          : state.currentChat.type === "group"
            ? `group:${state.currentChat.name}`
            : "public";
      const nextTimestamps = { ...state.lastReadTimestamps, [oldKey]: Date.now() };
      try {
        localStorage.setItem(getLSLastReadKey(state.username), JSON.stringify(nextTimestamps));
      } catch { /* quota exceeded */ }
      return { currentChat, pendingImage: null, lastReadTimestamps: nextTimestamps };
    }),
  setReplyTo: (replyTo) => set({ replyTo }),
  setFriends: (friends) => set({ friends }),
  addFriendRequest: (from) =>
    set((state) => ({
      pendingFriendRequests: [
        ...state.pendingFriendRequests,
        { from, timestamp: Date.now() },
      ],
    })),
  addGroupInvite: (group, from) =>
    set((state) => ({
      pendingGroupInvites: [
        ...state.pendingGroupInvites,
        { group, from, timestamp: Date.now() },
      ],
    })),
  removeGroupInvite: (group) =>
    set((state) => ({
      pendingGroupInvites: state.pendingGroupInvites.filter((i) => i.group !== group),
    })),
  setGroupMembers: (group, members) =>
    set((state) => {
      const existing = state.groups[group];
      const roles = existing?.roles ?? {};
      // Preserve existing roles, default new members to "member".
      for (const m of members) {
        if (!roles[m]) roles[m] = "member";
      }
      return {
        groups: {
          ...state.groups,
          [group]: { name: group, members, roles, owner: existing?.owner ?? "", created_at: existing?.created_at ?? 0 },
        },
      };
    }),
  setGroupMemberRole: (group, username, role) =>
    set((state) => {
      const g = state.groups[group];
      if (!g) return state;
      return {
        groups: {
          ...state.groups,
          [group]: {
            ...g,
            roles: { ...g.roles, [username]: role },
            owner: role === "owner" ? username : g.owner,
          },
        },
      };
    }),
  removeMemberFromGroup: (group, username) =>
    set((state) => {
      const g = state.groups[group];
      if (!g) return state;
      const members = g.members.filter((m) => m !== username);
      const roles = { ...g.roles };
      delete roles[username];
      // If group is empty after removal, remove the group entirely.
      if (members.length === 0) {
        const next = { ...state.groups };
        delete next[group];
        return { groups: next };
      }
      return {
        groups: {
          ...state.groups,
          [group]: { ...g, members, roles },
        },
      };
    }),
  renameGroupInStore: (oldName, newName) =>
    set((state) => {
      const g = state.groups[oldName];
      if (!g) return state;
      const next = { ...state.groups };
      delete next[oldName];
      next[newName] = { ...g, name: newName };
      return { groups: next };
    }),
  setGroupInfoPanel: (groupName) => set({ groupInfoPanel: groupName }),
  setPendingImage: (pendingImage) => set({ pendingImage }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  incrementConversationUnread: (key) =>
    set((state) => ({
      unreadByConversation: {
        ...state.unreadByConversation,
        [key]: (state.unreadByConversation[key] || 0) + 1,
      },
    })),
  clearConversationUnread: (key) =>
    set((state) => {
      if (!state.unreadByConversation[key]) return state;
      const next = { ...state.unreadByConversation };
      delete next[key];
      const nextTimestamps = { ...state.lastReadTimestamps, [key]: Date.now() };
      try {
        localStorage.setItem(getLSLastReadKey(state.username), JSON.stringify(nextTimestamps));
      } catch { /* quota exceeded */ }
      return { unreadByConversation: next, lastReadTimestamps: nextTimestamps };
    }),
  clearAllConversationUnreads: () => set({ unreadByConversation: {} }),
  markConversationRead: (key) =>
    set((state) => {
      const nextTimestamps = { ...state.lastReadTimestamps, [key]: Date.now() };
      try {
        localStorage.setItem(getLSLastReadKey(state.username), JSON.stringify(nextTimestamps));
      } catch { /* quota exceeded */ }
      const nextUnread = { ...state.unreadByConversation };
      delete nextUnread[key];
      return { lastReadTimestamps: nextTimestamps, unreadByConversation: nextUnread };
    }),
  updateMessageReactions: (messageId, reactions) =>
    set((state) => ({
      reactionsByMessageId: { ...state.reactionsByMessageId, [messageId]: reactions },
    })),
  editMessageInPlace: (messageId, content) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, content, edited: true } : m,
      ),
    })),
  markMessagesReadBy: (reader) =>
    set((state) => {
      const next = { ...state.readByMessageId };
      let changed = false;
      for (const m of state.messages) {
        if (m.username !== state.username) continue;
        const existing = next[m.id] || m.read_by || [];
        if (existing.includes(reader)) continue;
        next[m.id] = [...existing, reader];
        changed = true;
      }
      if (!changed) return state;
      return { readByMessageId: next };
    }),
  setLatestMention: (latestMention) => set({ latestMention }),
  setBlockedUsers: (blockedUsers) => set({ blockedUsers }),
  addBlockedUser: (username) =>
    set((state) => ({
      blockedUsers: state.blockedUsers.includes(username)
        ? state.blockedUsers
        : [...state.blockedUsers, username],
    })),
  removeBlockedUser: (username) =>
    set((state) => ({
      blockedUsers: state.blockedUsers.filter((u) => u !== username),
    })),
  setPinnedMessages: (pinnedMessages) => set({ pinnedMessages }),
  setPinnedConversations: (pinnedConversations) => set({ pinnedConversations }),
  addPinnedConversation: (key) =>
    set((state) => ({
      pinnedConversations: state.pinnedConversations.includes(key)
        ? state.pinnedConversations
        : [...state.pinnedConversations, key],
    })),
  removePinnedConversation: (key) =>
    set((state) => ({
      pinnedConversations: state.pinnedConversations.filter((k) => k !== key),
    })),
  setMutedConversations: (mutedConversations) => set({ mutedConversations }),
  addMutedConversation: (key) =>
    set((state) => ({
      mutedConversations: state.mutedConversations.includes(key)
        ? state.mutedConversations
        : [...state.mutedConversations, key],
    })),
  removeMutedConversation: (key) =>
    set((state) => ({
      mutedConversations: state.mutedConversations.filter((k) => k !== key),
    })),
  setNotificationPrefs: (prefs) => set({ notificationPrefs: prefs }),
  updateNotificationPref: (key, pref) =>
    set((state) => ({
      notificationPrefs: { ...state.notificationPrefs, [key]: pref },
    })),
  setArchivedConversations: (archivedConversations) => set({ archivedConversations }),
  addArchivedConversation: (key) =>
    set((state) => ({
      archivedConversations: state.archivedConversations.includes(key)
        ? state.archivedConversations
        : [...state.archivedConversations, key],
    })),
  removeArchivedConversation: (key) =>
    set((state) => ({
      archivedConversations: state.archivedConversations.filter((k) => k !== key),
    })),
  setLightboxImage: (lightboxImage) => set({ lightboxImage }),
  setUserProfile: (profile) =>
    set((state) => ({
      userProfiles: { ...state.userProfiles, [profile.username]: profile },
    })),
  removeUserProfile: (username) =>
    set((state) => {
      const next = { ...state.userProfiles };
      delete next[username];
      return { userProfiles: next };
    }),
  updateUserProfileStatus: (username, status) =>
    set((state) => {
      const existing = state.userProfiles[username];
      if (!existing) return state;
      return {
        userProfiles: {
          ...state.userProfiles,
          [username]: { ...existing, status },
        },
      };
    }),
  setScheduledMessages: (scheduledMessages) => set({ scheduledMessages }),
  removeScheduledMessage: (id) =>
    set((state) => ({
      scheduledMessages: state.scheduledMessages.filter((m) => m.id !== id),
    })),
  setCustomEmojis: (customEmojis) => set({ customEmojis }),
  addCustomEmoji: (emoji) =>
    set((state) => ({ customEmojis: [...state.customEmojis, emoji] })),
  removeCustomEmoji: (name) =>
    set((state) => ({
      customEmojis: state.customEmojis.filter((e) => e.name !== name),
    })),
  setFolders: (folders) => set({ folders }),
  addFolder: (folder) =>
    set((state) => ({ folders: [...state.folders, folder] })),
  removeFolder: (id) =>
    set((state) => ({ folders: state.folders.filter((f) => f.id !== id) })),
  updateFolder: (id, data) =>
    set((state) => ({
      folders: state.folders.map((f) => (f.id === id ? { ...f, ...data } : f)),
    })),
  addConversationToFolder: (folderId, key) =>
    set((state) => ({
      folders: state.folders.map((f) =>
        f.id === folderId
          ? { ...f, items: f.items.includes(key) ? f.items : [...f.items, key], item_count: f.items.includes(key) ? f.item_count : f.item_count + 1 }
          : f,
      ),
    })),
  removeConversationFromFolder: (folderId, key) =>
    set((state) => ({
      folders: state.folders.map((f) =>
        f.id === folderId
          ? { ...f, items: f.items.filter((k) => k !== key), item_count: f.items.includes(key) ? f.item_count - 1 : f.item_count }
          : f,
      ),
    })),
  setGroupWebhooks: (group, webhooks) =>
    set((state) => ({
      groupWebhooks: {
        ...state.groupWebhooks,
        [group]: webhooks.map((webhook) => ({
          id: webhook.id,
          group_name: webhook.group_name,
          url: webhook.url,
          created_by: webhook.created_by,
          created_at: webhook.created_at,
          rotated_at: webhook.rotated_at,
          rotated_by: webhook.rotated_by,
        })),
      },
    })),
  setGroupWebhookAuditLogs: (group, logs) =>
    set((state) => ({
      groupWebhookAuditLogs: { ...state.groupWebhookAuditLogs, [group]: logs },
    })),
  addGroupWebhook: (group, webhook) =>
    set((state) => {
      const existing = state.groupWebhooks[group] ?? [];
      const withoutDuplicate = existing.filter((w) => w.id !== webhook.id);
      const redactedWebhook: WebhookInfo = {
        id: webhook.id,
        group_name: webhook.group_name,
        url: webhook.url,
        created_by: webhook.created_by,
        created_at: webhook.created_at,
        rotated_at: webhook.rotated_at,
        rotated_by: webhook.rotated_by,
      };
      return {
        groupWebhooks: {
          ...state.groupWebhooks,
          [group]: [redactedWebhook, ...withoutDuplicate],
        },
        latestCreatedWebhook: webhook,
      };
    }),
  rotateGroupWebhookSecret: (group, webhook) =>
    set((state) => {
      const existing = state.groupWebhooks[group] ?? [];
      const previous = existing.find((w) => w.id === webhook.id);
      const redactedWebhook: WebhookInfo = {
        id: webhook.id,
        group_name: webhook.group_name,
        url: webhook.url,
        created_by: webhook.created_by || previous?.created_by || "",
        created_at: webhook.created_at || previous?.created_at || Date.now(),
        rotated_at: webhook.rotated_at,
        rotated_by: webhook.rotated_by,
      };
      const withoutDuplicate = existing.filter((w) => w.id !== webhook.id);
      return {
        groupWebhooks: {
          ...state.groupWebhooks,
          [group]: [redactedWebhook, ...withoutDuplicate],
        },
        latestCreatedWebhook: { ...redactedWebhook, secret: webhook.secret },
      };
    }),
  removeGroupWebhook: (group, id) =>
    set((state) => {
      const existing = state.groupWebhooks[group] ?? [];
      const nextWebhooks = { ...state.groupWebhooks, [group]: existing.filter((w) => w.id !== id) };
      const latest =
        state.latestCreatedWebhook?.group_name === group && state.latestCreatedWebhook.id === id
          ? null
          : state.latestCreatedWebhook;
      return { groupWebhooks: nextWebhooks, latestCreatedWebhook: latest };
    }),
  clearLatestCreatedWebhook: () => set({ latestCreatedWebhook: null }),
  setIncomingCall: (incomingCall) => set({ incomingCall }),
  setActiveCall: (activeCall) => set({ activeCall }),
  updatePoll: (pollId, poll) =>
    set((state) => ({
      polls: { ...state.polls, [pollId]: poll },
    })),
  removePoll: (pollId) =>
    set((state) => {
      const next = { ...state.polls };
      delete next[pollId];
      return { polls: next };
    }),
  setTranslation: (messageId, text) =>
    set((state) => ({ translations: { ...state.translations, [messageId]: text } })),
  reset: () => {
    const state = get();
    if (state.username) {
      try {
        localStorage.removeItem(getLSLastReadKey(state.username));
      } catch { /* ignore */ }
    }
    set({
      view: "join",
      username: "",
      connected: false,
      isGuest: false,
      messages: [],
      historyLoaded: false,
      reactionsByMessageId: {},
      readByMessageId: {},
      lastPreviews: {},
      onlineUsers: [],
      userStatusList: [],
      selectedProfileUser: null,
      typingUsers: [],
      typingPreviews: {},
      rooms: [],
      currentRoomID: "",
      currentChat: { type: "public" },
      replyTo: null,
      friends: [],
      pendingFriendRequests: [],
      pendingGroupInvites: [],
      groups: {},
      groupInfoPanel: null,
      pendingImage: null,
      unreadCount: 0,
      unreadByConversation: {},
      lastReadTimestamps: {},
      latestMention: null,
      blockedUsers: [],
      pinnedMessages: [],
      pinnedConversations: [],
      mutedConversations: [],
      notificationPrefs: {},
      archivedConversations: [],
      lightboxImage: null,
      userProfiles: {},
      scheduledMessages: [],
      customEmojis: [],
      folders: [],
      groupWebhooks: {},
      groupWebhookAuditLogs: {},
      latestCreatedWebhook: null,
      translations: {},
      incomingCall: null,
      activeCall: null,
      polls: {},
    });
  },
}));
