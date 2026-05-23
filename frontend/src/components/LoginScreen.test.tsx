import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const mockLoginUser = vi.fn();
vi.mock("@/lib/api", () => ({
  loginUser: (...args: unknown[]) => mockLoginUser(...args),
}));

vi.mock("@/i18n/context", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "auth.login": "登录",
        "auth.username": "用户名",
        "auth.password": "密码",
        "auth.loginButton": "登录",
        "auth.noAccount": "还没有账号？去注册",
        "auth.guestLogin": "返回游客模式",
        "auth.passwordMinLength": "密码不能少于6位",
        "join.errorEmpty": "用户名不能为空",
        "join.placeholder": "你的用户名...",
        "error.unknown": "未知错误",
        "a11y.back": "返回",
      };
      return map[key] ?? key;
    },
    lang: "zh-CN" as const,
    setLang: vi.fn(),
  }),
}));

import { LoginScreen } from "@/components/LoginScreen";

describe("LoginScreen", () => {
  const onBack = vi.fn();
  const onSuccess = vi.fn();
  const onSwitchToRegister = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderLogin() {
    return render(
      <LoginScreen
        onBack={onBack}
        onSuccess={onSuccess}
        onSwitchToRegister={onSwitchToRegister}
      />,
    );
  }

  it("renders the login form with all fields", () => {
    renderLogin();
    expect(screen.getByRole("heading", { name: "登录" })).toBeTruthy();
    expect(screen.getByLabelText("用户名")).toBeTruthy();
    expect(screen.getByLabelText("密码")).toBeTruthy();
    expect(screen.getByRole("button", { name: "登录" })).toBeTruthy();
    expect(screen.getByText("还没有账号？去注册")).toBeTruthy();
  });

  it("shows back button that calls onBack", () => {
    renderLogin();
    fireEvent.click(screen.getByLabelText("返回"));
    expect(onBack).toHaveBeenCalled();
  });

  it("calls onSwitchToRegister when link is clicked", () => {
    renderLogin();
    fireEvent.click(screen.getByText("还没有账号？去注册"));
    expect(onSwitchToRegister).toHaveBeenCalled();
  });

  it("shows error for empty username on Enter", async () => {
    renderLogin();
    fireEvent.keyDown(screen.getByLabelText("用户名"), { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByText("用户名不能为空")).toBeTruthy();
  });

  it("shows error for empty password on Enter", async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "testuser" } });
    fireEvent.keyDown(screen.getByLabelText("密码"), { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText("密码不能少于6位")).toBeTruthy();
    });
  });

  it("calls loginUser API on valid submit", async () => {
    mockLoginUser.mockResolvedValue({ success: true, username: "testuser" });
    renderLogin();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "testuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => {
      expect(mockLoginUser).toHaveBeenCalledWith("testuser", "password123");
    });
  });

  it("calls onSuccess when login API returns success", async () => {
    mockLoginUser.mockResolvedValue({ success: true, username: "testuser" });
    renderLogin();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "testuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("testuser");
    });
  });

  it("shows error when login API throws", async () => {
    mockLoginUser.mockRejectedValue(new Error("Network error"));
    renderLogin();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "testuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeTruthy();
    });
  });

  it("submits on Enter key press", async () => {
    mockLoginUser.mockResolvedValue({ success: true, username: "testuser" });
    renderLogin();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "testuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } });
    fireEvent.keyDown(screen.getByLabelText("密码"), { key: "Enter" });
    await waitFor(() => {
      expect(mockLoginUser).toHaveBeenCalled();
    });
  });

  it("has autocomplete attributes for password managers", () => {
    renderLogin();
    expect(screen.getByLabelText("用户名").getAttribute("autocomplete")).toBe("username");
    expect(screen.getByLabelText("密码").getAttribute("autocomplete")).toBe("current-password");
  });

  it("disables the submit button during API call (loading state)", async () => {
    // Return a promise that never resolves so loading state persists
    mockLoginUser.mockReturnValue(new Promise(() => {}));
    renderLogin();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "testuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "登录..." })).toBeDisabled();
    });
  });

  it("shows error when API returns {success: false}", async () => {
    mockLoginUser.mockResolvedValue({ success: false, username: "testuser" });
    renderLogin();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "testuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByText("未知错误")).toBeTruthy();
  });
});
