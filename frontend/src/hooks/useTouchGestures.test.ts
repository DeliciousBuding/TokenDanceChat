import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useTouchGestures,
  usePullDownGesture,
  useSwipeableMessage,
  type SwipeHandlers,
  type PullDownHandlers,
  type SwipeableMessageHandlers,
} from "@/hooks/useTouchGestures";

// ─── Touch event helpers ───────────────────────────────────────────

interface TouchInit {
  clientX: number;
  clientY: number;
}

function touchObj(t: TouchInit) {
  return { clientX: t.clientX, clientY: t.clientY } as unknown as Touch;
}

function mockTouchEvent(
  touches: TouchInit[],
  changedTouches?: TouchInit[],
): React.TouchEvent {
  return {
    touches: touches.map(touchObj),
    changedTouches: (changedTouches ?? touches).map(touchObj),
  } as unknown as React.TouchEvent;
}

// ─── useTouchGestures ──────────────────────────────────────────────

describe("useTouchGestures", () => {
  let handlers: SwipeHandlers;
  let onSwipeLeft: ReturnType<typeof vi.fn>;
  let onSwipeRight: ReturnType<typeof vi.fn>;
  let onLongPress: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onSwipeLeft = vi.fn();
    onSwipeRight = vi.fn();
    onLongPress = vi.fn();
    handlers = { onSwipeLeft, onSwipeRight, onLongPress };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not trigger long press on a quick tap", () => {
    const { result } = renderHook(() => useTouchGestures(handlers));

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 200 }]));
    });
    act(() => {
      result.current.onTouchEnd(
        mockTouchEvent([], [{ clientX: 100, clientY: 200 }]),
      );
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("triggers long press after 500ms without movement", () => {
    const { result } = renderHook(() => useTouchGestures(handlers));

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 200 }]));
    });

    vi.advanceTimersByTime(500);

    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it("cancels long press if finger moves beyond tolerance", () => {
    const { result } = renderHook(() => useTouchGestures(handlers));

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 200 }]));
    });

    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 100, clientY: 212 }]), // dy = 12 > 10
      );
    });

    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  // ── Swipe left / right detection ──

  it("triggers swipe left when swiping left fast enough", () => {
    const { result } = renderHook(() => useTouchGestures(handlers));

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 200, clientY: 100 }]));
    });

    act(() => {
      result.current.onTouchEnd(
        mockTouchEvent([], [{ clientX: 100, clientY: 100 }]), // dx = -100
      );
    });

    expect(onSwipeLeft).toHaveBeenCalledOnce();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("triggers swipe right when swiping right fast enough", () => {
    const { result } = renderHook(() => useTouchGestures(handlers));

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 100 }]));
    });

    act(() => {
      result.current.onTouchEnd(
        mockTouchEvent([], [{ clientX: 220, clientY: 100 }]), // dx = +120
      );
    });

    expect(onSwipeRight).toHaveBeenCalledOnce();
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it("triggers swipe left over long distance (distance gate, even when velocity is ambiguous)", () => {
    const { result } = renderHook(() => useTouchGestures(handlers));

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 300, clientY: 100 }]));
    });

    // Quick swipe of 200px horizontal, well past SWIPE_THRESHOLD*1.5=90
    act(() => {
      result.current.onTouchEnd(
        mockTouchEvent([], [{ clientX: 100, clientY: 100 }]), // dx = -200
      );
    });

    expect(onSwipeLeft).toHaveBeenCalledOnce();
  });

  it("triggers swipe right over long distance (distance gate)", () => {
    const { result } = renderHook(() => useTouchGestures(handlers));

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 50, clientY: 100 }]));
    });

    // Quick swipe of 200px horizontal
    act(() => {
      result.current.onTouchEnd(
        mockTouchEvent([], [{ clientX: 250, clientY: 100 }]), // dx = +200
      );
    });

    expect(onSwipeRight).toHaveBeenCalledOnce();
  });

  it("does not trigger swipe if vertical movement dominates", () => {
    const { result } = renderHook(() => useTouchGestures(handlers));

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 100 }]));
    });

    // dx = 70, dy = 100 — vertical dominates, |dx| < dy * 1.5
    act(() => {
      result.current.onTouchEnd(
        mockTouchEvent([], [{ clientX: 170, clientY: 200 }]),
      );
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("does not trigger swipe if distance is below threshold", () => {
    const { result } = renderHook(() => useTouchGestures(handlers));

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 100 }]));
    });

    // dx = 50 — below SWIPE_THRESHOLD (60)
    act(() => {
      result.current.onTouchEnd(
        mockTouchEvent([], [{ clientX: 150, clientY: 100 }]),
      );
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("returns handlers even when no callbacks are provided", () => {
    const { result } = renderHook(() =>
      useTouchGestures({} as SwipeHandlers),
    );

    expect(result.current.onTouchStart).toBeDefined();
    expect(result.current.onTouchMove).toBeDefined();
    expect(result.current.onTouchEnd).toBeDefined();

    // Should not throw for any handler.
    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 0, clientY: 0 }]));
    });
    act(() => {
      result.current.onTouchMove(mockTouchEvent([{ clientX: 10, clientY: 10 }]));
    });
    act(() => {
      result.current.onTouchEnd(
        mockTouchEvent([], [{ clientX: 10, clientY: 10 }]),
      );
    });
  });

  // ── Touch event cleanup on unmount ──

  it("touch handlers are safe to call after unmount (no crash)", () => {
    const { result, unmount } = renderHook(() =>
      useTouchGestures(handlers),
    );

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 200 }]));
    });

    unmount();

    // All handlers should be callable without throwing after unmount.
    expect(() => {
      act(() => {
        result.current.onTouchMove(
          mockTouchEvent([{ clientX: 110, clientY: 210 }]),
        );
      });
    }).not.toThrow();

    expect(() => {
      act(() => {
        result.current.onTouchEnd(
          mockTouchEvent([], [{ clientX: 110, clientY: 210 }]),
        );
      });
    }).not.toThrow();
  });
});

