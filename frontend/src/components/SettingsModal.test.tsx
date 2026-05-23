import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsModal } from "@/components/SettingsModal";
import { mockI18n } from "@/test-utils";

const {
  mockSendProfileUpdate,
  mockListInviteCodes,
  mockExportChat,
  mockSetSoundEnabled,
  mockPlayMessageSound,
  storeState,
} = vi.hoisted(() => ({
  mockSendProfileUpdate: vi.fn(),
  mockListInviteCodes: vi.fn().mockResolvedValue([]),
  mockExportChat: vi.fn(),
  mockSetSoundEnabled: vi.fn(),
  mockPlayMessageSound: vi.fn(),
  storeState: {
    username: "testuser",
    userProfiles: {
      testuser: {
        username: "testuser",
        display_name: "Test User",
        avatar_url: "",
        bio: "Hello world",
        status: "Online",
        last_seen: Date.now(),
        created_at: Date.now(),
      },
    },
    scheduledMessages: [],
  } as Record<string, unknown>,
}));

vi.mock("@/i18n/context", () => ({
  useTranslation: () => mockI18n(),
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: vi.fn((selector?: (s: unknown) => unknown) => {
    return selector ? selector(storeState) : storeState;
  }),
}));

vi.mock("@/lib/soundToggle", () => ({
  isSoundEnabled: vi.fn(() => true),
  setSoundEnabled: mockSetSoundEnabled,
}));

vi.mock("@/lib/sound", () => ({
  playMessageSound: mockPlayMessageSound,
}));

vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendProfileUpdate: mockSendProfileUpdate,
    exportChat: mockExportChat,
    uploadImage: vi.fn(),
  },
  listInviteCodes: mockListInviteCodes,
  generateInviteCode: vi.fn(),
}));

// Mock Avatar to avoid complex rendering dependencies
vi.mock("@/components/Avatar", () => ({
  Avatar: ({ src, name }: { src: string | null; name: string; size?: string }) => (
    <div data-testid="avatar" data-src={src ?? ""} data-name={name} />
  ),
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

describe("SettingsModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.setItem("tdchat-theme", "light");
    storeState.username = "testuser";
    storeState.userProfiles = {
      testuser: {
        username: "testuser",
        display_name: "Test User",
        avatar_url: "",
        bio: "Hello world",
        status: "Online",
        last_seen: Date.now(),
        created_at: Date.now(),
      },
    };
    storeState.scheduledMessages = [];
  });

  it("renders when open=true", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    // Tab buttons render in both desktop and mobile, so each text appears twice
    expect(screen.getAllByText("settings.profile").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("settings.appearance").length).toBeGreaterThanOrEqual(1);
    // Profile tab content should be visible (display name input)
    expect(screen.getByDisplayValue("Test User")).toBeTruthy();
  });

  it("does not render when open=false", () => {
    const { container } = render(<SettingsModal open={false} onClose={onClose} />);
    // SettingsModal returns null when closed
    expect(container.innerHTML).toBe("");
  });

  it("calls onClose when close button (X) clicked", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    const closeButton = screen.getByLabelText("friend.dismiss");
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop clicked", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    // The backdrop is the absolute div with bg-black/60
    const backdrop = document.querySelector(".bg-black\\/60");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders profile tab content with inputs", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    // Display name input should be pre-filled
    expect(screen.getByDisplayValue("Test User")).toBeTruthy();
    // Bio textarea
    expect(screen.getByDisplayValue("Hello world")).toBeTruthy();
    // Status input
    expect(screen.getByDisplayValue("Online")).toBeTruthy();
    // Save button
    expect(screen.getByText("profile.save")).toBeTruthy();
  });

  it("renders avatar component", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    const avatar = screen.getByTestId("avatar");
    expect(avatar).toBeTruthy();
    expect(avatar.dataset.name).toBe("Test User");
  });

  it("switches to appearance tab and shows theme options", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    // Click the first appearance tab button (desktop variant)
    fireEvent.click(screen.getAllByText("settings.appearance")[0]);
    // Theme options should be visible
    expect(screen.getByText("settings.themeLight")).toBeTruthy();
    expect(screen.getByText("settings.themeDark")).toBeTruthy();
    expect(screen.getByText("settings.themeSystem")).toBeTruthy();
  });

  it("switches to notifications tab and shows sound toggle", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getAllByText("settings.notifications")[0]);
    // Sound label should be visible
    expect(screen.getByText("settings.sound")).toBeTruthy();
  });

  it("close button has accessible aria-label", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    const closeButton = screen.getByLabelText("friend.dismiss");
    expect(closeButton).toBeTruthy();
    expect(closeButton.tagName).toBe("BUTTON");
  });
});
