import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScrollToBottomProps {
  /** Ref to the scrollable container to monitor and control. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Distance from bottom (px) before the button appears. Default 200. */
  threshold?: number;
  /** Number of new messages that arrived while scrolled up. Shows a badge when > 0. */
  newCount?: number;
  /** Called when the button is clicked, so the parent can clear the count. */
  onClearCount?: () => void;
}

/**
 * Floating Action Button that appears when the user scrolls up to read history.
 * Clicking it smoothly scrolls the container back to the bottom.
 *
 * Classic Telegram / Feishu UX pattern.
 */
export function ScrollToBottom({ containerRef, threshold = 200, newCount, onClearCount }: ScrollToBottomProps) {
  const [visible, setVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const check = () => {
      if (!container.isConnected) return;
      const distance =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      setVisible(distance > threshold);
    };

    const handleScroll = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(check, 80);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    // Check initial state (messages may already be loaded).
    check();

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [containerRef, threshold]);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    setVisible(false);
    onClearCount?.();
  }, [containerRef, onClearCount]);

  const displayCount = newCount && newCount > 99 ? "99+" : newCount;

  return (
    <button
      onClick={scrollToBottom}
      aria-label={newCount ? `Scroll to bottom (${newCount} new messages)` : "Scroll to bottom"}
      className={cn(
        "fixed bottom-24 right-4 z-30 flex h-10 w-10 items-center justify-center",
        "rounded-full bg-card border border-border shadow-lg",
        "hover:bg-accent hover:shadow-xl hover:scale-105",
        "transition-all duration-200 text-muted-foreground hover:text-foreground",
        visible
          ? "opacity-100 scale-100 pointer-events-auto"
          : "opacity-0 scale-75 pointer-events-none",
      )}
    >
      <ChevronDown className="h-5 w-5" />
      {newCount ? (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
          {displayCount}
        </span>
      ) : null}
    </button>
  );
}
