import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ─── Hoisted state for WS handler capture ────────────────────────

const { apiHandlers, mockChatAPI, mockGetSessionToken } = vi.hoisted(() => {
  const apiHandlers = new Map<string, Array<(msg: any) => void>>();
  const mockChatAPI = {
    on: vi.fn((event: string, handler: (msg: any) => void) => {
      if (!apiHandlers.has(event)) apiHandlers.set(event, []);
      apiHandlers.get(event)!.push(handler);
      return () => {
        const arr = apiHandlers.get(event);
        if (arr) {
          const idx = arr.indexOf(handler);
          if (idx !== -1) arr.splice(idx, 1);
        }
      };
    }),
    connect: vi.fn<(username: string, token?: string) => Promise<void>>().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    send: vi.fn(),
    sendMessage: vi.fn(),
    sendMarkRead: vi.fn(),
    sendBlockList: vi.fn(),
    sendReaction: vi.fn(),
    sendMessageEdit: vi.fn(),
    sendPinnedConversations: vi.fn(),
    sendMutedConversations: vi.fn(),
  };
  const mockGetSessionToken = vi.fn<() => string | null>(() => null);
  return { apiHandlers, mockChatAPI, mockGetSessionToken };
});

// ─── Module mocks (must be before any import that resolves them) ─

vi.mock("@/lib/api", () => ({
  chatAPI: mockChatAPI,
  getSessionToken: mockGetSessionToken,
}));

vi.mock("@/lib/sound", () => ({
  playMessageSound: vi.fn(),
  playMentionSound: vi.fn(),
  playOnlineSound: vi.fn(),
  playOfflineSound: vi.fn(),
  playSentSound: vi.fn(),
  playReactionSound: vi.fn(),
}));

import { getPageTitle, i18nSys, notifyMessage, isConversationMuted, useWebSocket } from "@/hooks/useWebSocket";
import { useChatStore } from "@/stores/chatStore";

// ─── Helper: dispatch a WS event to all registered handlers ──────

function dispatchWS(type: string, data: Record<string, unknown> = {}) {
  const handlers = apiHandlers.get(type);
  if (handlers) {
    handlers.forEach((h) => h({ type, ...data }));
  }
}

// ─── Helper: reset visibility to active state ────────────────────

function setTabActive(active: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => !active,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

// ─── Default store initial state ─────────────────────────────────

const DEFAULT_STORE_STATE = {
  view: "chat" as const,
  username: "testuser",
  connected: false,
  isGuest: false,
  messages: [] as any[],
  historyLoaded: false,
  onlineUsers: [] as string[],
  userStatusList: [] as any[],
  typingUsers: [] as string[],
  currentChat: { type: "public" as const },
  replyTo: null as any,
  blockedUsers: [] as string[],
  pinnedMessages: [] as any[],
  pinnedConversations: [] as string[],
  mutedConversations: [] as string[],
  notificationPrefs: {} as Record<string, any>,
  archivedConversations: [] as string[],
  userProfiles: {} as Record<string, any>,
  customEmojis: [] as any[],
  translations: {} as Record<string, string>,
  polls: {} as Record<string, any>,
  unreadCount: 0,
  unreadByConversation: {} as Record<string, number>,
  lastReadTimestamps: {} as Record<string, number>,
  latestMention: null as any,
  lightboxImage: null as string | null,
  selectedProfileUser: null as string | null,
  lastPreviews: {} as Record<string, any>,
  typingPreviews: {} as Record<string, string>,
  reactionsByMessageId: {} as Record<string, Record<string, string[]>>,
  readByMessageId: {} as Record<string, string[]>,
};

// ─── getPageTitle ───────────────────────────────────────────────

describe("getPageTitle", () => {
  it("returns base title when tab is active", () => {
    expect(getPageTitle(5, true)).toBe("TokenDanceChat");
  });

  it("returns base title when tab is inactive but unread count is 0", () => {
    expect(getPageTitle(0, false)).toBe("TokenDanceChat");
  });

  it("returns unread count prefix when tab is inactive with unread > 0", () => {
    expect(getPageTitle(3, false)).toBe("(3) TokenDanceChat");
  });
});

// ─── i18nSys ────────────────────────────────────────────────────

describe("i18nSys", () => {
  it("serializes a key-only object to JSON", () => {
    const result = i18nSys("system.hello");
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toEqual({ key: "system.hello" });
  });

  it("serializes a key with params to JSON", () => {
    const result = i18nSys("system.userJoined", { username: "Alice" });
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toEqual({
      key: "system.userJoined",
      params: { username: "Alice" },
    });
  });
});

// ─── notifyMessage ──────────────────────────────────────────────

describe("notifyMessage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when Notification is undefined", () => {
    const originalNotification = (globalThis as Record<string, unknown>).Notification;
    delete (globalThis as Record<string, unknown>).Notification;
    expect(() => notifyMessage("Title", "Body")).not.toThrow();
    (globalThis as Record<string, unknown>).Notification = originalNotification;
  });

  it("creates a Notification when permission is granted", () => {
    const fakeNotification = vi.fn() as unknown as typeof Notification;
    Object.defineProperty(fakeNotification, "permission", { value: "granted", writable: true });
    vi.stubGlobal("Notification", fakeNotification);

    notifyMessage("Alice", "Hello world");
    expect(fakeNotification).toHaveBeenCalledOnce();
    expect(fakeNotification).toHaveBeenCalledWith("Alice", {
      body: "Hello world",
      icon: "/favicon.svg",
      silent: true,
    });
  });

  it("skips Notification when permission is denied", () => {
    const fakeNotification = vi.fn() as unknown as typeof Notification;
    Object.defineProperty(fakeNotification, "permission", { value: "denied", writable: true });
    vi.stubGlobal("Notification", fakeNotification);

    notifyMessage("Bob", "Hi");
    expect(fakeNotification).not.toHaveBeenCalled();
  });

  it("catches Notification constructor errors gracefully", () => {
    const fakeNotification = vi.fn(() => {
      throw new Error("Not supported");
    }) as unknown as typeof Notification;
    Object.defineProperty(fakeNotification, "permission", { value: "granted", writable: true });
    vi.stubGlobal("Notification", fakeNotification);

    expect(() => notifyMessage("Alice", "Hello")).not.toThrow();
  });
});

