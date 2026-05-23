import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";

// Mock WebSocket
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

// Mock sound module
vi.mock("@/lib/sound", () => ({
  playMessageSound: vi.fn(),
  playMentionSound: vi.fn(),
  playOnlineSound: vi.fn(),
  playOfflineSound: vi.fn(),
  playSentSound: vi.fn(),
  playReactionSound: vi.fn(),
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

// Mock matchMedia (used by ThemeToggle)
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

// Must import JoinScreen AFTER all mocks are set up
import { JoinScreen } from "@/components/JoinScreen";

function renderJoinScreen() {
  return render(
    <I18nProvider>
      <JoinScreen />
    </I18nProvider>,
  );
}

describe("JoinScreen", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
    useChatStore.getState().reset();
  });

  describe("表单渲染", () => {
    it("显示标题 TokenDance Chat", () => {
      renderJoinScreen();
      expect(screen.getByText("TokenDance Chat")).toBeTruthy();
    });

    it("显示副标题", () => {
      renderJoinScreen();
      expect(screen.getByText("AgentHub 实时聊天验证 Demo · AI 助手 @TokenBot @PicoClaw 随时待命")).toBeTruthy();
    });

    it("显示用户名输入框", () => {
      renderJoinScreen();
      const input = screen.getByPlaceholderText("你的用户名...");
      expect(input).toBeTruthy();
    });

    it("显示加入按钮", () => {
      renderJoinScreen();
      expect(screen.getByRole("button", { name: /游客加入/ })).toBeTruthy();
    });

    it("显示底部版权提示", () => {
      renderJoinScreen();
      expect(screen.getByText("公共聊天室 · 文明交流")).toBeTruthy();
    });
  });

  describe("表单验证", () => {
    it("空用户名提交时显示错误", () => {
      renderJoinScreen();
      // Button is disabled when input is empty, so submit the form directly
      const form = document.querySelector("form")!;
      fireEvent.submit(form);
      expect(screen.getByText("请输入用户名")).toBeTruthy();
    });

    it("1个字符用户名提交时显示太短错误", () => {
      renderJoinScreen();
      const input = screen.getByPlaceholderText("你的用户名...");
      fireEvent.change(input, { target: { value: "A" } });
      const button = screen.getByRole("button", { name: /游客加入/ });
      fireEvent.click(button);
      expect(screen.getByText("用户名至少需要2个字符")).toBeTruthy();
    });

    it("输入有效字符后清除错误", () => {
      renderJoinScreen();
      // First trigger an error via form submit (button is disabled)
      const form = document.querySelector("form")!;
      fireEvent.submit(form);
      expect(screen.getByText("请输入用户名")).toBeTruthy();

      // Then type something valid to clear the error
      const input = screen.getByPlaceholderText("你的用户名...");
      fireEvent.change(input, { target: { value: "ValidName" } });

      // Error should be cleared
      expect(screen.queryByText("请输入用户名")).toBeNull();
    });

    it("按回车键触发表单提交", () => {
      renderJoinScreen();
      const input = screen.getByPlaceholderText("你的用户名...");
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.getByText("请输入用户名")).toBeTruthy();
    });
  });

  describe("语言切换", () => {
    it("语言切换按钮存在", () => {
      renderJoinScreen();
      // The lang toggle button shows the opposite language: "English" in zh-CN
      expect(screen.getByText("English")).toBeTruthy();
    });

    it("点击语言按钮切换到英文", () => {
      renderJoinScreen();
      const langBtn = screen.getByText("English");
      fireEvent.click(langBtn);
      // After switching to en-US, the button should show "中文"
      expect(screen.getByText("中文")).toBeTruthy();
      // Title remains the same (brand name)
      expect(screen.getByText("TokenDance Chat")).toBeTruthy();
    });
  });

  describe("ThemeToggle", () => {
    it("ThemeToggle 按钮存在", () => {
      renderJoinScreen();
      // ThemeToggle renders a button with aria-label starting with "Theme:"
      const themeBtn = document.querySelector('[aria-label^="Theme:"]');
      expect(themeBtn).toBeTruthy();
    });
  });

  describe("已保存用户名", () => {
    it("从 localStorage 加载已保存的用户名", () => {
      localStorageMock.setItem("tokendance:username", "SavedUser");
      renderJoinScreen();
      const input = screen.getByPlaceholderText("你的用户名...") as HTMLInputElement;
      expect(input.value).toBe("SavedUser");
    });
  });
});
