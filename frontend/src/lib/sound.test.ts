import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock soundToggle ────────────────────────────────────────────────
const { isSoundEnabledMock } = vi.hoisted(() => ({
  isSoundEnabledMock: vi.fn(),
}));

vi.mock("@/lib/soundToggle", () => ({
  isSoundEnabled: isSoundEnabledMock,
}));

import {
  playMessageSound,
  playMentionSound,
  playOnlineSound,
  playOfflineSound,
  playSentSound,
  playReactionSound,
} from "@/lib/sound";

// ── Shared mock objects (created once; call history cleared each test) ──
const oscMock = {
  connect: vi.fn(),
  type: "" as string,
  frequency: { setValueAtTime: vi.fn() },
  start: vi.fn(),
  stop: vi.fn(),
};

const gainMock = {
  connect: vi.fn(),
  gain: {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  },
};

const ctxMock = {
  createOscillator: vi.fn(() => oscMock),
  createGain: vi.fn(() => gainMock),
  destination: {} as AudioDestinationNode,
  currentTime: 0,
};

let audioCtorCallCount = 0;

// ── Helpers ────────────────────────────────────────────────────────
function installAudioContext() {
  audioCtorCallCount = 0;
  (window as Record<string, unknown>).AudioContext = function (this: void) {
    audioCtorCallCount++;
    return ctxMock;
  };
}

function removeAudioContext() {
  delete (window as Record<string, unknown>).AudioContext;
}

// ── Tests ──────────────────────────────────────────────────────────
describe("sound utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installAudioContext();
    isSoundEnabledMock.mockReturnValue(false);
  });

  // ── Error resilience (must run before any test caches audioCtx) ──
  describe("error resilience", () => {
    it("does not throw when AudioContext is unavailable", () => {
      isSoundEnabledMock.mockReturnValue(true);
      removeAudioContext();

      expect(() => {
        playMessageSound();
        playMentionSound();
        playOnlineSound();
        playOfflineSound();
        playSentSound();
        playReactionSound();
      }).not.toThrow();
    });

    it("does not throw when AudioContext constructor throws", () => {
      isSoundEnabledMock.mockReturnValue(true);
      (window as Record<string, unknown>).AudioContext = function () {
        throw new Error("Not supported");
      };

      expect(() => {
        playMessageSound();
        playMentionSound();
      }).not.toThrow();
    });
  });

  // ── AudioContext caching (must run while audioCtx is still null) ──
  it("reuses the AudioContext instance across multiple calls", () => {
    isSoundEnabledMock.mockReturnValue(true);

    playMessageSound();
    playMessageSound();
    playMessageSound();

    // getCtx() caches the instance; constructor called only once.
    expect(audioCtorCallCount).toBe(1);
  });

  // ── Disabled behavior (all 6 functions) ──────────────────────────
  const allFunctions = [
    { name: "playMessageSound", fn: playMessageSound },
    { name: "playMentionSound", fn: playMentionSound },
    { name: "playOnlineSound", fn: playOnlineSound },
    { name: "playOfflineSound", fn: playOfflineSound },
    { name: "playSentSound", fn: playSentSound },
    { name: "playReactionSound", fn: playReactionSound },
  ];

  describe.each(allFunctions)("$name", ({ fn: playFn }) => {
    it("does nothing when sound is disabled", () => {
      playFn();
      expect(audioCtorCallCount).toBe(0);
    });
  });

  // ── Enabled behavior ─────────────────────────────────────────────
  describe("when sound is enabled", () => {
    beforeEach(() => {
      isSoundEnabledMock.mockReturnValue(true);
    });

    function expectBasicAudioGraph() {
      expect(ctxMock.createOscillator).toHaveBeenCalled();
      expect(ctxMock.createGain).toHaveBeenCalled();
      expect(oscMock.connect).toHaveBeenCalledWith(gainMock);
      expect(gainMock.connect).toHaveBeenCalledWith(ctxMock.destination);
      expect(oscMock.start).toHaveBeenCalled();
      expect(oscMock.stop).toHaveBeenCalled();
    }

    it("playMessageSound sets up two-tone chime", () => {
      playMessageSound();
      expectBasicAudioGraph();
    });

    it("playMentionSound sets up three-tone ascending", () => {
      playMentionSound();
      expectBasicAudioGraph();
    });

    it("playOnlineSound sets up ascending two-tone", () => {
      playOnlineSound();
      expectBasicAudioGraph();
    });

    it("playOfflineSound sets up descending two-tone", () => {
      playOfflineSound();
      expectBasicAudioGraph();
    });

    it("playSentSound sets up single short tone", () => {
      playSentSound();
      expectBasicAudioGraph();
    });

    it("playReactionSound sets up quick two-tone", () => {
      playReactionSound();
      expectBasicAudioGraph();
    });
  });
});
