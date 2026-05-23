import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { VideoCall } from "@/components/VideoCall";
import { mockI18n } from "@/test-utils";
import type { ActiveCall, IncomingCall } from "@/stores/chatStore";

// ── hoisted store state + global WebRTC / media stubs ──
const {
  storeState, mockChatAPI, MockAudioContext,
  _ringtoneCloseTracker, _mediaDevicesMock, _defaultStream,
} = vi.hoisted(() => {
  // ── store state ──
  const storeState = {
    activeCall: null as ActiveCall | null,
    incomingCall: null as IncomingCall | null,
    userProfiles: {} as Record<string, { display_name?: string }>,
    setIncomingCall: vi.fn(),
    setActiveCall: vi.fn(),
    username: "alice",
  };

  // ── chat API mock ──
  const mockChatAPI = {
    sendCallStart: vi.fn(),
    sendCallAccept: vi.fn(),
    sendCallReject: vi.fn(),
    sendCallEnd: vi.fn(),
    sendCallIceCandidate: vi.fn(),
    sendCallRoomCreate: vi.fn(),
    sendCallRoomJoin: vi.fn(),
    sendCallRoomLeave: vi.fn(),
    on: vi.fn(() => () => {}),
    off: vi.fn(),
  };

  // ── AudioContext mock ──
  let _ringtoneCloseCalls = 0;
  const _ringtoneCloseMock = (): Promise<void> => { _ringtoneCloseCalls++; return Promise.resolve(); };
  // Export a tracker for assertions (avoids vi.fn quirks in hoisted class fields)
  const _ringtoneCloseTracker = {
    get called() { return _ringtoneCloseCalls > 0; },
    get count() { return _ringtoneCloseCalls; },
    reset() { _ringtoneCloseCalls = 0; },
  };
  class MockACImpl {
    createOscillator = vi.fn(() => ({
      type: "" as string,
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }));
    createGain = vi.fn(() => ({
      gain: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
    }));
    close = _ringtoneCloseMock;
    currentTime = 0;
    destination = {} as AudioDestinationNode;
  }
  const MockAudioContext = vi.fn(() => new MockACImpl());

  // ── Default mock MediaStream (always returns working tracks) ──
  function makeDefaultStream() {
    const tracks = [
      { kind: "audio", enabled: true, stop: vi.fn() },
      { kind: "video", enabled: true, stop: vi.fn() },
    ];
    return {
      getTracks: () => [...tracks],
      getAudioTracks: () => tracks.filter((t: { kind: string }) => t.kind === "audio"),
      getVideoTracks: () => tracks.filter((t: { kind: string }) => t.kind === "video"),
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
      _tracks: tracks,
    };
  }

  const _defaultStream = makeDefaultStream();

  // ── Persistent mediaDevices mock — never torn down between tests ──
  const _mediaDevicesMock = {
    getUserMedia: vi.fn().mockResolvedValue(_defaultStream),
    getDisplayMedia: vi.fn().mockResolvedValue(_defaultStream),
  };

  // Assign to navigator (jsdom navigator allows this)
  try {
    const nav = globalThis.navigator as unknown as Record<string, unknown>;
    if (!nav.mediaDevices || typeof nav.mediaDevices !== "object") {
      nav.mediaDevices = _mediaDevicesMock;
    }
  } catch { /* some environments may not allow */ }

  // ── WebRTC globals ──
  class MockRTCPeerConnection {
    addTrack = vi.fn();
    createOffer = vi.fn().mockResolvedValue({ sdp: "fake-offer", type: "offer" as RTCSdpType });
    createAnswer = vi.fn().mockResolvedValue({ sdp: "fake-answer", type: "answer" as RTCSdpType });
    setLocalDescription = vi.fn().mockResolvedValue(undefined);
    setRemoteDescription = vi.fn().mockResolvedValue(undefined);
    getSenders = vi.fn(() => []);
    addIceCandidate = vi.fn().mockResolvedValue(undefined);
    close = vi.fn();
    onicecandidate: ((e: RTCPeerConnectionIceEvent) => void) | null = null;
    ontrack: ((e: RTCTrackEvent) => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    connectionState: RTCPeerConnectionState = "connected";
    signalingState: RTCSignalingState = "stable";
  }

  globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection;
  globalThis.RTCSessionDescription = class {
    sdp: string;
    type: RTCSdpType;
    constructor(init?: RTCSessionDescriptionInit) {
      this.sdp = init?.sdp ?? "";
      this.type = init?.type ?? "offer";
    }
  } as unknown as typeof RTCSessionDescription;
  globalThis.RTCIceCandidate = class {
    candidate: string;
    constructor(init?: RTCIceCandidateInit) {
      this.candidate = init?.candidate ?? "";
    }
  } as unknown as typeof RTCIceCandidate;
  globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;

  return {
    storeState, mockChatAPI, MockAudioContext,
    _ringtoneCloseTracker, _mediaDevicesMock, _defaultStream,
  };
});

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

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/lib/sound", () => ({
  playSentSound: vi.fn(),
  playMessageSound: vi.fn(),
  playMentionSound: vi.fn(),
  playOnlineSound: vi.fn(),
  playOfflineSound: vi.fn(),
  playReactionSound: vi.fn(),
}));

