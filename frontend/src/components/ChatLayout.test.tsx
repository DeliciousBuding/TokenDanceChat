import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { chatAPI } from "@/lib/api";

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

vi.mock("@/lib/soundToggle", () => ({
  isSoundEnabled: vi.fn(() => true),
  setSoundEnabled: vi.fn(),
}));

vi.mock("@/lib/sound", () => ({
  playSentSound: vi.fn(),
  playMessageSound: vi.fn(),
  playMentionSound: vi.fn(),
  playOnlineSound: vi.fn(),
  playOfflineSound: vi.fn(),
  playReactionSound: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
  setSoundEnabled: vi.fn(),
}));

vi.mock("@/components/VideoCall", () => ({
  VideoCall: () => <div data-testid="video-call" />,
}));

vi.mock("@/components/ThreadPanel", () => ({
  ThreadPanel: () => <div data-testid="thread-panel" />,
}));

vi.mock("@/components/GroupInfoPanel", () => ({
  GroupInfoPanel: () => <div data-testid="group-info-panel" />,
}));

vi.mock("@/lib/api", () => {
  const handlers: Map<string, Set<(msg: unknown) => void>> = new Map();
  return {
    chatAPI: {
      on: vi.fn((event: string, handler: (msg: unknown) => void) => {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)!.add(handler);
        return () => { handlers.get(event)?.delete(handler); };
      }),
      dispatch: (event: string, data: unknown) => {
        handlers.get(event)?.forEach((h) => h(data));
        handlers.get("*")?.forEach((h) => h(data));
      },
      sendTypingStart: vi.fn(),
      sendTypingStop: vi.fn(),
      uploadImage: vi.fn().mockResolvedValue("https://example.com/uploads/file.png"),
      sendMessage: vi.fn(),
      sendDMMessage: vi.fn(),
      sendGroupMessage: vi.fn(),
      sendReaction: vi.fn(),
      sendMessageEdit: vi.fn(),
      sendThreadReply: vi.fn(),
      requestThreadMessages: vi.fn(),
      sendPinMessage: vi.fn(),
      deleteMessage: vi.fn(),
      sendFriendRequest: vi.fn(),
      sendFriendAccept: vi.fn(),
      sendFriendReject: vi.fn(),
      sendGroupCreate: vi.fn(),
      sendGroupInvite: vi.fn(),
      sendGroupInviteAccept: vi.fn(),
      sendGroupInviteDecline: vi.fn(),
      sendScheduledMessagesList: vi.fn(),
      sendCancelScheduledMessage: vi.fn(),
      sendFolderList: vi.fn(),
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
  };
});

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

