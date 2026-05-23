import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForwardModal } from "@/components/ForwardModal";
import { mockI18n } from "@/test-utils";
import type { ChatMessage } from "@/lib/api";

vi.mock("@/i18n/context", () => ({
  useTranslation: () => mockI18n({
    "forward.title": "转发消息",
    "forward.selectRecipient": "选择接收者",
    "forward.noUsers": "暂无在线用户",
    "forward.cancel": "取消",
    "forward.forward": "转发",
  }),
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: vi.fn(),
}));

import { useChatStore } from "@/stores/chatStore";

describe("ForwardModal", () => {
  const onClose = vi.fn();
  const onForward = vi.fn();
  const message: ChatMessage = {
    id: "msg-1",
    username: "alice",
    content: "Hello world, this is a test message",
    timestamp: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useChatStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      onlineUsers: ["alice", "bob", "charlie"],
      username: "alice",
    });
  });

  it("renders forwarded message preview", () => {
    render(<ForwardModal message={message} onClose={onClose} onForward={onForward} />);
    expect(screen.getByText("转发消息")).toBeTruthy();
    expect(screen.getByText(/Hello world/)).toBeTruthy();
    expect(screen.getByText("alice")).toBeTruthy();
  });

  it("filters out self from recipient list", () => {
    const { container } = render(
      <ForwardModal message={message} onClose={onClose} onForward={onForward} />,
    );
    // bob and charlie should appear in the user selector
    expect(screen.getByText("bob")).toBeTruthy();
    expect(screen.getByText("charlie")).toBeTruthy();
    // alice (self) should NOT be a selectable recipient button
    const userButtons = container.querySelectorAll(".space-y-1 button");
    const buttonTexts = Array.from(userButtons).map((b) => b.textContent);
    expect(buttonTexts.some((t) => t?.includes("alice"))).toBe(false);
  });

  it("shows empty state when no other users online", () => {
    (useChatStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      onlineUsers: ["alice"],
      username: "alice",
    });
    render(<ForwardModal message={message} onClose={onClose} onForward={onForward} />);
    expect(screen.getByText("暂无在线用户")).toBeTruthy();
  });

  it("selects a recipient on click", () => {
    render(<ForwardModal message={message} onClose={onClose} onForward={onForward} />);
    fireEvent.click(screen.getByText("bob"));
    // Forward button should now be enabled
    const forwardBtn = screen.getByText("转发");
    expect(forwardBtn.closest("button")?.disabled).toBe(false);
  });

  it("calls onForward with correct args and closes", () => {
    render(<ForwardModal message={message} onClose={onClose} onForward={onForward} />);
    fireEvent.click(screen.getByText("bob"));
    fireEvent.click(screen.getByText("转发"));
    expect(onForward).toHaveBeenCalledWith("msg-1", "bob");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on backdrop click", () => {
    const { container } = render(
      <ForwardModal message={message} onClose={onClose} onForward={onForward} />,
    );
    fireEvent.click(container.querySelector(".absolute.inset-0")!);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on X button click", () => {
    render(<ForwardModal message={message} onClose={onClose} onForward={onForward} />);
    // Find X button by its SVG icon container
    const buttons = screen.getAllByRole("button");
    const closeBtn = buttons.find((b) => b.querySelector(".lucide-x"));
    if (closeBtn) fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("cancel button calls onClose", () => {
    render(<ForwardModal message={message} onClose={onClose} onForward={onForward} />);
    fireEvent.click(screen.getByText("取消"));
    expect(onClose).toHaveBeenCalled();
  });

  it("truncates long message content in preview", () => {
    const longMsg: ChatMessage = {
      id: "msg-2",
      username: "bob",
      content: "a".repeat(250),
      timestamp: Date.now(),
    };
    render(<ForwardModal message={longMsg} onClose={onClose} onForward={onForward} />);
    const preview = screen.getByText(/^a+\.\.\.$/);
    expect(preview).toBeTruthy();
    expect(preview.textContent!.length).toBeLessThan(210);
  });
});
