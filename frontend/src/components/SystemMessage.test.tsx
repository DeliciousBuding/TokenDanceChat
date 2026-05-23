import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { mockI18n } from "@/test-utils";
import { SystemMessage } from "@/components/SystemMessage";

vi.mock("@/i18n/context", () => ({
  useTranslation: () => mockI18n({
    "system.userJoined": "{{username}} 加入了聊天室",
  }),
}));

vi.mock("@/lib/utils", () => ({
  formatTime: (ts: number) => `2026-05-23 ${new Date(ts).toLocaleTimeString()}`,
}));

describe("SystemMessage", () => {
  it("renders raw text content", () => {
    render(<SystemMessage content="Server restarting..." timestamp={Date.now()} />);
    expect(screen.getByText("Server restarting...")).toBeTruthy();
  });

  it("renders i18n content from JSON", () => {
    const i18nContent = JSON.stringify({ key: "system.userJoined", params: { username: "alice" } });
    render(<SystemMessage content={i18nContent} timestamp={Date.now()} />);
    expect(screen.getByText("alice 加入了聊天室")).toBeTruthy();
  });

  it("renders with role=status", () => {
    render(<SystemMessage content="Test" timestamp={Date.now()} />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("falls back to raw text when JSON is invalid", () => {
    render(<SystemMessage content="{invalid json" timestamp={Date.now()} />);
    expect(screen.getByText("{invalid json")).toBeTruthy();
  });

  it("handles JSON without key property", () => {
    render(<SystemMessage content='{"notKey": "value"}' timestamp={Date.now()} />);
    expect(screen.getByText('{"notKey": "value"}')).toBeTruthy();
  });
});
