import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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

  it("zoom out button decreases scale", () => {
    render(<ImageLightbox imageUrl={testImageUrl} onClose={vi.fn()} />);
    const img = screen.getByAltText("Full-size image");

    // Zoom in first so we can observe a decrease
    fireEvent.click(screen.getByLabelText("放大"));
    const afterZoomIn = img.style.transform;

    fireEvent.click(screen.getByLabelText("缩小"));
    expect(img.style.transform).not.toBe(afterZoomIn);
    // After zooming out, scale should be less than after zoom-in
    expect(img.style.transform).toContain("scale(1)");
  });

  it("closes on Escape key press", () => {
    const onClose = vi.fn();
    render(<ImageLightbox imageUrl={testImageUrl} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when pressing a non-Escape key", () => {
    const onClose = vi.fn();
    render(<ImageLightbox imageUrl={testImageUrl} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("zooms in on wheel scroll up (deltaY < 0)", () => {
    render(<ImageLightbox imageUrl={testImageUrl} onClose={vi.fn()} />);
    const img = screen.getByAltText("Full-size image");
    const wrapper = img.parentElement!;

    const initialScale = img.style.transform || "scale(1)";

    act(() => {
      wrapper.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }),
      );
    });

    // Scale should have increased from 1 to ~1.15
    expect(img.style.transform).not.toBe(initialScale);
    expect(img.style.transform).toContain("scale(");
  });

  it("zooms out on wheel scroll down (deltaY > 0)", () => {
    render(<ImageLightbox imageUrl={testImageUrl} onClose={vi.fn()} />);
    const img = screen.getByAltText("Full-size image");

    // Zoom in first so there's room to zoom out
    act(() => {
      const wrapper = img.parentElement!;
      wrapper.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }),
      );
    });
    const afterZoomIn = img.style.transform;

    act(() => {
      const wrapper = img.parentElement!;
      wrapper.dispatchEvent(
        new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }),
      );
    });

    // Scale should have decreased
    expect(img.style.transform).not.toBe(afterZoomIn);
  });

  it("clamps scale at minimum 0.5 on repeated zoom out", () => {
    render(<ImageLightbox imageUrl={testImageUrl} onClose={vi.fn()} />);
    const img = screen.getByAltText("Full-size image");
    const wrapper = img.parentElement!;

    // Zoom out many times — should not go below 0.5
    act(() => {
      for (let i = 0; i < 20; i++) {
        wrapper.dispatchEvent(
          new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }),
        );
      }
    });

    expect(img.style.transform).toContain("scale(0.5)");
  });

  it("clamps scale at maximum 3 on repeated zoom in", () => {
    render(<ImageLightbox imageUrl={testImageUrl} onClose={vi.fn()} />);
    const img = screen.getByAltText("Full-size image");
    const wrapper = img.parentElement!;

    // Zoom in many times — should not exceed 3
    act(() => {
      for (let i = 0; i < 20; i++) {
        wrapper.dispatchEvent(
          new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }),
        );
      }
    });

    expect(img.style.transform).toContain("scale(3)");
  });

  it("clicking the image does NOT close the lightbox (stopPropagation)", () => {
    const onClose = vi.fn();
    render(<ImageLightbox imageUrl={testImageUrl} onClose={onClose} />);
    const img = screen.getByAltText("Full-size image");

    fireEvent.click(img);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes keydown listener on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(
      <ImageLightbox imageUrl={testImageUrl} onClose={vi.fn()} />,
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
  });
});
