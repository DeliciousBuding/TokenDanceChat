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

    it("does not delay real-time new message rendering", () => {
      renderBubble({ isNew: true, staggerDelay: 5000 });
      const bubble = document.querySelector<HTMLElement>("[data-visual='message-bubble']");
      expect(bubble).toBeTruthy();
      expect(bubble?.style.animationDelay).toBe("");
    });

    it("renders old WebUIChat mentions as TokenBot", () => {
      renderBubble({
        message: {
          id: "msg-webui-mention",
          username: "alice",
          content: "Ask @WebUIChat and @webuibot",
          timestamp: 1700000000000,
        },
      });

      expect(screen.getAllByText("@TokenBot")).toHaveLength(2);
      expect(screen.queryByText("@WebUIChat")).toBeNull();
      expect(screen.queryByText("@webuibot")).toBeNull();
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

  describe("visual contract", () => {
    it("marks received message bubble surfaces and actions for visual acceptance", () => {
      const { container } = renderBubble({
        replyCount: 2,
        message: {
          id: "msg-visual",
          username: "alice",
          content: "Visual contract",
          timestamp: 1700000000000,
          reactions: {
            "👍": ["testuser"],
          },
        },
      });

      const bubble = container.querySelector("[data-visual='message-bubble']");
      expect(bubble).toBeTruthy();
      expect(bubble?.getAttribute("data-message-own")).toBe("false");
      expect(container.querySelector("[data-visual='message-bubble-surface']")).toBeTruthy();
      expect(container.querySelector("[data-visual='message-bubble-menu']")).toBeTruthy();
      expect(container.querySelector("[data-visual='message-bubble-thread']")).toBeTruthy();
      expect(container.querySelector("[data-visual='message-bubble-reaction']")).toBeTruthy();
      expect(container.querySelectorAll("[data-visual='message-bubble-meta']").length).toBeGreaterThan(0);
    });

    it("marks own message bubbles for direction coverage", () => {
      const { container } = renderBubble({
        isOwn: true,
        message: {
          id: "msg-own-visual",
          username: "testuser",
          content: "Own visual contract",
          timestamp: 1700000000000,
        },
      });

      const bubble = container.querySelector("[data-visual='message-bubble']");
      expect(bubble).toBeTruthy();
      expect(bubble?.getAttribute("data-message-own")).toBe("true");
      expect(container.querySelector("[data-visual='message-bubble-surface']")).toBeTruthy();
      expect(container.querySelector("[data-visual='message-bubble-menu']")).toBeTruthy();
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

  describe("code blocks", () => {
    it("renders code block with language label and copy button", () => {
      renderBubble({
        message: {
          id: "msg-code",
          username: "alice",
          content: "```javascript\nconst x = 1;\n```",
          timestamp: 1700000000000,
        },
      });
      // Language label is shown in the header bar
      expect(screen.getByText("javascript")).toBeTruthy();
      // Copy button with zh-CN aria-label
      expect(screen.getByLabelText("复制代码")).toBeTruthy();
    });

    it("renders code block with default 'code' label when no language", () => {
      renderBubble({
        message: {
          id: "msg-code2",
          username: "alice",
          content: "```\necho hello\n```",
          timestamp: 1700000000000,
        },
      });
      // Falls back to "code" label
      expect(screen.getByText("code")).toBeTruthy();
    });

    it("renders code block inline with text before and after", () => {
      renderBubble({
        message: {
          id: "msg-code3",
          username: "alice",
          content: "Look at this:\n```python\nprint('hi')\n```\nNice right?",
          timestamp: 1700000000000,
        },
      });
      // Surrounding text and code block both render
      expect(screen.getByText("python")).toBeTruthy();
      expect(screen.getByText("Look at this:")).toBeTruthy();
      expect(screen.getByText("Nice right?")).toBeTruthy();
    });
  });

  describe("legacy media markdown", () => {
    it("does not restore the removed voice-message player for audio markdown", () => {
      renderBubble({
        message: {
          id: "msg-voice",
          username: "alice",
          content: "![voice](https://example.com/audio.mp3)",
          timestamp: 1700000000000,
        },
      });
      expect(document.querySelector(".voice-mic-icon")).toBeNull();
      expect(document.querySelector(".custom-audio-player")).toBeNull();
      expect(screen.getByAltText("voice")).toBeTruthy();
    });

    it("does not render play/pause controls for audio markdown", () => {
      renderBubble({
        message: {
          id: "msg-voice2",
          username: "alice",
          content: "![voice](https://example.com/audio.mp3)",
          timestamp: 1700000000000,
        },
      });
      expect(screen.queryByLabelText("Play voice message")).toBeNull();
    });

    it("does not render waveform time display for audio markdown", () => {
      renderBubble({
        message: {
          id: "msg-voice3",
          username: "alice",
          content: "![voice](https://example.com/audio.mp3)",
          timestamp: 1700000000000,
        },
      });
      expect(document.querySelector(".time-display")).toBeNull();
      expect(document.querySelector(".current-time")).toBeNull();
      expect(document.querySelector(".total-time")).toBeNull();
    });

    it("renders GIF markdown as a plain Markdown image", () => {
      renderBubble({
        message: {
          id: "msg-gif",
          username: "alice",
          content: "![gif](https://example.com/animation.gif)",
          timestamp: 1700000000000,
        },
      });
      expect(document.querySelector("canvas")).toBeNull();
      const img = screen.getByAltText("gif");
      expect(img).toBeTruthy();
      expect(img.getAttribute("src")).toBe("https://example.com/animation.gif");
    });

    it("renders sticker markdown as a plain Markdown image", () => {
      renderBubble({
        message: {
          id: "msg-sticker",
          username: "alice",
          content: "![sticker](https://example.com/sticker.webp)",
          timestamp: 1700000000000,
        },
      });
      const img = screen.getByAltText("sticker");
      expect(img).toBeTruthy();
      expect(img.getAttribute("src")).toBe("https://example.com/sticker.webp");
      expect(img.getAttribute("draggable")).toBeNull();
    });
  });

  describe("message edit indicator", () => {
    it("shows edited label when message.edited is true for own message", () => {
      renderBubble({
        isOwn: true,
        message: {
          id: "msg-edit",
          username: "testuser",
          content: "Updated message",
          timestamp: 1700000000000,
          edited: true,
        },
      });
      // zh-CN edited label
      expect(screen.getByText("（已编辑）")).toBeTruthy();
    });

    it("does not show edited label when message.edited is false", () => {
      renderBubble({
        isOwn: true,
        message: {
          id: "msg-noedit",
          username: "testuser",
          content: "Normal message",
          timestamp: 1700000000000,
          edited: false,
        },
      });
      expect(screen.queryByText("（已编辑）")).toBeFalsy();
    });

    it("does not show edited label for others' messages", () => {
      renderBubble({
        isOwn: false,
        message: {
          id: "msg-other-edit",
          username: "bob",
          content: "I edited this",
          timestamp: 1700000000000,
          edited: true,
        },
      });
      // Edited label only shows for own messages
      expect(screen.queryByText("（已编辑）")).toBeFalsy();
    });
  });

  describe("search term highlighting", () => {
    it("wraps matching text in mark elements when highlight prop is provided", () => {
      renderBubble({
        highlight: "search",
        message: {
          id: "msg-hl",
          username: "alice",
          content: "Let me search for something here",
          timestamp: 1700000000000,
        },
      });
      const marks = document.querySelectorAll("mark");
      expect(marks.length).toBeGreaterThan(0);
      expect(marks[0].textContent).toBe("search");
    });

    it("highlights multiple occurrences of the search term", () => {
      renderBubble({
        highlight: "test",
        message: {
          id: "msg-hl2",
          username: "alice",
          content: "test this test again test",
          timestamp: 1700000000000,
        },
      });
      const marks = document.querySelectorAll("mark");
      // Should find multiple highlights (case-insensitive split produces N+1 segments for N matches)
      expect(marks.length).toBeGreaterThanOrEqual(2);
    });

    it("does not highlight when highlight prop is empty", () => {
      renderBubble({
        highlight: "",
        message: {
          id: "msg-nohl",
          username: "alice",
          content: "no highlight here",
          timestamp: 1700000000000,
        },
      });
      expect(document.querySelectorAll("mark").length).toBe(0);
    });

    it("highlight is case-insensitive", () => {
      renderBubble({
        highlight: "hello",
        message: {
          id: "msg-hl3",
          username: "alice",
          content: "HELLO world",
          timestamp: 1700000000000,
        },
      });
      const marks = document.querySelectorAll("mark");
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe("HELLO");
    });
  });

  describe("reply-to preview", () => {
    it("renders reply preview when reply_to_id is set", () => {
      renderBubble({
        message: {
          id: "msg-reply",
          username: "alice",
          content: "This is a reply",
          timestamp: 1700000000000,
          reply_to_id: "msg-original",
          reply_to_user: "bob",
          reply_to_content: "Original message text here",
        },
      });
      // Reply preview shows the original author
      expect(screen.getByText("bob")).toBeTruthy();
      // Reply preview shows truncated original content
      expect(screen.getByText("Original message text here")).toBeTruthy();
    });

    it("renders reply preview when only reply_to_content is set", () => {
      renderBubble({
        message: {
          id: "msg-reply2",
          username: "alice",
          content: "Another reply",
          timestamp: 1700000000000,
          reply_to_content: "Some quoted text",
        },
      });
      // Falls back to "..." for missing reply_to_user
      expect(screen.getByText("...")).toBeTruthy();
      expect(screen.getByText("Some quoted text")).toBeTruthy();
    });

    it("does not render reply preview without reply data", () => {
      renderBubble({
        message: {
          id: "msg-noreply",
          username: "alice",
          content: "Just a message",
          timestamp: 1700000000000,
        },
      });
      // No reply user or content visible
      expect(screen.queryByText("...")).toBeFalsy();
    });
  });

  describe("plain bracketed text", () => {
    it("renders bracketed prefixes as ordinary message content", () => {
      renderBubble({
        message: {
          id: "msg-bracket",
          username: "alice",
          content: "[Archived] check this out",
          timestamp: 1700000000000,
        },
      });
      expect(screen.getByText("[Archived] check this out")).toBeTruthy();
    });
  });

  describe("deleted message rendering", () => {
    it("shows deleted message placeholder text in zh-CN", () => {
      renderBubble({
        message: {
          id: "msg-del",
          username: "alice",
          content: "should not appear",
          timestamp: 1700000000000,
          deleted: true,
        },
      });
      // Shows the deleted message placeholder
      expect(screen.getByText("此消息已被删除")).toBeTruthy();
      // Original content is hidden
      expect(screen.queryByText("should not appear")).toBeFalsy();
    });

    it("applies muted styling to deleted messages", () => {
      renderBubble({
        message: {
          id: "msg-del2",
          username: "alice",
          content: "gone",
          timestamp: 1700000000000,
          deleted: true,
        },
      });
      // Deleted text has line-through and italic styling
      const deletedText = screen.getByText("此消息已被删除");
      expect(deletedText.className).toContain("line-through");
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
