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

    it("disabled 时不发送消息", () => {
      const { onSend } = renderChatInput({ disabled: true });
      const textarea = screen.getByPlaceholderText("输入消息... (Shift+Enter 换行)");
      typeInTextarea(textarea, "Hello");

      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(onSend).not.toHaveBeenCalled();
    });

    it("图片上传按钮存在", () => {
      renderChatInput();
      expect(screen.getByLabelText("Upload image")).toBeTruthy();
    });

    it("文件上传按钮存在", () => {
      renderChatInput();
      expect(screen.getByLabelText("Upload file")).toBeTruthy();
    });

    it("麦克风按钮存在", () => {
      renderChatInput();
      expect(screen.getByLabelText("Record voice message")).toBeTruthy();
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
});
