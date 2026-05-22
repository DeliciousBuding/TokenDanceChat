import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";

// Mock WebSocket before any imports that use it
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

// Mock sound config module
vi.mock("@/lib/soundToggle", () => ({
  isSoundEnabled: vi.fn(() => true),
  setSoundEnabled: vi.fn(),
}));

// Mock sound module — AudioContext not available in jsdom
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

// Mock matchMedia (used by theme init)
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

// Must import App AFTER all mocks are set up
import App from "@/App";

describe("App smoke test", () => {
  beforeEach(() => {
    localStorageMock.clear();
    // Set language to avoid navigator.language dependency
    localStorageMock.setItem("tokendance:lang", "zh-CN");
  });

  it("renders JoinScreen without crashing", () => {
    // This is the critical smoke test — if React error #321 occurs,
    // this render will throw and the test will fail immediately.
    expect(() => {
      render(
        <I18nProvider>
          <App />
        </I18nProvider>,
      );
    }).not.toThrow();
  });

  it("displays the join form title", () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    expect(screen.getByText("TokenDance Chat")).toBeTruthy();
  });

  it("displays the username input", () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    expect(screen.getByPlaceholderText(/用户名/)).toBeTruthy();
  });
});
