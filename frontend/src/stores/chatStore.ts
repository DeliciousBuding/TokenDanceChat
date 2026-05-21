import { create } from "zustand";
import type { ChatMessage } from "@/lib/api";

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

  // Typing users
  typingUsers: string[];

  // Friends
  friends: string[];
  pendingFriendRequests: PendingFriendRequest[];

  // Groups
  groups: GroupInfo[];
  groupMembers: Record<string, string[]>;

  // DM messages (keyed by username)
  dmMessages: Record<string, ChatMessage[]>;

  // Group messages (keyed by group name)
  groupMessages: Record<string, ChatMessage[]>;

  // Reply
  replyTo: ChatMessage | null;

  // Current chat context
  currentChat: CurrentChat;

  // Actions
  setView: (view: ViewState) => void;
  setUsername: (username: string) => void;
  setConnected: (connected: boolean) => void;
  addMessage: (message: ChatMessage) => void;
  addSystemMessage: (content: string, timestamp: number) => void;
  setHistory: (messages: ChatMessage[]) => void;
  setOnlineUsers: (users: string[]) => void;
  setTypingUsers: (users: string[]) => void;
  addTypingUser: (username: string) => void;
  removeTypingUser: (username: string) => void;

  // Reply actions
  setReplyTo: (message: ChatMessage | null) => void;

  // Friend actions
  setFriends: (friends: string[]) => void;
  addFriendRequest: (from: string) => void;
  removeFriendRequest: (from: string) => void;

  // Group actions
  setGroups: (groups: GroupInfo[]) => void;
  setGroupMembers: (groupName: string, members: string[]) => void;

  // DM actions
  addDMMessage: (message: ChatMessage) => void;

  // Group message actions
  addGroupMessage: (message: ChatMessage) => void;

  // Chat context actions
  setCurrentChat: (chat: CurrentChat) => void;

  // Message actions
  deleteMessage: (messageId: string) => void;

  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  view: "join",
  username: "",
  connected: false,
  messages: [],
  historyLoaded: false,
  onlineUsers: [],
  typingUsers: [],
  friends: [],
  pendingFriendRequests: [],
  groups: [],
  groupMembers: {},
  dmMessages: {},
  groupMessages: {},
  replyTo: null,
  currentChat: { type: "public" },

  setView: (view) => set({ view }),
  setUsername: (username) => set({ username }),
  setConnected: (connected) => set({ connected }),
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
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
  setHistory: (messages) =>
    set({
      messages,
      historyLoaded: true,
    }),
  setOnlineUsers: (onlineUsers) => set({ onlineUsers }),
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

  // Reply
  setReplyTo: (replyTo) => set({ replyTo }),

  // Friends
  setFriends: (friends) => set({ friends }),
  addFriendRequest: (from) =>
    set((state) => {
      if (state.pendingFriendRequests.some((r) => r.from === from)) {
        return state;
      }
      return {
        pendingFriendRequests: [
          ...state.pendingFriendRequests,
          { from, timestamp: Date.now() },
        ],
      };
    }),
  removeFriendRequest: (from) =>
    set((state) => ({
      pendingFriendRequests: state.pendingFriendRequests.filter(
        (r) => r.from !== from,
      ),
    })),

  // Groups
  setGroups: (groups) => set({ groups }),
  setGroupMembers: (groupName, members) =>
    set((state) => ({
      groupMembers: { ...state.groupMembers, [groupName]: members },
    })),

  // DM messages
  addDMMessage: (message) =>
    set((state) => {
      const partner =
        message.from && message.from !== state.username
          ? message.from
          : message.to || "";
      if (!partner) return state;
      const existing = state.dmMessages[partner] || [];
      return {
        dmMessages: {
          ...state.dmMessages,
          [partner]: [...existing, message],
        },
      };
    }),

  // Group messages
  addGroupMessage: (message) =>
    set((state) => {
      const groupName = message.group || "";
      if (!groupName) return state;
      const existing = state.groupMessages[groupName] || [];
      return {
        groupMessages: {
          ...state.groupMessages,
          [groupName]: [...existing, message],
        },
      };
    }),

  // Chat context
  setCurrentChat: (currentChat) => set({ currentChat, replyTo: null }),

  // Delete message
  deleteMessage: (messageId) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, deleted: true } : m,
      ),
    })),

  reset: () =>
    set({
      view: "join",
      username: "",
      connected: false,
      messages: [],
      historyLoaded: false,
      onlineUsers: [],
      typingUsers: [],
      friends: [],
      pendingFriendRequests: [],
      groups: [],
      groupMembers: {},
      dmMessages: {},
      groupMessages: {},
      replyTo: null,
      currentChat: { type: "public" },
    }),
}));
