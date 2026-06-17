import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar } from "./Avatar";

vi.mock("@/i18n/context", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = { "a11y.online": "在线" };
      return map[key] ?? key;
    },
    lang: "zh-CN" as const,
    setLang: vi.fn(),
  }),
}));

describe("Avatar", () => {
  it("renders with username initial letter", () => {
    render(<Avatar name="TestUser" />);
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  it("renders fallback initial when name is empty", () => {
    render(<Avatar name="" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("renders with image URL when provided", () => {
    render(
      <Avatar name="TestUser" src="https://example.com/avatar.jpg" />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/avatar.jpg");
    expect(img).toHaveAttribute("alt", "TestUser");
  });

  it("shows online status indicator when online", () => {
    render(<Avatar name="TestUser" online />);
    const dot = screen.getByRole("status");
    expect(dot).toHaveAttribute("aria-label", "在线");
  });

  it("does not show online indicator when offline", () => {
    render(<Avatar name="TestUser" online={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not show online indicator when online prop is omitted", () => {
    render(<Avatar name="TestUser" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("applies default size class (md)", () => {
    render(<Avatar name="TestUser" />);
    const initials = screen.getByText("T");
    expect(initials.className).toContain("h-8");
    expect(initials.className).toContain("w-8");
    expect(initials.className).toContain("text-xs");
  });

  it("applies sm size classes", () => {
    render(<Avatar name="TestUser" size="sm" />);
    const initials = screen.getByText("T");
    expect(initials.className).toContain("h-7");
    expect(initials.className).toContain("w-7");
    expect(initials.className).toContain("text-[11px]");
  });

  it("applies lg size classes", () => {
    render(<Avatar name="TestUser" size="lg" />);
    const initials = screen.getByText("T");
    expect(initials.className).toContain("h-12");
    expect(initials.className).toContain("w-12");
    expect(initials.className).toContain("text-lg");
  });

  it("renders with accessible label from name", () => {
    render(<Avatar name="TestUser" />);
    const container = screen.getByLabelText("TestUser");
    expect(container).toBeInTheDocument();
  });

  it("applies tokenized identity background to initials", () => {
    render(<Avatar name="TestUser" />);
    const initials = screen.getByText("T");
    expect(initials.style.background).toContain("var(--chat-identity-avatar)");
    expect(initials.style.getPropertyValue("--chat-identity-hue")).not.toBe("");
  });
});
