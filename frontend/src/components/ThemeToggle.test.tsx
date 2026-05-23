import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark", "light");
    // Reset matchMedia mock to default behaviour (from test-setup) so each test
    // starts with a fresh, predictable mock.
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );
  });

  it("renders theme toggle button", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("has accessible label with current theme", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", "Theme: light");
  });

  it("cycles through light -> dark -> system -> light on click", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");

    expect(button).toHaveAttribute("aria-label", "Theme: light");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-label", "Theme: dark");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-label", "Theme: system");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-label", "Theme: light");
  });

  it("persists theme choice to localStorage", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");

    fireEvent.click(button); // light -> dark
    expect(localStorage.getItem("tdchat-theme")).toBe("dark");
  });

  it("reads stored theme from localStorage on mount", () => {
    localStorage.setItem("tdchat-theme", "dark");
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", "Theme: dark");
  });

  // ── System colour-scheme listener (line 49-58) ──────────────────

  it("adds dark class when system colour-scheme changes to dark while stored as 'system'", () => {
    localStorage.setItem("tdchat-theme", "system");

    const mql = {
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(window.matchMedia).mockReturnValue(mql as any);

    render(<ThemeToggle />);

    // Extract the "change" handler that the component registered
    const handler = vi
      .mocked(mql.addEventListener)
      .mock.calls.find(([event]) => event === "change")?.[1] as
      | ((e: { matches: boolean }) => void)
      | undefined;

    expect(handler).toBeDefined();

    // Simulate OS switching to dark mode
    document.documentElement.classList.remove("dark");
    handler?.({ matches: true });
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Simulate OS switching back to light mode
    handler?.({ matches: false });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("ignores system colour-scheme changes when stored theme is NOT 'system'", () => {
    localStorage.setItem("tdchat-theme", "dark");

    const mql = {
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(window.matchMedia).mockReturnValue(mql as any);

    render(<ThemeToggle />);

    const handler = vi
      .mocked(mql.addEventListener)
      .mock.calls.find(([event]) => event === "change")?.[1] as
      | ((e: { matches: boolean }) => void)
      | undefined;

    document.documentElement.classList.remove("dark");
    handler?.({ matches: true });
    // Stored theme is "dark", not "system", so classList should be unchanged
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // ── Custom tdchat:theme-changed event (line 62-70) ──────────────

  it("updates theme when receiving a valid tdchat:theme-changed CustomEvent", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", "Theme: light");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("tdchat:theme-changed", { detail: { theme: "dark" } }),
      );
    });
    expect(button).toHaveAttribute("aria-label", "Theme: dark");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("tdchat:theme-changed", { detail: { theme: "system" } }),
      );
    });
    expect(button).toHaveAttribute("aria-label", "Theme: system");
  });

  it("ignores tdchat:theme-changed events with an unrecognised theme value", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");

    window.dispatchEvent(
      new CustomEvent("tdchat:theme-changed", {
        detail: { theme: "invalid" },
      }),
    );
    // Theme should still be the default (light)
    expect(button).toHaveAttribute("aria-label", "Theme: light");
  });

  it("ignores tdchat:theme-changed events that have no detail", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");

    window.dispatchEvent(new CustomEvent("tdchat:theme-changed"));
    expect(button).toHaveAttribute("aria-label", "Theme: light");
  });

  it("removes the custom event listener on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<ThemeToggle />);

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "tdchat:theme-changed",
      expect.any(Function),
    );
  });
});
