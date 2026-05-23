import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { mockI18n } from "@/test-utils";
import { ConversationSearch } from "@/components/ConversationSearch";

vi.mock("@/i18n/context", () => ({
  useTranslation: () => mockI18n(),
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: (selector?: (s: unknown) => unknown) => {
    const state = {
      currentChat: { type: "public" as const },
      messages: [
        { id: "1", username: "alice", content: "Hello world", timestamp: 1, deleted: false },
        { id: "2", username: "bob", content: "How are you today?", timestamp: 2, deleted: false },
        { id: "3", username: "system", content: "Server message", timestamp: 3, deleted: false },
        { id: "4", username: "charlie", content: "[deleted]", timestamp: 4, deleted: true },
      ],
      username: "testuser",
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(" "),
  formatTime: () => "12:00",
}));

describe("ConversationSearch", () => {
  const onClose = vi.fn();
  const onHighlightChange = vi.fn();

  it("renders nothing when closed", () => {
    const { container } = render(
      <ConversationSearch open={false} onClose={onClose} onHighlightChange={onHighlightChange} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders search input when open", () => {
    render(
      <ConversationSearch open={true} onClose={onClose} onHighlightChange={onHighlightChange} />,
    );
    expect(screen.getByLabelText("search.inConversation")).toBeTruthy();
  });

  it("calls onClose when Escape is pressed on search input", () => {
    render(
      <ConversationSearch open={true} onClose={onClose} onHighlightChange={onHighlightChange} />,
    );
    fireEvent.keyDown(screen.getByLabelText("search.inConversation"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("finds messages matching search query", async () => {
    const { container } = render(
      <ConversationSearch open={true} onClose={onClose} onHighlightChange={onHighlightChange} />,
    );
    fireEvent.change(screen.getByLabelText("search.inConversation"), { target: { value: "hello" } });
    await vi.waitFor(() => {
      // Text split by <mark> tags — use container.textContent
      expect(container.textContent).toContain("Hello world");
    });
  });

  it("excludes deleted messages from results", async () => {
    const { container } = render(
      <ConversationSearch open={true} onClose={onClose} onHighlightChange={onHighlightChange} />,
    );
    fireEvent.change(screen.getByLabelText("search.inConversation"), { target: { value: "deleted" } });
    await vi.waitFor(() => {
      expect(container.textContent).not.toContain("[deleted]");
    });
  });

  it("excludes system messages from results", async () => {
    const { container } = render(
      <ConversationSearch open={true} onClose={onClose} onHighlightChange={onHighlightChange} />,
    );
    fireEvent.change(screen.getByLabelText("search.inConversation"), { target: { value: "Server" } });
    await vi.waitFor(() => {
      expect(container.textContent).not.toContain("Server message");
    });
  });
});
