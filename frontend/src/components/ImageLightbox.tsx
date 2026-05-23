import { useEffect, useCallback, useRef } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/i18n/context";

interface ImageLightboxProps {
  imageUrl: string;
  onClose: () => void;
}

export function ImageLightbox({ imageUrl, onClose }: ImageLightboxProps) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const imageWrapperRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setScale((s) => {
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      return Math.max(0.5, Math.min(3, s + delta));
    });
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    const wrapper = imageWrapperRef.current;
    wrapper?.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      wrapper?.removeEventListener("wheel", handleWheel);
    };
  }, [handleKeyDown, handleWheel]);

  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 3));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={zoomOut}
          className="rounded-lg bg-white/10 p-2 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          aria-label={t("a11y.zoomOut")}
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={zoomIn}
          className="rounded-lg bg-white/10 p-2 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          aria-label={t("a11y.zoomIn")}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={onClose}
          className="rounded-lg bg-white/10 p-2 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          aria-label={t("a11y.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Image */}
      <div
        ref={imageWrapperRef}
        className="relative max-w-[90vw] max-h-[90vh] overflow-hidden"
      >
        <img
          src={imageUrl}
          alt="Full-size image"
          className="max-w-full max-h-full object-contain cursor-zoom-in transition-transform duration-200"
          style={{ transform: `scale(${scale})` }}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
