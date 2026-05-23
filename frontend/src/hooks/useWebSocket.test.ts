import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPageTitle, i18nSys, notifyMessage, isConversationMuted } from "@/hooks/useWebSocket";
import { useChatStore } from "@/stores/chatStore";

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
});

// ─── isConversationMuted ────────────────────────────────────────

describe("isConversationMuted", () => {
  beforeEach(() => {
    useChatStore.setState({
      mutedConversations: [],
      notificationPrefs: {},
    });
  });

  it("returns true when key is in legacy mutedConversations list", () => {
    useChatStore.setState({ mutedConversations: ["dm:bob"] });
    expect(isConversationMuted("dm:bob")).toBe(true);
  });

  it("returns true when notificationPref has an active time-based mute", () => {
    const future = Date.now() + 3600_000; // 1 hour from now
    useChatStore.setState({
      notificationPrefs: {
        "group:general": { mutedUntil: future, showPreview: true },
      },
    });
    expect(isConversationMuted("group:general")).toBe(true);
  });

  it("returns false when notificationPref mute has expired", () => {
    const past = Date.now() - 3600_000; // 1 hour ago
    useChatStore.setState({
      notificationPrefs: {
        "group:old": { mutedUntil: past, showPreview: true },
      },
    });
    expect(isConversationMuted("group:old")).toBe(false);
  });

  it("returns false when key is not in any mute list", () => {
    expect(isConversationMuted("public")).toBe(false);
  });
});
