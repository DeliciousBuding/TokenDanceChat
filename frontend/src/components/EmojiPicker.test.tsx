import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { mockI18n } from "@/test-utils";
import type { CustomEmoji } from "@/lib/api";

// ---- Mocks (module-level, hoisted by vitest) ----

const mockSendCustomEmojiList = vi.fn();
const mockUploadEmoji = vi.fn();
const mockSendCustomEmojiAdd = vi.fn();
const mockSendCustomEmojiDelete = vi.fn();

vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendCustomEmojiList: (...args: unknown[]) => mockSendCustomEmojiList(...args),
    uploadEmoji: (...args: unknown[]) => mockUploadEmoji(...args),
    sendCustomEmojiAdd: (...args: unknown[]) => mockSendCustomEmojiAdd(...args),
    sendCustomEmojiDelete: (...args: unknown[]) => mockSendCustomEmojiDelete(...args),
  },
}));

vi.mock("@/i18n/context", () => ({
  useTranslation: () => mockI18n({
    "emoji.search": "搜索表情...",
    "emoji.recent": "最近使用",
    "emoji.noResults": "未找到表情",
    "emoji.smileys": "表情",
    "emoji.gestures": "手势",
    "emoji.hearts": "爱心",
    "emoji.objects": "物品",
    "emoji.misc": "其他",
    "emoji.custom": "自定义表情",
    "emoji.uploadEmoji": "上传表情",
    "emoji.deleteEmoji": "删除表情",
    "emoji.noCustomEmoji": "暂无自定义表情",
  }),
}));

// Mutable store state so individual tests can set customEmojis
const storeState: { customEmojis: CustomEmoji[]; username: string } = {
  customEmojis: [],
  username: "testuser",
};

vi.mock("@/stores/chatStore", () => ({
  useChatStore: (selector?: (s: unknown) => unknown) => {
    return selector ? selector(storeState) : storeState;
  },
}));

// localStorage mock (used by getRecents / saveRecents inside EmojiPicker)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// ---- Import after all mocks ----
import { EmojiPicker } from "@/components/EmojiPicker";

describe("EmojiPicker", () => {
  beforeEach(() => {
    localStorageMock.clear();
    storeState.customEmojis = [];
    storeState.username = "testuser";
    vi.clearAllMocks();
  });

  it("renders emoji grid with default Smileys category", () => {
    render(<EmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    // Default category tab visible as active (zh-CN: "表情" = Smileys)
    expect(screen.getByText("表情")).toBeTruthy();
    // Emoji grid shows first few Smileys
    expect(screen.getByText("😀")).toBeTruthy();
    expect(screen.getByText("😂")).toBeTruthy();
    expect(screen.getByText("😃")).toBeTruthy();
  });

  it("renders all six category tabs", () => {
    render(<EmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText("表情")).toBeTruthy();
    expect(screen.getByText("手势")).toBeTruthy();
    expect(screen.getByText("爱心")).toBeTruthy();
    expect(screen.getByText("物品")).toBeTruthy();
    expect(screen.getByText("其他")).toBeTruthy();
    expect(screen.getByText("自定义表情")).toBeTruthy();
  });

  it("clicking emoji calls onSelect with emoji and onClose", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<EmojiPicker onSelect={onSelect} onClose={onClose} />);

    fireEvent.click(screen.getByText("😀"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("😀");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switching to Hearts category shows heart emojis", async () => {
    render(<EmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    // Click the Hearts tab
    fireEvent.click(screen.getByText("爱心"));

    await waitFor(() => {
      // Hearts category should now show heart emojis
      expect(screen.getByText("❤️")).toBeTruthy();
      expect(screen.getByText("💕")).toBeTruthy();
    });
  });

  it("search hides category tabs and shows filtered emojis", async () => {
    render(<EmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    // Category tabs visible before search
    expect(screen.getByText("手势")).toBeTruthy();

    // Type to filter
    const input = screen.getByPlaceholderText("搜索表情...");
    fireEvent.change(input, { target: { value: "😀" } });

    // Category tabs hidden
    await waitFor(() => {
      expect(screen.queryByText("手势")).toBeNull();
    });

    // Matching emoji still shown
    expect(screen.getByText("😀")).toBeTruthy();
  });

  it("shows no-results message when search has no matches", async () => {
    render(<EmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText("搜索表情...");
    fireEvent.change(input, { target: { value: "xyznonexistent" } });

    await waitFor(() => {
      expect(screen.getByText("未找到表情")).toBeTruthy();
    });
  });

  it("clears search and restores category tabs when input emptied", async () => {
    render(<EmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText("搜索表情...");
    fireEvent.change(input, { target: { value: "😀" } });

    await waitFor(() => {
      expect(screen.queryByText("手势")).toBeNull();
    });

    // Clear search
    fireEvent.change(input, { target: { value: "" } });

    await waitFor(() => {
      expect(screen.getByText("手势")).toBeTruthy();
    });
  });

  it("calls onClose when clicking backdrop", () => {
    const onClose = vi.fn();
    render(<EmojiPicker onSelect={vi.fn()} onClose={onClose} />);

    const card = document.querySelector(".animate-scale-in")!;
    const backdrop = card.parentElement!;
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(<EmojiPicker onSelect={vi.fn()} onClose={onClose} />);

    const card = document.querySelector(".animate-scale-in")!;
    const backdrop = card.parentElement!;
    fireEvent.keyDown(backdrop, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls sendCustomEmojiList on mount", () => {
    render(<EmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(mockSendCustomEmojiList).toHaveBeenCalledTimes(1);
  });

  // ---- New tests: search, category tabs, recents ----

  it("search filters across all categories and excludes non-matching emojis", async () => {
    render(<EmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText("搜索表情...");
    fireEvent.change(input, { target: { value: "😂" } });

    await waitFor(() => {
      // 😂 should be present (it matches the search term)
      expect(screen.getByText("😂")).toBeTruthy();
      // A Smileys emoji that does NOT contain 😂 should be absent
      expect(screen.queryByText("😀")).toBeNull();
    });
  });

  it("switching to Objects category shows object emojis and hides smileys", async () => {
    render(<EmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("物品"));

    await waitFor(() => {
      expect(screen.getByText("🎉")).toBeTruthy();
      expect(screen.getByText("🔥")).toBeTruthy();
      // A smiley from the previous category should not appear
      expect(screen.queryByText("😀")).toBeNull();
    });
  });

  it("shows recently used section when localStorage has recents", () => {
    localStorage.setItem(
      "tdchat:recent-emojis",
      JSON.stringify(["🔥", "❤️", "💀"]),
    );

    render(<EmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    // Section label visible
    expect(screen.getByText("最近使用")).toBeTruthy();
    // Recent emojis rendered as buttons
    expect(screen.getByText("🔥")).toBeTruthy();
    expect(screen.getByText("❤️")).toBeTruthy();
    expect(screen.getByText("💀")).toBeTruthy();
  });

  it("clicking a recent emoji calls onSelect with the emoji and closes", () => {
    localStorage.setItem(
      "tdchat:recent-emojis",
      JSON.stringify(["🔥", "❤️"]),
    );

    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<EmojiPicker onSelect={onSelect} onClose={onClose} />);

    fireEvent.click(screen.getByText("🔥"));

    expect(onSelect).toHaveBeenCalledWith("🔥");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
