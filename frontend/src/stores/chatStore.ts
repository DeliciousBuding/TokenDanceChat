import { create } from "zustand";
import type { ChatMessage, UserStatus, CustomEmoji, PollData } from "@/lib/api";

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

export type ViewState = "chat";

export type CurrentChat = { type: "public" };

export type LegacyChatInput =
  | CurrentChat
  | { type: "dm"; username: string }
  | { type: "group"; name: string };

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

  // Chat context
  currentChat: CurrentChat;
  replyTo: ChatMessage | null;

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

  customEmojis: CustomEmoji[];
  translations: Record<string, string>; // messageId -> translated text

  // Polls
  polls: Record<string, PollData>;

  // Actions
  setView: (view: ViewState) => void;
  setUsername: (username: string) => void;
  setConnected: (connected: boolean) => void;
  setGuest: (isGuest: boolean) => void;
  // Auth modal & guest preview.
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  // OIDC auth state.
  oidcAuthenticated: boolean;
  oidcAccessToken: string | null;
  oidcRefreshToken: string | null;
  setOidcAuth: (accessToken: string, refreshToken: string) => void;
  clearOidcAuth: () => void;
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
  setCurrentChat: (chat: LegacyChatInput) => void;
  setReplyTo: (message: ChatMessage | null) => void;
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
  setCustomEmojis: (emojis: CustomEmoji[]) => void;
  addCustomEmoji: (emoji: CustomEmoji) => void;
  removeCustomEmoji: (name: string) => void;
  setTranslation: (messageId: string, text: string) => void;
  updatePoll: (pollId: string, poll: PollData) => void;
  removePoll: (pollId: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  view: "chat" as ViewState,
  username: "",
  connected: false,
  isGuest: false,
  showAuthModal: false,
  oidcAuthenticated: false,
  oidcAccessToken: null,
  oidcRefreshToken: null,
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
  currentChat: { type: "public" },
  replyTo: null,
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
  customEmojis: [],
  translations: {},
  polls: {},

  setView: (view) => set({ view }),
  setUsername: (username) => set({ username, lastReadTimestamps: loadLastReadTimestamps(username) }),
  setConnected: (connected) => set({ connected }),
  setGuest: (isGuest) => set({ isGuest }),
  setOidcAuth: (accessToken, refreshToken) =>
    set({ oidcAuthenticated: true, oidcAccessToken: accessToken, oidcRefreshToken: refreshToken }),
  clearOidcAuth: () =>
    set({ oidcAuthenticated: false, oidcAccessToken: null, oidcRefreshToken: null }),
  setShowAuthModal: (show) => set({ showAuthModal: show }),
  addMessage: (message) =>
    set((state) => {
      // Filter out messages from blocked users.
      if (state.blockedUsers.includes(message.username)) return state;
      // Deduplicate optimistic messages: if server echo matches an optimistic
      // message (same content + username within 5s), replace the temp ID.
      const isOptimistic = message.id.startsWith("optimistic_");
      const messages = [...state.messages];
      if (!isOptimistic) {
        if (message.client_message_id) {
          const optimisticIndex = messages.findIndex((m) => m.id === message.client_message_id);
          if (optimisticIndex >= 0) {
            messages[optimisticIndex] = { ...message, reactions: messages[optimisticIndex].reactions };
            return { ...state, messages };
          }
        }
        for (let i = messages.length - 1; i >= Math.max(0, messages.length - 5); i--) {
          const m = messages[i];
          if (
            m.id.startsWith("optimistic_") &&
            m.username === message.username &&
            m.content === message.content &&
            Math.abs(m.timestamp - message.timestamp) < 5000
          ) {
            // Replace optimistic with real message (keep real ID + timestamp).
            messages[i] = { ...message, reactions: m.reactions };
            return { ...state, messages };
          }
        }
        if (messages.some((m) => m.id === message.id)) {
          return state;
        }
      }
      messages.push(message);
      if (messages.length > MESSAGE_CAP) {
        messages.splice(0, messages.length - MESSAGE_CAP);
      }

      // Current frontend contract has one public room. Keep a public preview
      // only; legacy DM/group message fields remain backend compatibility data.
      if (!message.deleted && message.username !== "system" && message.content) {
        let content = message.content;
        if (content.length > 50) {
          content = content.slice(0, 47) + "...";
        }
        if (message.username === state.username) {
          content = "You: " + content;
        }
        state.lastPreviews.public = { content, timestamp: message.timestamp, sender: message.username };
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
      const messages = [...state.messages];
      const existingIDs = new Set(messages.map((m) => m.id));
      const newMessages: ChatMessage[] = [];
      for (const incomingMessage of incoming) {
        if (existingIDs.has(incomingMessage.id)) continue;
        if (incomingMessage.client_message_id) {
          const optimisticIndex = messages.findIndex((m) => m.id === incomingMessage.client_message_id);
          if (optimisticIndex >= 0) {
            messages[optimisticIndex] = { ...incomingMessage, reactions: messages[optimisticIndex].reactions };
            existingIDs.add(incomingMessage.id);
            continue;
          }
        }
        newMessages.push(incomingMessage);
        existingIDs.add(incomingMessage.id);
      }
      // Populate only the public preview from history messages.
      for (const m of newMessages) {
        if (m.deleted || m.username === "system" || !m.content) continue;
        let content = m.content;
        if (content.length > 50) {
          content = content.slice(0, 47) + "...";
        }
        if (m.username === state.username) {
          content = "You: " + content;
        }
        state.lastPreviews.public = { content, timestamp: m.timestamp, sender: m.username };
      }
      return {
        messages: [...messages, ...newMessages],
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
  setCurrentChat: () =>
    set((state) => {
      // Legacy callers may still pass dm/group while old state is being
      // cleaned. The current frontend contract always returns to public.
      const nextTimestamps = { ...state.lastReadTimestamps, public: Date.now() };
      try {
        localStorage.setItem(getLSLastReadKey(state.username), JSON.stringify(nextTimestamps));
      } catch { /* quota exceeded */ }
      return { currentChat: { type: "public" }, pendingImage: null, lastReadTimestamps: nextTimestamps };
    }),
  setReplyTo: (replyTo) => set({ replyTo }),
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
  setCustomEmojis: (customEmojis) => set({ customEmojis }),
  addCustomEmoji: (emoji) =>
    set((state) => ({ customEmojis: [...state.customEmojis, emoji] })),
  removeCustomEmoji: (name) =>
    set((state) => ({
      customEmojis: state.customEmojis.filter((e) => e.name !== name),
    })),
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
      view: "chat" as ViewState,
      username: "",
      connected: false,
      isGuest: false,
      showAuthModal: false,
      oidcAuthenticated: false,
      oidcAccessToken: null,
      oidcRefreshToken: null,
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
      currentChat: { type: "public" },
      replyTo: null,
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
      customEmojis: [],
      translations: {},
      polls: {},
    });
  },
}));
