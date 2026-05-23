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
});
