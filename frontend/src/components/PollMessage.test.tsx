import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PollMessage } from "@/components/PollMessage";
import { mockI18n } from "@/test-utils";
import type { PollData } from "@/lib/api";

vi.mock("@/i18n/context", () => ({
  useTranslation: () =>
    mockI18n({
      "poll.finalResults": "Final Results",
      "poll.votes": "{{count}} votes",
      "poll.vote": "Vote",
      "poll.closed": "Close Poll",
    }),
}));

vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendPollVote: vi.fn(),
    sendPollClose: vi.fn(),
  },
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: vi.fn(),
}));

import { useChatStore } from "@/stores/chatStore";
import { chatAPI } from "@/lib/api";

const DEFAULT_STORE_STATE = { username: "currentUser" };

function setStore(overrides?: Record<string, unknown>) {
  (useChatStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector?: (state: unknown) => unknown) => {
      const state = { ...DEFAULT_STORE_STATE, ...overrides };
      return typeof selector === "function" ? selector(state) : state;
    },
  );
}

function makePoll(overrides?: Partial<PollData>): PollData {
  return {
    id: "poll-1",
    room_id: "room-1",
    creator: "alice",
    question: "What is your favorite color?",
    options: ["Red", "Blue", "Green"],
    multiple_choice: false,
    is_anonymous: false,
    is_closed: false,
    votes: { 0: 5, 1: 3, 2: 2 },
    voters: { 0: ["bob"], 1: ["charlie"], 2: ["dave"] },
    created_at: 1000,
    ...overrides,
  };
}