// ─── usePullDownGesture (mobile pull-down refresh) ─────────────────

describe("usePullDownGesture", () => {
  let containerRef: React.RefObject<HTMLDivElement | null>;
  let handlers: PullDownHandlers;
  let onPullDown: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onPullDown = vi.fn();
    handlers = { onPullDown };
    const div = { scrollTop: 0 } as HTMLDivElement;
    containerRef = { current: div };
  });

  it("triggers onPullDown when pulling down past threshold at scroll top", () => {
    const { result } = renderHook(() =>
      usePullDownGesture(containerRef, handlers),
    );

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 100 }]));
    });

    // Pull down: dy = 100 (past PULL_DOWN_THRESHOLD of 80)
    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 100, clientY: 200 }]),
      );
    });

    expect(onPullDown).toHaveBeenCalledOnce();
  });

  it("does not trigger if container scrollTop > 5", () => {
    containerRef.current = { scrollTop: 10 } as HTMLDivElement;
    const { result } = renderHook(() =>
      usePullDownGesture(containerRef, handlers),
    );

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 100 }]));
    });

    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 100, clientY: 200 }]),
      );
    });

    expect(onPullDown).not.toHaveBeenCalled();
  });

  it("does not trigger if pulling up instead of down", () => {
    const { result } = renderHook(() =>
      usePullDownGesture(containerRef, handlers),
    );

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 100 }]));
    });

    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 100, clientY: 50 }]), // dy = -50
      );
    });

    expect(onPullDown).not.toHaveBeenCalled();
  });

  it("does not trigger if horizontal movement dominates", () => {
    const { result } = renderHook(() =>
      usePullDownGesture(containerRef, handlers),
    );

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 100 }]));
    });

    // dy = 100, dx = 200 — horizontal dominates, dy < dx * 1.5
    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 300, clientY: 200 }]),
      );
    });

    expect(onPullDown).not.toHaveBeenCalled();
  });

  it("only triggers once per gesture", () => {
    const { result } = renderHook(() =>
      usePullDownGesture(containerRef, handlers),
    );

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 100 }]));
    });

    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 100, clientY: 200 }]),
      );
    });

    // Second move should not fire again.
    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 100, clientY: 250 }]),
      );
    });

    expect(onPullDown).toHaveBeenCalledTimes(1);
  });

  it("does not trigger when isLoading is true", () => {
    const { result } = renderHook(() =>
      usePullDownGesture(containerRef, handlers, true),
    );

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 100 }]));
    });

    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 100, clientY: 200 }]),
      );
    });

    expect(onPullDown).not.toHaveBeenCalled();
  });

  it("does not trigger if dy is below threshold", () => {
    const { result } = renderHook(() =>
      usePullDownGesture(containerRef, handlers),
    );

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 100 }]));
    });

    // dy = 50 — below PULL_DOWN_THRESHOLD (80)
    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 100, clientY: 150 }]),
      );
    });

    expect(onPullDown).not.toHaveBeenCalled();
  });

  it("clears touch state on touch end", () => {
    const { result } = renderHook(() =>
      usePullDownGesture(containerRef, handlers),
    );

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 100 }]));
    });

    act(() => {
      result.current.onTouchEnd(
        mockTouchEvent([], [{ clientX: 100, clientY: 100 }]),
      );
    });

    // Another gesture should still work (state was cleared).
    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 100 }]));
    });

    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 100, clientY: 200 }]),
      );
    });

    expect(onPullDown).toHaveBeenCalledOnce();
  });

  // ── Touch event cleanup on unmount ──

  it("touch handlers are safe to call after unmount (no crash)", () => {
    const { result, unmount } = renderHook(() =>
      usePullDownGesture(containerRef, handlers),
    );

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 100, clientY: 100 }]));
    });

    unmount();

    // Calling handlers after unmount should not throw.
    expect(() => {
      act(() => {
        result.current.onTouchMove(
          mockTouchEvent([{ clientX: 100, clientY: 200 }]),
        );
      });
    }).not.toThrow();

    expect(() => {
      act(() => {
        result.current.onTouchEnd(
          mockTouchEvent([], [{ clientX: 100, clientY: 200 }]),
        );
      });
    }).not.toThrow();
  });
});

