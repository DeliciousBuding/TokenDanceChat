import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    "emoji.custom": "自定义表情",
    "emoji.uploadEmoji": "上传表情",
    "emoji.deleteEmoji": "删除表情",
    "emoji.noCustomEmoji": "暂无自定义表情",
  }),
}));

// Mutable store state
const storeState: { customEmojis: CustomEmoji[]; username: string } = {
  customEmojis: [],
  username: "testuser",
};

vi.mock("@/stores/chatStore", () => ({
  useChatStore: (selector?: (s: unknown) => unknown) => {
    return selector ? selector(storeState) : storeState;
  },
}));

// ---- Import after all mocks ----
import { CustomEmojiPicker } from "@/components/CustomEmojiPicker";

describe("CustomEmojiPicker", () => {
  beforeEach(() => {
    storeState.customEmojis = [];
    storeState.username = "testuser";
    vi.clearAllMocks();
  });

  it("renders header with custom emoji title and upload button", () => {
    render(<CustomEmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText("自定义表情")).toBeTruthy();
    expect(screen.getByText("上传表情")).toBeTruthy();
  });

  it("shows empty state when no custom emojis exist", () => {
    storeState.customEmojis = [];
    render(<CustomEmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText("暂无自定义表情")).toBeTruthy();
  });

  it("renders custom emojis in grid when available", () => {
    storeState.customEmojis = [
      { name: "cat", url: "https://example.com/cat.png", uploader: "testuser" },
      { name: "dog", url: "https://example.com/dog.png", uploader: "otheruser" },
    ];
    render(<CustomEmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    // Emoji names shown with colon wrapper
    expect(screen.getByText(":cat:")).toBeTruthy();
    expect(screen.getByText(":dog:")).toBeTruthy();
    // Images rendered
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBe(2);
    expect(imgs[0].getAttribute("src")).toBe("https://example.com/cat.png");
    expect(imgs[1].getAttribute("src")).toBe("https://example.com/dog.png");
  });

  it("clicking an emoji calls onSelect with :name: format and onClose", () => {
    storeState.customEmojis = [
      { name: "cat", url: "https://example.com/cat.png", uploader: "testuser" },
    ];
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<CustomEmojiPicker onSelect={onSelect} onClose={onClose} />);

    fireEvent.click(screen.getByText(":cat:"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(":cat:");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls sendCustomEmojiList on mount", () => {
    render(<CustomEmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(mockSendCustomEmojiList).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking backdrop", () => {
    const onClose = vi.fn();
    render(<CustomEmojiPicker onSelect={vi.fn()} onClose={onClose} />);

    // The outer fixed container is the backdrop (onClick checks target === currentTarget)
    const backdrop = document.querySelector(".fixed.inset-0");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(<CustomEmojiPicker onSelect={vi.fn()} onClose={onClose} />);

    const backdrop = document.querySelector(".fixed.inset-0");
    fireEvent.keyDown(backdrop!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows delete button only for emojis uploaded by current user", () => {
    storeState.customEmojis = [
      { name: "cat", url: "https://example.com/cat.png", uploader: "testuser" },
      { name: "dog", url: "https://example.com/dog.png", uploader: "otheruser" },
    ];
    render(<CustomEmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    // Delete buttons: cat (own) should have one, dog (other's) should not
    const deleteButtons = document.querySelectorAll("button[title='删除表情']");
    expect(deleteButtons.length).toBe(1);
  });

  it("clicking delete button calls sendCustomEmojiDelete", () => {
    storeState.customEmojis = [
      { name: "cat", url: "https://example.com/cat.png", uploader: "testuser" },
    ];
    render(<CustomEmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    const deleteButton = document.querySelector("button[title='删除表情']") as HTMLButtonElement;
    expect(deleteButton).toBeTruthy();
    fireEvent.click(deleteButton);
    expect(mockSendCustomEmojiDelete).toHaveBeenCalledTimes(1);
    expect(mockSendCustomEmojiDelete).toHaveBeenCalledWith("cat");
  });

  it("upload button triggers hidden file input", () => {
    render(<CustomEmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    expect(fileInput.className).toBe("hidden");

    // Click upload button
    const clickSpy = vi.spyOn(fileInput, "click");
    fireEvent.click(screen.getByText("上传表情"));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("shows upload error for invalid file type", async () => {
    render(<CustomEmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    const invalidFile = new File(["dummy"], "test.txt", { type: "text/plain" });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    // Error message should appear
    expect(screen.getByText("Invalid file type. Allowed: PNG, JPG, GIF, WebP")).toBeTruthy();
  });

  it("shows upload error for file too large", async () => {
    render(<CustomEmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    // Create a file larger than 128KB
    const largeContent = new Uint8Array(129 * 1024);
    const largeFile = new File([largeContent], "large.png", { type: "image/png" });

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    // Error message should appear
    expect(screen.getByText("File too large. Max 128KB")).toBeTruthy();
  });

  it("shows ... text on upload button while uploading", () => {
    storeState.customEmojis = [];
    render(<CustomEmojiPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    const validFile = new File(["dummy"], "valid.png", { type: "image/png" });

    // Mock uploadEmoji to not resolve immediately (keeps uploading=true)
    let resolveUpload: (v: unknown) => void;
    const uploadPromise = new Promise((resolve) => { resolveUpload = resolve; });
    mockUploadEmoji.mockImplementation(() => uploadPromise);

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    // Button should show "..." while uploading
    expect(screen.getByText("...")).toBeTruthy();
    // Upload button text should be replaced
    expect(screen.queryByText("上传表情")).toBeNull();

    // Cleanup: resolve the hanging promise
    resolveUpload!({ url: "/uploads/emojis/test.png" });
  });
});
