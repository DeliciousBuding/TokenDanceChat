import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";

vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendReaction: vi.fn(),
    sendMessageEdit: vi.fn(),
    deleteMessage: vi.fn(),
    sendPinMessage: vi.fn(),
  },
}));

vi.mock("@/lib/sound", () => ({
  playReactionSound: vi.fn(),
}));

vi.mock("@/components/LinkPreview", () => ({
  MessageLinkPreviews: ({ content }: { content: string }) => (
    <div data-testid="link-previews">{content}</div>
  ),
  extractURLs: (text: string) => {
    const urlRegex = /https?:\/\/[^\s]+/g;
    return text.match(urlRegex) || [];
  },
}));

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

import { MessageBubble } from "@/components/MessageBubble";

function renderBubble(props: Partial<Parameters<typeof MessageBubble>[0]> = {}) {
  const defaults = {
    message: {
      id: "msg-1",
      username: "alice",
      content: "Hello world",
      timestamp: 1700000000000,
    },
    isOwn: false,
    currentUsername: "testuser",
    ...props,
  } as Parameters<typeof MessageBubble>[0];
  return render(
    <I18nProvider>
      <MessageBubble {...defaults} />
    </I18nProvider>,
  );
}

describe("MessageBubble", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
    useChatStore.setState({
      username: "testuser",
      customEmojis: [],
      translations: {},
    });
  });

  describe("rendering", () => {
    it("renders message content", () => {
      renderBubble();
      expect(screen.getByText("Hello world")).toBeTruthy();
    });

    it("renders username when hideUsername is false", () => {
      renderBubble({ hideUsername: false });
      expect(screen.getByText("alice")).toBeTruthy();
    });

    it("hides username when hideUsername is true", () => {
      renderBubble({ hideUsername: true });
      expect(screen.queryByText("alice")).toBeFalsy();
    });

    it("renders timestamp", () => {
      renderBubble({ forceShowTimestamp: true });
      // Should show a time string
      expect(document.querySelector("[title]")).toBeTruthy();
    });

    it("renders deleted state", () => {
      renderBubble({
        message: {
          id: "msg-2",
          username: "alice",
          content: "deleted",
          timestamp: 1700000000000,
          deleted: true,
        },
      });
      // Deleted message should show a deleted indicator, not the content
      expect(screen.queryByText("deleted")).toBeFalsy();
    });
  });

  describe("link previews", () => {
    it("renders link previews for messages with URLs", () => {
      renderBubble({
        message: {
          id: "msg-3",
          username: "alice",
          content: "Check this out: https://example.com/page",
          timestamp: 1700000000000,
        },
      });
      expect(screen.getByTestId("link-previews")).toBeTruthy();
    });

    it("does not render link previews for messages without URLs", () => {
      renderBubble({
        message: {
          id: "msg-4",
          username: "alice",
          content: "No URLs here",
          timestamp: 1700000000000,
        },
      });
      expect(screen.queryByTestId("link-previews")).toBeFalsy();
    });

    it("does not render link previews for deleted messages even with URLs", () => {
      renderBubble({
        message: {
          id: "msg-5",
          username: "alice",
          content: "https://example.com",
          timestamp: 1700000000000,
          deleted: true,
        },
      });
      expect(screen.queryByTestId("link-previews")).toBeFalsy();
    });
  });

  describe("own message", () => {
    it("applies own-message styling", () => {
      renderBubble({
        isOwn: true,
        message: {
          id: "msg-6",
          username: "testuser",
          content: "My message",
          timestamp: 1700000000000,
        },
      });
      // Own messages should exist
      expect(screen.getByText("My message")).toBeTruthy();
    });
  });

  describe("grouped messages", () => {
    it("renders grouped message with less padding", () => {
      renderBubble({
        isGrouped: true,
        hideAvatar: true,
      });
      expect(screen.getByText("Hello world")).toBeTruthy();
    });
  });

  describe("reply count", () => {
    it("shows reply count when replyCount > 0", () => {
      renderBubble({ replyCount: 3 });
      expect(screen.getByText("3")).toBeTruthy();
    });

    it("does not show reply count when replyCount is 0", () => {
      renderBubble({ replyCount: 0 });
      // No reply count badge should be visible
      expect(screen.queryByText("0")).toBeFalsy();
    });
  });
});
