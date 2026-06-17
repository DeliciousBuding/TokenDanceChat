import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { mockI18n } from "@/test-utils";
import type { SearchResult } from "@/lib/api";

// ---- Mocks (module-level, hoisted by vitest) ----

const mockSearchMessages = vi.fn();

vi.mock("@/lib/api", () => ({
  chatAPI: { searchMessages: (...args: unknown[]) => mockSearchMessages(...args) },
}));

vi.mock("@/i18n/context", () => ({
  useTranslation: () => mockI18n({
    "search.placeholder": "搜索消息...",
    "search.typeToSearch": "输入关键词搜索消息",
    "search.notFound": "未找到消息",
    "search.notFoundInConversation": "此对话中无消息",
    "search.searchError": "搜索出错，请重试",
    "search.toggleSearch": "切换搜索",
  }),
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

const mockResult: SearchResult = {
  id: "msg-1",
  username: "alice",
  content: "Hello world",
  timestamp: Date.now(),
  snippet: "Hello <mark>world</mark>",
  rank: 1,
};

/** Render SearchBar and open it via Ctrl+K. Returns the render result. */
function openSearchBar() {
  const result = render(<SearchBar />);
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  return result;
}

describe("SearchBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchMessages.mockResolvedValue([]);
  });

  // ---- Existing tests (preserved and slightly hardened) ----

  it("renders nothing when closed", () => {
    const { container } = render(<SearchBar />);
    expect(container.innerHTML).toBe("");
  });

  it("opens on Ctrl+K and shows search input", () => {
    render(<SearchBar />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    // Input with search placeholder should be visible
    expect(screen.getByPlaceholderText("搜索消息...")).toBeTruthy();
  });

  it("closes on Escape", () => {
    const { container } = render(<SearchBar />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Escape" });

    expect(container.innerHTML).toBe("");
  });

  it("shows type-to-search hint when open with empty query", () => {
    render(<SearchBar />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(screen.getByText("输入关键词搜索消息")).toBeTruthy();
  });

  // ---- New tests ----

  it("displays Ctrl+K shortcut badge in footer", () => {
    openSearchBar();

    expect(screen.getByText("Ctrl+K")).toBeTruthy();
    expect(screen.getByText("切换搜索")).toBeTruthy();
  });

  it("input accepts text", () => {
    openSearchBar();

    const input = screen.getByPlaceholderText("搜索消息...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello world" } });

    expect(input.value).toBe("hello world");
  });

  it("closes on backdrop click", async () => {
    openSearchBar();

    // Backdrop is the semi-transparent overlay
    const backdrop = document.querySelector(".td-chat-backdrop")!;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("搜索消息...")).toBeNull();
    });
  });

  it("clears query on first Escape, closes on second Escape", async () => {
    openSearchBar();

    const input = screen.getByPlaceholderText("搜索消息...");
    fireEvent.change(input, { target: { value: "hello" } });

    // First Escape clears query
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("搜索消息...")).toBeTruthy();
    });

    // Second Escape closes
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("搜索消息...")).toBeNull();
    });
  });

  it("shows clear button when query is entered", async () => {
    openSearchBar();

    const input = screen.getByPlaceholderText("搜索消息...");
    fireEvent.change(input, { target: { value: "test" } });

    // Debounced search sets loading=true; wait for it to resolve so the
    // clear button (which only renders when !loading && query) appears.
    const clearBtn = await screen.findByLabelText("Clear search", {}, { timeout: 3000 });
    expect(clearBtn).toBeTruthy();
  });

  it("clears query when clear button clicked", async () => {
    openSearchBar();

    const input = screen.getByPlaceholderText("搜索消息...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "test" } });

    // Wait for debounced search to finish so Clear button is visible
    const clearBtn = await screen.findByLabelText("Clear search", {}, { timeout: 3000 });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect((screen.getByPlaceholderText("搜索消息...") as HTMLInputElement).value).toBe("");
    });
  });

  it("shows loading indicator while searching", async () => {
    // Never resolve to keep loading state visible
    mockSearchMessages.mockReturnValue(new Promise(() => {}));
    openSearchBar();

    const input = screen.getByPlaceholderText("搜索消息...");
    fireEvent.change(input, { target: { value: "loading test" } });

    await waitFor(() => {
      const spinners = document.querySelectorAll(".animate-spin");
      expect(spinners.length).toBeGreaterThan(0);
    });
  });

  it("displays search results", async () => {
    mockSearchMessages.mockResolvedValue([mockResult]);
    openSearchBar();

    fireEvent.change(screen.getByPlaceholderText("搜索消息..."), {
      target: { value: "hello" },
    });

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeTruthy();
    });

    // Highlighted snippet piece
    expect(screen.getByText("world")).toBeTruthy();
  });

  it("shows not-found message when no results", async () => {
    mockSearchMessages.mockResolvedValue([]);
    openSearchBar();

    fireEvent.change(screen.getByPlaceholderText("搜索消息..."), {
      target: { value: "nonexistent" },
    });

    await waitFor(() => {
      expect(screen.getByText("未找到消息")).toBeTruthy();
    });
  });

  it("shows error message when search fails", async () => {
    mockSearchMessages.mockRejectedValue(new Error("Network error"));
    openSearchBar();

    fireEvent.change(screen.getByPlaceholderText("搜索消息..."), {
      target: { value: "error" },
    });

    await waitFor(() => {
      expect(screen.getByText("搜索出错，请重试")).toBeTruthy();
    });
  });

  it("toggles closed on second Ctrl+K", async () => {
    const { container } = render(<SearchBar />);

    // Open
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByPlaceholderText("搜索消息...")).toBeTruthy();

    // Close
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });
});
