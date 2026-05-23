import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { mockI18n } from "@/test-utils";

// ── Mocks ──────────────────────────────────────────

vi.mock("@/i18n/context", () => ({
  useTranslation: () =>
    mockI18n({
      "transcript.emptyTitle": "暂无消息，发送第一条消息开始聊天吧",
      "transcript.emptyDescription": "成为第一个发言的人吧",
      "transcript.emptyDmTitle": "暂无私信",
      "transcript.emptyDmDescription": "向 {{username}} 发送一条私信开始对话",
      "transcript.emptyGroupTitle": "暂无群聊消息",
      "transcript.emptyGroupDescription": "{{name}} 中还没有消息",
      "transcript.emptyGroupMembers": "{{count}} 位成员",
      "transcript.loading": "加载中...",
      "transcript.newMessagesDivider": "新消息",
    }),
}));

vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendLoadHistory: vi.fn(),
    deleteMessage: vi.fn(),
    sendForward: vi.fn(),
  },
}));

vi.mock("@/hooks/useTouchGestures", () => ({
  usePullDownGesture: () => ({
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
  }),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  formatDate: (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  },
  formatFullTime: () => "12:00",
}));

vi.mock("@/components/MessageBubble", () => ({
  MessageBubble: ({
    message,
    hideAvatar,
    hideUsername,
    isOwn,
  }: {
    message: { id: string; username: string; content: string };
    hideAvatar?: boolean;
    hideUsername?: boolean;
    isOwn?: boolean;
  }) => (
    <div
      data-testid="message-bubble"
      data-msg-id={message.id}
      data-hide-avatar={hideAvatar ? "1" : "0"}
      data-hide-username={hideUsername ? "1" : "0"}
      data-username={message.username}
      data-is-own={isOwn ? "1" : "0"}
    >
      {message.content}
    </div>
  ),
}));

vi.mock("@/components/SystemMessage", () => ({
  SystemMessage: ({ content }: { content: string }) => (
    <div data-testid="system-message">{content}</div>
  ),
}));

// ── Imports (after mocks) ──────────────────────────

import { useChatStore } from "@/stores/chatStore";
import { MessageTranscript } from "@/components/MessageTranscript";

// ── Helpers ────────────────────────────────────────

interface MsgOverrides {
  id?: string;
  username?: string;
  content?: string;
  timestamp?: number;
  from?: string;
  to?: string;
  deleted?: boolean;
}

function makeMsg(overrides: MsgOverrides = {}) {
  return {
    id: overrides.id ?? "m1",
    username: overrides.username ?? "alice",
    content: overrides.content ?? "Hello",
    timestamp: overrides.timestamp ?? 1000000,
    from: overrides.from,
    to: overrides.to,
    deleted: overrides.deleted,
  };
}

function renderTranscript() {
  return render(<MessageTranscript />);
}

// ── Tests ──────────────────────────────────────────

