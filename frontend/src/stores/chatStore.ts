import { create } from "zustand";
import type { ChatMessage, RoomInfo, UserStatus } from "@/lib/api";

const MESSAGE_CAP = 500;

export type ViewState = "join" | "chat";

export interface DM {
  username: string;
  messages: ChatMessage[];
}

export interface GroupInfo {
  name: string;
  members: string[];
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
  addTypingUser: (username: string) => void;
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
  rooms: [],
  currentRoomID: "",
  currentChat: { type: "public" },
  replyTo: null,
  friends: [],
  pendingFriendRequests: [],
  pendingGroupInvites: [],
  groups: {},
  pendingImage: null,
  unreadCount: 0,
  unreadByConversation: {},
  latestMention: null,
  blockedUsers: [],
  pinnedMessages: [],

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
      return {
        messages: [...newMessages, ...state.messages],
      };
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
  setCurrentChat: (currentChat) => set({ currentChat }),
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
    set((state) => ({
      groups: { ...state.groups, [group]: { name: group, members } },
    })),
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
      rooms: [],
      currentRoomID: "",
      currentChat: { type: "public" },
      replyTo: null,
      friends: [],
      pendingFriendRequests: [],
      pendingGroupInvites: [],
      groups: {},
      pendingImage: null,
      unreadCount: 0,
      unreadByConversation: {},
      latestMention: null,
      blockedUsers: [],
    }),
}));
