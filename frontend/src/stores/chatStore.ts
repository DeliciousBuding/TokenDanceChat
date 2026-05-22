import { create } from "zustand";
import type { ChatMessage, RoomInfo, UserStatus, ScheduledMessage, CustomEmoji } from "@/lib/api";

const MESSAGE_CAP = 500;

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
}

interface ChatState {
  // Connection state
  view: ViewState;
  username: string;
  connected: boolean;

  // Messages
  messages: ChatMessage[];
  historyLoaded: boolean;

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

  // Call state
  incomingCall: IncomingCall | null;
  activeCall: ActiveCall | null;

  // Actions
  setView: (view: ViewState) => void;
  setUsername: (username: string) => void;
  setConnected: (connected: boolean) => void;
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
  setIncomingCall: (call: IncomingCall | null) => void;
  setActiveCall: (call: ActiveCall | null) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  view: "join",
  username: "",
  connected: false,
  messages: [],
  historyLoaded: false,
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
  incomingCall: null,
  activeCall: null,

  setView: (view) => set({ view }),
  setUsername: (username) => set({ username }),
  setConnected: (connected) => set({ connected }),
  addMessage: (message) =>
    set((state) => {
      // Filter out messages from blocked users.
      if (state.blockedUsers.includes(message.username)) return state;
      const messages = [...state.messages, message];
      if (messages.length > MESSAGE_CAP) {
        messages.splice(0, messages.length - MESSAGE_CAP);
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
  setCurrentChat: (currentChat) => set({ currentChat, pendingImage: null }),
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
      return { unreadByConversation: next };
    }),
  clearAllConversationUnreads: () => set({ unreadByConversation: {} }),
  updateMessageReactions: (messageId, reactions) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, reactions } : m,
      ),
    })),
  editMessageInPlace: (messageId, content) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, content, edited: true } : m,
      ),
    })),
  markMessagesReadBy: (reader) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.username !== state.username) return m;
        const readBy = m.read_by || [];
        if (readBy.includes(reader)) return m;
        return { ...m, read_by: [...readBy, reader] };
      }),
    })),
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
  setIncomingCall: (incomingCall) => set({ incomingCall }),
  setActiveCall: (activeCall) => set({ activeCall }),
  reset: () =>
    set({
      view: "join",
      username: "",
      connected: false,
      messages: [],
      historyLoaded: false,
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
      incomingCall: null,
      activeCall: null,
    }),
}));
