import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ScrollToBottom } from "./ScrollToBottom";
import { mockI18n } from "@/test-utils";

vi.mock("@/i18n/context", () => ({
  useTranslation: () => mockI18n(),
}));

/**
 * Creates a scrollable div element attached to the DOM (so isConnected is true)
 * with specified scroll geometry.
 */
function createScrollContainer(
  scrollHeight = 1000,
  scrollTop = 0,
  clientHeight = 500,
): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  Object.defineProperty(div, "scrollHeight", {
    value: scrollHeight,
    configurable: true,
  });
  Object.defineProperty(div, "scrollTop", {
    value: scrollTop,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(div, "clientHeight", {
    value: clientHeight,
    configurable: true,
  });
  div.scrollTo = vi.fn();
  return div;
}

describe("ScrollToBottom", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // ── Visibility ─────────────────────────────────────────────────────

  it("is hidden when near bottom (distance <= default threshold 200)", () => {
    // scrollHeight 500, scrollTop 300, clientHeight 200 → distance 0
    const container = createScrollContainer(500, 300, 200);
    render(<ScrollToBottom containerRef={{ current: container }} />);

    const btn = screen.getByRole("button");
    expect(btn.className).toContain("opacity-0");
    expect(btn.className).toContain("pointer-events-none");
  });

  it("is visible when scrolled up (distance > default threshold 200)", () => {
    // scrollHeight 1000, scrollTop 0, clientHeight 500 → distance 500
    const container = createScrollContainer(1000, 0, 500);
    render(<ScrollToBottom containerRef={{ current: container }} />);

    const btn = screen.getByRole("button");
    expect(btn.className).toContain("opacity-100");
    expect(btn.className).not.toContain("opacity-0");
  });

  it("respects a custom threshold", () => {
    // distance = 300, threshold = 400 → hidden
    const container = createScrollContainer(1000, 200, 500);
    render(
      <ScrollToBottom containerRef={{ current: container }} threshold={400} />,
    );

    expect(screen.getByRole("button").className).toContain("opacity-0");
  });

  it("becomes visible after a scroll event moves the user up", () => {
    vi.useFakeTimers();
    // Start near bottom (distance 0 -> hidden)
    const container = createScrollContainer(500, 300, 200);
    render(<ScrollToBottom containerRef={{ current: container }} />);
    expect(screen.getByRole("button").className).toContain("opacity-0");

    // Simulate scrolling up by changing scrollTop (writable=true allows direct assignment)
    container.scrollTop = 0;
    act(() => {
      fireEvent.scroll(container);
      vi.advanceTimersByTime(80); // debounce
    });

    expect(screen.getByRole("button").className).toContain("opacity-100");
    vi.useRealTimers();
  });

  // ── Scroll action ──────────────────────────────────────────────────

  it("scrolls the container to bottom on click", () => {
    const container = createScrollContainer(1000, 0, 500);
    render(<ScrollToBottom containerRef={{ current: container }} />);

    fireEvent.click(screen.getByRole("button"));

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: "smooth",
    });
  });

  it("hides itself after click (via setVisible(false))", () => {
    const container = createScrollContainer(1000, 0, 500);
    render(<ScrollToBottom containerRef={{ current: container }} />);
    expect(screen.getByRole("button").className).toContain("opacity-100");

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").className).toContain("opacity-0");
  });

  it("calls onClearCount on click when provided", () => {
    const container = createScrollContainer(1000, 0, 500);
    const onClearCount = vi.fn();
    render(
      <ScrollToBottom
        containerRef={{ current: container }}
        newCount={5}
        onClearCount={onClearCount}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onClearCount).toHaveBeenCalledTimes(1);
  });

  it("does not throw when onClearCount is not provided", () => {
    const container = createScrollContainer(1000, 0, 500);
    render(
      <ScrollToBottom containerRef={{ current: container }} newCount={5} />,
    );

    expect(() =>
      fireEvent.click(screen.getByRole("button")),
    ).not.toThrow();
  });

  // ── Badge (newCount) ───────────────────────────────────────────────

  it("shows badge with the new message count", () => {
    const container = createScrollContainer(1000, 0, 500);
    render(
      <ScrollToBottom containerRef={{ current: container }} newCount={5} />,
    );

    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows '99+' when count exceeds 99", () => {
    const container = createScrollContainer(1000, 0, 500);
    render(
      <ScrollToBottom containerRef={{ current: container }} newCount={100} />,
    );

    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("shows '99+' for count much larger than 99", () => {
    const container = createScrollContainer(1000, 0, 500);
    render(
      <ScrollToBottom containerRef={{ current: container }} newCount={999} />,
    );

    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("does not render a badge when newCount is 0 (falsy)", () => {
    const container = createScrollContainer(1000, 0, 500);
    render(
      <ScrollToBottom containerRef={{ current: container }} newCount={0} />,
    );

    const button = screen.getByRole("button");
    expect(button.querySelector("span")).toBeNull();
  });

  it("does not render a badge when newCount is undefined", () => {
    const container = createScrollContainer(1000, 0, 500);
    render(<ScrollToBottom containerRef={{ current: container }} />);

    const button = screen.getByRole("button");
    expect(button.querySelector("span")).toBeNull();
  });

  // ── Accessibility ──────────────────────────────────────────────────

  it("sets aria-label with scroll-to-bottom text", () => {
    const container = createScrollContainer(1000, 0, 500);
    render(<ScrollToBottom containerRef={{ current: container }} />);

    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "回到底部",
    );
  });

  it("includes newCount in aria-label when badge is shown", () => {
    const container = createScrollContainer(1000, 0, 500);
    render(
      <ScrollToBottom containerRef={{ current: container }} newCount={3} />,
    );

    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "回到底部 (3)",
    );
  });

  // ── Cleanup ────────────────────────────────────────────────────────

  it("removes the scroll listener on unmount", () => {
    const container = createScrollContainer(1000, 0, 500);
    const spy = vi.spyOn(container, "removeEventListener");

    const { unmount } = render(
      <ScrollToBottom containerRef={{ current: container }} />,
    );
    unmount();

    expect(spy).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("clears the debounce timer on unmount", () => {
    vi.useFakeTimers();
    const container = createScrollContainer(1000, 0, 500);
    // Spy before rendering so the component sees the spy
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = render(
      <ScrollToBottom containerRef={{ current: container }} />,
    );

    // Fire a scroll event to populate the debounce ref
    fireEvent.scroll(container);
    // At this point debounceRef.current is a timer ID from setTimeout

    unmount();
    // Cleanup should clear the debounce timeout
    expect(clearTimeoutSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
