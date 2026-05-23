import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { mockI18n } from "@/test-utils";
import { ScheduledMessagesPanel } from "@/components/ScheduledMessagesPanel";
import type { ScheduledMessage } from "@/lib/api";

const { mockSendCancel, mockSendList, storeState } = vi.hoisted(() => ({
  mockSendCancel: vi.fn(),
  mockSendList: vi.fn(),
  storeState: {
    scheduledMessages: [] as ScheduledMessage[],
    currentChat: { type: "public" as const },
  },
}));

vi.mock("@/i18n/context", () => ({ useTranslation: () => mockI18n() }));
vi.mock("@/stores/chatStore", () => ({
  useChatStore: vi.fn((selector?: (s: any) => any) => {
    return selector ? selector(storeState) : storeState;
  }),
}));
vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendCancelScheduledMessage: mockSendCancel,
    sendScheduledMessagesList: mockSendList,
  },
}));

function createMockMessage(overrides: Partial<ScheduledMessage> = {}): ScheduledMessage {
  const now = Date.now();
  return {
    id: "msg-1",
    username: "alice",
    content: "Hello tomorrow",
    room_id: "room-a",
    to_user: "",
    group_name: "",
    reply_to_id: "",
    thread_id: "",
    send_at: now + 86400000, // tomorrow
    created_at: now,
    sent: 0,
    ...overrides,
  };
}

describe("ScheduledMessagesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.scheduledMessages = [];
    storeState.currentChat = { type: "public" };
  });

  it("requests scheduled messages list on mount", () => {
    render(<ScheduledMessagesPanel roomId="room-a" />);
    expect(mockSendList).toHaveBeenCalledTimes(1);
  });

  it("shows empty state when panel is opened with no messages", async () => {
    render(<ScheduledMessagesPanel roomId="room-a" />);

    // Panel is closed by default; click the toggle button to open
    const toggle = screen.getByLabelText("schedule.scheduledMessages");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByText("schedule.noScheduled")).toBeInTheDocument();
    });
    // Opening the panel triggers another list request
    expect(mockSendList).toHaveBeenCalledTimes(2);
  });

  it("renders scheduled messages in the open panel", async () => {
    storeState.scheduledMessages = [
      createMockMessage({ id: "msg-1", content: "Reminder: meeting at 3pm" }),
      createMockMessage({ id: "msg-2", content: "Happy birthday!" }),
    ];

    render(<ScheduledMessagesPanel roomId="room-a" />);

    const toggle = screen.getByLabelText("schedule.scheduledMessages");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByText("Reminder: meeting at 3pm")).toBeInTheDocument();
    });
    expect(screen.getByText("Happy birthday!")).toBeInTheDocument();
    // Badge should show message count
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("sends cancel request when cancel button is clicked", async () => {
    storeState.scheduledMessages = [
      createMockMessage({ id: "msg-cancel", content: "Cancel me" }),
    ];

    render(<ScheduledMessagesPanel roomId="room-a" />);

    // Open panel
    fireEvent.click(screen.getByLabelText("schedule.scheduledMessages"));

    await waitFor(() => {
      expect(screen.getByText("Cancel me")).toBeInTheDocument();
    });

    // Click the cancel (X) button next to the message
    const cancelBtn = screen.getByLabelText("schedule.cancelSchedule");
    fireEvent.click(cancelBtn);

    expect(mockSendCancel).toHaveBeenCalledWith("msg-cancel");
  });

  it("displays badge count for filtered messages", async () => {
    storeState.scheduledMessages = [
      createMockMessage({ id: "a", content: "One", room_id: "room-a" }),
      createMockMessage({ id: "b", content: "Two", room_id: "room-a" }),
      createMockMessage({ id: "c", content: "Three", room_id: "room-a" }),
    ];

    render(<ScheduledMessagesPanel roomId="room-a" />);

    // Badge is visible even when panel is closed
    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });
});
