import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const mockRegisterUser = vi.fn();
vi.mock("@/lib/api", () => ({
  registerUser: (...args: unknown[]) => mockRegisterUser(...args),
}));

vi.mock("@/i18n/context", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "auth.register": "注册",
        "auth.username": "用户名",
        "auth.password": "密码",
        "auth.confirmPassword": "确认密码",
        "auth.inviteCode": "邀请码",
        "auth.registerButton": "注册",
        "auth.haveAccount": "已有账号？去登录",
        "auth.guestLogin": "返回游客模式",
        "auth.passwordMinLength": "密码不能少于6位",
        "auth.confirmNotMatch": "两次密码不一致",
        "auth.invalidCode": "邀请码无效",
        "join.errorEmpty": "用户名不能为空",
        "join.errorTooShort": "用户名至少2个字符",
        "join.errorTooLong": "用户名最多20个字符",
        "join.errorInvalidChars": "用户名只能包含中英文、数字和下划线",
        "auth.fillAllFields": "请填写所有字段后点击注册",
        "error.unknown": "未知错误",
        "a11y.back": "返回",
      };
      return map[key] ?? key;
    },
    lang: "zh-CN" as const,
    setLang: vi.fn(),
  }),
}));

import { RegisterScreen } from "@/components/RegisterScreen";

describe("RegisterScreen", () => {
  const onBack = vi.fn();
  const onSuccess = vi.fn();
  const onSwitchToLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderReg() {
    return render(
      <RegisterScreen
        onBack={onBack}
        onSuccess={onSuccess}
        onSwitchToLogin={onSwitchToLogin}
      />,
    );
  }

  it("renders all form fields", () => {
    renderReg();
    expect(screen.getByRole("heading", { name: "注册" })).toBeTruthy();
    expect(screen.getByLabelText("用户名")).toBeTruthy();
    expect(screen.getByLabelText("密码")).toBeTruthy();
    expect(screen.getByLabelText("确认密码")).toBeTruthy();
    expect(screen.getByLabelText("邀请码")).toBeTruthy();
  });

  it("shows fill-all-fields hint when form is empty", () => {
    renderReg();
    expect(screen.getByText("请填写所有字段后点击注册")).toBeTruthy();
  });

  it("hides hint when all fields are filled", () => {
    renderReg();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("邀请码"), { target: { value: "ABCD1234" } });
    expect(screen.queryByText("请填写所有字段后点击注册")).toBeNull();
  });

  it("shows error for empty username via Enter", async () => {
    renderReg();
    fireEvent.keyDown(screen.getByLabelText("用户名"), { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText("用户名不能为空")).toBeTruthy();
    });
  });

  it("shows error for short username via Enter", async () => {
    renderReg();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "a" } });
    fireEvent.keyDown(screen.getByLabelText("用户名"), { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText("用户名至少2个字符")).toBeTruthy();
    });
  });

  it("shows error for long username via Enter", async () => {
    renderReg();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "a".repeat(21) } });
    fireEvent.keyDown(screen.getByLabelText("用户名"), { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText("用户名最多20个字符")).toBeTruthy();
    });
  });

  it("shows error for invalid username characters via Enter", async () => {
    renderReg();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "user!@#" } });
    fireEvent.keyDown(screen.getByLabelText("用户名"), { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText("用户名只能包含中英文、数字和下划线")).toBeTruthy();
    });
  });

  it("shows error for short password on submit", async () => {
    renderReg();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "12345" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "12345" } });
    fireEvent.change(screen.getByLabelText("邀请码"), { target: { value: "ABCD1234" } });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    await waitFor(() => {
      expect(screen.getByText("密码不能少于6位")).toBeTruthy();
    });
  });

  it("shows error for mismatched passwords on submit", async () => {
    renderReg();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "654321" } });
    fireEvent.change(screen.getByLabelText("邀请码"), { target: { value: "ABCD1234" } });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    await waitFor(() => {
      expect(screen.getByText("两次密码不一致")).toBeTruthy();
    });
  });

  it("shows error for empty invite code via Enter", async () => {
    renderReg();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "123456" } });
    fireEvent.keyDown(screen.getByLabelText("邀请码"), { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText("邀请码无效")).toBeTruthy();
    });
  });

  it("calls onSuccess on successful registration", async () => {
    mockRegisterUser.mockResolvedValue({ success: true, username: "newuser" });
    renderReg();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("邀请码"), { target: { value: "ABCD1234" } });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("newuser");
    });
  });

  it("submits on Enter key", async () => {
    mockRegisterUser.mockResolvedValue({ success: true, username: "newuser" });
    renderReg();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("邀请码"), { target: { value: "ABCD1234" } });
    fireEvent.keyDown(screen.getByLabelText("邀请码"), { key: "Enter" });
    await waitFor(() => {
      expect(mockRegisterUser).toHaveBeenCalled();
    });
  });

  it("navigates back when back button clicked", () => {
    renderReg();
    fireEvent.click(screen.getByLabelText("返回"));
    expect(onBack).toHaveBeenCalled();
  });

  it("switches to login when link clicked", () => {
    renderReg();
    fireEvent.click(screen.getByText("已有账号？去登录"));
    expect(onSwitchToLogin).toHaveBeenCalled();
  });

  it("has autocomplete attributes for password managers", () => {
    renderReg();
    expect(screen.getByLabelText("用户名").getAttribute("autocomplete")).toBe("username");
    expect(screen.getByLabelText("密码").getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByLabelText("确认密码").getAttribute("autocomplete")).toBe("new-password");
  });

  it("disables button when fields are incomplete", () => {
    renderReg();
    expect((screen.getByRole("button", { name: "注册" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("handles API error gracefully", async () => {
    mockRegisterUser.mockRejectedValue(new Error("Server error"));
    renderReg();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("邀请码"), { target: { value: "ABCD1234" } });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeTruthy();
    });
  });
});
