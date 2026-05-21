import { useRef, useCallback, type TouchEvent as ReactTouchEvent } from "react";

export interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onLongPress?: () => void;
}

export interface PullDownHandlers {
  onPullDown?: () => void;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  moved: boolean;
}

const SWIPE_THRESHOLD = 60; // px
const SWIPE_VELOCITY = 0.5; // px/ms minimum
const LONG_PRESS_DURATION = 500; // ms
const LONG_PRESS_MOVE_TOLERANCE = 10; // px
const PULL_DOWN_THRESHOLD = 80; // px

/**
 * Hook for swipe and long-press gestures on individual elements (like message bubbles).
 */
export function useTouchGestures(handlers: SwipeHandlers) {
  const touchRef = useRef<TouchState | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const onTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      const touch = e.touches[0];
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        moved: false,
      };
      longPressTriggered.current = false;

      // Start long-press timer
      clearLongPress();
      longPressTimer.current = setTimeout(() => {
        if (touchRef.current && !touchRef.current.moved) {
          longPressTriggered.current = true;
          handlers.onLongPress?.();
        }
      }, LONG_PRESS_DURATION);
    },
    [handlers, clearLongPress],
  );

  const onTouchMove = useCallback(
    (e: ReactTouchEvent) => {
      if (!touchRef.current) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchRef.current.startX);
      const dy = Math.abs(touch.clientY - touchRef.current.startY);

      if (dx > LONG_PRESS_MOVE_TOLERANCE || dy > LONG_PRESS_MOVE_TOLERANCE) {
        touchRef.current.moved = true;
        clearLongPress();
      }
    },
    [clearLongPress],
  );

  const onTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      clearLongPress();
      if (!touchRef.current || longPressTriggered.current) {
        touchRef.current = null;
        return;
      }

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchRef.current.startX;
      const dy = Math.abs(touch.clientY - touchRef.current.startY);
      const dt = Date.now() - touchRef.current.startTime;

      // Only trigger swipe if horizontal movement dominates
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > dy * 1.5) {
        const velocity = Math.abs(dx) / dt;
        if (velocity > SWIPE_VELOCITY || Math.abs(dx) > SWIPE_THRESHOLD * 1.5) {
          if (dx > 0) {
            handlers.onSwipeRight?.();
          } else {
            handlers.onSwipeLeft?.();
          }
        }
      }

      touchRef.current = null;
    },
    [handlers, clearLongPress],
  );

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}

/**
 * Hook for pull-down-to-refresh at the top of a scroll container.
 * Returns handlers to spread on the container and a boolean indicating loading state.
 */
export function usePullDownGesture(
  containerRef: React.RefObject<HTMLDivElement | null>,
  handlers: PullDownHandlers,
  isLoading = false,
) {
  const touchRef = useRef<TouchState | null>(null);
  const pullTriggered = useRef(false);

  const onTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      const container = containerRef.current;
      if (!container || container.scrollTop > 5) return;

      const touch = e.touches[0];
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        moved: false,
      };
      pullTriggered.current = false;
    },
    [containerRef],
  );

  const onTouchMove = useCallback(
    (e: ReactTouchEvent) => {
      if (!touchRef.current || pullTriggered.current || isLoading) return;
      const touch = e.touches[0];
      const dy = touch.clientY - touchRef.current.startY;
      const dx = Math.abs(touch.clientX - touchRef.current.startX);

      // Must be primarily vertical
      if (dy > PULL_DOWN_THRESHOLD && dy > dx * 1.5) {
        pullTriggered.current = true;
        handlers.onPullDown?.();
      }
    },
    [handlers, isLoading],
  );

  const onTouchEnd = useCallback(() => {
    touchRef.current = null;
  }, []);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
