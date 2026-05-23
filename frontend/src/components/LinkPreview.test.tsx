import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LinkPreview, MessageLinkPreviews } from "./LinkPreview";
import type { LinkPreviewData } from "@/lib/api";

const mockFetchLinkPreview = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  chatAPI: {
    fetchLinkPreview: mockFetchLinkPreview,
  },
}));

describe("LinkPreview", () => {
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
});

describe("MessageLinkPreviews", () => {
  it("renders nothing when no URLs present in content", () => {
    const { container } = render(
      <MessageLinkPreviews content="Hello world, no links here!" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("does not render for invalid or malformed URLs", () => {
    // Regex requires http(s):// with at least one char; both are filtered out
    const { container } = render(
      <MessageLinkPreviews content="Check htp://typo and https://" />,
    );
    expect(container.innerHTML).toBe("");
  });
});