describe("PollMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStore();
  });

  describe("rendering", () => {
    it("renders poll question and all options", () => {
      const poll = makePoll();
      render(<PollMessage poll={poll} messageId="msg-1" />);

      expect(screen.getByText("What is your favorite color?")).toBeTruthy();
      expect(screen.getByText("Red")).toBeTruthy();
      expect(screen.getByText("Blue")).toBeTruthy();
      expect(screen.getByText("Green")).toBeTruthy();
    });

    it("shows total vote count and per-option percentages", () => {
      const poll = makePoll({
        votes: { 0: 5, 1: 3, 2: 2 },
      });
      render(<PollMessage poll={poll} messageId="msg-1" />);

      // Total votes = 5 + 3 + 2 = 10
      expect(screen.getByText("10 votes")).toBeTruthy();
      // Percentages
      expect(screen.getByText("50%")).toBeTruthy();
      expect(screen.getByText("30%")).toBeTruthy();
      expect(screen.getByText("20%")).toBeTruthy();
    });

    it("shows close button when current user is poll creator", () => {
      setStore({ username: "alice" });
      const poll = makePoll({ creator: "alice" });

      render(<PollMessage poll={poll} messageId="msg-1" />);
      expect(screen.getByText("Close Poll")).toBeTruthy();
    });

    it("hides close button when current user is not the creator", () => {
      setStore({ username: "bob" });
      const poll = makePoll({ creator: "alice" });

      render(<PollMessage poll={poll} messageId="msg-1" />);
      expect(screen.queryByText("Close Poll")).toBeFalsy();
    });
  });

  describe("closed poll", () => {
    it("displays the closed badge", () => {
      const poll = makePoll({ is_closed: true });
      render(<PollMessage poll={poll} messageId="msg-1" />);

      expect(screen.getByText("Final Results")).toBeTruthy();
    });

    it("disables all option buttons", () => {
      const poll = makePoll({ is_closed: true });
      render(<PollMessage poll={poll} messageId="msg-1" />);

      const buttons = screen.getAllByRole("button");
      const optionButtons = buttons.filter((b) =>
        poll.options.some((o) => b.textContent?.includes(o)),
      );
      for (const btn of optionButtons) {
        expect(btn).toBeDisabled();
      }
    });

    it("hides vote and close buttons", () => {
      setStore({ username: "alice" });
      const poll = makePoll({ is_closed: true, creator: "alice" });

      render(<PollMessage poll={poll} messageId="msg-1" />);
      expect(screen.queryByText("Vote")).toBeFalsy();
      expect(screen.queryByText("Close Poll")).toBeFalsy();
    });

    it("still shows percentages for all options", () => {
      const poll = makePoll({
        is_closed: true,
        votes: { 0: 3, 1: 1, 2: 0 },
      });
      render(<PollMessage poll={poll} messageId="msg-1" />);

      // 3 + 1 + 0 = 4 total, 3/4=75%, 1/4=25%, 0/4=0%
      expect(screen.getByText("75%")).toBeTruthy();
      expect(screen.getByText("25%")).toBeTruthy();
      expect(screen.getByText("0%")).toBeTruthy();
    });
  });

  describe("single choice", () => {
    it("selects only one option at a time", () => {
      const poll = makePoll({ multiple_choice: false });
      render(<PollMessage poll={poll} messageId="msg-1" />);

      fireEvent.click(screen.getByText("Red"));
      // Vote button appears after a selection is made
      expect(screen.getByText("Vote")).toBeTruthy();

      fireEvent.click(screen.getByText("Blue"));
      // Still only one selection — clicking Vote sends a single vote
      fireEvent.click(screen.getByText("Vote"));

      expect(chatAPI.sendPollVote).toHaveBeenCalledTimes(1);
      expect(chatAPI.sendPollVote).toHaveBeenCalledWith("msg-1", 1);
    });

    it("disables interaction after submitting a vote", async () => {
      const poll = makePoll({ multiple_choice: false });
      render(<PollMessage poll={poll} messageId="msg-1" />);

      fireEvent.click(screen.getByText("Red"));
      fireEvent.click(screen.getByText("Vote"));

      // After voting, Vote button should disappear and options should be disabled
      await waitFor(() => {
        expect(screen.queryByText("Vote")).toBeFalsy();
      });
      const redOption = screen.getByText("Red").closest("button")!;
      expect(redOption).toBeDisabled();
    });
  });

  describe("multiple choice", () => {
    it("allows selecting multiple options", async () => {
      const poll = makePoll({ multiple_choice: true });
      render(<PollMessage poll={poll} messageId="msg-1" />);

      fireEvent.click(screen.getByText("Red"));
      fireEvent.click(screen.getByText("Blue"));

      fireEvent.click(screen.getByText("Vote"));

      await waitFor(() => {
        expect(chatAPI.sendPollVote).toHaveBeenCalledTimes(2);
      });
      expect(chatAPI.sendPollVote).toHaveBeenCalledWith("msg-1", 0);
      expect(chatAPI.sendPollVote).toHaveBeenCalledWith("msg-1", 1);
    });

    it("toggles an option off when clicked again", () => {
      const poll = makePoll({ multiple_choice: true });
      render(<PollMessage poll={poll} messageId="msg-1" />);

      fireEvent.click(screen.getByText("Red"));
      fireEvent.click(screen.getByText("Blue"));
      fireEvent.click(screen.getByText("Red")); // deselect Red

      fireEvent.click(screen.getByText("Vote"));

      expect(chatAPI.sendPollVote).toHaveBeenCalledTimes(1);
      expect(chatAPI.sendPollVote).toHaveBeenCalledWith("msg-1", 1);
    });

    it("does not show vote button when no options are selected", () => {
      const poll = makePoll({ multiple_choice: true });
      render(<PollMessage poll={poll} messageId="msg-1" />);

      expect(screen.queryByText("Vote")).toBeFalsy();
    });
  });

  describe("close poll button", () => {
    it("calls sendPollClose when creator clicks close", () => {
      setStore({ username: "alice" });
      const poll = makePoll({ creator: "alice" });

      render(<PollMessage poll={poll} messageId="msg-1" />);
      fireEvent.click(screen.getByText("Close Poll"));

      expect(chatAPI.sendPollClose).toHaveBeenCalledWith("msg-1");
    });

    it("shows error feedback when close poll fails", async () => {
      setStore({ username: "alice" });
      (chatAPI.sendPollClose as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error"),
      );
      const poll = makePoll({ creator: "alice" });

      render(<PollMessage poll={poll} messageId="msg-1" />);
      fireEvent.click(screen.getByText("Close Poll"));

      await screen.findByRole("alert");
      expect(screen.getByText("Network error")).toBeTruthy();
    });
  });

  describe("error handling", () => {
    it("shows error feedback when vote fails", async () => {
      (chatAPI.sendPollVote as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Vote failed"),
      );
      const poll = makePoll({ multiple_choice: false });

      render(<PollMessage poll={poll} messageId="msg-1" />);
      fireEvent.click(screen.getByText("Red"));
      fireEvent.click(screen.getByText("Vote"));

      await screen.findByRole("alert");
      expect(screen.getByText("Vote failed")).toBeTruthy();
    });
  });
});