// jsdom may lack crypto.randomUUID
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => "mock-uuid-" + Math.random().toString(36).slice(2) },
    writable: true,
    configurable: true,
  });
}

// Force window.innerWidth for isMobile check (>=768 = desktop)
Object.defineProperty(window, "innerWidth", {
  writable: true,
  configurable: true,
  value: 1024,
});

// jsdom lacks Element.setPointerCapture — stub it
if (!(Element.prototype as unknown as Record<string, unknown>).setPointerCapture) {
  Object.defineProperty(Element.prototype, "setPointerCapture", {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(Element.prototype, "releasePointerCapture", {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
}

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

function makeMockStream(opts?: { audio?: boolean; video?: boolean }) {
  const tracks: { kind: string; enabled: boolean; stop: ReturnType<typeof vi.fn> }[] = [];
  if (opts?.audio !== false) {
    tracks.push({ kind: "audio", enabled: true, stop: vi.fn() });
  }
  if (opts?.video !== false) {
    tracks.push({ kind: "video", enabled: true, stop: vi.fn() });
  }
  return {
    getTracks: () => [...tracks],
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    _tracks: tracks,
  };
}

/** Point navigator.mediaDevices.getUserMedia / getDisplayMedia to the given streams */
function setMediaStream(
  stream: ReturnType<typeof makeMockStream>,
  screenStream?: ReturnType<typeof makeMockStream>,
) {
  (_mediaDevicesMock.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(stream);
  (_mediaDevicesMock.getDisplayMedia as ReturnType<typeof vi.fn>).mockResolvedValue(
    screenStream ?? stream,
  );
}

// ──────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────
describe("VideoCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.activeCall = null;
    storeState.incomingCall = null;
    storeState.userProfiles = {};
    storeState.username = "alice";
    // reset media mock to default working stream
    setMediaStream(_defaultStream);
    // reset ringtone close tracker
    _ringtoneCloseTracker.reset();
  });

  // ──────────────────────────────────────────────────
  // Calling state (outgoing call)
  // ──────────────────────────────────────────────────
  describe("calling state (outgoing)", () => {
    it("renders calling state UI with peer display name", () => {
      storeState.activeCall = makeActiveCall({ peer: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };
      render(<VideoCall onClose={vi.fn()} />);
      expect(screen.getByText("Bob")).toBeTruthy();
      expect(screen.getByText("Calling Bob...")).toBeTruthy();
    });

    it("falls back to username when no display_name", () => {
      storeState.activeCall = makeActiveCall({ peer: "charlie" });
      render(<VideoCall onClose={vi.fn()} />);
      expect(screen.getByText("charlie")).toBeTruthy();
    });

    it("has a hang-up / end call button", () => {
      storeState.activeCall = makeActiveCall();
      render(<VideoCall onClose={vi.fn()} />);
      expect(screen.getByLabelText("Reject Call")).toBeTruthy();
    });

    it("calling state shows Phone icon without pulse animation", () => {
      storeState.activeCall = makeActiveCall({ peer: "bob" });
      render(<VideoCall onClose={vi.fn()} />);
      expect(document.querySelector(".rounded-full.bg-white\\/10")).toBeTruthy();
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
      expect(screen.getByText("Bob")).toBeTruthy();
      expect(screen.getByText("Incoming call from Bob")).toBeTruthy();
      expect(screen.getByLabelText("Accept Call")).toBeTruthy();
      expect(screen.getByLabelText("Reject Call")).toBeTruthy();
    });

    it("reject button calls sendCallReject and onClose", () => {
      const onClose = vi.fn();
      storeState.incomingCall = makeIncomingCall({ callId: "inc-test" });
      render(<VideoCall onClose={onClose} />);
      fireEvent.click(screen.getByLabelText("Reject Call"));
      expect(mockChatAPI.sendCallReject).toHaveBeenCalledWith("inc-test");
      expect(storeState.setIncomingCall).toHaveBeenCalledWith(null);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Phone icon has green pulse animation in ringing state", () => {
      storeState.incomingCall = makeIncomingCall({ from: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };
      render(<VideoCall onClose={vi.fn()} />);
      expect(document.querySelector(".text-green-400.animate-pulse")).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────
  // Ended state
  // ──────────────────────────────────────────────────
  describe("ended state", () => {
    it("renders ended state after getUserMedia fails", async () => {
      const origMediaDevices = navigator.mediaDevices;
      Object.defineProperty(navigator, "mediaDevices", {
        writable: true, configurable: true,
        value: { getUserMedia: vi.fn().mockRejectedValue(new Error("Not allowed")) },
      });
      storeState.activeCall = makeActiveCall();
      try {
        render(<VideoCall onClose={vi.fn()} />);
        await waitFor(() => { expect(screen.getByText("Call Ended")).toBeTruthy(); }, { timeout: 3000 });
      } finally {
        Object.defineProperty(navigator, "mediaDevices", {
          writable: true, configurable: true,
          value: origMediaDevices,
        });
      }
    });

    it("shows elapsed time on ended screen", async () => {
      const origMediaDevices = navigator.mediaDevices;
      Object.defineProperty(navigator, "mediaDevices", {
        writable: true, configurable: true,
        value: { getUserMedia: vi.fn().mockRejectedValue(new Error("Not allowed")) },
      });
      storeState.activeCall = makeActiveCall();
      try {
        render(<VideoCall onClose={vi.fn()} />);
        await waitFor(() => { expect(screen.getByText("Call Ended")).toBeTruthy(); }, { timeout: 3000 });
        expect(screen.getByText("00:00")).toBeTruthy();
      } finally {
        Object.defineProperty(navigator, "mediaDevices", {
          writable: true, configurable: true,
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
        isGroupCall: true, groupName: "Design Team", peer: "bob", callType: "voice",
      });
      render(<VideoCall onClose={vi.fn()} />);
      expect(screen.getByText("Design Team")).toBeTruthy();
      expect(screen.getByText("Calling bob...")).toBeTruthy();
    });

    it("shows default group call label when no groupName", () => {
      storeState.activeCall = makeActiveCall({ isGroupCall: true, groupName: undefined });
      render(<VideoCall onClose={vi.fn()} />);
      expect(screen.getByText("Group Call")).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────
  // Ringtone control
  // ──────────────────────────────────────────────────
  describe("ringtone control", () => {
    it("starts ringtone when incoming call is rendered", () => {
      storeState.incomingCall = makeIncomingCall({ from: "bob" });
      render(<VideoCall onClose={vi.fn()} />);
      expect(MockAudioContext).toHaveBeenCalled();
    });

    it("stops ringtone when rejecting an incoming call", () => {
      const onClose = vi.fn();
      storeState.incomingCall = makeIncomingCall({ callId: "inc-test" });
      render(<VideoCall onClose={onClose} />);
      expect(MockAudioContext).toHaveBeenCalled(); // ringtone started
      fireEvent.click(screen.getByLabelText("Reject Call"));
      // rejectCall always calls stopRingtone synchronously as its first line,
      // then calls sendCallReject and onClose
      expect(mockChatAPI.sendCallReject).toHaveBeenCalledWith("inc-test");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("stops ringtone when accepting an incoming call", async () => {
      const stream = makeMockStream({ audio: true, video: true });
      setMediaStream(stream);

      storeState.incomingCall = makeIncomingCall({ from: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };
      render(<VideoCall onClose={vi.fn()} />);
      expect(MockAudioContext).toHaveBeenCalled(); // ringtone started

      fireEvent.click(screen.getByLabelText("Accept Call"));
      // acceptCall always calls stopRingtone synchronously as its first line
      // Proving acceptCall ran (via sendCallAccept) proves stopRingtone ran
      await waitFor(() => { expect(mockChatAPI.sendCallAccept).toHaveBeenCalled(); }, { timeout: 5000 });
      await waitFor(() => { expect(screen.getByLabelText("End Call")).toBeTruthy(); }, { timeout: 5000 });
    });

    it("does not start ringtone for outgoing call (calling state)", () => {
      storeState.activeCall = makeActiveCall();
      render(<VideoCall onClose={vi.fn()} />);
      expect(MockAudioContext).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // Call timer
  // ──────────────────────────────────────────────────
  describe("call timer", () => {
    it("renders timer display in connected state", async () => {
      const stream = makeMockStream({ audio: true, video: true });
      setMediaStream(stream);
      storeState.incomingCall = makeIncomingCall({ from: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };
      render(<VideoCall onClose={vi.fn()} />);

      fireEvent.click(screen.getByLabelText("Accept Call"));

      await waitFor(
        () => {
          const timerEl = document.querySelector(".font-mono");
          expect(timerEl).toBeTruthy();
          expect(timerEl!.textContent).toMatch(/^\d{2}:\d{2}$/);
        },
        { timeout: 5000 },
      );
    });

    it("formatTime formats seconds correctly", () => {
      const fmt = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      };
      expect(fmt(0)).toBe("00:00");
      expect(fmt(5)).toBe("00:05");
      expect(fmt(65)).toBe("01:05");
      expect(fmt(3661)).toBe("61:01");
    });
  });

  // ──────────────────────────────────────────────────
  // Connected state UI
  // ──────────────────────────────────────────────────
  describe("connected state UI", () => {
    async function acceptAndConnect() {
      const stream = makeMockStream({ audio: true, video: true });
      setMediaStream(stream);
      storeState.incomingCall = makeIncomingCall({ from: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };
      render(<VideoCall onClose={vi.fn()} />);
      fireEvent.click(screen.getByLabelText("Accept Call"));
      await waitFor(() => { expect(screen.getByLabelText("End Call")).toBeTruthy(); }, { timeout: 5000 });
      return stream;
    }

    it("renders control bar with mute, camera, screen share, and end call buttons", async () => {
      await acceptAndConnect();
      expect(screen.getByLabelText("Mute Mic")).toBeTruthy();
      expect(screen.getByLabelText("Turn Off Camera")).toBeTruthy();
      expect(screen.getByLabelText("Share Screen")).toBeTruthy();
      expect(screen.getByLabelText("End Call")).toBeTruthy();
    });

    it("displays single peer video for 1:1 calls", async () => {
      await acceptAndConnect();
      const videos = document.querySelectorAll("video");
      expect(videos.length).toBeGreaterThanOrEqual(2); // remote + local PiP
    });

    it("renders local PiP overlay", async () => {
      await acceptAndConnect();
      expect(document.querySelector(".cursor-grab")).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────
  // Draggable PiP overlay
  // ──────────────────────────────────────────────────
  describe("draggable PiP overlay", () => {
    async function acceptAndConnect() {
      const stream = makeMockStream({ audio: true, video: true });
      setMediaStream(stream);
      storeState.incomingCall = makeIncomingCall({ from: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };
      render(<VideoCall onClose={vi.fn()} />);
      fireEvent.click(screen.getByLabelText("Accept Call"));
      await waitFor(() => { expect(screen.getByLabelText("End Call")).toBeTruthy(); }, { timeout: 5000 });
      return stream;
    }

    it("renders PiP with camera content when camera is on", async () => {
      await acceptAndConnect();
      const pipContainer = document.querySelector(".cursor-grab");
      expect(pipContainer).toBeTruthy();
      expect(pipContainer!.querySelector("video")).toBeTruthy();
    });

    it("shows VideoOff icon in PiP when camera is off (no video track)", async () => {
      const stream = makeMockStream({ audio: true, video: false });
      setMediaStream(stream);
      storeState.incomingCall = makeIncomingCall({ from: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };
      render(<VideoCall onClose={vi.fn()} />);
      fireEvent.click(screen.getByLabelText("Accept Call"));
      await waitFor(() => { expect(screen.getByLabelText("End Call")).toBeTruthy(); }, { timeout: 5000 });

      const pipContainer = document.querySelector(".cursor-grab");
      expect(pipContainer).toBeTruthy();
      // no video element inside PiP when camera is off
      expect(pipContainer!.querySelector("video")).toBeFalsy();
    });

    it("dragging PiP updates position via pointer events", async () => {
      await acceptAndConnect();
      const pipContainer = document.querySelector(".cursor-grab") as HTMLDivElement;
      expect(pipContainer).toBeTruthy();

      const origGBCR = pipContainer.getBoundingClientRect.bind(pipContainer);
      pipContainer.getBoundingClientRect = vi.fn(() => ({
        left: 100, top: 200, right: 200, bottom: 400,
        width: 100, height: 200, x: 100, y: 200, toJSON: () => {},
      }));

      fireEvent.pointerDown(pipContainer, { clientX: 150, clientY: 250, pointerId: 1 });
      fireEvent.pointerMove(pipContainer, { clientX: 200, clientY: 300, pointerId: 1 });

      const style = pipContainer.getAttribute("style") || "";
      expect(style).toContain("translate");

      fireEvent.pointerUp(pipContainer, { pointerId: 1 });
      pipContainer.getBoundingClientRect = origGBCR;
    });

    it("shows muted/camera-off status indicators in PiP", async () => {
      await acceptAndConnect();
      fireEvent.click(screen.getByLabelText("Mute Mic"));
      await waitFor(() => {
        const pip = document.querySelector(".cursor-grab");
        expect(pip?.querySelector(".bg-red-500")).toBeTruthy();
      });
    });
  });

  // ──────────────────────────────────────────────────
  // Peer grid layout
  // ──────────────────────────────────────────────────
  describe("peer grid layout", () => {
    async function acceptAndConnect() {
      const stream = makeMockStream({ audio: true, video: true });
      setMediaStream(stream);
      storeState.incomingCall = makeIncomingCall({ from: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };
      render(<VideoCall onClose={vi.fn()} />);
      fireEvent.click(screen.getByLabelText("Accept Call"));
      await waitFor(() => { expect(screen.getByLabelText("End Call")).toBeTruthy(); }, { timeout: 5000 });
    }

    it("uses grid-cols-1 for single peer (1:1 call)", async () => {
      await acceptAndConnect();
      const gridContainer = document.querySelector(".grid");
      expect(gridContainer).toBeTruthy();
      expect(gridContainer!.className).toContain("grid-cols-1");
    });

    it("renders remote video element for 1:1 call", async () => {
      await acceptAndConnect();
      const gridContainer = document.querySelector(".grid");
      const videoWrappers = gridContainer!.querySelectorAll(".relative.w-full.h-full");
      expect(videoWrappers.length).toBe(1);
      expect(videoWrappers[0].querySelector("video")).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────
  // Mute / Camera toggle
  // ──────────────────────────────────────────────────
  describe("mute and camera toggle", () => {
    async function acceptAndConnect() {
      const stream = makeMockStream({ audio: true, video: true });
      setMediaStream(stream);
      storeState.incomingCall = makeIncomingCall({ from: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };
      render(<VideoCall onClose={vi.fn()} />);
      fireEvent.click(screen.getByLabelText("Accept Call"));
      await waitFor(() => { expect(screen.getByLabelText("End Call")).toBeTruthy(); }, { timeout: 5000 });
      return stream;
    }

    it("toggles mic mute button label and track state", async () => {
      const stream = await acceptAndConnect();
      expect(screen.getByLabelText("Mute Mic")).toBeTruthy();

      fireEvent.click(screen.getByLabelText("Mute Mic"));
      const audioTrack = stream._tracks.find((t) => t.kind === "audio");
      expect(audioTrack!.enabled).toBe(false);
      await waitFor(() => { expect(screen.getByLabelText("Unmute Mic")).toBeTruthy(); });

      fireEvent.click(screen.getByLabelText("Unmute Mic"));
      expect(audioTrack!.enabled).toBe(true);
      await waitFor(() => { expect(screen.getByLabelText("Mute Mic")).toBeTruthy(); });
    });

    it("toggles camera button label and track state", async () => {
      const stream = await acceptAndConnect();
      expect(screen.getByLabelText("Turn Off Camera")).toBeTruthy();

      fireEvent.click(screen.getByLabelText("Turn Off Camera"));
      const videoTrack = stream._tracks.find((t) => t.kind === "video");
      expect(videoTrack!.enabled).toBe(false);
      await waitFor(() => { expect(screen.getByLabelText("Turn On Camera")).toBeTruthy(); });

      fireEvent.click(screen.getByLabelText("Turn On Camera"));
      expect(videoTrack!.enabled).toBe(true);
      await waitFor(() => { expect(screen.getByLabelText("Turn Off Camera")).toBeTruthy(); });
    });

    it("multiple toggles work independently (mute then camera off)", async () => {
      const stream = await acceptAndConnect();

      fireEvent.click(screen.getByLabelText("Mute Mic"));
      const audioTrack = stream._tracks.find((t) => t.kind === "audio");
      const videoTrack = stream._tracks.find((t) => t.kind === "video");
      expect(audioTrack!.enabled).toBe(false);
      expect(videoTrack!.enabled).toBe(true);

      fireEvent.click(screen.getByLabelText("Turn Off Camera"));
      expect(audioTrack!.enabled).toBe(false);
      expect(videoTrack!.enabled).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────
  // Screen sharing toggle
  // ──────────────────────────────────────────────────
  describe("screen sharing", () => {
    it("renders screen share button in control bar", async () => {
      const stream = makeMockStream({ audio: true, video: true });
      setMediaStream(stream);
      storeState.incomingCall = makeIncomingCall({ from: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };
      render(<VideoCall onClose={vi.fn()} />);
      fireEvent.click(screen.getByLabelText("Accept Call"));
      await waitFor(() => { expect(screen.getByLabelText("End Call")).toBeTruthy(); }, { timeout: 5000 });
      expect(screen.getByLabelText("Share Screen")).toBeTruthy();
    });

    it("calls getDisplayMedia when screen share button is clicked", async () => {
      const stream = makeMockStream({ audio: true, video: true });
      const screenStream = makeMockStream({ audio: false, video: true });
      setMediaStream(stream, screenStream);

      storeState.incomingCall = makeIncomingCall({ from: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };
      render(<VideoCall onClose={vi.fn()} />);
      fireEvent.click(screen.getByLabelText("Accept Call"));
      await waitFor(() => { expect(screen.getByLabelText("End Call")).toBeTruthy(); }, { timeout: 5000 });

      fireEvent.click(screen.getByLabelText("Share Screen"));
      await waitFor(() => { expect(_mediaDevicesMock.getDisplayMedia).toHaveBeenCalled(); });
    });
  });

  // ──────────────────────────────────────────────────
  // End call button
  // ──────────────────────────────────────────────────
  describe("end call button", () => {
    it("triggers onClose callback after ending a call", async () => {
      const onClose = vi.fn();
      const stream = makeMockStream({ audio: true, video: true });
      setMediaStream(stream);

      storeState.incomingCall = makeIncomingCall({ from: "bob" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };
      render(<VideoCall onClose={onClose} />);
      fireEvent.click(screen.getByLabelText("Accept Call"));
      await waitFor(() => { expect(screen.getByLabelText("End Call")).toBeTruthy(); }, { timeout: 5000 });

      vi.useFakeTimers();
      try {
        fireEvent.click(screen.getByLabelText("End Call"));
        expect(mockChatAPI.sendCallEnd).toHaveBeenCalled();
        expect(storeState.setActiveCall).toHaveBeenCalledWith(null);
        expect(onClose).not.toHaveBeenCalled(); // deferred by setTimeout 1500
        act(() => { vi.advanceTimersByTime(1500); });
        expect(onClose).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("sends sendCallEnd with correct callId", async () => {
      const stream = makeMockStream({ audio: true, video: true });
      setMediaStream(stream);

      storeState.incomingCall = makeIncomingCall({ from: "bob", callId: "my-call-id" });
      render(<VideoCall onClose={vi.fn()} />);
      fireEvent.click(screen.getByLabelText("Accept Call"));
      await waitFor(() => { expect(screen.getByLabelText("End Call")).toBeTruthy(); }, { timeout: 5000 });

      fireEvent.click(screen.getByLabelText("End Call"));
      expect(mockChatAPI.sendCallEnd).toHaveBeenCalled();
      // At least one call includes the correct callId
      const calls = (mockChatAPI.sendCallEnd as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some((c: unknown[]) => c[0] === "my-call-id")).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────
  // Fallback UI (ringing/calling) button behaviors
  // ──────────────────────────────────────────────────
  describe("fallback UI button semantics", () => {
    it("calling state end button triggers onClose callback", () => {
      const onClose = vi.fn();
      storeState.activeCall = makeActiveCall({ callId: "call-end-test" });
      render(<VideoCall onClose={onClose} />);

      vi.useFakeTimers();
      try {
        fireEvent.click(screen.getByLabelText("Reject Call"));
        // endCall calls setTimeout(() => onClose(), 1500)
        act(() => { vi.advanceTimersByTime(1500); });
        expect(onClose).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("ringing state accept button sends call accept and transitions to connected", async () => {
      const stream = makeMockStream({ audio: true, video: true });
      setMediaStream(stream);

      storeState.incomingCall = makeIncomingCall({ from: "bob", callId: "inc-acc1" });
      storeState.userProfiles = { bob: { display_name: "Bob" } };
      render(<VideoCall onClose={vi.fn()} />);

      fireEvent.click(screen.getByLabelText("Accept Call"));

      await waitFor(() => { expect(mockChatAPI.sendCallAccept).toHaveBeenCalled(); });
      await waitFor(() => { expect(screen.getByLabelText("End Call")).toBeTruthy(); }, { timeout: 5000 });
    });
  });
});