describe("MessageTranscript", () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      username: "testuser",
      messages: [],
      historyLoaded: true,
      typingUsers: [],
      currentChat: { type: "public" },
      onlineUsers: [],
      groups: {},
    });
  });

  describe("empty state", () => {
    it("renders empty state when no messages are present", () => {
      renderTranscript();
      expect(screen.getByText("暂无消息，发送第一条消息开始聊天吧")).toBeTruthy();
      expect(screen.getByText("成为第一个发言的人吧")).toBeTruthy();
    });

    it("renders DM-specific empty state for direct messages", () => {
      useChatStore.setState({
        currentChat: { type: "dm", username: "alice" },
      });
      renderTranscript();
      expect(screen.getByText("暂无私信")).toBeTruthy();
    });

    it("renders group-specific empty state for group chats", () => {
      useChatStore.setState({
        currentChat: { type: "group", name: "general" },
        groups: { general: { name: "general", members: ["testuser", "alice"], roles: {}, owner: "testuser", created_at: 1000 } },
      });
      renderTranscript();
      expect(screen.getByText("暂无群聊消息")).toBeTruthy();
    });
  });

  describe("loading state", () => {
    it("renders loading skeleton when history is not yet loaded", () => {
      useChatStore.setState({ historyLoaded: false, messages: [] });
      renderTranscript();
      expect(screen.getByText("加载中...")).toBeTruthy();
    });
  });

  describe("message rendering", () => {
    it("renders messages in chronological order", () => {
      useChatStore.setState({
        messages: [
          makeMsg({ id: "m1", username: "alice", content: "First", timestamp: 1000 }),
          makeMsg({ id: "m2", username: "bob", content: "Second", timestamp: 2000 }),
          makeMsg({ id: "m3", username: "alice", content: "Third", timestamp: 3000 }),
        ],
      });
      renderTranscript();
      const bubbles = screen.getAllByTestId("message-bubble");
      expect(bubbles).toHaveLength(3);
      expect(bubbles[0].dataset.msgId).toBe("m1");
      expect(bubbles[1].dataset.msgId).toBe("m2");
      expect(bubbles[2].dataset.msgId).toBe("m3");
    });

    it("shows date separator between messages on different days", () => {
      const day1 = new Date("2024-01-01T12:00:00Z").getTime();
      const day2 = new Date("2024-01-02T12:00:00Z").getTime();
      useChatStore.setState({
        messages: [
          makeMsg({ id: "m1", content: "Day 1", timestamp: day1 }),
          makeMsg({ id: "m2", content: "Day 2", timestamp: day2 }),
        ],
      });
      renderTranscript();
      // The mocked formatDate produces "M/D/YYYY" format
      expect(screen.getByText("1/2/2024")).toBeTruthy();
    });

    it("does not show date separator between messages on the same day", () => {
      const day1 = new Date("2024-06-15T08:00:00Z").getTime();
      const day1Later = new Date("2024-06-15T14:00:00Z").getTime();
      useChatStore.setState({
        messages: [
          makeMsg({ id: "m1", content: "Morning", timestamp: day1 }),
          makeMsg({ id: "m2", content: "Afternoon", timestamp: day1Later }),
        ],
      });
      renderTranscript();
      // Only one date label should appear (same day)
      const dateLabels = screen.getAllByText("6/15/2024");
      expect(dateLabels).toHaveLength(1);
    });

    it("renders system messages via SystemMessage component", () => {
      useChatStore.setState({
        messages: [
          makeMsg({ id: "sys1", username: "system", content: "User joined", timestamp: 1000 }),
          makeMsg({ id: "m1", username: "alice", content: "Hello", timestamp: 2000 }),
        ],
      });
      renderTranscript();
      const sysMsg = screen.getByTestId("system-message");
      expect(sysMsg).toBeTruthy();
      expect(sysMsg.textContent).toBe("User joined");
      // User message still rendered as a bubble
      expect(screen.getByTestId("message-bubble")).toBeTruthy();
    });

    it("groups consecutive messages from the same user hiding avatar and username", () => {
      const baseTime = 1700000000000;
      useChatStore.setState({
        messages: [
          makeMsg({ id: "g1", username: "alice", content: "Msg1", timestamp: baseTime }),
          makeMsg({ id: "g2", username: "alice", content: "Msg2", timestamp: baseTime + 1000 }),
          makeMsg({ id: "g3", username: "alice", content: "Msg3", timestamp: baseTime + 2000 }),
          makeMsg({ id: "g4", username: "bob", content: "Msg4", timestamp: baseTime + 3000 }),
        ],
      });
      renderTranscript();
      const bubbles = screen.getAllByTestId("message-bubble");
      expect(bubbles).toHaveLength(4);

      // First message of the group: avatar and username visible
      expect(bubbles[0].dataset.hideAvatar).toBe("0");
      expect(bubbles[0].dataset.hideUsername).toBe("0");

      // Second and third: grouped, avatar and username hidden
      expect(bubbles[1].dataset.hideAvatar).toBe("1");
      expect(bubbles[1].dataset.hideUsername).toBe("1");
      expect(bubbles[2].dataset.hideAvatar).toBe("1");
      expect(bubbles[2].dataset.hideUsername).toBe("1");

      // Fourth message: new user, avatar and username visible again
      expect(bubbles[3].dataset.hideAvatar).toBe("0");
      expect(bubbles[3].dataset.hideUsername).toBe("0");
    });

    it("does not group messages from same user when outside the time window", () => {
      const baseTime = 1700000000000;
      // GROUP_WINDOW_MS is 2 minutes (120000ms)
      useChatStore.setState({
        messages: [
          makeMsg({ id: "w1", username: "alice", content: "Msg1", timestamp: baseTime }),
          makeMsg({ id: "w2", username: "alice", content: "Msg2", timestamp: baseTime + 180000 }), // 3 min later
        ],
      });
      renderTranscript();
      const bubbles = screen.getAllByTestId("message-bubble");
      // Both should show avatar since they're in separate groups
      expect(bubbles[0].dataset.hideAvatar).toBe("0");
      expect(bubbles[1].dataset.hideAvatar).toBe("0");
    });
  });

  describe("DM filtering", () => {
    it("filters messages to show only the DM conversation between current user and partner", () => {
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "dm", username: "alice" },
        messages: [
          makeMsg({ id: "dm1", username: "testuser", from: "testuser", to: "alice", content: "To Alice", timestamp: 1000 }),
          makeMsg({ id: "dm2", username: "alice", from: "alice", to: "testuser", content: "From Alice", timestamp: 2000 }),
          makeMsg({ id: "dm3", username: "bob", from: "bob", to: "testuser", content: "From Bob", timestamp: 3000 }),
        ],
      });
      renderTranscript();
      const bubbles = screen.getAllByTestId("message-bubble");
      expect(bubbles).toHaveLength(2);
      expect(bubbles[0].dataset.msgId).toBe("dm1");
      expect(bubbles[1].dataset.msgId).toBe("dm2");
    });
  });

  describe("unread divider", () => {
    it("shows '新消息' divider when lastReadTimestamp is between messages", () => {
      const baseTime = 1700000000000;
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "public" },
        messages: [
          makeMsg({ id: "m1", username: "alice", content: "Old", timestamp: baseTime }),
          makeMsg({ id: "m2", username: "bob", content: "New", timestamp: baseTime + 10000 }),
        ],
        lastReadTimestamps: { public: baseTime + 5000 },
      });
      renderTranscript();
      expect(screen.getByText("新消息")).toBeTruthy();
    });

    it("does not show divider when all messages are older than lastReadTimestamp", () => {
      const baseTime = 1700000000000;
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "public" },
        messages: [
          makeMsg({ id: "m1", username: "alice", content: "Old", timestamp: baseTime }),
          makeMsg({ id: "m2", username: "bob", content: "Also old", timestamp: baseTime + 1000 }),
        ],
        lastReadTimestamps: { public: baseTime + 50000 },
      });
      renderTranscript();
      expect(screen.queryByText("新消息")).toBeNull();
    });

    it("does not show divider when lastReadTimestamp is not set", () => {
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "public" },
        messages: [
          makeMsg({ id: "m1", username: "alice", content: "Msg", timestamp: 1000 }),
        ],
        lastReadTimestamps: {},
      });
      renderTranscript();
      expect(screen.queryByText("新消息")).toBeNull();
    });
  });
});
