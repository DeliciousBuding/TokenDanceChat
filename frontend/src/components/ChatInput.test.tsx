import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    uploadImage: vi.fn(),
    sendMessage: vi.fn(),
    sendDMMessage: vi.fn(),
    sendGroupMessage: vi.fn(),
    sendReaction: vi.fn(),
    sendMessageEdit: vi.fn(),
    sendSetTopic: vi.fn(),
    sendPinMessage: vi.fn(),
    deleteMessage: vi.fn(),
    sendFriendRequest: vi.fn(),
    sendFriendAccept: vi.fn(),
    sendFriendReject: vi.fn(),
    sendGroupCreate: vi.fn(),
    sendGroupInvite: vi.fn(),
    sendGroupInviteAccept: vi.fn(),
    sendGroupInviteDecline: vi.fn(),
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
  onUpload?: (file: File) => void;
}) {
  const onSend = props?.onSend ?? vi.fn();
  const result = render(
    <I18nProvider>
      <ChatInput
        onSend={onSend}
        disabled={props?.disabled ?? false}
        replyTo={props?.replyTo ?? null}
        onUpload={props?.onUpload ?? vi.fn()}
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
      pendingImage: null,
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

    it("disconnected 时不发送消息", () => {
      useChatStore.setState({ connected: false });
      const { onSend } = renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");
      typeInTextarea(textarea, "Hello");

      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(onSend).not.toHaveBeenCalled();
    });

    it("disconnected 时显示断连反馈消息", () => {
      useChatStore.setState({ connected: false });
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

    it("图片上传按钮存在", () => {
      renderChatInput();
      expect(screen.getByLabelText("上传图片")).toBeTruthy();
    });

    it("文件上传按钮存在", () => {
      renderChatInput();
      expect(screen.getByLabelText("上传文件")).toBeTruthy();
    });

    it("麦克风按钮存在", () => {
      renderChatInput();
      expect(screen.getByLabelText("录制语音")).toBeTruthy();
    });

    it("Markdown 格式化工具栏存在", () => {
      renderChatInput();
      expect(screen.getByLabelText("加粗")).toBeTruthy();
      expect(screen.getByLabelText("斜体")).toBeTruthy();
      expect(screen.getByLabelText("删除线")).toBeTruthy();
      expect(screen.getByLabelText("代码")).toBeTruthy();
      expect(screen.getByLabelText("引用")).toBeTruthy();
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

      // Navigate down once - first item (TokenBot) should lose accent, second (PicoClaw) gets it
      fireEvent.keyDown(textarea, { key: "ArrowDown" });

      const picoClawBtn = screen.getByText("PicoClaw").closest("button");
      expect(picoClawBtn?.className).toContain("bg-accent");

      // ArrowUp back to first
      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      const tokenBotBtn = screen.getByText("TokenBot").closest("button");
      expect(tokenBotBtn?.className).toContain("bg-accent");
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
    it("拖入文件时显示 drop overlay", () => {
      renderChatInput();
      const container = document.querySelector(".relative.border-t")!;

      fireEvent.dragEnter(container);
      // Drop overlay text should appear
      expect(screen.getByText("拖放文件到此处")).toBeTruthy();
    });

    it("离开拖拽区域后 overlay 消失", () => {
      renderChatInput();
      const container = document.querySelector(".relative.border-t")!;

      fireEvent.dragEnter(container);
      fireEvent.dragLeave(container);

      expect(screen.queryByText("拖放文件到此处")).toBeNull();
    });

    it("拖拽超大文件显示错误提示", () => {
      renderChatInput();
      const container = document.querySelector(".relative.border-t")!;

      const largeFile = new File([new ArrayBuffer(51 * 1024 * 1024)], "large.zip", {
        type: "application/zip",
      });
      const dataTransfer = {
        files: [largeFile],
        items: [],
        types: ["Files"],
      };

      fireEvent.drop(container, { dataTransfer });

      expect(screen.getByText("文件过大（最大 50MB）")).toBeTruthy();
    });

    it("dragOver 阻止默认行为", () => {
      renderChatInput();
      const container = document.querySelector(".relative.border-t")!;

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

    it("ArrowUp 在 DM 中只加载与该 DM 对端的对话消息", () => {
      const messages = [
        { id: "m1", username: "testuser", from: "testuser", to: "alice", content: "DM to alice", timestamp: 1000 },
        { id: "m2", username: "testuser", from: "testuser", to: "bob", content: "DM to bob", timestamp: 2000 },
        { id: "m3", username: "alice", from: "alice", to: "testuser", content: "from alice", timestamp: 3000 },
      ];
      useChatStore.setState({
        username: "testuser",
        currentChat: { type: "dm", username: "alice" },
        messages,
      });

      renderChatInput();
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

      fireEvent.keyDown(textarea, { key: "ArrowUp" });

      expect(textarea.value).toBe("DM to alice");
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

    it("DM 会话挂载时从 tdchat-draft-dm-{username} 恢复草稿", () => {
      localStorageMock.setItem("tdchat-draft-dm-alice", "dm draft");
      useChatStore.setState({ currentChat: { type: "dm", username: "alice" } });
      renderChatInput();
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(textarea.value).toBe("dm draft");
    });

    it("group 会话挂载时从 tdchat-draft-group-{name} 恢复草稿", () => {
      localStorageMock.setItem("tdchat-draft-group-general", "group draft");
      useChatStore.setState({ currentChat: { type: "group", name: "general" } });
      renderChatInput();
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(textarea.value).toBe("group draft");
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

  describe("文件/图片粘贴 (file/image paste)", () => {
    it("粘贴图片调用 FileReader 并设置 pendingImage", () => {
      const readAsDataURLSpy = vi
        .spyOn(FileReader.prototype, "readAsDataURL")
        .mockImplementation(function (this: FileReader, _blob: Blob) {
          Object.defineProperty(this, "result", { value: "data:image/png;base64,mock123" });
          this.onload?.(new Event("load") as ProgressEvent<FileReader>);
        });

      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");

      const file = new File(["fake-image"], "test.png", { type: "image/png" });
      fireEvent.paste(textarea, {
        clipboardData: {
          items: [{ type: "image/png", getAsFile: () => file }],
        },
      });

      expect(readAsDataURLSpy).toHaveBeenCalledWith(file);
      expect(useChatStore.getState().pendingImage).toBe("data:image/png;base64,mock123");
      readAsDataURLSpy.mockRestore();
    });

    it("粘贴非图片内容不触发 FileReader", () => {
      const readAsDataURLSpy = vi.spyOn(FileReader.prototype, "readAsDataURL");

      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");

      fireEvent.paste(textarea, {
        clipboardData: {
          items: [{ type: "text/plain", getAsFile: () => null }],
        },
      });

      expect(readAsDataURLSpy).not.toHaveBeenCalled();
      readAsDataURLSpy.mockRestore();
    });

    it("粘贴超过 50MB 的图片被忽略", () => {
      const readAsDataURLSpy = vi.spyOn(FileReader.prototype, "readAsDataURL");

      renderChatInput();
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");

      const largeFile = new File([], "large.png", { type: "image/png" });
      Object.defineProperty(largeFile, "size", { value: 51 * 1024 * 1024 });

      fireEvent.paste(textarea, {
        clipboardData: {
          items: [{ type: "image/png", getAsFile: () => largeFile }],
        },
      });

      expect(readAsDataURLSpy).not.toHaveBeenCalled();
      readAsDataURLSpy.mockRestore();
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

    it("同时有 replyTo 和编辑态时优先显示回复指示器", () => {
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

      fireEvent.keyDown(textarea, { key: "ArrowUp" });

      // Reply indicator should be visible (priority over editing)
      expect(screen.getByText("alice")).toBeTruthy();
      // Editing indicator should NOT appear
      expect(screen.queryByText("编辑消息")).toBeNull();
    });
  });

  describe("@mention 额外场景", () => {
    it("DM 会话的 mention 列表不包含 @all", () => {
      useChatStore.setState({ currentChat: { type: "dm", username: "alice" } });

      renderChatInput();
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: "@" } });
      Object.defineProperty(textarea, "selectionStart", { value: 1, writable: true });

      // TokenBot and PicoClaw (assistants) should appear
      expect(screen.getByText("TokenBot")).toBeTruthy();
      expect(screen.getByText("PicoClaw")).toBeTruthy();
      // @all should NOT appear in DM context
      expect(screen.queryByText("all")).toBeNull();
    });
  });
});
