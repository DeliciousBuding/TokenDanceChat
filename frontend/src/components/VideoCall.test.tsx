import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VideoCall } from "@/components/VideoCall";
import { mockI18n } from "@/test-utils";
import type { ActiveCall, IncomingCall } from "@/stores/chatStore";

// ── hoisted store state ──
const { storeState, mockChatAPI } = vi.hoisted(() => ({
  storeState: {
    activeCall: null as ActiveCall | null,
    incomingCall: null as IncomingCall | null,
    userProfiles: {} as Record<string, { display_name?: string }>,
    setIncomingCall: vi.fn(),
    setActiveCall: vi.fn(),
    username: "alice",
  },
  mockChatAPI: {
    sendCallStart: vi.fn(),
    sendCallAccept: vi.fn(),
    sendCallReject: vi.fn(),
    sendCallEnd: vi.fn(),
    sendCallIceCandidate: vi.fn(),
    sendCallRoomCreate: vi.fn(),
    sendCallRoomJoin: vi.fn(),
    sendCallRoomLeave: vi.fn(),
    on: vi.fn().mockReturnValue(() => {}),
    off: vi.fn(),
  },
}));

// ── module mocks ──
vi.mock("@/i18n/context", () => ({
  useTranslation: () =>
    mockI18n({
      "call.callEnded": "Call Ended",
      "call.joiningRoom": "Joining room...",
      "call.participants": "participants",
      "call.unmuteMic": "Unmute Mic",
      "call.muteMic": "Mute Mic",
      "call.unmuteCamera": "Turn On Camera",
      "call.muteCamera": "Turn Off Camera",
      "call.screenShare": "Share Screen",
      "call.switchCamera": "Switch Camera",
      "call.endCall": "End Call",
      "call.groupCall": "Group Call",
      "call.incomingCall": "Incoming call from {{name}}",
      "call.calling": "Calling {{name}}...",
      "call.acceptCall": "Accept Call",
      "call.rejectCall": "Reject Call",
    }),
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: (() => {
    const fn = (selector?: (state: unknown) => unknown) => {
      return typeof selector === "function" ? selector(storeState) : storeState;
    };
    fn.getState = () => storeState;
    return fn;
  })(),
}));

vi.mock("@/lib/api", () => ({
  chatAPI: mockChatAPI,
}));

// Force window.innerWidth for isMobile check (≥768 = desktop)
Object.defineProperty(window, "innerWidth", {
  writable: true,
  configurable: true,
  value: 1024,
});

// ── helpers ──
function makeActiveCall(overrides?: Partial<ActiveCall>): ActiveCall {
  return {
    callId: "call-1",
    peer: "bob",
    callType: "video",
    startTime: Date.now(),
    ...overrides,
  };
}

function makeIncomingCall(overrides?: Partial<IncomingCall>): IncomingCall {
  return {
    callId: "inc-1",
    from: "bob",
    callType: "video",
    sdp: "{}",
    ...overrides,
  };
}

describe("VideoCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.activeCall = null;
    storeState.incomingCall = null;
    storeState.userProfiles = {};
    storeState.username = "alice";
  });

  // ──────────────────────────────────────────────────
  // Calling state (outgoing call)
  // ──────────────────────────────────────────────────
  describe("calling state (outgoing)", () => {
    it("renders calling state UI with peer display name", () => {
      storeState.activeCall = makeActiveCall({ peer: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };

      render(<VideoCall onClose={vi.fn()} />);

      // Should show peer's display name
      expect(screen.getByText("Bob")).toBeTruthy();
      // Should show calling text
      expect(screen.getByText("Calling Bob...")).toBeTruthy();
    });

    it("falls back to username when no display_name", () => {
      storeState.activeCall = makeActiveCall({ peer: "charlie" });
      storeState.userProfiles = {};

      render(<VideoCall onClose={vi.fn()} />);

      // Falls back to the raw peer username
      expect(screen.getByText("charlie")).toBeTruthy();
    });

    it("has a hang-up / end call button", () => {
      storeState.activeCall = makeActiveCall();

      render(<VideoCall onClose={vi.fn()} />);

      // In calling/ringing fallback UI, the button has aria-label "Reject Call"
      const endBtn = screen.getByLabelText("Reject Call");
      expect(endBtn).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────
  // Ringing state (incoming call)
  // ──────────────────────────────────────────────────
  describe("ringing state (incoming)", () => {
    it("renders incoming call UI with accept and reject buttons", () => {
      storeState.incomingCall = makeIncomingCall({ from: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };

      render(<VideoCall onClose={vi.fn()} />);

      // Should show the caller name
      expect(screen.getByText("Bob")).toBeTruthy();
      // Should show incoming call text
      expect(screen.getByText("Incoming call from Bob")).toBeTruthy();
      // Accept button
      expect(screen.getByLabelText("Accept Call")).toBeTruthy();
      // Reject button
      expect(screen.getByLabelText("Reject Call")).toBeTruthy();
    });

    it("reject button calls sendCallReject and onClose", () => {
      const onClose = vi.fn();
      storeState.incomingCall = makeIncomingCall({ callId: "inc-test" });

      render(<VideoCall onClose={onClose} />);

      const rejectBtn = screen.getByLabelText("Reject Call");
      fireEvent.click(rejectBtn);

      expect(mockChatAPI.sendCallReject).toHaveBeenCalledWith("inc-test");
      expect(storeState.setIncomingCall).toHaveBeenCalledWith(null);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────
  // Ended state
  // ──────────────────────────────────────────────────
  describe("ended state", () => {
    it("renders ended state after getUserMedia fails", async () => {
      // Mock getUserMedia to always fail
      const origMediaDevices = navigator.mediaDevices;
      Object.defineProperty(navigator, "mediaDevices", {
        writable: true,
        configurable: true,
        value: {
          getUserMedia: vi.fn().mockRejectedValue(new Error("Not allowed")),
        },
      });

      storeState.activeCall = makeActiveCall();

      try {
        render(<VideoCall onClose={vi.fn()} />);

        // Wait for the component to transition to "ended" state
        await waitFor(
          () => {
            expect(screen.getByText("Call Ended")).toBeTruthy();
          },
          { timeout: 3000 },
        );
      } finally {
        Object.defineProperty(navigator, "mediaDevices", {
          writable: true,
          configurable: true,
          value: origMediaDevices,
        });
      }
    });
  });

  // ──────────────────────────────────────────────────
  // Group call display
  // ──────────────────────────────────────────────────
  describe("group call", () => {
    it("shows group call name for outgoing group calls", () => {
      storeState.activeCall = makeActiveCall({
        isGroupCall: true,
        groupName: "Design Team",
        peer: "bob",
        callType: "voice",
      });
      storeState.userProfiles = {};

      render(<VideoCall onClose={vi.fn()} />);

      // Heading should display the group name
      expect(screen.getByText("Design Team")).toBeTruthy();
      // Calling text uses peerDisplayName, not the group name
      expect(screen.getByText("Calling bob...")).toBeTruthy();
    });

    it("shows default group call label when no groupName", () => {
      storeState.activeCall = makeActiveCall({
        isGroupCall: true,
        groupName: undefined,
      });

      render(<VideoCall onClose={vi.fn()} />);

      // Falls back to "Group Call" i18n key
      expect(screen.getByText("Group Call")).toBeTruthy();
    });
  });
});
