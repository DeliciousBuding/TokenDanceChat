import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";

// ── Mocks ──────────────────────────────────────────

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendMessage: vi.fn(),
    sendDMMessage: vi.fn(),
    sendGroupMessage: vi.fn(),
    markRead: vi.fn(),
    joinRoom: vi.fn(),
    createRoom: vi.fn(),
    leaveRoom: vi.fn(),
    forwardMessage: vi.fn(),
    sendReaction: vi.fn(),
    sendMessageEdit: vi.fn(),
    uploadImage: vi.fn(),
  }),
}));

vi.mock("@/lib/sound", () => ({
  playSentSound: vi.fn(),
  playMessageSound: vi.fn(),
  playMentionSound: vi.fn(),
  playOnlineSound: vi.fn(),
  playOfflineSound: vi.fn(),
  playReactionSound: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendTypingStart: vi.fn(),
    sendTypingStop: vi.fn(),
    uploadImage: vi.fn().mockResolvedValue("https://example.com/uploads/file.png"),
    sendMessage: vi.fn(),
    sendDMMessage: vi.fn(),
    sendGroupMessage: vi.fn(),
    sendReaction: vi.fn(),
    sendMessageEdit: vi.fn(),
    sendPinMessage: vi.fn(),
    deleteMessage: vi.fn(),
    sendFriendRequest: vi.fn(),
    sendFriendAccept: vi.fn(),
    sendFriendReject: vi.fn(),
    sendGroupCreate: vi.fn(),
    sendGroupInvite: vi.fn(),
    sendGroupInviteAccept: vi.fn(),
    sendGroupInviteDecline: vi.fn(),
    fetchLinkPreview: vi.fn(),
  },
  ChatError: class ChatError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  ErrorCode: { TIMEOUT: "TIMEOUT", CLOSED: "CLOSED", CANNOT_CONNECT: "CANNOT_CONNECT" },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.location.reload
const mockReload = vi.fn();
Object.defineProperty(window, "location", {
  value: { reload: mockReload },
  writable: true,
});

// Mock window.visualViewport
Object.defineProperty(window, "visualViewport", {
  writable: true,
  value: {
    height: 800,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
});

import { ChatLayout } from "@/components/ChatLayout";

function renderChatLayout() {
  return render(
    <I18nProvider>
      <ChatLayout />
    </I18nProvider>,
  );
}

describe("ChatLayout", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
    mockReload.mockClear();
    useChatStore.setState({
      username: "testuser",
      connected: true,
      onlineUsers: ["testuser", "alice"],
      currentChat: { type: "public" },
      messages: [],
      friends: [],
      groups: {},
      unreadByConversation: {},
      userStatusList: [],
      pendingFriendRequests: [],
      pendingGroupInvites: [],
      pinnedMessages: [],
      currentRoomID: "public",
    });
  });

  describe("Header 渲染", () => {
    it("渲染 ChatLayout 不报错", () => {
      const { container } = renderChatLayout();
      expect(container).toBeTruthy();
      // Basic layout structure exists
      expect(container.querySelector(".flex")).toBeTruthy();
    });

    it("语言切换按钮可见", () => {
      renderChatLayout();
      expect(screen.getByText("English")).toBeTruthy();
    });

    it("移动端折叠菜单按钮存在", () => {
      renderChatLayout();
      expect(screen.getByLabelText("Open sidebar")).toBeTruthy();
    });
  });

  describe("Conversation 切换", () => {
    it("切换到 DM 时标题可见（移动端+桌面端各一份）", () => {
      useChatStore.setState({ currentChat: { type: "dm", username: "alice" } });
      renderChatLayout();
      // Both mobile and desktop headers render the title, so getAllByText
      const matches = screen.getAllByText("与 alice 的私聊");
      expect(matches.length).toBe(2); // mobile h1 + desktop h1
    });

    it("切换到 DM 时显示返回按钮", () => {
      useChatStore.setState({ currentChat: { type: "dm", username: "alice" } });
      renderChatLayout();
      // "公共聊天" aria-label appears on both sidebar <aside> and the back <button>
      const matches = screen.getAllByLabelText("公共聊天");
      // At least the back button should be present
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it("切换到群聊时标题可见（移动端+桌面端各一份）", () => {
      useChatStore.setState({ currentChat: { type: "group", name: "test-group" } });
      renderChatLayout();
      // Both mobile and desktop headers show the title
      const matches = screen.getAllByText("群聊: test-group");
      expect(matches.length).toBe(2);
    });

    it("点击返回按钮切换到公共聊天", () => {
      useChatStore.setState({ currentChat: { type: "dm", username: "alice" } });
      renderChatLayout();

      // The back button is a <button> with aria-label "公共聊天" in the desktop header
      const backButtons = screen.getAllByLabelText("公共聊天");
      // Filter to get the button element (not the aside)
      const backBtn = backButtons.find((el) => el.tagName === "BUTTON");
      expect(backBtn).toBeTruthy();
      fireEvent.click(backBtn!);

      expect(useChatStore.getState().currentChat.type).toBe("public");
    });
  });

  describe("连接状态", () => {
    it("connected=false 时显示断线横幅", () => {
      useChatStore.setState({ connected: false });
      renderChatLayout();
      expect(screen.getByText("连接已断开，正在尝试重新连接...")).toBeTruthy();
    });

    it("断线横幅有重载按钮", () => {
      useChatStore.setState({ connected: false });
      renderChatLayout();
      expect(screen.getByText("刷新页面")).toBeTruthy();
    });

    it("点击重载按钮触发 reload", () => {
      useChatStore.setState({ connected: false });
      renderChatLayout();
      fireEvent.click(screen.getByText("刷新页面"));
      expect(mockReload).toHaveBeenCalledTimes(1);
    });
  });

  describe("好友请求通知", () => {
    it("有待处理请求时显示通知", () => {
      useChatStore.setState({
        currentChat: { type: "public" },
        pendingFriendRequests: [{ from: "newfriend", timestamp: Date.now() }],
      });
      renderChatLayout();
      expect(screen.getByText(/newfriend.*好友请求/)).toBeTruthy();
    });

    it("显示接受和拒绝按钮", () => {
      useChatStore.setState({
        currentChat: { type: "public" },
        pendingFriendRequests: [{ from: "newfriend", timestamp: Date.now() }],
      });
      renderChatLayout();
      expect(screen.getByText("接受")).toBeTruthy();
      expect(screen.getByText("拒绝")).toBeTruthy();
    });
  });

  describe("全局快捷键", () => {
    it("Escape 关闭侧边栏不崩溃", () => {
      renderChatLayout();
      // Just verify the handler is registered without error
      fireEvent.keyDown(window, { key: "Escape" });
      // Test passes if no error thrown
    });
  });
});
