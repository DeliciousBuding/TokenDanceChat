import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GifPicker } from "@/components/GifPicker";
import { mockI18n } from "@/test-utils";

vi.mock("@/i18n/context", () => ({
  useTranslation: () =>
    mockI18n({
      "gif.searchGifs": "Search GIFs",
      "a11y.close": "Close",
      "gif.gifs": "GIFs",
      "gif.stickers": "Stickers",
      "gif.trending": "Trending",
      "gif.noResults": "No results found",
      "gif.poweredBy": "Powered by GIPHY",
    }),
}));

const mockTrendingItems = [
  {
    id: "gif-1",
    url: "https://media.giphy.com/gif1.gif",
    preview_url: "https://media.giphy.com/gif1_small.gif",
    title: "Trending GIF 1",
  },
  {
    id: "gif-2",
    url: "https://media.giphy.com/gif2.gif",
    preview_url: "https://media.giphy.com/gif2_small.gif",
    title: "Trending GIF 2",
  },
  {
    id: "gif-3",
    url: "https://media.giphy.com/gif3.gif",
    preview_url: "https://media.giphy.com/gif3_small.gif",
    title: "Trending GIF 3",
  },
];

const mockSearchItems = [
  {
    id: "search-1",
    url: "https://media.giphy.com/cat1.gif",
    preview_url: "https://media.giphy.com/cat1_small.gif",
    title: "Cat GIF 1",
  },
];

function mockFetchResponse(items: typeof mockTrendingItems) {
  return Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        data: items,
        pagination: { total_count: items.length, count: items.length, offset: 0 },
      }),
  });
}

function renderGifPicker(onSelect?: ReturnType<typeof vi.fn>, onClose?: ReturnType<typeof vi.fn>) {
  const selectFn = onSelect ?? vi.fn();
  const closeFn = onClose ?? vi.fn();
  const result = render(<GifPicker onSelect={selectFn} onClose={closeFn} />);
  return { ...result, onSelect: selectFn, onClose: closeFn };
}

describe("GifPicker", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
    // Default: return trending items for any fetch
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/giphy/search")) {
        return mockFetchResponse(mockSearchItems);
      }
      return mockFetchResponse(mockTrendingItems);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders search input with placeholder", () => {
    renderGifPicker();
    const input = screen.getByPlaceholderText("Search GIFs");
    expect(input).toBeTruthy();
    expect(input.getAttribute("aria-label")).toBe("Search GIFs");
  });

  it("renders trending GIFs section on mount (empty search)", async () => {
    renderGifPicker();

    await waitFor(() => {
      // Trending label should be visible when search is empty
      expect(screen.getByText("Trending")).toBeTruthy();
    });

    // GIF items should render as images
    await waitFor(() => {
      const images = screen.getAllByRole("img");
      expect(images.length).toBe(mockTrendingItems.length);
    });
  });

  it("search input accepts text and triggers search", async () => {
    renderGifPicker();
    const input = screen.getByPlaceholderText("Search GIFs");

    fireEvent.change(input, { target: { value: "cat" } });
    expect((input as HTMLInputElement).value).toBe("cat");

    // After debounce and fetch, search results should appear
    await waitFor(
      () => {
        const images = screen.getAllByRole("img");
        // Should show search results (1 item from mockSearchItems)
        expect(images.length).toBe(mockSearchItems.length);
      },
      { timeout: 2000 },
    );
  });

  it("close button calls onClose", () => {
    const { onClose } = renderGifPicker();
    const closeBtn = screen.getByLabelText("Close");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking a GIF calls onSelect with correct markdown", async () => {
    const { onSelect } = renderGifPicker();

    await waitFor(() => {
      expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
    });

    const firstGifButton = screen.getAllByRole("img")[0].closest("button")!;
    fireEvent.click(firstGifButton);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      `![gif](https://media.giphy.com/gif1.gif)`,
    );
  });

  it("shows stickers tab and switches between GIFs and stickers", async () => {
    renderGifPicker();

    // Both tabs should be present
    const gifsTab = screen.getByText("GIFs");
    const stickersTab = screen.getByText("Stickers");
    expect(gifsTab).toBeTruthy();
    expect(stickersTab).toBeTruthy();

    // Click stickers tab
    fireEvent.click(stickersTab);

    // After switching tabs, the component should re-fetch (trending stickers)
    await waitFor(() => {
      const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const stickerCall = fetchCalls.find(
        (call: string[]) => typeof call[0] === "string" && call[0].includes("type=sticker"),
      );
      expect(stickerCall).toBeTruthy();
    });
  });

  it("handles empty search results", async () => {
    // Override fetch to return empty data
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [],
          pagination: { total_count: 0, count: 0, offset: 0 },
        }),
    }) as unknown as typeof fetch;

    renderGifPicker();
    const input = screen.getByPlaceholderText("Search GIFs");
    fireEvent.change(input, { target: { value: "xyznonexistent" } });

    await waitFor(
      () => {
        expect(screen.getByText("No results found")).toBeTruthy();
      },
      { timeout: 2000 },
    );
  });

  it("closes when clicking backdrop overlay", () => {
    const { onClose } = renderGifPicker();
    // The outer fixed container with onClick backdrop logic
    const backdrop = document.querySelector(".fixed.inset-0");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
