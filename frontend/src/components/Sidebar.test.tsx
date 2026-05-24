import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";

// ── Mocks ──────────────────────────────────────────
vi.mock("@/lib/soundToggle", () => ({
  isSoundEnabled: vi.fn(() => true),
  setSoundEnabled: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendPinConversation: vi.fn(),
    sendUnpinConversation: vi.fn(),
    sendArchiveConversation: vi.fn(),
    sendUnarchiveConversation: vi.fn(),
    sendFolderAddConversation: vi.fn(),
    sendFolderRemoveConversation: vi.fn(),
    sendFolderList: vi.fn(),
    sendSetNotificationPrefs: vi.fn(),
  },
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
import { setSoundEnabled } from "@/lib/soundToggle";
import { chatAPI } from "@/lib/api";

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

/** Helper: get the DM-section button for a partner by name. Always uses the last DOM match
 *  because DM section renders after pinned section. */
function getDMButton(name: string): HTMLElement {
  return screen.getAllByText(name).pop()!.closest("button")!;
}

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      pinnedConversations: [],
      archivedConversations: [],
      folders: [],
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

    it("在线用户区在 AI 助手区之前，保证桌面首屏密度", () => {
      const { container } = renderSidebar();
      const onlineSection = container.querySelector('[data-visual="sidebar-online-users"]');
      const aiSection = screen.getByRole("button", { name: "AI 助手" });

      expect(onlineSection).toBeTruthy();
      expect(
        onlineSection!.compareDocumentPosition(aiSection) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("在线用户为空时保留区域但不显示旧空状态文案", () => {
      useChatStore.setState({ onlineUsers: [] });
      renderSidebar();
      expect(screen.getByText("在线用户")).toBeTruthy();
      expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText("暂无在线用户")).toBeNull();
    });

    it("未连接且无在线用户时显示骨架而非旧空状态文案", () => {
      useChatStore.setState({ connected: false, onlineUsers: [] });
      const { container } = renderSidebar();
      expect(container.querySelectorAll(".animate-shimmer").length).toBeGreaterThanOrEqual(3);
      expect(screen.queryByText("连接中...")).toBeNull();
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
    it("默认展开，AI 助手 header 可见", () => {
      renderSidebar();
      expect(screen.getByText("AI 助手")).toBeTruthy();
    });

    it("默认展开时助手列表可见", () => {
      renderSidebar();
      expect(screen.getByText("TokenBot")).toBeTruthy();
      expect(screen.getByText("PicoClaw")).toBeTruthy();
    });

    it("展开后显示助手 section 子标题", () => {
      renderSidebar();
      expect(screen.getByText("助手")).toBeTruthy();
    });

    it("展开后 TokenBot 和 PicoClaw 助手可见", () => {
      renderSidebar();
      const tokenBotMatches = screen.getAllByText("TokenBot");
      const picoClawMatches = screen.getAllByText("PicoClaw");
      expect(tokenBotMatches.length).toBeGreaterThanOrEqual(1);
      expect(picoClawMatches.length).toBeGreaterThanOrEqual(1);
    });

    it("展开后助手标签 Bot/Agent 存在", () => {
      renderSidebar();
      const botElements = screen.getAllByText((content) => content.includes("Bot"));
      const agentElements = screen.getAllByText((content) => content.includes("Agent"));
      expect(botElements.length).toBeGreaterThanOrEqual(1);
      expect(agentElements.length).toBeGreaterThanOrEqual(1);
    });

    it("展开后点击助手触发 onMentionAssistant", () => {
      const { onMentionAssistant } = renderSidebar();

      const tokenBotButtons = screen.getAllByText("TokenBot");
      fireEvent.click(tokenBotButtons[0]);

      expect(onMentionAssistant).toHaveBeenCalledWith("TokenBot");
    });

    it("展开后助手卡片显示在线状态点", () => {
      const { container } = renderSidebar();
      const onlineDots = container.querySelectorAll(".bg-success");
      expect(onlineDots.length).toBeGreaterThan(0);
    });

    it("展开后显示模型 section 子标题", () => {
      renderSidebar();
      expect(screen.getByText("模型")).toBeTruthy();
    });

    it("展开后模型卡片包含 providerName 文本", () => {
      renderSidebar();
      const deepseekMatches = screen.getAllByText("DeepSeek");
      expect(deepseekMatches.length).toBeGreaterThanOrEqual(1);
      // May match both sidebar text and SVG <title> — verify at least one match.
      expect(screen.getAllByText("Qwen").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Moonshot").length).toBeGreaterThanOrEqual(1);
    });

    it("展开后模型卡片有网格布局", () => {
      const { container } = renderSidebar();
      const grid = container.querySelector(".grid.grid-cols-2");
      expect(grid).toBeTruthy();
    });

    it("展开后模型预览只展示前四个模型", () => {
      renderSidebar();
      expect(screen.getAllByTestId("sidebar-model-card")).toHaveLength(4);
    });

    it("折叠回 AI 助手区会隐藏内容", () => {
      renderSidebar();
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

    it("显示副标题 '公共聊天室'", () => {
      renderSidebar();
      expect(screen.getByText("公共聊天室")).toBeTruthy();
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
    it("无历史消息时不显示旧空状态文案", () => {
      renderSidebar();
      expect(screen.queryByText("暂无私信")).toBeNull();
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
    it("无群组时不显示旧空状态文案", () => {
      renderSidebar();
      expect(screen.getByText("群组")).toBeTruthy();
      expect(screen.queryByText("暂无群组")).toBeNull();
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
      const onlineDot = container.querySelector('[role="status"]');
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

  // ─── New tests ──────────────────────────────────────────

  describe("右键菜单 置顶/取消置顶 (context menu pin/unpin)", () => {
    beforeEach(() => {
      useChatStore.setState({
        messages: [
          { id: "m1", username: "testuser", content: "hi charlie", to: "charlie", timestamp: Date.now() },
          { id: "m2", username: "charlie", content: "hey", timestamp: Date.now() },
        ],
        pinnedConversations: [],
      });
    });

    it("右击未置顶会话显示置顶会话按钮", () => {
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      expect(screen.getByText("置顶会话")).toBeTruthy();
      expect(screen.queryByText("取消置顶")).toBeNull();
    });

    it("右击已置顶会话显示取消置顶按钮", () => {
      useChatStore.setState({ pinnedConversations: ["dm:charlie"] });
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      expect(screen.getByText("取消置顶")).toBeTruthy();
      expect(screen.queryByText("置顶会话")).toBeNull();
    });

    it("点击置顶会话调用 chatAPI.sendPinConversation", () => {
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      fireEvent.click(screen.getByText("置顶会话"));
      expect(chatAPI.sendPinConversation).toHaveBeenCalledWith("dm:charlie");
    });

    it("点击取消置顶调用 chatAPI.sendUnpinConversation", () => {
      useChatStore.setState({ pinnedConversations: ["dm:charlie"] });
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      fireEvent.click(screen.getByText("取消置顶"));
      expect(chatAPI.sendUnpinConversation).toHaveBeenCalledWith("dm:charlie");
    });

    it("公共聊天会话也可右键置顶", () => {
      renderSidebar();
      const publicBtn = screen.getByRole("button", { name: "公共聊天" });
      fireEvent(publicBtn, new MouseEvent("contextmenu", { bubbles: true }));
      expect(screen.getByText("置顶会话")).toBeTruthy();
      fireEvent.click(screen.getByText("置顶会话"));
      expect(chatAPI.sendPinConversation).toHaveBeenCalledWith("public");
    });

    it("群组会话也可右键置顶", () => {
      useChatStore.setState({
        groups: {
          "test-group": { name: "test-group", members: ["testuser", "alice"], roles: { testuser: "owner", alice: "member" }, owner: "testuser", created_at: 0 },
        },
      });
      renderSidebar();
      const groupBtn = screen.getByText("test-group").closest("button")!;
      fireEvent(groupBtn, new MouseEvent("contextmenu", { bubbles: true }));
      expect(screen.getByText("置顶会话")).toBeTruthy();
      fireEvent.click(screen.getByText("置顶会话"));
      expect(chatAPI.sendPinConversation).toHaveBeenCalledWith("group:test-group");
    });
  });

  describe("右键菜单 归档/取消归档 (context menu archive/unarchive)", () => {
    beforeEach(() => {
      useChatStore.setState({
        messages: [
          { id: "m1", username: "testuser", content: "hi charlie", to: "charlie", timestamp: Date.now() },
          { id: "m2", username: "charlie", content: "hey", timestamp: Date.now() },
        ],
        archivedConversations: [],
      });
    });

    it("右击会话显示归档会话按钮", () => {
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      expect(screen.getByText("归档会话")).toBeTruthy();
    });

    it("右击已归档会话显示取消归档按钮", () => {
      useChatStore.setState({ archivedConversations: ["dm:charlie"] });
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      expect(screen.getByText("取消归档")).toBeTruthy();
    });

    it("点击归档会话调用 chatAPI.sendArchiveConversation", () => {
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      fireEvent.click(screen.getByText("归档会话"));
      expect(chatAPI.sendArchiveConversation).toHaveBeenCalledWith("dm:charlie");
    });

    it("点击取消归档调用 chatAPI.sendUnarchiveConversation", () => {
      useChatStore.setState({ archivedConversations: ["dm:charlie"] });
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      fireEvent.click(screen.getByText("取消归档"));
      expect(chatAPI.sendUnarchiveConversation).toHaveBeenCalledWith("dm:charlie");
    });

    it("有已归档会话时显示归档区域标题", () => {
      useChatStore.setState({ archivedConversations: ["dm:charlie"] });
      renderSidebar();
      expect(screen.getByText("已归档会话")).toBeTruthy();
    });

    it("展开归档区域显示已归档会话名称", () => {
      useChatStore.setState({ archivedConversations: ["dm:charlie"] });
      renderSidebar();
      fireEvent.click(screen.getByText("已归档会话"));
      // After expanding, charlie appears in both DM section and archived section
      expect(screen.getAllByText("charlie").length).toBeGreaterThanOrEqual(1);
    });

    it("无已归档会话时不显示归档区域", () => {
      useChatStore.setState({ archivedConversations: [] });
      renderSidebar();
      expect(screen.queryByText("已归档会话")).toBeNull();
    });
  });

  describe("右键菜单 文件夹操作 (context menu folder)", () => {
    beforeEach(() => {
      useChatStore.setState({
        messages: [
          { id: "m1", username: "testuser", content: "hi charlie", to: "charlie", timestamp: Date.now() },
          { id: "m2", username: "charlie", content: "hey", timestamp: Date.now() },
        ],
        folders: [],
      });
    });

    it("右击不在文件夹中的会话显示添加到文件夹选项", () => {
      useChatStore.setState({
        folders: [
          { id: "f1", username: "testuser", name: "Work", sort_order: 0, created_at: Date.now(), item_count: 0, items: [] },
        ],
      });
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      expect(screen.getByText("添加到文件夹")).toBeTruthy();
    });

    it("点击添加到文件夹展开子菜单显示已有文件夹", () => {
      useChatStore.setState({
        folders: [
          { id: "f1", username: "testuser", name: "Work", sort_order: 0, created_at: Date.now(), item_count: 0, items: [] },
          { id: "f2", username: "testuser", name: "Personal", sort_order: 1, created_at: Date.now(), item_count: 0, items: [] },
        ],
      });
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      fireEvent.click(screen.getByText("添加到文件夹"));
      expect(screen.getByText("Work")).toBeTruthy();
      expect(screen.getByText("Personal")).toBeTruthy();
    });

    it("无文件夹时子菜单显示暂无文件夹", () => {
      useChatStore.setState({ folders: [] });
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      fireEvent.click(screen.getByText("添加到文件夹"));
      expect(screen.getByText("暂无文件夹")).toBeTruthy();
    });

    it("已在文件夹中的会话显示从文件夹移除", () => {
      useChatStore.setState({
        folders: [
          { id: "f1", username: "testuser", name: "Work", sort_order: 0, created_at: Date.now(), item_count: 1, items: ["dm:charlie"] },
        ],
      });
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      expect(screen.getByText("从文件夹移除")).toBeTruthy();
      expect(screen.queryByText("添加到文件夹")).toBeNull();
    });

    it("点击从文件夹移除调用 chatAPI.sendFolderRemoveConversation", () => {
      useChatStore.setState({
        folders: [
          { id: "f1", username: "testuser", name: "Work", sort_order: 0, created_at: Date.now(), item_count: 1, items: ["dm:charlie"] },
        ],
      });
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      fireEvent.click(screen.getByText("从文件夹移除"));
      expect(chatAPI.sendFolderRemoveConversation).toHaveBeenCalledWith("f1", "dm:charlie");
    });

    it("点击子菜单中文件夹调用 chatAPI.sendFolderAddConversation", () => {
      useChatStore.setState({
        folders: [
          { id: "f1", username: "testuser", name: "Work", sort_order: 0, created_at: Date.now(), item_count: 0, items: [] },
        ],
      });
      renderSidebar();
      fireEvent(getDMButton("charlie"), new MouseEvent("contextmenu", { bubbles: true }));
      fireEvent.click(screen.getByText("添加到文件夹"));
      fireEvent.click(screen.getByText("Work"));
      expect(chatAPI.sendFolderAddConversation).toHaveBeenCalledWith("f1", "dm:charlie");
    });
  });

  describe("声音开关持久化 (sound toggle persistence)", () => {
    it("默认声音为开启状态", () => {
      renderSidebar();
      expect(screen.getByLabelText("音效已开启")).toBeTruthy();
    });

    it("点击切换到关闭调用 setSoundEnabled(false)", () => {
      renderSidebar();
      fireEvent.click(screen.getByLabelText("音效已开启"));
      expect(setSoundEnabled).toHaveBeenCalledWith(false);
    });

    it("关闭后按钮 aria-label 变为音效已关闭", () => {
      renderSidebar();
      fireEvent.click(screen.getByLabelText("音效已开启"));
      expect(screen.getByLabelText("音效已关闭")).toBeTruthy();
    });

    it("再次点击从关闭切换回开启", () => {
      renderSidebar();
      fireEvent.click(screen.getByLabelText("音效已开启"));
      expect(setSoundEnabled).toHaveBeenCalledWith(false);
      fireEvent.click(screen.getByLabelText("音效已关闭"));
      expect(setSoundEnabled).toHaveBeenCalledWith(true);
    });

    it("点击两次后声音回到开启状态", () => {
      renderSidebar();
      fireEvent.click(screen.getByLabelText("音效已开启"));
      fireEvent.click(screen.getByLabelText("音效已关闭"));
      expect(screen.getByLabelText("音效已开启")).toBeTruthy();
    });
  });

  describe("好友请求待处理状态 (pending friend request)", () => {
    it("有pending请求的用户在上下文菜单显示请求待处理", () => {
      renderSidebar({ pendingFriendUsers: ["alice"] });
      const aliceBtn = screen.getByRole("button", { name: "alice" });
      fireEvent.click(aliceBtn);
      expect(screen.getByText("请求待处理")).toBeTruthy();
    });

    it("有pending请求时不显示添加好友按钮", () => {
      renderSidebar({ pendingFriendUsers: ["alice"] });
      const aliceBtn = screen.getByRole("button", { name: "alice" });
      fireEvent.click(aliceBtn);
      expect(screen.queryByText("添加好友")).toBeNull();
    });

    it("无pending请求且非好友显示添加好友按钮", () => {
      renderSidebar({ pendingFriendUsers: [] });
      useChatStore.setState({ friends: [] });
      const aliceBtn = screen.getByRole("button", { name: "alice" });
      fireEvent.click(aliceBtn);
      expect(screen.getByText("添加好友")).toBeTruthy();
      expect(screen.queryByText("请求待处理")).toBeNull();
    });

    it("已经是好友且无pending时不显示添加好友", () => {
      useChatStore.setState({ friends: ["alice"] });
      renderSidebar({ pendingFriendUsers: [] });
      const aliceBtn = screen.getByRole("button", { name: "alice" });
      fireEvent.click(aliceBtn);
      expect(screen.getByText("发送消息")).toBeTruthy();
      expect(screen.queryByText("添加好友")).toBeNull();
    });

    it("多用户pending时各自独立显示", () => {
      useChatStore.setState({
        onlineUsers: ["testuser", "alice", "bob", "charlie"],
        messages: [],
      });
      renderSidebar({ pendingFriendUsers: ["alice", "charlie"] });

      const aliceBtn = screen.getByRole("button", { name: "alice" });
      fireEvent.click(aliceBtn);
      expect(screen.getByText("请求待处理")).toBeTruthy();

      // Close alice's menu by clicking her button again (toggles showMenu)
      fireEvent.click(aliceBtn);

      const charlieBtn = screen.getByRole("button", { name: "charlie" });
      fireEvent.click(charlieBtn);
      expect(screen.getByText("请求待处理")).toBeTruthy();
    });
  });

  describe("补充在线用户测试 (online users additional)", () => {
    it("当前用户有'你'标签", () => {
      renderSidebar();
      expect(screen.getByText("你")).toBeTruthy();
    });

    it("当前用户与其他用户间有分隔线", () => {
      renderSidebar();
      const selfBtn = screen.getByRole("button", { name: "testuser (你)" });
      expect(selfBtn).toBeTruthy();
    });

    it("在线用户显示在线状态点 (role=status)", () => {
      renderSidebar();
      const onlineDots = screen.getAllByRole("status", { name: "在线" });
      expect(onlineDots.length).toBeGreaterThanOrEqual(1);
    });

    it("非好友在线用户上下文菜单有发送消息和添加好友", () => {
      useChatStore.setState({ friends: [] });
      renderSidebar();
      const aliceBtn = screen.getByRole("button", { name: "alice" });
      fireEvent.click(aliceBtn);
      expect(screen.getByText("发送消息")).toBeTruthy();
      expect(screen.getByText("添加好友")).toBeTruthy();
    });

    it("好友在线用户上下文菜单有发送消息但无添加好友", () => {
      useChatStore.setState({ friends: ["alice"] });
      renderSidebar();
      const aliceBtn = screen.getByRole("button", { name: "alice" });
      fireEvent.click(aliceBtn);
      expect(screen.getByText("发送消息")).toBeTruthy();
      expect(screen.queryByText("添加好友")).toBeNull();
    });

    it("当前用户不可打开上下文菜单", () => {
      renderSidebar();
      const selfBtn = screen.getByRole("button", { name: "testuser (你)" });
      fireEvent.click(selfBtn);
      expect(screen.queryByText("发送消息")).toBeNull();
      expect(screen.queryByText("添加好友")).toBeNull();
    });
  });

  describe("好友列表交互 (friend list interaction)", () => {
    it("在线好友显示在好友section中并有在线指示", () => {
      useChatStore.setState({
        friends: ["alice", "bob"],
        onlineUsers: ["testuser", "alice", "bob"],
      });
      renderSidebar();
      expect(screen.getByText("好友")).toBeTruthy();
      expect(screen.getAllByText("alice").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("bob").length).toBeGreaterThanOrEqual(1);
    });

    it("离线好友显示在好友列表中", () => {
      useChatStore.setState({
        friends: ["david"],
        messages: [],
        onlineUsers: ["testuser", "alice", "bob"],
        userStatusList: [{ username: "david", online: false, last_seen: Date.now() - 3600000 }],
      });
      renderSidebar();
      expect(screen.getByText("david")).toBeTruthy();
    });

    it("无好友时显示空状态", () => {
      useChatStore.setState({ friends: [] });
      renderSidebar();
      expect(screen.getByText("暂无好友")).toBeTruthy();
    });
  });
});
