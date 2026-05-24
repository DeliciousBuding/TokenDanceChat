import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThreadPanel } from "./ThreadPanel";
import { mockI18n } from "@/test-utils";
import type { ChatMessage } from "@/lib/api";

// === Mocks ===

vi.mock("@/i18n/context", () => ({
  useTranslation: () =>
    mockI18n({
      "thread.replies": "Replies",
      "thread.replyCount": "{{count}} replies",
      "thread.replyPlaceholder": "Write a reply...",
      "thread.close": "Close thread",
    }),
}));

const mockUseChatStore = vi.hoisted(() => vi.fn());
vi.mock("@/stores/chatStore", () => ({
  useChatStore: mockUseChatStore,
}));

vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendThreadMessages: vi.fn(),
    sendReaction: vi.fn(),
    sendMessageEdit: vi.fn(),
    sendPinMessage: vi.fn(),
    sendTranslateMessage: vi.fn(),
    fetchLinkPreview: vi.fn(),
  },
  ErrorCode: {
    NOT_FOUND: "NOT_FOUND",
    UNAUTHORIZED: "UNAUTHORIZED",
    CONFLICT: "CONFLICT",
  },
  ChatError: class ChatError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

// === Helpers ===

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    username: "alice",
    content: "Hello world",
    timestamp: 1716400000000,
    ...overrides,
  };
}

// === Tests ===

