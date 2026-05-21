import { create } from "zustand";
import type { ChatMessage, UserStatus } from "@/lib/api";

export type ViewState = "join" | "chat";

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

  // Actions
  setView: (view: ViewState) => void;
  setUsername: (username: string) => void;
  setConnected: (connected: boolean) => void;
  addMessage: (message: ChatMessage) => void;
  addSystemMessage: (content: string, timestamp: number) => void;
  setHistory: (messages: ChatMessage[]) => void;
  setOnlineUsers: (users: string[]) => void;
  setUserStatusList: (users: UserStatus[]) => void;
  setSelectedProfileUser: (username: string | null) => void;
  setTypingUsers: (users: string[]) => void;
  addTypingUser: (username: string) => void;
  removeTypingUser: (username: string) => void;
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
    }),
}));
