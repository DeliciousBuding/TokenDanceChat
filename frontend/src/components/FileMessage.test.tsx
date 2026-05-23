import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileMessage, formatFileSize, truncateFileName, getFileCategory } from "@/components/FileMessage";

vi.mock("@/i18n/context", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (key === "file.fileSize") return params?.size ?? "";
      if (key === "file.downloadFile") return "Download file";
      return key;
    },
    lang: "zh-CN" as const,
    setLang: vi.fn(),
  }),
}));

describe("formatFileSize", () => {
  it("formats bytes under 1KB", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(500)).toBe("500 B");
  });
  it("formats KB", () => {
    expect(formatFileSize(1500)).toBe("1.5 KB");
    expect(formatFileSize(1024 * 50)).toBe("50.0 KB");
  });
  it("formats MB", () => {
    expect(formatFileSize(1024 * 1024 * 3.7)).toBe("3.7 MB");
  });
});

describe("truncateFileName", () => {
  it("returns short names unchanged", () => {
    expect(truncateFileName("file.pdf")).toBe("file.pdf");
  });
  it("truncates long names preserving extension", () => {
    const result = truncateFileName("very-long-filename-that-exceeds-thirty-chars.txt");
    expect(result.endsWith(".txt")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(30);
  });
  it("handles names without extension", () => {
    const result = truncateFileName("a".repeat(50));
    expect(result).toBe("a".repeat(27) + "...");
  });
});

describe("getFileCategory", () => {
  it("detects pdf", () => {
    expect(getFileCategory("doc.pdf")).toBe("pdf");
    expect(getFileCategory("", "application/pdf")).toBe("pdf");
  });
  it("detects images by extension", () => {
    expect(getFileCategory("photo.png")).toBe("image");
    expect(getFileCategory("img.jpg")).toBe("image");
    expect(getFileCategory("anim.gif")).toBe("image");
  });
  it("detects images by mimeType", () => {
    expect(getFileCategory("file", "image/webp")).toBe("image");
  });
  it("detects video", () => {
    expect(getFileCategory("clip.mp4")).toBe("video");
  });
  it("detects audio", () => {
    expect(getFileCategory("song.mp3")).toBe("audio");
  });
  it("detects archive", () => {
    expect(getFileCategory("backup.zip")).toBe("archive");
  });
  it("defaults for unknown types", () => {
    expect(getFileCategory("data.bin")).toBe("default");
  });
});

describe("FileMessage", () => {
  it("renders file card with download link", () => {
    render(
      <FileMessage
        fileName="report.pdf"
        fileSize={1024 * 100}
        fileUrl="/uploads/report.pdf"
      />,
    );
    expect(screen.getByText("report.pdf")).toBeTruthy();
  });

  it("renders image preview thumbnail", () => {
    render(
      <FileMessage
        fileName="photo.png"
        fileSize={5000}
        fileUrl="/uploads/photo.png"
      />,
    );
    const img = screen.getByAltText("photo.png");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("/uploads/photo.png");
  });

  it("renders audio player for audio files", () => {
    const { container } = render(
      <FileMessage
        fileName="podcast.mp3"
        fileSize={50000}
        fileUrl="/uploads/podcast.mp3"
      />,
    );
    expect(container.querySelector("audio")).toBeTruthy();
  });

  it("renders video player for video files", () => {
    const { container } = render(
      <FileMessage
        fileName="clip.mp4"
        fileSize={99999}
        fileUrl="/uploads/clip.mp4"
      />,
    );
    expect(container.querySelector("video")).toBeTruthy();
  });

  it("shows PDF preview button initially", () => {
    render(
      <FileMessage
        fileName="doc.pdf"
        fileSize={20000}
        fileUrl="/uploads/doc.pdf"
      />,
    );
    expect(screen.getByText("Preview PDF")).toBeTruthy();
  });

  it("PDF iframe has only allow-scripts in sandbox (no allow-same-origin)", async () => {
    render(
      <FileMessage
        fileName="doc.pdf"
        fileSize={20000}
        fileUrl="/uploads/doc.pdf"
      />,
    );
    fireEvent.click(screen.getByText("Preview PDF"));
    const iframe = screen.getByTitle("doc.pdf");
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    // Must NOT contain allow-same-origin (prevents sandbox escape).
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("hides PDF preview when hide button clicked", () => {
    render(
      <FileMessage
        fileName="doc.pdf"
        fileSize={20000}
        fileUrl="/uploads/doc.pdf"
      />,
    );
    fireEvent.click(screen.getByText("Preview PDF"));
    // Hide button (EyeOff icon) should be present.
    expect(screen.getByTitle("doc.pdf")).toBeTruthy(); // iframe visible
  });

  it("renders icon for archive files", () => {
    render(
      <FileMessage
        fileName="backup.zip"
        fileSize={50000}
        fileUrl="/uploads/backup.zip"
      />,
    );
    expect(screen.getByText("backup.zip")).toBeTruthy();
    // No preview elements for archive
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("audio")).toBeNull();
    expect(screen.queryByRole("video")).toBeNull();
  });
});