describe("ThreadPanel", () => {
  beforeEach(() => {
    mockUseChatStore.mockReturnValue({ username: "testuser" });
    Element.prototype.scrollIntoView = vi.fn();
    // Make requestAnimationFrame synchronous so isVisible flips immediately
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when closed (parentMessage=null)", () => {
    const { container } = render(
      <ThreadPanel
        parentMessage={null}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows parent message content when open", () => {
    const parent = createMessage({ content: "Hello world", username: "alice" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={vi.fn()}
      />,
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("shows thread replies below the parent message", () => {
    const parent = createMessage({ id: "parent-1", content: "Parent message" });
    const replies = [
      createMessage({ id: "reply-1", content: "Reply one", username: "bob" }),
      createMessage({ id: "reply-2", content: "Reply two", username: "carol" }),
    ];
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={replies}
        onClose={vi.fn()}
        onSendReply={vi.fn()}
      />,
    );
    expect(screen.getByText("Reply one")).toBeInTheDocument();
    expect(screen.getByText("Reply two")).toBeInTheDocument();
  });

  it("shows empty state when there are no replies", () => {
    const parent = createMessage({ content: "Parent message" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={vi.fn()}
      />,
    );
    expect(screen.getByText("Write a reply...")).toBeInTheDocument();
  });

  it("calls onClose when the close (X) button is clicked", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={onClose}
        onSendReply={vi.fn()}
      />,
    );

    const closeButton = screen.getByLabelText("Close thread");
    fireEvent.click(closeButton);

    // handleClose fires setTimeout(onClose, 200)
    vi.advanceTimersByTime(200);
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("calls onClose when the backdrop overlay is clicked", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={onClose}
        onSendReply={vi.fn()}
      />,
    );

    const backdrop = document.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    vi.advanceTimersByTime(200);
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("displays the reply count in the header", () => {
    const parent = createMessage({ content: "Parent" });
    const replies = [
      createMessage({ id: "r1", content: "A" }),
      createMessage({ id: "r2", content: "B" }),
      createMessage({ id: "r3", content: "C" }),
    ];
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={replies}
        onClose={vi.fn()}
        onSendReply={vi.fn()}
      />,
    );
    expect(screen.getByText("3 replies")).toBeInTheDocument();
  });

  it("calls onSendReply with the reply text when typing and clicking send", () => {
    const onSendReply = vi.fn();
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={onSendReply}
      />,
    );

    const textarea = screen.getByPlaceholderText("Write a reply...");
    fireEvent.change(textarea, { target: { value: "Nice thread!" } });

    const sendButton = screen.getByRole("button", { name: "Write a reply..." });
    fireEvent.click(sendButton);

    expect(onSendReply).toHaveBeenCalledWith("Nice thread!");
  });

  // === Keyboard interaction tests ===

  it("sends reply on Enter key (without Shift)", () => {
    const onSendReply = vi.fn();
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={onSendReply}
      />,
    );

    const textarea = screen.getByPlaceholderText("Write a reply...");
    fireEvent.change(textarea, { target: { value: "Enter reply" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSendReply).toHaveBeenCalledWith("Enter reply");
  });

  it("clears input after sending via Enter", () => {
    const onSendReply = vi.fn();
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={onSendReply}
      />,
    );

    const textarea = screen.getByPlaceholderText(
      "Write a reply...",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Reply text" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(textarea.value).toBe("");
  });

  it("does NOT send on Shift+Enter (allows newline)", () => {
    const onSendReply = vi.fn();
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={onSendReply}
      />,
    );

    const textarea = screen.getByPlaceholderText("Write a reply...");
    fireEvent.change(textarea, { target: { value: "Multi\nline" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(onSendReply).not.toHaveBeenCalled();
  });

  it("does NOT send on Enter with empty content", () => {
    const onSendReply = vi.fn();
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={onSendReply}
      />,
    );

    const textarea = screen.getByPlaceholderText("Write a reply...");
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSendReply).not.toHaveBeenCalled();
  });

  it("does NOT send on Enter with whitespace-only content", () => {
    const onSendReply = vi.fn();
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={onSendReply}
      />,
    );

    const textarea = screen.getByPlaceholderText("Write a reply...");
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSendReply).not.toHaveBeenCalled();
  });

  it("closes on Escape key", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={onClose}
        onSendReply={vi.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText("Write a reply...");
    fireEvent.keyDown(textarea, { key: "Escape" });

    vi.advanceTimersByTime(200);
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("send button is disabled when reply content is empty", () => {
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={vi.fn()}
      />,
    );

    const sendButton = screen.getByRole("button", { name: "Write a reply..." });
    expect(sendButton).toBeDisabled();
  });

  it("send button is disabled when reply content is only whitespace", () => {
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={vi.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText("Write a reply...");
    fireEvent.change(textarea, { target: { value: "   " } });

    const sendButton = screen.getByRole("button", { name: "Write a reply..." });
    expect(sendButton).toBeDisabled();
  });

  // ── Reply input rendering ───────────────────────────

  it("renders reply input textarea when panel is open", () => {
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={vi.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText("Write a reply...");
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("renders send button alongside the reply textarea", () => {
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={vi.fn()}
      />,
    );

    const sendButton = screen.getByRole("button", { name: "Write a reply..." });
    expect(sendButton).toBeInTheDocument();
    // Send button starts disabled with empty content
    expect(sendButton).toBeDisabled();
  });

  it("send button becomes enabled when reply text is entered", () => {
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={vi.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText("Write a reply...");
    fireEvent.change(textarea, { target: { value: "Hello" } });

    const sendButton = screen.getByRole("button", { name: "Write a reply..." });
    expect(sendButton).not.toBeDisabled();
  });

  // ── Loading state ───────────────────────────────────

  it("shows placeholder while thread replies are loading (empty state)", () => {
    // When threadMessages is empty, the component shows a placeholder
    // message.  This is the visible "loading/empty" state before the
    // server has returned any thread replies.
    const parent = createMessage({ content: "Parent" });
    render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={vi.fn()}
      />,
    );

    // Placeholder text is shown in the message area
    expect(screen.getByText("Write a reply...")).toBeInTheDocument();
    // Reply input remains available (user can reply even while loading)
    expect(screen.getByPlaceholderText("Write a reply...")).toBeInTheDocument();
  });

  it("transitions from empty to populated when replies arrive", () => {
    const parent = createMessage({ content: "Parent" });
    const replies = [
      createMessage({ id: "r1", content: "First reply", username: "bob" }),
    ];

    const { rerender } = render(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={[]}
        onClose={vi.fn()}
        onSendReply={vi.fn()}
      />,
    );

    // Initially empty
    expect(screen.queryByText("First reply")).toBeFalsy();
    expect(screen.getByText("Write a reply...")).toBeInTheDocument();

    // Replies arrive — rerender with messages
    rerender(
      <ThreadPanel
        parentMessage={parent}
        threadMessages={replies}
        onClose={vi.fn()}
        onSendReply={vi.fn()}
      />,
    );

    // Now reply content is visible and placeholder is gone
    expect(screen.getByText("First reply")).toBeInTheDocument();
    expect(screen.queryByText("Write a reply...")).toBeFalsy();
  });
});
