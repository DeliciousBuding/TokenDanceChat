import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { mockI18n } from "@/test-utils";

// ---- Mocks (module-level, hoisted by vitest) ----
// Use vi.hoisted() so the mock factory can reference these values,
// since vi.mock() calls are hoisted to the top of the file.

const {
  mockUploadImage,
  mockWsSend,
  mockWs,
  storeState,
} = vi.hoisted(() => ({
  mockUploadImage: vi.fn(),
  mockWsSend: vi.fn(),
  mockWs: {
    readyState: 1, // WebSocket.OPEN
  },
  storeState: {
    username: "testuser",
    userProfiles: {
      testuser: {
        username: "testuser",
        display_name: "Test User",
        avatar_url: "https://example.com/avatar.png",
        bio: "Hello world",
        status: "Online",
        last_seen: Date.now(),
        created_at: Date.now(),
      },
    },
  } as {
    username: string;
    userProfiles: Record<string, {
      username: string;
      display_name: string;
      avatar_url: string;
      bio: string;
      status: string;
      last_seen: number;
      created_at: number;
    }>;
  },
}));

vi.mock("@/lib/api", () => ({
  chatAPI: {
    uploadImage: (...args: unknown[]) => mockUploadImage(...args),
    ws: mockWs,
    send: (...args: unknown[]) => mockWsSend(...args),
  },
}));

vi.mock("@/i18n/context", () => ({
  useTranslation: () => mockI18n({
    "profile.editProfile": "编辑资料",
    "profile.avatarUpload": "上传头像",
    "profile.displayName": "显示名称",
    "profile.bio": "个人简介",
    "profile.status": "状态",
    "profile.cancel": "取消",
    "profile.save": "保存",
  }),
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: (selector?: (s: unknown) => unknown) => {
    return selector ? selector(storeState) : storeState;
  },
}));

// Mock Avatar to keep test focused
vi.mock("@/components/Avatar", () => ({
  Avatar: ({ src, name, size }: { src: string | null; name: string; size?: string }) => (
    <div data-testid="avatar" data-src={src ?? ""} data-name={name} data-size={size ?? ""} />
  ),
}));

// ---- Import after all mocks ----
import { ProfileEditModal } from "@/components/ProfileEditModal";

