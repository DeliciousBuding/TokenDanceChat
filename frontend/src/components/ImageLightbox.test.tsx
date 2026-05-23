import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageLightbox } from "@/components/ImageLightbox";

vi.mock("@/i18n/context", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "a11y.close": "关闭",
        "a11y.zoomIn": "放大",
        "a11y.zoomOut": "缩小",
      };
      return map[key] ?? key;
    },
    lang: "zh-CN" as const,
    setLang: vi.fn(),
  }),
}));

describe("ImageLightbox", () => {
  const testImageUrl = "https://example.com/image.png";

  it("renders when image URL is provided", () => {
    render(<ImageLightbox imageUrl={testImageUrl} onClose={vi.fn()} />);
    // The lightbox container should be in the document
    const img = screen.getByAltText("Full-size image");
    expect(img).toBeTruthy();
  });

  it("renders container even with empty image URL", () => {
    render(<ImageLightbox imageUrl="" onClose={vi.fn()} />);
    // The component always renders its container structure
    const img = screen.getByAltText("Full-size image");
    expect(img).toBeTruthy();
    expect((img as HTMLImageElement).src).toBe("");
  });

  it("shows zoom controls", () => {
    render(<ImageLightbox imageUrl={testImageUrl} onClose={vi.fn()} />);
    expect(screen.getByLabelText("放大")).toBeTruthy();
    expect(screen.getByLabelText("缩小")).toBeTruthy();
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render(<ImageLightbox imageUrl={testImageUrl} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("关闭"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop click calls onClose", () => {
    const onClose = vi.fn();
    render(<ImageLightbox imageUrl={testImageUrl} onClose={onClose} />);
    // The backdrop is the div with bg-black/80 and onClick={onClose}
    const backdrop = document.querySelector(".bg-black\\/80");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows image with correct src", () => {
    render(<ImageLightbox imageUrl={testImageUrl} onClose={vi.fn()} />);
    const img = screen.getByAltText("Full-size image") as HTMLImageElement;
    expect(img.src).toBe(testImageUrl);
  });

  it("zoom in button increases scale", () => {
    render(<ImageLightbox imageUrl={testImageUrl} onClose={vi.fn()} />);
    const img = screen.getByAltText("Full-size image");
    const initialTransform = img.style.transform;

    fireEvent.click(screen.getByLabelText("放大"));
    // After zoom in, the transform should differ from initial
    expect(img.style.transform).not.toBe(initialTransform);
  });
});