// ─── useSwipeableMessage ───────────────────────────────────────────

describe("useSwipeableMessage", () => {
  let handlers: SwipeableMessageHandlers;
  let onReply: ReturnType<typeof vi.fn>;
  let onCopy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onReply = vi.fn();
    onCopy = vi.fn();
    handlers = { onReply, onCopy, isOwn: false, disabled: false };
  });

  it("initializes with translateX = 0 and showActions = false", () => {
    const { result } = renderHook(() => useSwipeableMessage(handlers));
    expect(result.current.translateX).toBe(0);
    expect(result.current.showActions).toBe(false);
    expect(result.current.actionWidth).toBe(180);
  });

  it("does nothing when disabled", () => {
    const { result } = renderHook(() =>
      useSwipeableMessage({ ...handlers, disabled: true }),
    );

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 200, clientY: 100 }]));
    });

    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 100, clientY: 100 }]),
      );
    });

    expect(result.current.translateX).toBe(0);
  });

  it("translates on horizontal swipe left", () => {
    const { result } = renderHook(() => useSwipeableMessage(handlers));

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 300, clientY: 100 }]));
    });

    // Move left by 60px
    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 240, clientY: 100 }]),
      );
    });

    expect(result.current.translateX).toBeLessThan(0);
  });

  it("deactivates on vertical scroll", () => {
    const { result } = renderHook(() => useSwipeableMessage(handlers));

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 300, clientY: 100 }]));
    });

    // Move vertically (more than 10px) — should deactivate
    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 300, clientY: 150 }]),
      );
    });

    // Subsequent horizontal moves should be ignored
    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 200, clientY: 150 }]),
      );
    });

    expect(result.current.translateX).toBe(0);
  });

  it("snaps open when swiped past activation threshold on end", () => {
    const { result } = renderHook(() => useSwipeableMessage(handlers));

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 300, clientY: 100 }]));
    });

    // Swipe far left
    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 50, clientY: 100 }]),
      );
    });

    act(() => {
      result.current.onTouchEnd(
        mockTouchEvent([], [{ clientX: 50, clientY: 100 }]),
      );
    });

    // translateX should snap to -ACTION_WIDTH because |translateX| > ACTION_WIDTH * 0.4
    expect(result.current.translateX).toBe(-180);
    expect(result.current.showActions).toBe(true);
  });

  it("snaps closed when swiped only slightly", () => {
    const { result } = renderHook(() => useSwipeableMessage(handlers));

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 300, clientY: 100 }]));
    });

    // Swipe a small amount left
    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 270, clientY: 100 }]),
      );
    });

    act(() => {
      result.current.onTouchEnd(
        mockTouchEvent([], [{ clientX: 270, clientY: 100 }]),
      );
    });

    // Should snap back to 0 since |translateX| <= ACTION_WIDTH * 0.4
    // (translateX was ~30, which is less than 72)
    expect(result.current.translateX).toBe(0);
    expect(result.current.showActions).toBe(false);
  });

  it("closeActions resets translateX and showActions", () => {
    const { result } = renderHook(() => useSwipeableMessage(handlers));

    // Simulate full swipe to open actions
    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 300, clientY: 100 }]));
    });
    act(() => {
      result.current.onTouchMove(
        mockTouchEvent([{ clientX: 50, clientY: 100 }]),
      );
    });
    act(() => {
      result.current.onTouchEnd(
        mockTouchEvent([], [{ clientX: 50, clientY: 100 }]),
      );
    });

    expect(result.current.showActions).toBe(true);

    act(() => {
      result.current.closeActions();
    });

    expect(result.current.translateX).toBe(0);
    expect(result.current.showActions).toBe(false);
  });

  // ── Touch event cleanup on unmount ──

  it("touch handlers are safe to call after unmount (no crash)", () => {
    const { result, unmount } = renderHook(() =>
      useSwipeableMessage(handlers),
    );

    act(() => {
      result.current.onTouchStart(mockTouchEvent([{ clientX: 300, clientY: 100 }]));
    });

    unmount();

    // Calling handlers after unmount should not throw.
    expect(() => {
      act(() => {
        result.current.onTouchMove(
          mockTouchEvent([{ clientX: 240, clientY: 100 }]),
        );
      });
    }).not.toThrow();

    expect(() => {
      act(() => {
        result.current.onTouchEnd(
          mockTouchEvent([], [{ clientX: 240, clientY: 100 }]),
        );
      });
    }).not.toThrow();
  });
});
