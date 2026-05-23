import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { mockI18n } from "@/test-utils";

vi.mock("@/lib/api", () => ({
  chatAPI: { searchMessages: vi.fn() },
}));

vi.mock("@/i18n/context", () => ({
  useTranslation: () => mockI18n(),
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: (selector?: (s: unknown) => unknown) => {
    const state = {
      currentChat: { type: "public" as const },
      messages: [],
      username: "testuser",
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(" "),
}));

import { SearchBar } from "@/components/SearchBar";

describe("SearchBar", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<SearchBar currentRoomID="room-1" />);
    expect(container.innerHTML).toBe("");
  });

  it("opens on Ctrl+K and shows search input", () => {
    render(<SearchBar currentRoomID="room-1" />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    // Should now show the search panel with placeholder
    const input = document.querySelector('input[placeholder*="搜索"]');
    expect(input).toBeTruthy();
  });

  it("closes on Escape", () => {
    const { container } = render(<SearchBar currentRoomID="room-1" />);
    // Open first
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    // Now close with Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.innerHTML).toBe("");
  });

  it("shows type-to-search hint when open with empty query", () => {
    render(<SearchBar currentRoomID="room-1" />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    // The "type to search" hint should be visible
    const hint = document.querySelector(".text-center");
    expect(hint).toBeTruthy();
  });
});
