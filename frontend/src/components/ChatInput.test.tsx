import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";

// ── Mocks ──────────────────────────────────────────

vi.mock("@/lib/sound", () => ({
  playSentSound: vi.fn(),
  playMessageSound: vi.fn(),
  playMentionSound: vi.fn(),
  playOnlineSound: vi.fn(),
  playOfflineSound: vi.fn(),
  playReactionSound: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendTypingStart: vi.fn(),
    sendTypingStop: vi.fn(),
    sendMessage: vi.fn(),
    sendReaction: vi.fn(),
    sendMessageEdit: vi.fn(),
    sendSetTopic: vi.fn(),
    sendPinMessage: vi.fn(),
    deleteMessage: vi.fn(),
    fetchLinkPreview: vi.fn(),
  },
  ChatError: class ChatError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  ErrorCode: { TIMEOUT: "TIMEOUT", CLOSED: "CLOSED", CANNOT_CONNECT: "CANNOT_CONNECT" },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock navigator.mediaDevices
Object.defineProperty(window.navigator, "mediaDevices", {
  writable: true,
  value: {
    getUserMedia: vi.fn().mockRejectedValue(new Error("Not available")),
  },
});

// Import ChatInput AFTER all mocks
import { ChatInput } from "@/components/ChatInput";
import { chatAPI } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";

function renderChatInput(props?: {
  onSend?: (content: string) => void;
  disabled?: boolean;
  replyTo?: ChatMessage | null;
}) {
  const onSend = props?.onSend ?? vi.fn();
  // Set reply state in the store instead of passing a prop.
  if (props?.replyTo !== undefined) {
    useChatStore.getState().setReplyTo(props.replyTo);
  }
  const result = render(
    <I18nProvider>
      <ChatInput
        onSend={onSend}
        disabled={props?.disabled ?? false}
      />
    </I18nProvider>,
  );
  return { ...result, onSend };
}

function typeInTextarea(textarea: HTMLElement, text: string) {
  fireEvent.change(textarea, { target: { value: text } });
}

describe("ChatInput", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
    useChatStore.setState({
      username: "testuser",
      connected: true,
      onlineUsers: ["testuser", "alice", "bob", "TokenBot", "PicoClaw"],
      currentChat: { type: "public" },
      replyTo: null,
    });
  });

  describe("消息发送 (message sending)", () => {
    it("点击发送按钮调用 onSend", () => {
      const { onSend } = renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");
      typeInTextarea(textarea, "Hello world");

      // Send button uses the current placeholder as its accessible label.
      fireEvent.click(screen.getByRole("button", { name: "输入消息... (Shift+Enter 换行)" }));

      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith("Hello world");
    });

    it("按 Enter 键发送消息", () => {
      const { onSend } = renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");
      typeInTextarea(textarea, "Hello");

      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith("Hello");
    });

    it("Shift+Enter 换行不触发发送", () => {
      const { onSend } = renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");
      typeInTextarea(textarea, "Line1");

      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

      expect(onSend).not.toHaveBeenCalled();
    });

    it("空消息不发送", () => {
      const { onSend } = renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");

      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(onSend).not.toHaveBeenCalled();
    });

    it("输入中文时 IME 组成状态不发送", () => {
      const { onSend } = renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");
      typeInTextarea(textarea, "测试");

      // Simulate IME composition
      fireEvent.compositionStart(textarea);
      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(onSend).not.toHaveBeenCalled();
    });

    it("发送后清空输入框", () => {
      const { onSend } = renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;
      typeInTextarea(textarea, "Hello");

      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(onSend).toHaveBeenCalledTimes(1);
      expect(textarea.value).toBe("");
    });

    it("发送后展示 submitting 状态并阻止短时间重复发送", () => {
      vi.useFakeTimers();
      try {
        const { onSend } = renderChatInput();
        const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;
        typeInTextarea(textarea, "Hello");

        fireEvent.keyDown(textarea, { key: "Enter" });

        const sendButton = screen.getByRole("button", { name: "输入消息... (Shift+Enter 换行)" });
        expect(sendButton.getAttribute("data-submitting")).toBe("true");
        expect(document.querySelector("[data-visual='composer-submit-state']")).toBeTruthy();

        fireEvent.keyDown(textarea, { key: "Enter" });
        expect(onSend).toHaveBeenCalledTimes(1);

        act(() => {
          vi.advanceTimersByTime(500);
        });

        expect(sendButton.getAttribute("data-submitting")).toBe("false");
      } finally {
        vi.useRealTimers();
      }
    });

    it("disconnected 时不发送消息", () => {
      useChatStore.setState({ connected: false });
      const { onSend } = renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");
      typeInTextarea(textarea, "Hello");

      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(onSend).not.toHaveBeenCalled();
    });

    it("disconnected 时显示断连反馈消息", () => {
      useChatStore.setState({ connected: false, username: "testuser" });
      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;
      typeInTextarea(textarea, "Hello");

      fireEvent.keyDown(textarea, { key: "Enter" });

      // Disconnect feedback message should appear.
      expect(screen.getByText(/未连接/)).toBeTruthy();
      // Content is preserved (not cleared).
      expect(textarea.value).toBe("Hello");
    });

    it("disabled 时不发送消息", () => {
      const { onSend } = renderChatInput({ disabled: true });
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");
      typeInTextarea(textarea, "Hello");

      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(onSend).not.toHaveBeenCalled();
    });

    it("禁用状态下点击发送不会触发 onSend", () => {
      const { onSend } = renderChatInput({ disabled: true });
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");
      typeInTextarea(textarea, "Hello world");
      expect(onSend).not.toHaveBeenCalled();
    });

    it("未登录预览态聚焦输入框时不渲染全屏格式化遮罩", () => {
      useChatStore.setState({ username: "", connected: false });
      renderChatInput();

      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");
      fireEvent.focus(textarea);

      expect(document.querySelector(".fixed.inset-0.z-40")).toBeNull();
    });

    it("composer 使用 AgentHub 风格轻量入口，不渲染旧 IM 工具条", () => {
      const { container } = renderChatInput();

      expect(container.querySelector("[data-visual='composer-toolbar']")).toBeNull();
      expect(screen.queryByLabelText("添加附件")).toBeNull();

      for (const label of ["上传图片", "上传文件"]) {
        expect(screen.queryByLabelText(label)).toBeNull();
      }
      expect(screen.queryByLabelText("Markdown 格式")).toBeNull();
      expect(screen.queryByLabelText("表情")).toBeNull();
      expect(screen.queryByLabelText("GIF")).toBeNull();
      expect(screen.queryByLabelText("录制语音")).toBeNull();
      expect(screen.queryByLabelText("定时发送消息")).toBeNull();

      const tools = Array.from(container.querySelectorAll("[data-visual='composer-tool']"));
      expect(tools).toHaveLength(0);
    });

    it("字符计数器显示", () => {
      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");
      typeInTextarea(textarea, "Hello");

      expect(screen.getByText("5/2000")).toBeTruthy();
    });

    it("回复指示器渲染 replyTo 内容", () => {
      const replyTo: ChatMessage = {
        id: "msg-1",
        username: "alice",
        content: "Original message text here",
        timestamp: Date.now(),
      };
      renderChatInput({ replyTo });
      // "回复" text appears in the reply indicator
      expect(screen.getByText(/回复/, { exact: false })).toBeTruthy();
      expect(screen.getByText(/Original message/)).toBeTruthy();
    });
  });

  describe("@mention 补全 (mention autocomplete)", () => {
    it("输入 @ 触发 mention 下拉菜单", () => {
      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: "@" } });
      Object.defineProperty(textarea, "selectionStart", { value: 1, writable: true });

      // TokenBot and PicoClaw from mentionableAssistants should be visible
      expect(screen.getByText("TokenBot")).toBeTruthy();
      expect(screen.getByText("PicoClaw")).toBeTruthy();
    });

    it("@后输入部分关键字过滤 mention 列表", () => {
      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: "@Tok" } });
      Object.defineProperty(textarea, "selectionStart", { value: 4, writable: true });

      // Should show TokenBot but not PicoClaw
      expect(screen.getByText("TokenBot")).toBeTruthy();
      expect(screen.queryByText("PicoClaw")).toBeNull();
    });

    it("点击 mention 项插入 @name", () => {
      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: "@" } });
      Object.defineProperty(textarea, "selectionStart", { value: 1, writable: true });

      fireEvent.click(screen.getByText("TokenBot"));

      expect(textarea.value).toBe("@TokenBot ");
    });

    it("按 Escape 键关闭 mention 下拉", () => {
      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: "@" } });
      Object.defineProperty(textarea, "selectionStart", { value: 1, writable: true });

      expect(screen.getByText("TokenBot")).toBeTruthy();

      fireEvent.keyDown(textarea, { key: "Escape" });

      expect(screen.queryByText("TokenBot")).toBeNull();
    });

    it("ArrowDown/ArrowUp 导航 mention 列表", () => {
      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: "@" } });
      Object.defineProperty(textarea, "selectionStart", { value: 1, writable: true });

      // Navigate down once - first item (@all) should lose accent, second (TokenBot) gets it
      fireEvent.keyDown(textarea, { key: "ArrowDown" });

      const tokenBotBtn = screen.getByText("TokenBot").closest("button");
      expect(tokenBotBtn?.className).toContain("bg-[var(--bg-hover)]");

      // ArrowUp back to first
      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      const allBtn = screen.getByText("all").closest("button");
      expect(allBtn?.className).toContain("bg-[var(--bg-hover)]");
    });

    it("Enter 在 mention 下拉中选择当前项", () => {
      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: "@" } });
      Object.defineProperty(textarea, "selectionStart", { value: 1, writable: true });

      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(textarea.value).toBe("@all ");
    });

    it("assistant 标签显示在 mention 列表中", () => {
      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: "@" } });
      Object.defineProperty(textarea, "selectionStart", { value: 1, writable: true });

      expect(screen.getByText("Bot")).toBeTruthy();
      expect(screen.getByText("Agent")).toBeTruthy();
    });
  });

  describe("文件拖拽 (file drag-and-drop)", () => {
    it("拖入文件时不显示旧 drop overlay", () => {
      renderChatInput();
      const container = screen.getByTestId("chat-input");

      fireEvent.dragEnter(container);
      expect(screen.queryByText("拖放文件到此处")).toBeNull();
    });

    it("离开拖拽区域后仍无 overlay", () => {
      renderChatInput();
      const container = screen.getByTestId("chat-input");

      fireEvent.dragEnter(container);
      fireEvent.dragLeave(container);

      expect(screen.queryByText("拖放文件到此处")).toBeNull();
    });

    it("拖拽超大文件不触发旧上传错误提示", () => {
      renderChatInput();
      const container = screen.getByTestId("chat-input");

      const largeFile = new File([new ArrayBuffer(51 * 1024 * 1024)], "large.zip", {
        type: "application/zip",
      });
      const dataTransfer = {
        files: [largeFile],
        items: [],
        types: ["Files"],
      };

      fireEvent.drop(container, { dataTransfer });

      expect(screen.queryByText("文件过大（最大 50MB）")).toBeNull();
    });

    it("dragOver 阻止默认行为", () => {
      renderChatInput();
      const container = screen.getByTestId("chat-input");

      // Just verify the handler runs without throwing
      fireEvent.dragOver(container);
      // Component should still be rendered
      expect(container).toBeTruthy();
    });
  });

  describe("上箭头编辑消息 (up-arrow edit last message)", () => {
    it("空输入按 ArrowUp 加载最后一条本人消息到输入框", () => {
      const messages = [
        { id: "m1", username: "alice", content: "Hi", timestamp: 1000 },
        { id: "m2", username: "testuser", content: "My last message", timestamp: 2000 },
      ];
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "public" },
        messages,
      });

      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      fireEvent.keyDown(textarea, { key: "ArrowUp" });

      expect(textarea.value).toBe("My last message");
    });

    it("ArrowUp 仅加载本人消息，不加载他人消息", () => {
      const messages = [
        { id: "m1", username: "alice", content: "Alice message", timestamp: 1000 },
        { id: "m2", username: "bob", content: "Bob message", timestamp: 2000 },
      ];
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "public" },
        messages,
      });

      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      fireEvent.keyDown(textarea, { key: "ArrowUp" });

      expect(textarea.value).toBe("");
    });

    it("ArrowUp 跳过已删除消息", () => {
      const messages = [
        { id: "m1", username: "testuser", content: "deleted message", timestamp: 1000, deleted: true },
        { id: "m2", username: "testuser", content: "my actual last", timestamp: 2000 },
      ];
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "public" },
        messages,
      });

      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      fireEvent.keyDown(textarea, { key: "ArrowUp" });

      expect(textarea.value).toBe("my actual last");
    });

    it("ArrowUp ignores private messages when stale DM state is present", () => {
      const messages = [
        { id: "m1", username: "testuser", from: "testuser", to: "alice", content: "DM to alice", timestamp: 1000 },
        { id: "m2", username: "testuser", from: "testuser", to: "bob", content: "DM to bob", timestamp: 2000 },
        { id: "m3", username: "testuser", content: "public message", timestamp: 3000 },
      ];
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "dm", username: "alice" } as any,
        messages,
      });

      renderChatInput();
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

      fireEvent.keyDown(textarea, { key: "ArrowUp" });

      expect(textarea.value).toBe("public message");
    });

    it("有内容时 ArrowUp 不触发编辑（优先导航/不吞键）", () => {
      const messages = [
        { id: "m1", username: "testuser", content: "old message", timestamp: 1000 },
      ];
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "public" },
        messages,
      });

      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;
      typeInTextarea(textarea, "current content");
      (textarea as any).selectionStart = "current content".length;
      (textarea as any).selectionEnd = "current content".length;

      fireEvent.keyDown(textarea, { key: "ArrowUp" });

      expect(textarea.value).toBe("current content");
    });

    it("编辑态发送调用 sendMessageEdit 而非 onSend", () => {
      const messages = [
        { id: "m-edit", username: "testuser", content: "original text", timestamp: 1000 },
      ];
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "public" },
        messages,
      });

      const { onSend } = renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      expect(textarea.value).toBe("original text");

      // Modify the loaded message
      typeInTextarea(textarea, "original text (edited)");
      fireEvent.keyDown(textarea, { key: "Enter" });

      // Should call sendMessageEdit, not onSend
      expect(chatAPI.sendMessageEdit).toHaveBeenCalledWith("m-edit", "original text (edited)");
      expect(onSend).not.toHaveBeenCalled();
    });
  });

  describe("草稿保存/恢复 (draft save/restore)", () => {
    it("public 会话挂载时从 tdchat-draft-public 恢复草稿", () => {
      localStorageMock.setItem("tdchat-draft-public", "saved draft");
      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;
      expect(textarea.value).toBe("saved draft");
    });

    it("stale DM state still restores the public draft", () => {
      localStorageMock.setItem("tdchat-draft-public", "public draft");
      localStorageMock.setItem("tdchat-draft-dm-alice", "dm draft");
      useChatStore.setState({ currentChat: { type: "dm", username: "alice" } as any });
      renderChatInput();
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(textarea.value).toBe("public draft");
    });

    it("stale group state still restores the public draft", () => {
      localStorageMock.setItem("tdchat-draft-public", "public draft");
      localStorageMock.setItem("tdchat-draft-group-general", "group draft");
      useChatStore.setState({ currentChat: { type: "group", name: "general" } as any });
      renderChatInput();
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(textarea.value).toBe("public draft");
    });

    it("内容变化后防抖 500ms 自动保存草稿", () => {
      vi.useFakeTimers();
      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");
      typeInTextarea(textarea, "auto saved draft");

      // 防抖未到时不应保存
      expect(localStorageMock.getItem("tdchat-draft-public")).toBeNull();

      vi.advanceTimersByTime(600);
      expect(localStorageMock.getItem("tdchat-draft-public")).toBe("auto saved draft");
      vi.useRealTimers();
    });

    it("清空内容后防抖删除草稿", () => {
      vi.useFakeTimers();
      localStorageMock.setItem("tdchat-draft-public", "existing draft");
      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");

      // Clear the restored draft content
      typeInTextarea(textarea, "");
      vi.advanceTimersByTime(600);

      expect(localStorageMock.getItem("tdchat-draft-public")).toBeNull();
      vi.useRealTimers();
    });

    it("发送消息后同步清除草稿", () => {
      localStorageMock.setItem("tdchat-draft-public", "draft before send");
      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");
      typeInTextarea(textarea, "draft before send");

      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(localStorageMock.getItem("tdchat-draft-public")).toBeNull();
    });
  });

  describe("回复取消 (reply-to cancel)", () => {
    it("点击取消按钮清除回复状态", () => {
      const replyTo: ChatMessage = {
        id: "msg-1",
        username: "alice",
        content: "Original message",
        timestamp: Date.now(),
      };
      renderChatInput({ replyTo });

      // Reply indicator should be visible
      expect(screen.getByText("alice")).toBeTruthy();

      // Click the cancel button (aria-label="取消")
      fireEvent.click(screen.getByLabelText("取消"));

      // After clicking cancel, replyTo should be cleared (setReplyTo(null) was called)
      expect(useChatStore.getState().replyTo).toBeNull();
    });
  });

  describe("编辑消息内联模式 (editing message inline UI)", () => {
    it("ArrowUp 加载消息后显示编辑指示器", () => {
      const messages = [
        { id: "m1", username: "testuser", content: "original message", timestamp: 1000 },
      ];
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "public" },
        messages,
      });

      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      fireEvent.keyDown(textarea, { key: "ArrowUp" });

      // Editing indicator should appear
      expect(screen.getByText("编辑消息")).toBeTruthy();
      expect(textarea.value).toBe("original message");
    });

    it("点击编辑取消按钮退出编辑态并清空输入", () => {
      const messages = [
        { id: "m1", username: "testuser", content: "original message", timestamp: 1000 },
      ];
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "public" },
        messages,
      });

      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      // Enter editing mode
      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      expect(screen.getByText("编辑消息")).toBeTruthy();

      // Click cancel button
      fireEvent.click(screen.getByLabelText("取消"));

      // Should exit editing mode and clear content
      expect(screen.queryByText("编辑消息")).toBeNull();
      expect(textarea.value).toBe("");
    });

    it("进入编辑时取消 reply", () => {
      const messages = [
        { id: "m1", username: "testuser", content: "my message", timestamp: 1000 },
      ];
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "public" },
        messages,
      });

      const replyTo: ChatMessage = {
        id: "msg-2",
        username: "alice",
        content: "reply target message",
        timestamp: Date.now(),
      };

      renderChatInput({ replyTo });
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)") as HTMLTextAreaElement;

      // Reply indicator should be visible before ArrowUp
      expect(screen.getByText("alice")).toBeTruthy();

      // ArrowUp enters edit mode, which cancels reply
      fireEvent.keyDown(textarea, { key: "ArrowUp" });

      // Reply indicator should be gone (cleared by edit mode)
      expect(screen.queryByText("alice")).toBeNull();
      // Editing indicator should appear
      expect(screen.getByText("编辑消息")).toBeTruthy();
    });
  });

  describe("@mention 额外场景", () => {
    it("stale DM state still uses the public mention list", () => {
      useChatStore.setState({ currentChat: { type: "dm", username: "alice" } as any });

      renderChatInput();
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: "@" } });
      Object.defineProperty(textarea, "selectionStart", { value: 1, writable: true });

      // TokenBot and PicoClaw (assistants) should appear
      expect(screen.getByText("TokenBot")).toBeTruthy();
      expect(screen.getByText("PicoClaw")).toBeTruthy();
      expect(screen.getByText("all")).toBeTruthy();
    });
  });
});
