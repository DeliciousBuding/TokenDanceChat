import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";

const wsMocks = vi.hoisted(() => ({
  connect: vi.fn(),
}));

// Mock WebSocket before any imports that use it
vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: () => ({
    connect: wsMocks.connect,
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

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

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

Element.prototype.scrollTo = vi.fn();

// Must import App AFTER all mocks are set up
import App from "@/App";
import { useChatStore } from "@/stores/chatStore";

describe("App smoke test", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
    wsMocks.connect.mockReset();
    wsMocks.connect.mockResolvedValue(undefined);
    mockFetch.mockReset();
    mockFetch.mockRejectedValue(new Error("no backend"));
    useChatStore.getState().reset();
  });

  it("renders ChatLayout without crashing", () => {
    expect(() => {
      render(
        <I18nProvider>
          <App />
        </I18nProvider>,
      );
    }).not.toThrow();
  });

  it("renders the chat interface by default", () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    // Chat input placeholder should be visible in read-only guest preview mode.
    expect(screen.getByPlaceholderText(/输入消息/)).toBeTruthy();
  });

  it("loads public messages for the unauthenticated preview", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: [
          {
            id: "preview-1",
            username: "TokenBot",
            content: "Preview welcome",
            timestamp: 1000,
          },
        ],
      }),
    } as unknown as Response);

    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/messages?limit=100");
    });
    expect(await screen.findByText("Preview welcome")).toBeTruthy();
  });

  it("loads public messages when React StrictMode re-runs effects", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            {
              id: "preview-strict-1",
              username: "TokenBot",
              content: "Strict preview welcome",
              timestamp: 1000,
            },
          ],
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            {
              id: "preview-strict-2",
              username: "TokenBot",
              content: "Strict preview welcome",
              timestamp: 1000,
            },
          ],
        }),
      } as unknown as Response);

    render(
      <StrictMode>
        <I18nProvider>
          <App />
        </I18nProvider>
      </StrictMode>,
    );

    expect(await screen.findByText("Strict preview welcome")).toBeTruthy();
  });

  it("ends the public preview loading state when message fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline"));

    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/messages?limit=100");
    });
    await waitFor(() => {
      expect(useChatStore.getState().historyLoaded).toBe(true);
    });
    expect(screen.queryByRole("status", { name: "加载消息中..." })).toBeNull();
    expect(screen.getByText("暂无消息")).toBeTruthy();
  });

  it("uses the redeemed OIDC username instead of the callback URL username", async () => {
    window.history.replaceState({}, "", "/?oidc_success=1&oidc_username=mallory&oidc_rid=redeem-1");
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/oidc/redeem") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            username: "alice",
            access_token: "access-token-1",
            refresh_token: "refresh-token-1",
            session_token: "session-token-1",
          }),
        } as unknown as Response);
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/oidc/redeem",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ redeem_id: "redeem-1" }),
        }),
      );
    });
    await waitFor(() => {
      expect(wsMocks.connect).toHaveBeenCalledWith("alice");
    });
    expect(window.localStorage.getItem("tokendance:username")).toBe("alice");
    expect(window.localStorage.getItem("tokendance:sessionToken")).toBe("session-token-1");
    expect(useChatStore.getState().oidcAccessToken).toBe("access-token-1");
  });
});
