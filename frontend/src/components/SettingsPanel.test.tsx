import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsPanel } from "@/components/SettingsPanel";
import { mockI18n } from "@/test-utils";

const { mockSendSetNotificationPrefs, storeState } = vi.hoisted(() => ({
  mockSendSetNotificationPrefs: vi.fn(),
  storeState: {
    notificationPrefs: {} as Record<string, { mutedUntil: number; showPreview: boolean }>,
    mutedConversations: [] as string[],
    username: "alice",
    onlineUsers: [] as string[],
    userProfiles: {} as Record<string, { display_name?: string }>,
  },
}));

vi.mock("@/i18n/context", () => ({
  useTranslation: () => mockI18n({
    "settings.notificationPrefs": "通知偏好设置",
    "settings.mutedConversations": "已静音的对话",
    "settings.noMutedConversations": "暂无静音的对话",
    "settings.showPreview": "消息预览",
    "settings.previewOn": "预览已开启",
    "settings.previewOff": "预览已关闭",
    "settings.unmute": "取消静音",
    "chat.publicChat": "公共聊天",
  }),
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: vi.fn((selector?: (s: unknown) => unknown) => {
    return selector ? selector(storeState) : storeState;
  }),
}));

vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendSetNotificationPrefs: mockSendSetNotificationPrefs,
  },
}));

describe("SettingsPanel", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    storeState.notificationPrefs = {};
    storeState.mutedConversations = [];
    storeState.username = "alice";
    storeState.onlineUsers = [];
    storeState.userProfiles = {};
  });

  it("renders notification preferences header", () => {
    render(<SettingsPanel onClose={onClose} />);
    expect(screen.getByText("通知偏好设置")).toBeTruthy();
  });

  it("renders close button and calls onClose when clicked", () => {
    render(<SettingsPanel onClose={onClose} />);
    // Find the X button in the header
    const buttons = screen.getAllByRole("button");
    const closeBtn = buttons.find((b) => b.querySelector(".lucide-x"));
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders muted conversations section header", () => {
    render(<SettingsPanel onClose={onClose} />);
    expect(screen.getByText("已静音的对话")).toBeTruthy();
  });

  it("shows empty state when no muted conversations", () => {
    render(<SettingsPanel onClose={onClose} />);
    expect(screen.getByText("暂无静音的对话")).toBeTruthy();
  });

  it("renders show preview section header", () => {
    render(<SettingsPanel onClose={onClose} />);
    expect(screen.getByText("消息预览")).toBeTruthy();
  });

  it("calls onClose when backdrop is clicked", () => {
    render(<SettingsPanel onClose={onClose} />);
    const backdrop = document.querySelector(".td-chat-backdrop");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders muted conversations with unmute button", () => {
    storeState.mutedConversations = ["public"];
    render(<SettingsPanel onClose={onClose} />);
    // Public chat should appear as muted
    expect(screen.getByText("公共聊天")).toBeTruthy();
    // Should have unmute button
    const unmuteButtons = screen.getAllByTitle("取消静音");
    expect(unmuteButtons.length).toBeGreaterThan(0);
  });

  it("clicking unmute button calls sendSetNotificationPrefs", () => {
    storeState.mutedConversations = ["public"];
    render(<SettingsPanel onClose={onClose} />);
    const unmuteBtn = screen.getByTitle("取消静音");
    fireEvent.click(unmuteBtn);
    expect(mockSendSetNotificationPrefs).toHaveBeenCalledWith("public", 0, true);
  });
});