// ─── isConversationMuted ────────────────────────────────────────

describe("isConversationMuted", () => {
  beforeEach(() => {
    useChatStore.setState({
      mutedConversations: [],
      notificationPrefs: {},
    });
  });

  it("returns true when the public room is in the mutedConversations list", () => {
    useChatStore.setState({ mutedConversations: ["public"] });
    expect(isConversationMuted("public")).toBe(true);
  });

  it("returns true when notificationPref has an active time-based mute", () => {
    const future = Date.now() + 3600_000; // 1 hour from now
    useChatStore.setState({
      notificationPrefs: {
        public: { mutedUntil: future, showPreview: true },
      },
    });
    expect(isConversationMuted("public")).toBe(true);
  });

  it("returns false when notificationPref mute has expired", () => {
    const past = Date.now() - 3600_000; // 1 hour ago
    useChatStore.setState({
      notificationPrefs: {
        public: { mutedUntil: past, showPreview: true },
      },
    });
    expect(isConversationMuted("public")).toBe(false);
  });

  it("returns false when key is not in any mute list", () => {
    expect(isConversationMuted("public")).toBe(false);
  });
});

// ─── useWebSocket hook ──────────────────────────────────────────

describe("useWebSocket", () => {
  beforeEach(() => {
    apiHandlers.clear();
    vi.clearAllMocks();
    mockGetSessionToken.mockReturnValue(null);
    // Reset store to clean state.
    useChatStore.setState(DEFAULT_STORE_STATE);
    // Reset tab visibility to active.
    setTabActive(true);
    // Reset page title.
    document.title = "TokenDanceChat";
  });

  afterEach(() => {
    // Restore document.title in case tests modify it.
    document.title = "TokenDanceChat";
    setTabActive(true);
  });

  it("registers shared WebSocket event handlers only once across hook consumers", () => {
    const first = renderHook(() => useWebSocket());
    const second = renderHook(() => useWebSocket());

    expect(apiHandlers.get("group_message")).toBeUndefined();
    expect(apiHandlers.get("message")).toHaveLength(1);

    first.unmount();
    expect(apiHandlers.get("message")).toHaveLength(1);

    second.unmount();
    expect(apiHandlers.get("message")).toHaveLength(0);
  });

  // ─── Connection lifecycle ─────────────────────────────────────

  describe("connection lifecycle", () => {
    it("connect calls chatAPI.connect and sets connected state", async () => {
      const { result } = renderHook(() => useWebSocket());

      await act(async () => {
        await result.current.connect("testuser");
      });

      expect(mockChatAPI.connect).toHaveBeenCalledWith("testuser", undefined);
      expect(mockChatAPI.sendMarkRead).toHaveBeenCalled();
      expect(mockChatAPI.sendBlockList).toHaveBeenCalled();
      expect(useChatStore.getState().connected).toBe(true);
      expect(useChatStore.getState().isGuest).toBe(false);
    });

    it("passes the local app session token when connecting a non-OIDC user", async () => {
      mockGetSessionToken.mockReturnValue("session-token-1");
      const { result } = renderHook(() => useWebSocket());

      await act(async () => {
        await result.current.connect("testuser");
      });

      expect(mockChatAPI.connect).toHaveBeenCalledWith("testuser", "session-token-1");
    });

    it("does not send a stale local session token for guest connections", async () => {
      mockGetSessionToken.mockReturnValue("stale-session-token");
      useChatStore.setState({ isGuest: true });
      const { result } = renderHook(() => useWebSocket());

      await act(async () => {
        await result.current.connect("guest");
      });

      expect(mockChatAPI.connect).toHaveBeenCalledWith("guest", undefined);
    });

    it("passes the OIDC access token instead of the app session token for OIDC users", async () => {
      mockGetSessionToken.mockReturnValue("session-token-1");
      useChatStore.setState({
        oidcAuthenticated: true,
        oidcAccessToken: "oidc-access-token-1",
      });
      const { result } = renderHook(() => useWebSocket());

      await act(async () => {
        await result.current.connect("testuser");
      });

      expect(mockChatAPI.connect).toHaveBeenCalledWith("testuser", "oidc-access-token-1");
    });

    it("connect sets connected=false and rethrows on failure", async () => {
      mockChatAPI.connect.mockRejectedValueOnce(new Error("Connection failed"));
      const { result } = renderHook(() => useWebSocket());

      await act(async () => {
        try {
          await result.current.connect("baduser");
        } catch (e) {
          // expected
        }
      });

      expect(useChatStore.getState().connected).toBe(false);
    });

    it("disconnect calls chatAPI.disconnect and sets connected false", () => {
      // Start connected.
      useChatStore.setState({ connected: true });
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.disconnect();
      });

      expect(mockChatAPI.disconnect).toHaveBeenCalled();
      expect(useChatStore.getState().connected).toBe(false);
    });
  });

  // ─── Message routing ──────────────────────────────────────────

  describe("message routing", () => {
    it("routes public chat message to addMessage", () => {
      useChatStore.setState({ currentChat: { type: "public" } });
      renderHook(() => useWebSocket());

      dispatchWS("message", {
        id: "msg-1",
        username: "alice",
        content: "hello public",
        timestamp: 1000,
      });

      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({
        id: "msg-1",
        username: "alice",
        content: "hello public",
        timestamp: 1000,
      });
    });

    it("ignores legacy DM messages in the lightweight public-room contract", () => {
      useChatStore.setState({ currentChat: { type: "dm", username: "bob" } as any });
      renderHook(() => useWebSocket());

      dispatchWS("dm_message", {
        id: "dm-1",
        username: "alice",
        content: "hey bob",
        timestamp: 2000,
        to: "testuser",
      });

      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(0);
    });

    it("ignores legacy group messages in the lightweight public-room contract", () => {
      useChatStore.setState({ currentChat: { type: "group", name: "general" } as any });
      renderHook(() => useWebSocket());

      dispatchWS("group_message", {
        id: "gm-1",
        username: "alice",
        content: "hello group",
        timestamp: 3000,
        group: "general",
      });

      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(0);
    });

    it("routes typing event to addTypingUser", () => {
      useChatStore.setState({ currentChat: { type: "public" } });
      renderHook(() => useWebSocket());

      dispatchWS("typing", {
        username: "alice",
        context: "public",
      });

      expect(useChatStore.getState().typingUsers).toContain("alice");
    });

    it("routes typing_stop event to removeTypingUser", () => {
      useChatStore.setState({
        currentChat: { type: "public" },
        typingUsers: ["alice"],
      });
      renderHook(() => useWebSocket());

      dispatchWS("typing_stop", { username: "alice" });

      expect(useChatStore.getState().typingUsers).not.toContain("alice");
    });

    it("routes user_status to setUserStatusList", () => {
      renderHook(() => useWebSocket());

      dispatchWS("user_status", {
        users: [
          { username: "alice", online: true, last_seen: 5000 },
          { username: "bob", online: false, last_seen: 4000 },
        ],
      });

      const statusList = useChatStore.getState().userStatusList;
      expect(statusList).toHaveLength(2);
      expect(statusList[0]).toMatchObject({ username: "alice", online: true });
      expect(statusList[1]).toMatchObject({ username: "bob", online: false });
    });

    it("does not register legacy room_list handlers", () => {
      renderHook(() => useWebSocket());
      expect(apiHandlers.get("room_list")).toBeUndefined();
    });

    it("routes reaction_update to updateMessageReactions", () => {
      renderHook(() => useWebSocket());

      const reactions = { "👍": ["alice", "bob"], "❤️": ["charlie"] };
      dispatchWS("reaction_update", {
        id: "msg-1",
        reactions,
      });

      // Store updates reactionsByMessageId internally.
      expect(useChatStore.getState().reactionsByMessageId["msg-1"]).toEqual(reactions);
    });

    it("routes message_edit to editMessageInPlace", () => {
      // Add a message first so we can verify it was edited.
      useChatStore.setState({
        messages: [
          { id: "msg-1", username: "alice", content: "old text", timestamp: 1000 },
        ],
      });
      renderHook(() => useWebSocket());

      dispatchWS("message_edit", {
        id: "msg-1",
        content: "new text",
        edited: true,
      });

      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe("new text");
    });

    it("routes poll_created to addMessage and updatePoll", () => {
      useChatStore.setState({ currentChat: { type: "public" } });
      renderHook(() => useWebSocket());

      const poll = {
        id: "poll-1",
        room_id: "room1",
        creator: "alice",
        question: "Favorite color?",
        options: ["Red", "Blue"],
        multiple_choice: false,
        is_anonymous: false,
        is_closed: false,
        votes: {},
        voters: {},
        created_at: 5000,
      };

      dispatchWS("poll_created", {
        id: "poll-1",
        username: "alice",
        poll,
      });

      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({ id: "poll-1", content: "Favorite color?" });
      expect(useChatStore.getState().polls["poll-1"]).toEqual(poll);
    });

    it("routes poll_vote_update to updatePoll", () => {
      renderHook(() => useWebSocket());

      const poll = {
        id: "poll-1",
        room_id: "room1",
        creator: "alice",
        question: "Favorite color?",
        options: ["Red", "Blue"],
        multiple_choice: false,
        is_anonymous: false,
        is_closed: false,
        votes: { 0: 2, 1: 1 },
        voters: { 0: ["alice", "bob"], 1: ["charlie"] },
        created_at: 5000,
      };

      dispatchWS("poll_vote_update", { id: "poll-1", poll });

      expect(useChatStore.getState().polls["poll-1"]).toEqual(poll);
    });

    it("routes poll_closed to updatePoll", () => {
      renderHook(() => useWebSocket());

      const poll = {
        id: "poll-1",
        room_id: "room1",
        creator: "alice",
        question: "Favorite color?",
        options: ["Red", "Blue"],
        multiple_choice: false,
        is_anonymous: false,
        is_closed: true,
        votes: { 0: 3, 1: 2 },
        voters: { 0: ["alice", "bob", "charlie"], 1: ["dave", "eve"] },
        created_at: 5000,
      };

      dispatchWS("poll_closed", { id: "poll-1", poll });

      expect(useChatStore.getState().polls["poll-1"]).toMatchObject({ is_closed: true });
    });

    it("routes history to setHistory when history not loaded", () => {
      useChatStore.setState({ historyLoaded: false, messages: [] });
      renderHook(() => useWebSocket());

      const msgs = [
        { id: "h1", username: "alice", content: "msg1", timestamp: 1000 },
        { id: "h2", username: "bob", content: "msg2", timestamp: 2000 },
      ];

      dispatchWS("history", { messages: msgs });

      const state = useChatStore.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0].id).toBe("h1");
      expect(state.messages[1].id).toBe("h2");
    });

    it("routes history to prependHistory when history already loaded", () => {
      useChatStore.setState({
        historyLoaded: true,
        messages: [{ id: "existing", username: "charlie", content: "old", timestamp: 500 }],
      });
      renderHook(() => useWebSocket());

      const olderMsgs = [
        { id: "older1", username: "dave", content: "older1", timestamp: 100 },
        { id: "older2", username: "eve", content: "older2", timestamp: 200 },
      ];

      dispatchWS("history", { messages: olderMsgs });

      const state = useChatStore.getState();
      // prependHistory prepends older messages before existing ones.
      expect(state.messages).toHaveLength(3);
      expect(state.messages[0].id).toBe("older1");
      expect(state.messages[1].id).toBe("older2");
      expect(state.messages[2].id).toBe("existing");
    });

    it("routes user_joined to addSystemMessage", () => {
      renderHook(() => useWebSocket());

      dispatchWS("user_joined", {
        username: "newuser",
        online: ["newuser", "testuser"],
        timestamp: 6000,
      });

      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].username).toBe("system");
      const parsed = JSON.parse(msgs[0].content);
      expect(parsed.key).toBe("system.userJoined");
      expect(parsed.params).toEqual({ username: "newuser" });
    });

    it("routes user_left to addSystemMessage", () => {
      renderHook(() => useWebSocket());

      dispatchWS("user_left", {
        username: "olduser",
        online: ["testuser"],
        timestamp: 7000,
      });

      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].username).toBe("system");
      const parsed = JSON.parse(msgs[0].content);
      expect(parsed.key).toBe("system.userLeft");
      expect(parsed.params).toEqual({ username: "olduser" });
    });

    it("ignores legacy forward events", () => {
      useChatStore.setState({ currentChat: { type: "public" } });
      renderHook(() => useWebSocket());

      dispatchWS("forward", {
        id: "fwd-1",
        from: "alice",
        content: "check this out",
        timestamp: 8000,
      });

      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(0);
    });

    it("ignores legacy friend requests", () => {
      renderHook(() => useWebSocket());

      dispatchWS("friend_request", { from: "newfriend" });

      expect(useChatStore.getState().messages).toHaveLength(0);
    });

    it("routes online_users to setOnlineUsers", () => {
      renderHook(() => useWebSocket());

      dispatchWS("online_users", {
        online: ["alice", "bob", "charlie"],
      });

      expect(useChatStore.getState().onlineUsers).toEqual(["alice", "bob", "charlie"]);
    });

    it("routes kicked to reset store, set view to join, and disconnect", () => {
      // Start with some state to verify it gets reset.
      useChatStore.setState({
        connected: true,
        messages: [{ id: "m1", username: "alice", content: "hi", timestamp: 1000 }],
        view: "chat",
      });
      renderHook(() => useWebSocket());

      dispatchWS("kicked", { content: "You were kicked" });

      const state = useChatStore.getState();
      // Store should be reset and view set to "join".
      expect(state.view).toBe("chat");
      expect(state.connected).toBe(false);
      expect(state.messages).toEqual([]);
      // chatAPI.disconnect should have been called via the hook's disconnect callback.
      expect(mockChatAPI.disconnect).toHaveBeenCalled();
    });

    it("routes message_delete to deleteMessage and removePoll", () => {
      useChatStore.setState({
        messages: [
          { id: "msg-del", username: "alice", content: "remove me", timestamp: 1000 },
          { id: "msg-keep", username: "bob", content: "keep me", timestamp: 2000 },
        ],
        polls: {
          "msg-del": { id: "msg-del", room_id: "public", creator: "alice", question: "Delete?", options: ["Yes"], multiple_choice: false, is_anonymous: false, is_closed: false, votes: {}, voters: {}, created_at: 1000 },
        },
      });
      renderHook(() => useWebSocket());

      dispatchWS("message_delete", { id: "msg-del" });

      const state = useChatStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].id).toBe("msg-keep");
      // Poll associated with deleted message should also be removed.
      expect(state.polls["msg-del"]).toBeUndefined();
    });

    it("routes block_list to setBlockedUsers", () => {
      renderHook(() => useWebSocket());

      dispatchWS("block_list", { blocked: ["spammer1", "spammer2"] });

      expect(useChatStore.getState().blockedUsers).toEqual(["spammer1", "spammer2"]);
    });
  });

  // ─── Desktop notification ─────────────────────────────────────

  describe("desktop notification", () => {
    it("triggers notification for public message from other user when page is hidden", () => {
      const fakeNotification = vi.fn() as unknown as typeof Notification;
      (fakeNotification as any).permission = "granted";
      vi.stubGlobal("Notification", fakeNotification);

      useChatStore.setState({
        mutedConversations: [],
      });
      renderHook(() => useWebSocket());

      // Make tab inactive.
      setTabActive(false);

      dispatchWS("message", {
        id: "msg-notif",
        username: "alice",
        content: "hello from hidden tab",
        timestamp: 9000,
      });

      // Should create a Notification for the message.
      expect(fakeNotification).toHaveBeenCalled();
    });

    it("does not trigger notification for ignored legacy DM messages", () => {
      const fakeNotification = vi.fn() as unknown as typeof Notification;
      (fakeNotification as any).permission = "granted";
      vi.stubGlobal("Notification", fakeNotification);

      // Viewing public chat, so DM messages are "unread".
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "public" },
        mutedConversations: [],
      });
      renderHook(() => useWebSocket());

      setTabActive(false);

      dispatchWS("dm_message", {
        id: "dm-notif",
        username: "alice",
        content: "secret DM",
        timestamp: 10000,
        to: "testuser",
      });

      expect(fakeNotification).not.toHaveBeenCalled();
    });

    it("does not trigger notification for own ignored legacy DM messages", () => {
      const fakeNotification = vi.fn() as unknown as typeof Notification;
      (fakeNotification as any).permission = "granted";
      vi.stubGlobal("Notification", fakeNotification);

      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "dm", username: "alice" } as any,
      });
      renderHook(() => useWebSocket());

      setTabActive(false);

      // DM from self (username === state.username).
      dispatchWS("dm_message", {
        id: "self-dm",
        username: "testuser",
        content: "my own message",
        timestamp: 11000,
        to: "alice",
      });

      // No notification for own message.
      expect(fakeNotification).not.toHaveBeenCalled();
    });

    it("does not trigger notification for muted conversation", () => {
      const fakeNotification = vi.fn() as unknown as typeof Notification;
      (fakeNotification as any).permission = "granted";
      vi.stubGlobal("Notification", fakeNotification);

      useChatStore.setState({
        currentChat: { type: "public" },
        mutedConversations: ["public"],
      });
      renderHook(() => useWebSocket());

      setTabActive(false);

      dispatchWS("dm_message", {
        id: "muted-dm",
        username: "alice",
        content: "should be muted",
        timestamp: 12000,
        to: "testuser",
      });

      expect(fakeNotification).not.toHaveBeenCalled();
    });
  });

  // ─── Page title unread badge ──────────────────────────────────

  describe("page title unread badge", () => {
    it("updates document.title when mention_notify arrives while tab is inactive", () => {
      useChatStore.setState({
        username: "testuser",
        mutedConversations: [],
      });
      renderHook(() => useWebSocket());

      // Make tab inactive.
      setTabActive(false);
      // After visibility change, title should be reset to base.
      expect(document.title).toBe("TokenDanceChat");

      dispatchWS("mention_notify", {
        from: "alice",
        content: "hey @testuser check this",
        message_id: "mention-1",
      });

      expect(document.title).toBe("(1) TokenDanceChat");
    });

    it("updates document.title when mention_all arrives while tab is inactive", () => {
      useChatStore.setState({
        username: "testuser",
        mutedConversations: [],
      });
      renderHook(() => useWebSocket());

      setTabActive(false);
      expect(document.title).toBe("TokenDanceChat");

      dispatchWS("mention_all", {
        from: "alice",
        content: "@all important announcement",
        message_id: "all-1",
      });

      expect(document.title).toBe("(1) TokenDanceChat");
    });

    it("does not update document.title for mention_notify when tab is active", () => {
      useChatStore.setState({
        username: "testuser",
        mutedConversations: [],
      });
      renderHook(() => useWebSocket());

      // Tab is active (default after beforeEach reset).
      expect(document.title).toBe("TokenDanceChat");

      dispatchWS("mention_notify", {
        from: "alice",
        content: "hey @testuser",
        message_id: "mention-2",
      });

      // Title remains unchanged when tab is active.
      expect(document.title).toBe("TokenDanceChat");
    });

    it("accumulates unread count across multiple mentions", () => {
      useChatStore.setState({
        username: "testuser",
        mutedConversations: [],
      });
      renderHook(() => useWebSocket());

      setTabActive(false);

      dispatchWS("mention_notify", {
        from: "alice",
        content: "first mention",
        message_id: "m1",
      });
      expect(document.title).toBe("(1) TokenDanceChat");

      dispatchWS("mention_notify", {
        from: "bob",
        content: "second mention",
        message_id: "m2",
      });
      expect(document.title).toBe("(2) TokenDanceChat");
    });
  });
});
