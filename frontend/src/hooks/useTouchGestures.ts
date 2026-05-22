import { useRef, useCallback, useState, type TouchEvent as ReactTouchEvent } from "react";

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

// ─── Swipeable message hook (Telegram-style swipe-to-reveal actions) ───

export interface SwipeableMessageHandlers {
  onReply?: () => void;
  onCopy?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
  isOwn?: boolean;
  disabled?: boolean;
}

const ACTION_WIDTH = 180; // px — max reveal width for action buttons
const SWIPE_ACTIVATE_THRESHOLD = 10; // px — minimum dx before activating horizontal swipe
const SWIPE_SNAP_THRESHOLD = 0.4; // ratio — snap to open if past this fraction of ACTION_WIDTH

export function useSwipeableMessage(handlers: SwipeableMessageHandlers) {
  const [translateX, setTranslateX] = useState(0);
  const [showActions, setShowActions] = useState(false);
  const touchRef = useRef({
    startX: 0,
    startY: 0,
    prevTranslateX: 0,
    active: false,
    swipeActive: false,
  });

  const onTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      if (handlers.disabled) return;
      const touch = e.touches[0];
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        prevTranslateX: translateX,
        active: true,
        swipeActive: false,
      };
    },
    [handlers.disabled, translateX],
  );

  const onTouchMove = useCallback(
    (e: ReactTouchEvent) => {
      if (!touchRef.current.active) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchRef.current.startX;
      const dy = touch.clientY - touchRef.current.startY;

      if (!touchRef.current.swipeActive) {
        // Determine gesture direction
        if (Math.abs(dx) > SWIPE_ACTIVATE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          touchRef.current.swipeActive = true;
        } else if (Math.abs(dy) > SWIPE_ACTIVATE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
          // Vertical scroll — deactivate, let parent scroll
          touchRef.current.active = false;
          return;
        } else {
          return; // Still undetermined
        }
      }

      // Horizontal swipe active: translate the element
      const rawX = touchRef.current.prevTranslateX + dx;
      const clamped = Math.max(-ACTION_WIDTH, Math.min(0, rawX));
      setTranslateX(clamped);
    },
    [],
  );

  const onTouchEnd = useCallback(() => {
    if (!touchRef.current.active || !touchRef.current.swipeActive) {
      touchRef.current.active = false;
      touchRef.current.swipeActive = false;
      return;
    }
    touchRef.current.active = false;
    touchRef.current.swipeActive = false;

    const shouldSnap = Math.abs(translateX) > ACTION_WIDTH * SWIPE_SNAP_THRESHOLD;
    const targetX = shouldSnap ? -ACTION_WIDTH : 0;

    setTranslateX(targetX);
    setShowActions(targetX !== 0);
  }, [translateX]);

  const closeActions = useCallback(() => {
    setTranslateX(0);
    setShowActions(false);
  }, []);

  return {
    translateX,
    showActions,
    actionWidth: ACTION_WIDTH,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    closeActions,
  };
}
