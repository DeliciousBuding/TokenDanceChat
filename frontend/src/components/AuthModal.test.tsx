import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { AuthModal } from "@/components/AuthModal";
import { loginUser } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  persistSessionToken: vi.fn(),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: () => ({
    connect: mocks.connect,
  }),
}));

vi.mock("@/components/OidcLoginButton", () => ({
  OidcLoginButton: () => null,
}));

vi.mock("@/lib/api", () => ({
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  persistSessionToken: mocks.persistSessionToken,
  ChatError: class ChatError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  ErrorCode: {
    TIMEOUT: "ERR_TIMEOUT",
    CLOSED: "ERR_CLOSED",
    CANNOT_CONNECT: "ERR_CANNOT_CONNECT",
    AUTH_FAILED: "ERR_AUTH_FAILED",
  },
}));

function renderOpenAuthModal() {
  useChatStore.getState().reset();
  useChatStore.getState().setShowAuthModal(true);
  return render(
    <I18nProvider>
      <AuthModal />
    </I18nProvider>,
  );
}

describe("AuthModal", () => {
  beforeEach(() => {
    mocks.connect.mockReset();
    mocks.persistSessionToken.mockReset();
    window.localStorage.clear();
    window.localStorage.setItem("tokendance:lang", "zh-CN");
  });

  it("renders as a labelled modal dialog", () => {
    renderOpenAuthModal();

    const dialog = screen.getByRole("dialog", { name: "游客加入" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("auth-modal-title");
  });

  it("labels the guest username input for assistive technology", () => {
    renderOpenAuthModal();

    const input = screen.getByLabelText("你的用户名...");
    expect(input.getAttribute("placeholder")).toBe("你的用户名...");
  });

  it("keeps the password visibility toggle keyboard reachable", () => {
    renderOpenAuthModal();

    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    const toggle = screen.getByRole("button", { name: "显示密码" });

    expect(toggle.getAttribute("tabindex")).not.toBe("-1");
  });

  it("does not persist auth when credential login succeeds but WebSocket join fails", async () => {
    vi.mocked(loginUser).mockResolvedValueOnce({
      success: true,
      username: "alice",
      session_token: "session-token-1",
    });
    mocks.connect.mockRejectedValueOnce(new Error("join failed"));
    renderOpenAuthModal();

    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "correct-password" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "登录" }).at(-1)!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("join failed");
    });
    expect(mocks.connect).toHaveBeenCalledWith("alice", "session-token-1");
    expect(window.localStorage.getItem("tokendance:auth")).toBeNull();
    expect(window.localStorage.getItem("tokendance:username")).toBeNull();
    expect(mocks.persistSessionToken).toHaveBeenCalledWith(null);
  });

  it("persists the session token only after credential login joins WebSocket", async () => {
    vi.mocked(loginUser).mockResolvedValueOnce({
      success: true,
      username: "alice",
      session_token: "session-token-1",
    });
    mocks.connect.mockResolvedValueOnce(undefined);
    renderOpenAuthModal();

    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "correct-password" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "登录" }).at(-1)!);

    await waitFor(() => {
      expect(mocks.connect).toHaveBeenCalledWith("alice", "session-token-1");
    });
    expect(mocks.persistSessionToken).toHaveBeenCalledWith("session-token-1");
    expect(window.localStorage.getItem("tokendance:auth")).toBe("true");
    expect(window.localStorage.getItem("tokendance:username")).toBe("alice");
  });
});