describe("ProfileEditModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    storeState.username = "testuser";
    storeState.userProfiles = {
      testuser: {
        username: "testuser",
        display_name: "Test User",
        avatar_url: "https://example.com/avatar.png",
        bio: "Hello world",
        status: "Online",
        last_seen: Date.now(),
        created_at: Date.now(),
      },
    };
    // Ensure desktop layout (default in jsdom is usually 1024 or similar)
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    });
    window.dispatchEvent(new Event("resize"));
  });

  it("renders with profile fields pre-filled from store", () => {
    render(<ProfileEditModal onClose={onClose} />);

    // Title
    expect(screen.getByText("编辑资料")).toBeTruthy();

    // Display name input pre-filled
    expect(screen.getByDisplayValue("Test User")).toBeTruthy();

    // Bio textarea pre-filled
    expect(screen.getByDisplayValue("Hello world")).toBeTruthy();

    // Status input pre-filled
    expect(screen.getByDisplayValue("Online")).toBeTruthy();
  });

  it("renders avatar with correct props", () => {
    render(<ProfileEditModal onClose={onClose} />);

    const avatar = screen.getByTestId("avatar");
    expect(avatar).toBeTruthy();
    expect(avatar.dataset.name).toBe("Test User");
    expect(avatar.dataset.src).toBe("https://example.com/avatar.png");
  });

  it("shows avatar upload button", () => {
    render(<ProfileEditModal onClose={onClose} />);

    const uploadButton = screen.getByRole("button", { name: "上传头像" });
    expect(uploadButton).toBeTruthy();
  });

  it("renders save and cancel buttons", () => {
    render(<ProfileEditModal onClose={onClose} />);

    expect(screen.getByText("保存")).toBeTruthy();
    expect(screen.getByText("取消")).toBeTruthy();
  });

  it("calls onClose when close button (X) clicked", () => {
    render(<ProfileEditModal onClose={onClose} />);

    const closeButton = screen.getByLabelText("关闭");
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when cancel button clicked", () => {
    render(<ProfileEditModal onClose={onClose} />);

    fireEvent.click(screen.getByText("取消"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape key", () => {
    render(<ProfileEditModal onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking backdrop", () => {
    render(<ProfileEditModal onClose={onClose} />);

    // Desktop: backdrop is the absolute div with bg-black/60
    const backdrop = document.querySelector(".bg-black\\/60");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders with dialog role and aria-modal", () => {
    render(<ProfileEditModal onClose={onClose} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("编辑资料");
  });

  it("has a hidden file input for avatar upload", () => {
    render(<ProfileEditModal onClose={onClose} />);

    const fileInput = document.querySelector("input[type='file']");
    expect(fileInput).toBeTruthy();
    expect(fileInput!.className).toContain("hidden");
    expect(fileInput!.getAttribute("accept")).toBe("image/jpeg,image/png,image/webp,image/gif");
  });

  it("triggers file input when avatar upload button clicked", () => {
    render(<ProfileEditModal onClose={onClose} />);

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");

    // Use role query to avoid ambiguity with hidden input's aria-label
    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("shows character counter for bio", () => {
    render(<ProfileEditModal onClose={onClose} />);

    // Bio starts with "Hello world" (11 chars)
    expect(screen.getByText("11/200")).toBeTruthy();
  });

  it("shows character counter for status", () => {
    render(<ProfileEditModal onClose={onClose} />);

    // Status starts with "Online" (6 chars)
    expect(screen.getByText("6/50")).toBeTruthy();
  });

  it("limits bio to 200 characters", () => {
    render(<ProfileEditModal onClose={onClose} />);

    const bioTextarea = screen.getByDisplayValue("Hello world") as HTMLTextAreaElement;

    // Enter exactly 200 chars -- should be accepted
    const text200 = "a".repeat(200);
    fireEvent.change(bioTextarea, { target: { value: text200 } });
    expect(bioTextarea.value.length).toBe(200);

    // Try to exceed limit -- should be rejected (value stays at 200)
    const text201 = "a".repeat(201);
    fireEvent.change(bioTextarea, { target: { value: text201 } });
    expect(bioTextarea.value.length).toBe(200);
  });

  it("limits status to 50 characters", () => {
    render(<ProfileEditModal onClose={onClose} />);

    const statusInput = screen.getByDisplayValue("Online") as HTMLInputElement;

    // Enter exactly 50 chars -- should be accepted
    const text50 = "a".repeat(50);
    fireEvent.change(statusInput, { target: { value: text50 } });
    expect(statusInput.value.length).toBe(50);

    // Try to exceed limit -- should be rejected (value stays at 50)
    const text51 = "a".repeat(51);
    fireEvent.change(statusInput, { target: { value: text51 } });
    expect(statusInput.value.length).toBe(50);
  });

  it("displays username as fallback name when display_name is empty", () => {
    storeState.userProfiles = {
      testuser: {
        username: "testuser",
        display_name: "",
        avatar_url: "",
        bio: "",
        status: "",
        last_seen: Date.now(),
        created_at: Date.now(),
      },
    };

    render(<ProfileEditModal onClose={onClose} />);

    // Avatar should use username as fallback
    const avatar = screen.getByTestId("avatar");
    expect(avatar.dataset.name).toBe("testuser");
  });

  it("saves profile via WebSocket send when save clicked", () => {
    render(<ProfileEditModal onClose={onClose} />);

    fireEvent.click(screen.getByText("保存"));

    // Should send profile_update and close
    expect(mockWsSend).toHaveBeenCalledTimes(1);
    expect(mockWsSend).toHaveBeenCalledWith({
      type: "profile_update",
      display_name: "Test User",
      avatar_url: "https://example.com/avatar.png",
      bio: "Hello world",
      status: "Online",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mobile layout uses slide-up animation class", () => {
    // Switch to mobile viewport
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 375,
    });
    window.dispatchEvent(new Event("resize"));

    render(<ProfileEditModal onClose={onClose} />);

    // Mobile uses animate-slide-up and rounded-t-2xl
    const slideUp = document.querySelector(".animate-slide-up");
    expect(slideUp).toBeTruthy();
  });
});
