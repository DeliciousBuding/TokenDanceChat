import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LinkPreview, MessageLinkPreviews, extractURLs } from "./LinkPreview";
import type { LinkPreviewData } from "@/lib/api";

const mockFetchLinkPreview = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  chatAPI: {
    fetchLinkPreview: mockFetchLinkPreview,
  },
}));

describe("LinkPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("renders URL metadata (title, description, image) on success", async () => {
    const data: LinkPreviewData = {
      title: "Example Title",
      description: "A great description",
      image: "https://example.com/img.jpg",
      url: "https://example.com",
      site_name: "Example Site",
    };
    mockFetchLinkPreview.mockResolvedValue(data);

    render(<LinkPreview url="https://example.com" />);

    await waitFor(() => {
      expect(screen.getByText("Example Title")).toBeInTheDocument();
    });
    expect(screen.getByText("A great description")).toBeInTheDocument();
    expect(screen.getByText("Example Site")).toBeInTheDocument();

    const img = document.querySelector("img");
    expect(img).toHaveAttribute("src", "https://example.com/img.jpg");
  });

  it("handles missing image gracefully", async () => {
    const data: LinkPreviewData = {
      title: "No Image",
      description: "Description here",
      image: "",
      url: "https://example.com",
    };
    mockFetchLinkPreview.mockResolvedValue(data);

    render(<LinkPreview url="https://example.com" />);

    await waitFor(() => {
      expect(screen.getByText("No Image")).toBeInTheDocument();
    });
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows error state with domain when fetch fails", async () => {
    mockFetchLinkPreview.mockRejectedValue(new Error("Network error"));

    render(<LinkPreview url="https://broken.example" />);

    await waitFor(() => {
      expect(screen.getByText("broken.example")).toBeInTheDocument();
    });
  });

  it("renders nothing when the API returns empty data", async () => {
    mockFetchLinkPreview.mockResolvedValue({
      title: "",
      description: "",
      image: "",
      url: "https://empty.example",
    });

    const { container } = render(<LinkPreview url="https://empty.example" />);

    await waitFor(() => {
      expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
    });
    expect(container.innerHTML).toBe("");
  });

  it("returns null for messages older than 5 minutes", () => {
    const oldTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
    const { container } = render(
      <LinkPreview url="https://example.com" messageTimestamp={oldTimestamp} />,
    );

    expect(container.innerHTML).toBe("");
    expect(mockFetchLinkPreview).not.toHaveBeenCalled();
  });

  it("shows domain fallback when site_name is missing", async () => {
    const data: LinkPreviewData = {
      title: "Has Title",
      description: "Has Desc",
      image: "",
      url: "https://no-site.example/path",
    };
    mockFetchLinkPreview.mockResolvedValue(data);

    render(<LinkPreview url="https://no-site.example/path" />);

    await waitFor(() => {
      expect(screen.getByText("no-site.example")).toBeInTheDocument();
    });
  });

  it("shows Globe icon instead of image when image URL is empty", async () => {
    const data: LinkPreviewData = {
      title: "Title",
      description: "",
      image: "",
      url: "https://example.com",
    };
    mockFetchLinkPreview.mockResolvedValue(data);

    const { container } = render(<LinkPreview url="https://example.com" />);

    await waitFor(() => {
      expect(screen.getByText("Title")).toBeInTheDocument();
    });
    // Should render a Globe icon (no img element)
    expect(container.querySelector("img")).toBeNull();
    const globeIcons = container.querySelectorAll(".lucide-globe");
    expect(globeIcons.length).toBeGreaterThan(0);
  });

  it("shows error state when fetch returns null/falsy", async () => {
    mockFetchLinkPreview.mockResolvedValue(null);

    render(<LinkPreview url="https://null-result.example" />);

    await waitFor(() => {
      expect(screen.getByText("null-result.example")).toBeInTheDocument();
    });
  });
});

describe("extractURLs", () => {
  it("returns empty array for text with no URLs", () => {
    expect(extractURLs("Hello world")).toEqual([]);
    expect(extractURLs("")).toEqual([]);
  });

  it("extracts an HTTP URL from text", () => {
    const urls = extractURLs("Check out https://example.com/page");
    expect(urls).toEqual(["https://example.com/page"]);
  });

  it("filters out image and audio extensions", () => {
    expect(extractURLs("https://example.com/photo.png")).toEqual([]);
    expect(extractURLs("https://example.com/sound.mp3")).toEqual([]);
    expect(extractURLs("https://example.com/video.webm")).toEqual([]);
  });

  it("deduplicates identical URLs", () => {
    const urls = extractURLs("https://example.com and https://example.com");
    expect(urls).toEqual(["https://example.com"]);
  });

  it("filters out non-HTTP(S) protocols", () => {
    expect(extractURLs("ftp://example.com/file")).toEqual([]);
    expect(extractURLs("ws://example.com/socket")).toEqual([]);
  });

  it("cleans trailing punctuation from URLs", () => {
    const urls = extractURLs("Visit https://example.com.");
    expect(urls).toEqual(["https://example.com"]);
  });

  it("returns at most one URL (first valid only)", () => {
    const urls = extractURLs(
      "https://first.com and https://second.com",
    );
    expect(urls).toEqual(["https://first.com"]);
  });
});

describe("MessageLinkPreviews", () => {
  it("renders nothing when no URLs present in content", () => {
    const { container } = render(
      <MessageLinkPreviews content="Hello world, no links here!" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("does not render for invalid or malformed URLs", () => {
    const { container } = render(
      <MessageLinkPreviews content="Check htp://typo and https://" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders LinkPreview for valid URL in content", async () => {
    const data: LinkPreviewData = {
      title: "Preview Title",
      description: "Preview Desc",
      image: "",
      url: "https://valid.example",
    };
    mockFetchLinkPreview.mockResolvedValue(data);

    render(<MessageLinkPreviews content="See https://valid.example for details" />);

    await waitFor(() => {
      expect(screen.getByText("Preview Title")).toBeInTheDocument();
    });
  });
});
