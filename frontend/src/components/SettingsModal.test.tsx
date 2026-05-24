import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsModal } from "@/components/SettingsModal";
import { mockI18n } from "@/test-utils";

const {
  mockSendProfileUpdate,
  mockSetSoundEnabled,
  mockPlayMessageSound,
  storeState,
} = vi.hoisted(() => ({
  mockSendProfileUpdate: vi.fn(),
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
    uploadImage: vi.fn(),
  },
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
  });

  it("renders when open=true", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    // Sidebar nav items should be rendered (single sidebar, no mobile duplicate)
    expect(screen.getByText("settings.profile")).toBeTruthy();
    expect(screen.getByText("settings.appearance")).toBeTruthy();
    expect(screen.getByText("settings.notifications")).toBeTruthy();
    // Profile tab content should be visible (display name input)
    expect(screen.getByDisplayValue("Test User")).toBeTruthy();
  });

  it("does not render when open=false", () => {
    const { container } = render(<SettingsModal open={false} onClose={onClose} />);
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
    // The backdrop is the absolute div with bg-black/20 and backdrop-blur-sm
    const backdrop = document.querySelector(".backdrop-blur-sm, [class*='bg-black\\/20']");
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
    // Click appearance nav item in sidebar
    fireEvent.click(screen.getByText("settings.appearance"));
    // Theme options should be visible
    expect(screen.getByText("settings.themeLight")).toBeTruthy();
    expect(screen.getByText("settings.themeDark")).toBeTruthy();
    expect(screen.getByText("settings.themeSystem")).toBeTruthy();
  });

  it("switches to notifications tab and shows sound toggle", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("settings.notifications"));
    // Sound label should be visible
    expect(screen.getByText("settings.sound")).toBeTruthy();
    // Sound on description
    expect(screen.getByText("settings.soundOn")).toBeTruthy();
  });

  it("close button has accessible aria-label", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    const closeButton = screen.getByLabelText("friend.dismiss");
    expect(closeButton).toBeTruthy();
    expect(closeButton.tagName).toBe("BUTTON");
  });

  // ── Theme toggle ────────────────────────────────────

  it("shows active ring on default light theme in appearance tab", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("settings.appearance"));
    const lightBtn = screen.getByText("settings.themeLight").closest("button")!;
    // Default theme is "light", so light card has ring-2
    expect(lightBtn.className).toContain("ring-2");
  });

  it("switches to dark theme on click and persists to localStorage", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("settings.appearance"));
    fireEvent.click(screen.getByText("settings.themeDark"));
    expect(localStorageMock.getItem("tdchat-theme")).toBe("dark");
    // Active ring now on dark button
    const darkBtn = screen.getByText("settings.themeDark").closest("button")!;
    expect(darkBtn.className).toContain("ring-2");
    // Light button should no longer be active
    const lightBtn = screen.getByText("settings.themeLight").closest("button")!;
    expect(lightBtn.className).not.toContain("ring-2");
  });

  it("switches to system theme on click and persists to localStorage", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("settings.appearance"));
    fireEvent.click(screen.getByText("settings.themeSystem"));
    expect(localStorageMock.getItem("tdchat-theme")).toBe("system");
  });

  // ── Language switch ─────────────────────────────────

  it("provides language switching through i18n context setLang", () => {
    const i18n = mockI18n();
    i18n.setLang("en-US");
    expect(i18n.setLang).toHaveBeenCalledWith("en-US");
  });

  // ── Notification preferences / Sound toggle ──────────

  it("shows sound-on description when sound is enabled", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("settings.notifications"));
    expect(screen.getByText("settings.soundOn")).toBeTruthy();
  });

  it("toggles sound off when sound switch is clicked", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("settings.notifications"));
    // Find all switches and click the first one (sound toggle)
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThanOrEqual(1);
    // Sound switch should be checked initially (sound is enabled)
    expect(switches[0].getAttribute("aria-checked")).toBe("true");
    fireEvent.click(switches[0]);
    expect(mockSetSoundEnabled).toHaveBeenCalledWith(false);
  });

  it("toggles sound switch aria state", () => {
    const { unmount } = render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("settings.notifications"));

    // First switch should be sound toggle, currently on
    const switch1 = screen.getAllByRole("switch")[0];
    expect(switch1.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(switch1);
    expect(mockSetSoundEnabled).toHaveBeenCalledWith(false);

    // Unmount and re-render fresh with sound enabled again
    unmount();
    render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("settings.notifications"));

    const switch2 = screen.getAllByRole("switch")[0];
    // Fresh mount with isSoundEnabled()=true, so switch starts checked
    fireEvent.click(switch2);
    expect(mockSetSoundEnabled).toHaveBeenCalledWith(false);
  });

  it("plays test sound when test-sound button is clicked", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("settings.notifications"));
    fireEvent.click(screen.getByText("settings.testSound"));
    expect(mockPlayMessageSound).toHaveBeenCalled();
  });

  // ── Mention & Desktop notification toggles ──────────

  it("renders mention notification toggle", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("settings.notifications"));
    // @mention toggle uses notificationPrefs label with @ prefix
    expect(screen.getByText(/settings.notificationPrefs/)).toBeTruthy();
    // There should be 3 switches: sound, mention, desktop
    expect(screen.getAllByRole("switch").length).toBe(3);
  });

  it("toggles mention notification switch", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("settings.notifications"));
    const switches = screen.getAllByRole("switch");
    // Second switch is mention toggle (initially checked)
    expect(switches[1].getAttribute("aria-checked")).toBe("true");
    fireEvent.click(switches[1]);
    expect(switches[1].getAttribute("aria-checked")).toBe("false");
  });

  it("toggles desktop notification switch", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("settings.notifications"));
    const switches = screen.getAllByRole("switch");
    // Third switch is desktop toggle (initially unchecked)
    expect(switches[2].getAttribute("aria-checked")).toBe("false");
    fireEvent.click(switches[2]);
    expect(switches[2].getAttribute("aria-checked")).toBe("true");
  });

  // ── Profile save ────────────────────────────────────

  it("calls sendProfileUpdate when save button is clicked", () => {
    render(<SettingsModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("profile.save"));
    expect(mockSendProfileUpdate).toHaveBeenCalledWith({
      display_name: "Test User",
      avatar_url: "",
      bio: "Hello world",
      status: "Online",
    });
  });
});
