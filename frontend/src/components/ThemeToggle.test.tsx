import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark", "light");
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
});
