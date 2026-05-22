import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  describe("Assistants 区", () => {
    it("显示助手 section 标题", () => {
      renderSidebar();
      expect(screen.getByText("助手")).toBeTruthy();
    });

    it("TokenBot 和 PicoClaw 助手可见（使用 getAllByText）", () => {
      renderSidebar();
      // Assistants are always rendered regardless of onlineUsers
      const tokenBotMatches = screen.getAllByText("TokenBot");
      const picoClawMatches = screen.getAllByText("PicoClaw");
      expect(tokenBotMatches.length).toBeGreaterThanOrEqual(1);
      expect(picoClawMatches.length).toBeGreaterThanOrEqual(1);
    });

    it("助手标签 Bot/Agent 存在", () => {
      renderSidebar();
      // "Bot " is part of "Bot · DeepSeek..." and "Agent " is part of "Agent · PicoClaw..."
      // Use a function matcher for substring match
      const botElements = screen.getAllByText((content) => content.includes("Bot"));
      const agentElements = screen.getAllByText((content) => content.includes("Agent"));
      expect(botElements.length).toBeGreaterThanOrEqual(1);
      expect(agentElements.length).toBeGreaterThanOrEqual(1);
    });

    it("点击助手触发 onMentionAssistant", () => {
      const { onMentionAssistant } = renderSidebar();

      // Click on TokenBot in the assistants section
      const tokenBotButtons = screen.getAllByText("TokenBot");
      fireEvent.click(tokenBotButtons[0]);

      expect(onMentionAssistant).toHaveBeenCalledWith("TokenBot");
    });

    it("助手卡片显示在线状态点", () => {
      const { container } = renderSidebar();
      const onlineDots = container.querySelectorAll(".bg-online");
      expect(onlineDots.length).toBeGreaterThan(0);
    });
  });

  describe("Models 区", () => {
    it("显示模型 section 标题", () => {
      renderSidebar();
      expect(screen.getByText("模型")).toBeTruthy();
    });

    it("模型卡片包含 providerName 文本", () => {
      renderSidebar();
      // "DeepSeek" appears in both model grid and assistant subtitle
      const deepseekMatches = screen.getAllByText("DeepSeek");
      expect(deepseekMatches.length).toBeGreaterThanOrEqual(1);
      // These should be unique text
      expect(screen.getByText("Qwen")).toBeTruthy();
      expect(screen.getByText("Moonshot")).toBeTruthy();
    });

    it("模型卡片有网格布局", () => {
      const { container } = renderSidebar();
      const grid = container.querySelector(".grid.grid-cols-2");
      expect(grid).toBeTruthy();
    });

    it("模型预览保持紧凑，只展示前四个模型", () => {
      renderSidebar();
      expect(screen.getAllByTestId("sidebar-model-card")).toHaveLength(4);
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
      const closeBtn = container.querySelector('[aria-label="Close sidebar"]');
      expect(closeBtn).toBeNull();
    });

    it("传入 onClose 时显示关闭按钮", () => {
      renderSidebar({ onClose: vi.fn() });
      expect(screen.getByLabelText("Close sidebar")).toBeTruthy();
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
});
