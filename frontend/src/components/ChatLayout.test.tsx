import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { chatAPI } from "@/lib/api";

const wsMocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  sendMessage: vi.fn(),
  markRead: vi.fn(),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: () => ({
    connect: vi.fn(),
    disconnect: wsMocks.disconnect,
    sendMessage: wsMocks.sendMessage,
    markRead: wsMocks.markRead,
    sendReaction: vi.fn(),
    sendMessageEdit: vi.fn(),
  }),
}));

vi.mock("@/lib/sound", () => ({
  playSentSound: vi.fn(),
  playMessageSound: vi.fn(),
  playMentionSound: vi.fn(),
  playOnlineSound: vi.fn(),
  playOfflineSound: vi.fn(),
  playReactionSound: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
  setSoundEnabled: vi.fn(),
}));

vi.mock("@/components/ThreadPanel", () => ({
  ThreadPanel: () => <div data-testid="thread-panel" />,
}));

vi.mock("@/lib/api", () => {
  const handlers: Map<string, Set<(msg: unknown) => void>> = new Map();
  return {
    chatAPI: {
      on: vi.fn((event: string, handler: (msg: unknown) => void) => {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)!.add(handler);
        return () => { handlers.get(event)?.delete(handler); };
      }),
      dispatch: (event: string, data: unknown) => {
        handlers.get(event)?.forEach((handler) => handler(data));
      },
      sendTypingStart: vi.fn(),
      sendTypingStop: vi.fn(),
      sendMessage: vi.fn(),
      sendMessageEdit: vi.fn(),
      sendThreadReply: vi.fn(),
      requestThreadMessages: vi.fn(),
      sendPinMessage: vi.fn(),
      deleteMessage: vi.fn(),
      exportChat: vi.fn().mockResolvedValue(new Blob(["[]"], { type: "application/json" })),
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
  };
});

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

Object.defineProperty(window, "visualViewport", {
  writable: true,
  value: {
    height: 800,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
});

Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;

import { ChatLayout } from "@/components/ChatLayout";

function renderChatLayout() {
  return render(
    <I18nProvider>
      <ChatLayout />
    </I18nProvider>,
  );
}

function typeAndSend(text: string) {
  const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  const sendButton = document.querySelector<HTMLButtonElement>("[data-visual='composer-send']");
  expect(sendButton).toBeTruthy();
  fireEvent.click(sendButton!);
}

describe("ChatLayout lightweight chat contract", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
    wsMocks.disconnect.mockClear();
    wsMocks.sendMessage.mockClear();
    wsMocks.markRead.mockClear();
    useChatStore.setState({
      username: "testuser",
      connected: true,
      onlineUsers: ["testuser", "alice"],
      currentChat: { type: "public" },
      messages: [],
      unreadByConversation: {},
      userStatusList: [],
      pinnedMessages: [],
    });
  });

  it("renders only public room plus TokenBot and PicoClaw entries", () => {
    renderChatLayout();

    expect(screen.getAllByText("公共聊天").length).toBeGreaterThan(0);
    expect(screen.getByText("TokenBot")).toBeTruthy();
    expect(screen.getByText("PicoClaw")).toBeTruthy();

    expect(screen.queryByText("好友")).toBeNull();
    expect(screen.queryByText("群组")).toBeNull();
    expect(screen.queryByText("私信")).toBeNull();
    expect(screen.queryByText("接受")).toBeNull();
    expect(screen.queryByText("拒绝")).toBeNull();
    expect(screen.queryByLabelText("语音通话")).toBeNull();
    expect(screen.queryByLabelText("视频通话")).toBeNull();
    expect(screen.queryByTestId("video-call")).toBeNull();
  });

  it("coerces stale DM/group state back to public chat", () => {
    useChatStore.setState({ currentChat: { type: "dm", username: "alice" } as any });
    renderChatLayout();

    expect(screen.getAllByText("公共聊天").length).toBeGreaterThan(0);
    expect(useChatStore.getState().currentChat).toEqual({ type: "public" });
  });

  it("selects TokenBot context and prefixes outgoing messages", () => {
    renderChatLayout();
    fireEvent.click(screen.getByText("TokenBot"));

    expect(screen.getAllByText("TokenBot").length).toBeGreaterThan(0);
    expect(screen.getAllByText("@TokenBot").length).toBeGreaterThan(0);
    expect(document.querySelector("[data-visual='ai-chat-workbench']")).toBeNull();

    typeAndSend("总结一下");

    expect(wsMocks.sendMessage).toHaveBeenCalledWith("@TokenBot 总结一下");
    expect(useChatStore.getState().currentChat).toEqual({ type: "public" });
  });

  it("selects PicoClaw context and prefixes outgoing messages", () => {
    renderChatLayout();
    fireEvent.click(screen.getByText("PicoClaw"));

    expect(screen.getAllByText("PicoClaw").length).toBeGreaterThan(0);
    expect(screen.getAllByText("@PicoClaw").length).toBeGreaterThan(0);
    expect(document.querySelector("[data-visual='ai-chat-workbench']")).toBeNull();

    typeAndSend("执行任务");

    expect(wsMocks.sendMessage).toHaveBeenCalledWith("@PicoClaw 执行任务");
  });

  it("keeps plain public sends unprefixed", () => {
    renderChatLayout();

    typeAndSend("大家好");

    expect(wsMocks.sendMessage).toHaveBeenCalledWith("大家好");
  });

  it("keeps utility menu without IM actions", () => {
    renderChatLayout();
    fireEvent.click(screen.getByLabelText("更多"));

    expect(screen.getByText("English")).toBeTruthy();
    expect(screen.getByText("导出为 JSON")).toBeTruthy();
    expect(screen.getByText("导出为文本")).toBeTruthy();
    expect(screen.getAllByText("打开设置").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("创建群组")).toBeNull();
    expect(screen.queryByText("添加好友")).toBeNull();
  });

  it("shows reconnect state in the compact header", async () => {
    useChatStore.setState({ connected: false });
    renderChatLayout();

    await act(async () => {
      (chatAPI as unknown as { dispatch: (event: string, data: unknown) => void }).dispatch("reconnecting", {
        type: "reconnecting",
        attempt: 1,
      });
    });

    expect(screen.getAllByTitle("正在重新连接 (第 2 次)...").length).toBeGreaterThan(0);
  });
});
