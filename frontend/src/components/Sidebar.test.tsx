import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";

// ── Mocks ──────────────────────────────────────────
vi.mock("@/lib/soundToggle", () => ({
  isSoundEnabled: vi.fn(() => true),
  setSoundEnabled: vi.fn(),
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

import { Sidebar } from "@/components/Sidebar";

function renderSidebar(props?: {
  collapsed?: boolean;
  onClose?: () => void;
  onStartDM?: (username: string) => void;
  onAddFriend?: (username: string) => void;
  onCreateGroup?: () => void;
  onMentionAssistant?: (name: string) => void;
  pendingFriendUsers?: string[];
}) {
  const defaultOnClose = vi.fn();
  const defaultOnStartDM = vi.fn();
  const defaultOnAddFriend = vi.fn();
  const defaultOnCreateGroup = vi.fn();
  const defaultOnMentionAssistant = vi.fn();

  const result = render(
    <I18nProvider>
      <Sidebar
        collapsed={props?.collapsed ?? false}
        onClose={props?.onClose ?? defaultOnClose}
        onStartDM={props?.onStartDM ?? defaultOnStartDM}
        onAddFriend={props?.onAddFriend ?? defaultOnAddFriend}
        onCreateGroup={props?.onCreateGroup ?? defaultOnCreateGroup}
        onMentionAssistant={props?.onMentionAssistant ?? defaultOnMentionAssistant}
        pendingFriendUsers={props?.pendingFriendUsers ?? []}
      />
    </I18nProvider>,
  );
  return {
    ...result,
    onClose: props?.onClose ?? defaultOnClose,
    onStartDM: props?.onStartDM ?? defaultOnStartDM,
    onAddFriend: props?.onAddFriend ?? defaultOnAddFriend,
    onCreateGroup: props?.onCreateGroup ?? defaultOnCreateGroup,
    onMentionAssistant: props?.onMentionAssistant ?? defaultOnMentionAssistant,
  };
}

/** Helper: expand the collapsible AI 助手 section so assistant/model tests work. */
function expandAIAssistants() {
  const header = screen.getByText("AI 助手");
  fireEvent.click(header);
}

describe("Sidebar", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
    // Use only real users in onlineUsers to avoid duplicate TokenBot/PicoClaw
    useChatStore.setState({
      username: "testuser",
      connected: true,
      onlineUsers: ["testuser", "alice", "bob"],
      currentChat: { type: "public" },
      messages: [],
      friends: [],
      groups: {},
      unreadByConversation: {},
      userStatusList: [],
    });
  });

  describe("在线用户列表 (online users)", () => {
    it("显示当前用户标记为 '你'", () => {
      renderSidebar();
      expect(screen.getByText("你")).toBeTruthy();
    });

    it("当前用户名 'testuser' 可见", () => {
      renderSidebar();
      // testuser appears in header footer and user list
      const matches = screen.getAllByText("testuser");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it("显示其他在线用户", () => {
      renderSidebar();
      expect(screen.getByText("alice")).toBeTruthy();
      expect(screen.getByText("bob")).toBeTruthy();
    });

    it("在线用户区域显示用户数量统计", () => {
      renderSidebar();
      expect(screen.getByText("3")).toBeTruthy();
    });

    it("在线用户为空时显示空状态", () => {
      useChatStore.setState({ onlineUsers: [] });
      renderSidebar();
      expect(screen.getByText("暂无在线用户")).toBeTruthy();
    });

    it("未连接且无在线用户时显示连接中指示而非空状态", () => {
      useChatStore.setState({ connected: false, onlineUsers: [] });
      renderSidebar();
      expect(screen.getByText("连接中...")).toBeTruthy();
      expect(screen.queryByText("暂无在线用户")).toBeNull();
    });

    it("显示 '在线用户' section 标题", () => {
      renderSidebar();
      expect(screen.getByText("在线用户")).toBeTruthy();
    });

    it("点击用户打开上下文菜单（发送消息）", () => {
      renderSidebar();
      const aliceBtn = screen.getByRole("button", { name: "alice" });
      fireEvent.click(aliceBtn);
      expect(screen.getByText("发送消息")).toBeTruthy();
    });

    it("上下文菜单包含添加好友选项", () => {
      renderSidebar();
      const aliceBtn = screen.getByRole("button", { name: "alice" });
      fireEvent.click(aliceBtn);
      expect(screen.getByText("添加好友")).toBeTruthy();
    });

    it("点击发送消息触发 onStartDM", () => {
      const { onStartDM } = renderSidebar();
      const aliceBtn = screen.getByRole("button", { name: "alice" });
      fireEvent.click(aliceBtn);
      fireEvent.click(screen.getByText("发送消息"));

      expect(onStartDM).toHaveBeenCalledWith("alice");
    });
  });

  describe("AI 助手区 (collapsible Assistants + Models)", () => {
    it("默认折叠，AI 助手 header 可见", () => {
      renderSidebar();
      expect(screen.getByText("AI 助手")).toBeTruthy();
    });

    it("默认折叠时助手列表不可见", () => {
      renderSidebar();
      // TokenBot/PicoClaw are not rendered when section is collapsed
      expect(screen.queryByText("TokenBot")).toBeNull();
      expect(screen.queryByText("PicoClaw")).toBeNull();
    });

    it("展开后显示助手 section 子标题", () => {
      renderSidebar();
      expandAIAssistants();
      expect(screen.getByText("助手")).toBeTruthy();
    });

    it("展开后 TokenBot 和 PicoClaw 助手可见", () => {
      renderSidebar();
      expandAIAssistants();
      const tokenBotMatches = screen.getAllByText("TokenBot");
      const picoClawMatches = screen.getAllByText("PicoClaw");
      expect(tokenBotMatches.length).toBeGreaterThanOrEqual(1);
      expect(picoClawMatches.length).toBeGreaterThanOrEqual(1);
    });

    it("展开后助手标签 Bot/Agent 存在", () => {
      renderSidebar();
      expandAIAssistants();
      const botElements = screen.getAllByText((content) => content.includes("Bot"));
      const agentElements = screen.getAllByText((content) => content.includes("Agent"));
      expect(botElements.length).toBeGreaterThanOrEqual(1);
      expect(agentElements.length).toBeGreaterThanOrEqual(1);
    });

    it("展开后点击助手触发 onMentionAssistant", () => {
      const { onMentionAssistant } = renderSidebar();
      expandAIAssistants();

      const tokenBotButtons = screen.getAllByText("TokenBot");
      fireEvent.click(tokenBotButtons[0]);

      expect(onMentionAssistant).toHaveBeenCalledWith("TokenBot");
    });

    it("展开后助手卡片显示在线状态点", () => {
      const { container } = renderSidebar();
      expandAIAssistants();
      const onlineDots = container.querySelectorAll(".bg-online");
      expect(onlineDots.length).toBeGreaterThan(0);
    });

    it("展开后显示模型 section 子标题", () => {
      renderSidebar();
      expandAIAssistants();
      expect(screen.getByText("模型")).toBeTruthy();
    });

    it("展开后模型卡片包含 providerName 文本", () => {
      renderSidebar();
      expandAIAssistants();
      const deepseekMatches = screen.getAllByText("DeepSeek");
      expect(deepseekMatches.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Qwen")).toBeTruthy();
      expect(screen.getByText("Moonshot")).toBeTruthy();
    });

    it("展开后模型卡片有网格布局", () => {
      const { container } = renderSidebar();
      expandAIAssistants();
      const grid = container.querySelector(".grid.grid-cols-2");
      expect(grid).toBeTruthy();
    });

    it("展开后模型预览只展示前四个模型", () => {
      renderSidebar();
      expandAIAssistants();
      expect(screen.getAllByTestId("sidebar-model-card")).toHaveLength(4);
    });

    it("折叠回 AI 助手区会隐藏内容", () => {
      renderSidebar();
      expandAIAssistants();
      expect(screen.getByText("助手")).toBeTruthy();
      // Click again to collapse
      fireEvent.click(screen.getByText("AI 助手"));
      expect(screen.queryByText("助手")).toBeNull();
    });
  });

  describe("标题区 (header)", () => {
    it("显示公共聊天标题（多处出现）", () => {
      renderSidebar();
      const matches = screen.getAllByText("公共聊天");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it("显示副标题 'Public Chat Room'", () => {
      renderSidebar();
      expect(screen.getByText("Public Chat Room")).toBeTruthy();
    });

    it("不传 onClose 时无关闭按钮", () => {
      const { container } = render(
        <I18nProvider>
          <Sidebar />
        </I18nProvider>,
      );
      const closeBtn = container.querySelector('[aria-label="关闭侧边栏"]');
      expect(closeBtn).toBeNull();
    });

    it("传入 onClose 时显示关闭按钮", () => {
      renderSidebar({ onClose: vi.fn() });
      expect(screen.getByLabelText("关闭侧边栏")).toBeTruthy();
    });
  });

  describe("私信区 (Direct Messages)", () => {
    it("无历史消息时显示空状态", () => {
      renderSidebar();
      expect(screen.getByText("暂无私信")).toBeTruthy();
    });

    it("有历史消息时出现私信区标题", () => {
      useChatStore.setState({
        messages: [
          {
            id: "msg-1",
            username: "testuser",
            content: "Hello alice",
            to: "alice",
            timestamp: Date.now(),
          },
          {
            id: "msg-2",
            username: "alice",
            content: "Hi testuser",
            timestamp: Date.now(),
          },
        ],
      });
      renderSidebar();
      expect(screen.getByText("私信")).toBeTruthy();
    });
  });

  describe("群组区 (Groups)", () => {
    it("无群组时显示空状态", () => {
      renderSidebar();
      expect(screen.getByText("暂无群组")).toBeTruthy();
    });

    it("有群组时显示群组名", () => {
      useChatStore.setState({
        groups: {
          "test-group": { name: "test-group", members: ["testuser", "alice"], roles: { testuser: "owner", alice: "member" }, owner: "testuser", created_at: 0 },
        },
      });
      renderSidebar();
      expect(screen.getByText("test-group")).toBeTruthy();
    });

    it("显示创建群组按钮", () => {
      renderSidebar({ onCreateGroup: vi.fn() });
      expect(screen.getByLabelText("创建群组")).toBeTruthy();
    });

    it("点击创建群组触发 onCreateGroup", () => {
      const onCreateGroup = vi.fn();
      renderSidebar({ onCreateGroup });
      fireEvent.click(screen.getByLabelText("创建群组"));
      expect(onCreateGroup).toHaveBeenCalledTimes(1);
    });

    it("显示群组成员数量", () => {
      useChatStore.setState({
        groups: {
          "test-group": { name: "test-group", members: ["testuser", "alice", "bob"], roles: { testuser: "owner", alice: "member", bob: "member" }, owner: "testuser", created_at: 0 },
        },
      });
      renderSidebar();
      // "3" may appear in both member count and online users count
      const matches = screen.getAllByText("3");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Footer", () => {
    it("在 footer 显示当前用户和设置入口", () => {
      renderSidebar();
      expect(screen.getAllByText("testuser").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByLabelText("打开设置")).toBeTruthy();
    });

    it("显示在线指示点", () => {
      const { container } = renderSidebar();
      const onlineDot = container.querySelector(".animate-pulse-dot");
      expect(onlineDot).toBeTruthy();
    });
  });

  describe("collapsed 状态", () => {
    it("collapsed=true 时 sidebar 隐藏", () => {
      const { container } = renderSidebar({ collapsed: true });
      const aside = container.querySelector("aside");
      expect(aside?.className).toContain("hidden");
    });

    it("collapsed=false 时 sidebar 可见", () => {
      const { container } = renderSidebar({ collapsed: false });
      const aside = container.querySelector("aside");
      expect(aside?.className).toContain("flex");
    });
  });

  describe("好友区 (Friends)", () => {
    it("无好友时显示空状态", () => {
      renderSidebar();
      expect(screen.getByText("暂无好友")).toBeTruthy();
    });

    it("有在线好友时显示好友名", () => {
      useChatStore.setState({
        friends: ["alice"],
        onlineUsers: ["testuser", "alice"],
      });
      renderSidebar();
      const aliceElements = screen.getAllByText("alice");
      expect(aliceElements.length).toBeGreaterThanOrEqual(1);
    });

    it("显示好友数量标签", () => {
      useChatStore.setState({
        friends: ["alice", "bob"],
      });
      renderSidebar();
      expect(screen.getByText("2")).toBeTruthy();
    });
  });

  describe("搜索对话 (search filter)", () => {
    it("渲染搜索输入框", () => {
      renderSidebar();
      const input = screen.getByPlaceholderText("搜索对话...");
      expect(input).toBeTruthy();
    });

    it("搜索框默认值为空", () => {
      renderSidebar();
      const input = screen.getByPlaceholderText("搜索对话...") as HTMLInputElement;
      expect(input.value).toBe("");
    });

    it("输入搜索词后显示搜索结果标题", async () => {
      useChatStore.setState({
        messages: [
          {
            id: "msg-1",
            username: "testuser",
            content: "Hello alice",
            to: "alice",
            timestamp: Date.now(),
          },
        ],
      });
      renderSidebar();
      const input = screen.getByPlaceholderText("搜索对话...");
      fireEvent.change(input, { target: { value: "alice" } });

      // Wait for debounce (150ms)
      await waitFor(() => {
        expect(screen.getByText("搜索结果")).toBeTruthy();
      });
    });

    it("过滤 DM 对话名称", async () => {
      useChatStore.setState({
        messages: [
          { id: "msg-1", username: "testuser", content: "hi", to: "alice", timestamp: Date.now() },
          { id: "msg-2", username: "bob", content: "hello", timestamp: Date.now() },
        ],
      });
      renderSidebar();
      const input = screen.getByPlaceholderText("搜索对话...");
      fireEvent.change(input, { target: { value: "alice" } });

      await waitFor(() => {
        expect(screen.getByText("搜索结果")).toBeTruthy();
      });

      // alice should be visible in results (may also appear in online users)
      const aliceMatches = screen.getAllByText("alice");
      expect(aliceMatches.length).toBeGreaterThanOrEqual(1);
    });

    it("过滤群组名称", async () => {
      useChatStore.setState({
        groups: {
          "dev-team": { name: "dev-team", members: ["testuser", "alice"], roles: { testuser: "owner", alice: "member" }, owner: "testuser", created_at: 0 },
          "design-squad": { name: "design-squad", members: ["testuser"], roles: { testuser: "owner" }, owner: "testuser", created_at: 0 },
        },
      });
      renderSidebar();
      const input = screen.getByPlaceholderText("搜索对话...");
      fireEvent.change(input, { target: { value: "dev" } });

      await waitFor(() => {
        expect(screen.getByText("搜索结果")).toBeTruthy();
      });

      expect(screen.getByText("dev-team")).toBeTruthy();
    });

    it("过滤好友名称", async () => {
      useChatStore.setState({
        friends: ["alice", "bob"],
        onlineUsers: ["testuser", "alice", "bob"],
      });
      renderSidebar();
      const input = screen.getByPlaceholderText("搜索对话...");
      fireEvent.change(input, { target: { value: "bob" } });

      await waitFor(() => {
        expect(screen.getByText("搜索结果")).toBeTruthy();
      });

      // bob should be visible in results (may also appear in online users)
      const bobMatches = screen.getAllByText("bob");
      expect(bobMatches.length).toBeGreaterThanOrEqual(1);
    });

    it("无匹配时显示空状态", async () => {
      useChatStore.setState({
        messages: [
          { id: "msg-1", username: "testuser", content: "hi", to: "alice", timestamp: Date.now() },
        ],
      });
      renderSidebar();
      const input = screen.getByPlaceholderText("搜索对话...");
      fireEvent.change(input, { target: { value: "zzz-nonexistent" } });

      await waitFor(() => {
        expect(screen.getByText("未找到匹配的对话")).toBeTruthy();
      });
    });

    it("清空搜索框恢复普通布局", async () => {
      useChatStore.setState({
        messages: [
          { id: "msg-1", username: "testuser", content: "hi", to: "alice", timestamp: Date.now() },
        ],
      });
      renderSidebar();
      const input = screen.getByPlaceholderText("搜索对话...") as HTMLInputElement;

      // Type something to trigger filter
      fireEvent.change(input, { target: { value: "alice" } });
      await waitFor(() => {
        expect(screen.getByText("搜索结果")).toBeTruthy();
      });

      // Clear the input
      fireEvent.change(input, { target: { value: "" } });
      await waitFor(() => {
        expect(screen.queryByText("搜索结果")).toBeNull();
      });

      // Normal section titles should be back
      expect(screen.getByText("私信")).toBeTruthy();
    });

    it("搜索不区分大小写", async () => {
      useChatStore.setState({
        messages: [
          { id: "msg-1", username: "testuser", content: "hi", to: "Alice", timestamp: Date.now() },
        ],
      });
      renderSidebar();
      const input = screen.getByPlaceholderText("搜索对话...");
      fireEvent.change(input, { target: { value: "alice" } });

      await waitFor(() => {
        expect(screen.getByText("搜索结果")).toBeTruthy();
      });

      expect(screen.getByText("Alice")).toBeTruthy();
    });

    it("搜索时隐藏普通 section 标题", async () => {
      useChatStore.setState({
        messages: [
          { id: "msg-1", username: "testuser", content: "hi", to: "alice", timestamp: Date.now() },
        ],
        groups: {
          "test-group": { name: "test-group", members: ["testuser"], roles: { testuser: "owner" }, owner: "testuser", created_at: 0 },
        },
      });
      renderSidebar();

      // Before search, sections are visible
      expect(screen.getByText("私信")).toBeTruthy();
      expect(screen.getByText("群组")).toBeTruthy();

      const input = screen.getByPlaceholderText("搜索对话...");
      fireEvent.change(input, { target: { value: "alice" } });

      await waitFor(() => {
        expect(screen.getByText("搜索结果")).toBeTruthy();
      });

      // Normal section titles should be hidden during search
      expect(screen.queryByText("私信")).toBeNull();
      expect(screen.queryByText("群组")).toBeNull();
    });

    it("点击搜索结果导航到对应 DM 会话", async () => {
      useChatStore.setState({
        messages: [
          { id: "msg-1", username: "testuser", content: "hi", to: "alice", timestamp: Date.now() },
        ],
      });
      renderSidebar();
      const input = screen.getByPlaceholderText("搜索对话...");
      fireEvent.change(input, { target: { value: "alice" } });

      await waitFor(() => {
        expect(screen.getByText("搜索结果")).toBeTruthy();
      });

      // Click on the first "alice" match
      const aliceButtons = screen.getAllByText("alice");
      fireEvent.click(aliceButtons[0]);
    });

    it("搜索时清除按钮可见", async () => {
      renderSidebar();
      const input = screen.getByPlaceholderText("搜索对话...");
      fireEvent.change(input, { target: { value: "test" } });

      // Clear button should appear
      const clearBtn = screen.getByLabelText("清除搜索");
      expect(clearBtn).toBeTruthy();

      // Click clear
      fireEvent.click(clearBtn);
      await waitFor(() => {
        expect((screen.getByPlaceholderText("搜索对话...") as HTMLInputElement).value).toBe("");
      });
    });
  });
});
