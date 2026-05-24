import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";

// Shared mock connect function so individual tests can control resolve/reject.
const mockConnect = vi.fn();

// Mock WebSocket
vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: () => ({
    connect: mockConnect,
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

// Mock @/lib/api: keep ChatError/ErrorCode real, stub auth functions.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    loginUser: vi.fn(),
    registerUser: vi.fn(),
  };
});

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

// Must import JoinScreen and ChatError AFTER all mocks are set up
import { JoinScreen } from "@/components/JoinScreen";
import { ChatError, ErrorCode } from "@/lib/api";

function renderJoinScreen() {
  return render(
    <I18nProvider>
      <JoinScreen />
    </I18nProvider>,
  );
}

/** Navigate from the default login view to the guest view by clicking the back button. */
function goToGuestView() {
  fireEvent.click(screen.getByLabelText("返回"));
}

describe("JoinScreen", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
    useChatStore.getState().reset();
    mockConnect.mockReset();
  });

  describe("表单渲染", () => {
    it("显示标题 TokenDance Chat", () => {
      renderJoinScreen();
      goToGuestView();
      expect(screen.getByText("TokenDance Chat")).toBeTruthy();
    });

    it("显示副标题", () => {
      renderJoinScreen();
      goToGuestView();
      expect(screen.getByText("实时聊天 · AI 助手 @TokenBot @PicoClaw 在线陪伴")).toBeTruthy();
    });

    it("显示用户名输入框", () => {
      renderJoinScreen();
      goToGuestView();
      const input = screen.getByPlaceholderText("你的用户名...");
      expect(input).toBeTruthy();
    });

    it("显示加入按钮", () => {
      renderJoinScreen();
      goToGuestView();
      expect(screen.getByRole("button", { name: /游客加入/ })).toBeTruthy();
    });

    it("显示底部版权提示", () => {
      renderJoinScreen();
      goToGuestView();
      expect(screen.getByText("公共聊天室 · 文明交流")).toBeTruthy();
    });
  });

  describe("表单验证", () => {
    it("空用户名提交时显示错误", () => {
      renderJoinScreen();
      goToGuestView();
      // Button is disabled when input is empty, so submit the form directly
      const form = document.querySelector("form")!;
      fireEvent.submit(form);
      expect(screen.getByText("请输入用户名")).toBeTruthy();
    });

    it("1个字符用户名提交时显示太短错误", () => {
      renderJoinScreen();
      goToGuestView();
      const input = screen.getByPlaceholderText("你的用户名...");
      fireEvent.change(input, { target: { value: "A" } });
      const button = screen.getByRole("button", { name: /游客加入/ });
      fireEvent.click(button);
      expect(screen.getByText("用户名至少需要2个字符")).toBeTruthy();
    });

    it("输入有效字符后清除错误", () => {
      renderJoinScreen();
      goToGuestView();
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
      goToGuestView();
      const input = screen.getByPlaceholderText("你的用户名...");
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.getByText("请输入用户名")).toBeTruthy();
    });
  });

  describe("语言切换", () => {
    it("语言切换按钮存在", () => {
      renderJoinScreen();
      goToGuestView();
      // The lang toggle button shows the opposite language: "English" in zh-CN
      expect(screen.getByText("English")).toBeTruthy();
    });

    it("点击语言按钮切换到英文", () => {
      renderJoinScreen();
      goToGuestView();
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
      goToGuestView();
      // ThemeToggle renders a button with aria-label starting with "Theme:"
      const themeBtn = document.querySelector('[aria-label^="Theme:"]');
      expect(themeBtn).toBeTruthy();
    });
  });

  describe("已保存用户名", () => {
    it("从 localStorage 加载已保存的用户名", () => {
      localStorageMock.setItem("tokendance:username", "SavedUser");
      renderJoinScreen();
      goToGuestView();
      const input = screen.getByPlaceholderText("你的用户名...") as HTMLInputElement;
      expect(input.value).toBe("SavedUser");
    });
  });

  // ─── New tests ───────────────────────────────────────────────

  describe("WebSocket 连接失败", () => {
    it("超时错误显示对应提示", async () => {
      mockConnect.mockRejectedValueOnce(new ChatError(ErrorCode.TIMEOUT, "timeout"));
      renderJoinScreen();
      goToGuestView();

      const input = screen.getByPlaceholderText("你的用户名...");
      fireEvent.change(input, { target: { value: "TestUser" } });
      fireEvent.click(screen.getByRole("button", { name: /游客加入/ }));

      expect(await screen.findByText("连接超时，请检查服务器是否运行")).toBeTruthy();
    });

    it("连接关闭错误显示对应提示", async () => {
      mockConnect.mockRejectedValueOnce(new ChatError(ErrorCode.CLOSED, "closed"));
      renderJoinScreen();
      goToGuestView();

      const input = screen.getByPlaceholderText("你的用户名...");
      fireEvent.change(input, { target: { value: "TestUser" } });
      fireEvent.click(screen.getByRole("button", { name: /游客加入/ }));

      expect(await screen.findByText("连接已关闭")).toBeTruthy();
    });

    it("无法连接错误显示对应提示", async () => {
      mockConnect.mockRejectedValueOnce(new ChatError(ErrorCode.CANNOT_CONNECT, "cannot-connect"));
      renderJoinScreen();
      goToGuestView();

      const input = screen.getByPlaceholderText("你的用户名...");
      fireEvent.change(input, { target: { value: "TestUser" } });
      fireEvent.click(screen.getByRole("button", { name: /游客加入/ }));

      expect(await screen.findByText("无法连接到聊天服务器")).toBeTruthy();
    });

    it("普通 Error 显示其 message", async () => {
      mockConnect.mockRejectedValueOnce(new Error("Something broke"));
      renderJoinScreen();
      goToGuestView();

      const input = screen.getByPlaceholderText("你的用户名...");
      fireEvent.change(input, { target: { value: "TestUser" } });
      fireEvent.click(screen.getByRole("button", { name: /游客加入/ }));

      expect(await screen.findByText("Something broke")).toBeTruthy();
    });
  });

  describe("子视图切换", () => {
    it("从 guest 切换到 login 再返回 guest", () => {
      renderJoinScreen();
      // Default is now login; go to guest first.
      goToGuestView();

      // Click "登录" to go to login sub-view
      fireEvent.click(screen.getByRole("button", { name: /登录/ }));
      // LoginScreen heading is visible (use getByRole to avoid colliding with the submit button)
      expect(screen.getByRole("heading", { name: "登录" })).toBeTruthy();

      // Click back button (aria-label="返回")
      fireEvent.click(screen.getByLabelText("返回"));
      // Back to guest view — the guest join button is visible
      expect(screen.getByRole("button", { name: /游客加入/ })).toBeTruthy();
    });

    it("从 guest 切换到 register 再返回 guest", () => {
      renderJoinScreen();
      // Default is now login; go to guest first.
      goToGuestView();

      // Click "注册" to go to register sub-view
      fireEvent.click(screen.getByRole("button", { name: /注册/ }));
      // RegisterScreen heading is visible
      expect(screen.getByRole("heading", { name: "注册账号" })).toBeTruthy();

      // Click back button (aria-label="返回")
      fireEvent.click(screen.getByLabelText("返回"));
      // Back to guest view
      expect(screen.getByRole("button", { name: /游客加入/ })).toBeTruthy();
    });

    it("从 guest -> login -> 切换到 register -> 返回 guest", () => {
      renderJoinScreen();
      // Default is now login; go to guest first.
      goToGuestView();

      // guest → login
      fireEvent.click(screen.getByRole("button", { name: /登录/ }));
      expect(screen.getByRole("heading", { name: "登录" })).toBeTruthy();

      // login → register (click "还没有账号？去注册")
      fireEvent.click(screen.getByText("还没有账号？去注册"));
      expect(screen.getByRole("heading", { name: "注册账号" })).toBeTruthy();

      // register → guest (click back)
      fireEvent.click(screen.getByLabelText("返回"));
      expect(screen.getByRole("button", { name: /游客加入/ })).toBeTruthy();
    });

    it("从 guest -> register -> 切换到 login -> 返回 guest", () => {
      renderJoinScreen();
      // Default is now login; go to guest first.
      goToGuestView();

      // guest → register
      fireEvent.click(screen.getByRole("button", { name: /注册/ }));
      expect(screen.getByRole("heading", { name: "注册账号" })).toBeTruthy();

      // register → login (click "已有账号？去登录")
      fireEvent.click(screen.getByText("已有账号？去登录"));
      expect(screen.getByRole("heading", { name: "登录" })).toBeTruthy();

      // login → guest (click back)
      fireEvent.click(screen.getByLabelText("返回"));
      expect(screen.getByRole("button", { name: /游客加入/ })).toBeTruthy();
    });
  });

  describe("Login 表单验证", () => {
    /** Navigate to the login sub-view. Default is already login, so just render. */
    function goToLogin() {
      renderJoinScreen();
    }

    it("空用户名时提交显示输入用户名错误", () => {
      goToLogin();
      // Submit the LoginScreen form directly (button disabled when empty)
      const form = document.querySelector("form")!;
      fireEvent.submit(form);
      expect(screen.getByText("请输入用户名")).toBeTruthy();
    });

    it("空密码时提交显示密码错误", () => {
      goToLogin();

      const usernameInput = screen.getByLabelText("用户名");
      fireEvent.change(usernameInput, { target: { value: "ValidUser" } });

      // Submit the form with username filled but password empty
      const form = document.querySelector("form")!;
      fireEvent.submit(form);
      expect(screen.getByText("密码至少需要6个字符")).toBeTruthy();
    });

    it("输入字符后清除错误", () => {
      goToLogin();

      // Trigger error first
      const form = document.querySelector("form")!;
      fireEvent.submit(form);
      expect(screen.getByText("请输入用户名")).toBeTruthy();

      // Type something to clear
      const usernameInput = screen.getByLabelText("用户名");
      fireEvent.change(usernameInput, { target: { value: "X" } });
      expect(screen.queryByText("请输入用户名")).toBeNull();
    });
  });

  describe("Register 表单验证", () => {
    /** Navigate to the register sub-view from the default login view. */
    function goToRegister() {
      renderJoinScreen();
      // From login, click "还没有账号？去注册" to reach register
      fireEvent.click(screen.getByText("还没有账号？去注册"));
    }

    it("空用户名提交显示对应错误", () => {
      goToRegister();
      const form = document.querySelector("form")!;
      fireEvent.submit(form);
      expect(screen.getByText("请输入用户名")).toBeTruthy();
    });

    it("用户名少于2个字符显示太短错误", () => {
      goToRegister();

      const usernameInput = screen.getByLabelText("用户名");
      fireEvent.change(usernameInput, { target: { value: "A" } });

      const form = document.querySelector("form")!;
      fireEvent.submit(form);
      expect(screen.getByText("用户名至少需要2个字符")).toBeTruthy();
    });

    it("密码少于6个字符显示对应错误", () => {
      goToRegister();

      // Fill valid username
      fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "ValidUser" } });
      // Short password
      fireEvent.change(screen.getByLabelText("密码"), { target: { value: "12345" } });

      const form = document.querySelector("form")!;
      fireEvent.submit(form);
      expect(screen.getByText("密码至少需要6个字符")).toBeTruthy();
    });

    it("两次密码不一致显示对应错误", () => {
      goToRegister();

      fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "ValidUser" } });
      fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } });
      fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "different456" } });

      // Button is disabled until all fields are filled, including invite code.
      // Submit via form directly.
      const form = document.querySelector("form")!;
      fireEvent.submit(form);
      expect(screen.getByText("两次输入的密码不一致")).toBeTruthy();
    });

    it("空邀请码提交显示对应错误", () => {
      goToRegister();

      fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "ValidUser" } });
      fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } });
      fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "password123" } });

      const form = document.querySelector("form")!;
      fireEvent.submit(form);
      expect(screen.getByText("邀请码无效或已过期")).toBeTruthy();
    });

    it("显示填写所有字段提示", () => {
      goToRegister();
      // With all fields empty, the hint should be visible
      expect(screen.getByText("请填写所有字段后点击注册")).toBeTruthy();
    });

    it("输入字符后清除错误", () => {
      goToRegister();

      // Trigger error first
      const form = document.querySelector("form")!;
      fireEvent.submit(form);
      expect(screen.getByText("请输入用户名")).toBeTruthy();

      // Type something to clear
      const usernameInput = screen.getByLabelText("用户名");
      fireEvent.change(usernameInput, { target: { value: "X" } });
      expect(screen.queryByText("请输入用户名")).toBeNull();
    });
  });
});