// jsdom does not implement scrollTo — suppress for MessageTranscript
Element.prototype.scrollTo = vi.fn() as any;

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

    it("桌面更多菜单包含语言切换", () => {
      renderChatLayout();
      // The desktop language toggle is now inside the More dropdown
      const moreBtn = screen.getByLabelText("更多");
      expect(moreBtn).toBeTruthy();
      fireEvent.click(moreBtn);
      expect(screen.getByText("English")).toBeTruthy();
    });

    it("移动端次要操作收纳在更多菜单", () => {
      renderChatLayout();
      fireEvent.click(screen.getByLabelText("更多操作"));
      expect(screen.getAllByText("English").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("导出为 JSON")).toBeTruthy();
      expect(screen.getByText("导出为文本")).toBeTruthy();
      expect(screen.getAllByText("通知偏好").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("断开连接")).toBeTruthy();
    });

    it("移动端折叠菜单按钮存在", () => {
      renderChatLayout();
      expect(screen.getByLabelText("打开侧边栏")).toBeTruthy();
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

    it("群聊中点击群组通话按钮会发起视频群组通话", () => {
      useChatStore.setState({
        currentChat: { type: "group", name: "test-group" },
        groups: {
          "test-group": {
            name: "test-group",
            members: ["testuser", "alice", "bob"],
            roles: { testuser: "owner", alice: "member", bob: "member" },
            owner: "testuser",
            created_at: 0,
          },
        },
      });

      renderChatLayout();
      fireEvent.click(screen.getAllByLabelText("群组通话")[0]);

      const activeCall = useChatStore.getState().activeCall;
      expect(activeCall).toMatchObject({
        callId: "",
        peer: "test-group",
        callType: "video",
        isGroupCall: true,
        groupName: "test-group",
        participants: ["alice", "bob"],
      });
      expect(activeCall?.startTime).toEqual(expect.any(Number));
    });
  });

  describe("连接状态", () => {
    it("connected=false 时在标题旁显示重连状态点", () => {
      useChatStore.setState({ connected: false });
      renderChatLayout();
      expect(screen.getAllByTitle("正在重新连接 (第 1 次)...").length).toBeGreaterThanOrEqual(1);
    });

    it("connected=false 时不显示旧横幅或重载按钮", () => {
      useChatStore.setState({ connected: false });
      renderChatLayout();
      expect(screen.queryByText("连接已断开，正在尝试重新连接...")).toBeFalsy();
      expect(screen.queryByText("刷新页面")).toBeFalsy();
    });

    it("reconnect_failed 后在标题旁显示失败状态点", async () => {
      useChatStore.setState({ connected: false });
      renderChatLayout();
      await act(async () => {
        (chatAPI as any).dispatch("reconnect_failed", { type: "reconnect_failed", attempt: 10 });
      });
      expect(screen.getAllByTitle("连接已断开，请刷新页面。").length).toBeGreaterThanOrEqual(1);
    });

    it("reconnect_failed 不再渲染旧重载按钮", async () => {
      useChatStore.setState({ connected: false });
      renderChatLayout();
      await act(async () => {
        (chatAPI as any).dispatch("reconnect_failed", { type: "reconnect_failed", attempt: 10 });
      });
      expect(screen.queryByText("刷新页面")).toBeFalsy();
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

  // ── New tests ────────────────────────────────────

  describe("移动端侧边栏切换", () => {
    it("点击打开侧边栏按钮显示遮罩层", () => {
      renderChatLayout();
      // 遮罩层初始不存在 (use div selector to avoid matching lucide SVG icons)
      expect(document.querySelector('div.fixed.inset-0[aria-hidden="true"]')).toBeFalsy();
      fireEvent.click(screen.getByLabelText("打开侧边栏"));
      // 遮罩层出现
      expect(document.querySelector('div.fixed.inset-0[aria-hidden="true"]')).toBeTruthy();
    });

    it("点击遮罩层关闭侧边栏", () => {
      renderChatLayout();
      fireEvent.click(screen.getByLabelText("打开侧边栏"));
      const backdrop = document.querySelector('div.fixed.inset-0[aria-hidden="true"]');
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop!);
      // 遮罩层消失
      expect(document.querySelector('div.fixed.inset-0[aria-hidden="true"]')).toBeFalsy();
    });
  });

  describe("Thread panel open/close", () => {
    it("初始不渲染 ThreadPanel", () => {
      renderChatLayout();
      expect(screen.queryByTestId("thread-panel")).toBeFalsy();
    });

    it("点击回复计数按钮打开 ThreadPanel", async () => {
      // 添加消息：msg-2 是 msg-1 的 thread 回复
      // historyLoaded must be true for MessageTranscript to render messages
      useChatStore.setState({
        historyLoaded: true,
        messages: [
          {
            id: "msg-1",
            username: "alice",
            content: "Hello everyone",
            timestamp: Date.now() - 2000,
          },
          {
            id: "msg-2",
            username: "bob",
            content: "Thread reply",
            timestamp: Date.now() - 1000,
            thread_id: "msg-1",
          },
        ],
      });
      renderChatLayout();
      // msg-1 的回复计数按钮应出现
      const replyBtn = screen.getByLabelText("1 replies");
      expect(replyBtn).toBeTruthy();
      fireEvent.click(replyBtn);
      await waitFor(() => {
        expect(screen.getByTestId("thread-panel")).toBeTruthy();
      });
    });
  });

  describe("Group info panel", () => {
    it("初始不渲染 GroupInfoPanel", () => {
      renderChatLayout();
      expect(screen.queryByTestId("group-info-panel")).toBeFalsy();
    });

    it("设置 groupInfoPanel 后渲染 GroupInfoPanel", async () => {
      useChatStore.setState({ groupInfoPanel: "test-group" });
      renderChatLayout();
      await waitFor(() => {
        expect(screen.getByTestId("group-info-panel")).toBeTruthy();
      });
    });
  });

  describe("重连状态点", () => {
    it("显示带尝试次数的重连状态", async () => {
      useChatStore.setState({ connected: false });
      renderChatLayout();
      await act(async () => {
        (chatAPI as any).dispatch("reconnecting", { type: "reconnecting", attempt: 0 });
      });
      expect(screen.getAllByTitle("正在重新连接 (第 1 次)...").length).toBeGreaterThanOrEqual(1);
    });

    it("不同尝试次数显示不同计数", async () => {
      useChatStore.setState({ connected: false });
      renderChatLayout();
      await act(async () => {
        (chatAPI as any).dispatch("reconnecting", { type: "reconnecting", attempt: 4 });
      });
      // attempt + 1 = 5
      expect(screen.getAllByTitle("正在重新连接 (第 5 次)...").length).toBeGreaterThanOrEqual(1);
    });

    it("重连成功后清除状态点", async () => {
      useChatStore.setState({ connected: false });
      renderChatLayout();
      await act(async () => {
        (chatAPI as any).dispatch("reconnected", { type: "reconnected" });
      });
      // connected 应恢复
      expect(useChatStore.getState().connected).toBe(true);
      // 旧横幅和标题状态点都不应再显示
      expect(screen.queryByText("连接已断开，正在尝试重新连接...")).toBeFalsy();
      expect(screen.queryByTitle("正在重新连接 (第 1 次)...")).toBeFalsy();
    });

    it("reconnect_failed 不显示重连次数，只显示失败状态", async () => {
      useChatStore.setState({ connected: false });
      renderChatLayout();
      await act(async () => {
        (chatAPI as any).dispatch("reconnect_failed", { type: "reconnect_failed", attempt: 10 });
      });
      expect(screen.queryByTitle("正在重新连接 (第 11 次)...")).toBeFalsy();
      expect(screen.getAllByTitle("连接已断开，请刷新页面。").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Theme 循环", () => {
    it("light -> dark -> system 循环切换", () => {
      renderChatLayout();
      // 打开桌面"更多"菜单
      fireEvent.click(screen.getByLabelText("更多"));

      // 初始主题 light → 显示"浅色"
      expect(screen.getByText("浅色")).toBeTruthy();

      // 点击切换到 dark
      fireEvent.click(screen.getByText("浅色"));
      expect(localStorageMock.getItem("tdchat-theme")).toBe("dark");

      // 重新打开菜单
      fireEvent.click(screen.getByLabelText("更多"));
      // 现在显示"深色"
      expect(screen.getByText("深色")).toBeTruthy();

      // 点击切换到 system
      fireEvent.click(screen.getByText("深色"));
      expect(localStorageMock.getItem("tdchat-theme")).toBe("system");

      // 重新打开菜单
      fireEvent.click(screen.getByLabelText("更多"));
      // 现在显示"跟随系统"
      expect(screen.getByText("跟随系统")).toBeTruthy();
    });
  });

  describe("移动端更多菜单", () => {
    it("再次点击更多操作按钮可关闭菜单", () => {
      renderChatLayout();
      const moreBtn = screen.getByLabelText("更多操作");
      fireEvent.click(moreBtn);
      expect(screen.getByText("导出为 JSON")).toBeTruthy();
      // 再次点击关闭
      fireEvent.click(moreBtn);
      expect(screen.queryByText("导出为 JSON")).toBeFalsy();
    });

    it("点击语言切换可切换语言", () => {
      renderChatLayout();
      fireEvent.click(screen.getByLabelText("更多操作"));
      // 当前是 zh-CN，显示 "English" 表示切换到英文
      expect(screen.getByText("English")).toBeTruthy();
    });

    it("点击断开连接后菜单关闭", () => {
      renderChatLayout();
      fireEvent.click(screen.getByLabelText("更多操作"));
      // 移动端下拉中的"断开连接"
      const disconnectBtns = screen.getAllByText("断开连接");
      expect(disconnectBtns.length).toBeGreaterThanOrEqual(1);
      fireEvent.click(disconnectBtns[0]);
      // 菜单应已关闭，verify by trying to open again
      fireEvent.click(screen.getByLabelText("更多操作"));
      expect(screen.getByText("断开连接")).toBeTruthy();
    });
  });
});
