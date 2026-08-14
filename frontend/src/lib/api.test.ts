import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ErrorCode,
  ChatError,
  chatAPI,
  registerUser,
  loginUser,
  generateInviteCode,
  listInviteCodes,
  fetchPublicMessages,
  SESSION_TOKEN_STORAGE_KEY,
} from "@/lib/api";
import type { SearchResult } from "@/lib/api";

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  window.localStorage.clear();
});

// ===========================================================================
// ErrorCode
// ===========================================================================
describe("ErrorCode", () => {
  it("defines the expected error-code constants", () => {
    expect(ErrorCode.TIMEOUT).toBe("ERR_TIMEOUT");
    expect(ErrorCode.CLOSED).toBe("ERR_CLOSED");
    expect(ErrorCode.CANNOT_CONNECT).toBe("ERR_CANNOT_CONNECT");
    expect(ErrorCode.AUTH_FAILED).toBe("ERR_AUTH_FAILED");
  });

  it("all values are unique", () => {
    const values = Object.values(ErrorCode);
    expect(new Set(values).size).toBe(values.length);
  });
});

// ===========================================================================
// ChatError
// ===========================================================================
describe("ChatError", () => {
  it("constructs with a code and message", () => {
    const err = new ChatError(ErrorCode.TIMEOUT, "timed out");
    expect(err.code).toBe(ErrorCode.TIMEOUT);
    expect(err.message).toBe("timed out");
  });

  it("sets name to 'ChatError'", () => {
    const err = new ChatError(ErrorCode.CLOSED, "gone");
    expect(err.name).toBe("ChatError");
  });

  it("is an instance of Error", () => {
    const err = new ChatError(ErrorCode.CANNOT_CONNECT, "no route");
    expect(err).toBeInstanceOf(Error);
  });
});

// ===========================================================================
// registerUser
// ===========================================================================
describe("registerUser", () => {
  const username = "alice";
  const password = "s3cret";
  const inviteCode = "INVITE-001";

  function mockJsonResponse(body: unknown, ok = true, status = 200) {
    mockFetch.mockResolvedValueOnce({
      ok,
      status,
      json: async () => body,
    } as unknown as Response);
  }

  it("sends a POST to /api/register with the correct JSON body", async () => {
    mockJsonResponse({ success: true, username, session_token: "session-token-1" });

    await registerUser(username, password, inviteCode);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/register");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      username,
      password,
      invite_code: inviteCode,
      cf_turnstile_response: "",
    });
  });

  it("resolves with RegisterResponse on success", async () => {
    mockJsonResponse({ success: true, username, session_token: "session-token-1" });

    const result = await registerUser(username, password, inviteCode);

    expect(result).toEqual({ success: true, username, session_token: "session-token-1" });
  });

  it("throws the server error message when the response is not ok", async () => {
    mockJsonResponse({ error: "Username taken" }, false, 409);

    await expect(
      registerUser(username, password, inviteCode),
    ).rejects.toThrow("Username taken");
  });

  it("throws a fallback message when the error body is not valid JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("parse error");
      },
    } as unknown as Response);

    await expect(
      registerUser(username, password, inviteCode),
    ).rejects.toThrow("Registration failed");
  });
});

// ===========================================================================
// loginUser
// ===========================================================================
describe("loginUser", () => {
  const username = "bob";
  const password = "p4ss";

  function mockJsonResponse(body: unknown, ok = true) {
    mockFetch.mockResolvedValueOnce({
      ok,
      json: async () => body,
    } as unknown as Response);
  }

  it("sends a POST to /api/login with the correct JSON body", async () => {
    mockJsonResponse({ success: true, username, session_token: "session-token-1" });

    await loginUser(username, password);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ username, password, cf_turnstile_response: "" });
  });

  it("resolves with LoginResponse on success", async () => {
    mockJsonResponse({ success: true, username, session_token: "session-token-1" });

    const result = await loginUser(username, password);

    expect(result).toEqual({ success: true, username, session_token: "session-token-1" });
  });

  it("throws the server error message on failure", async () => {
    mockJsonResponse({ error: "Invalid credentials" }, false);

    await expect(loginUser(username, password)).rejects.toThrow(
      "Invalid credentials",
    );
  });

  it("throws a fallback when the error body is unparseable", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error("bad json");
      },
    } as unknown as Response);

    await expect(loginUser(username, password)).rejects.toThrow("Login failed");
  });

  it("throws ChatError with AUTH_FAILED on HTTP 401", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid credentials" }),
    } as unknown as Response);

    try {
      await loginUser(username, password);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ChatError);
      expect((err as ChatError).code).toBe(ErrorCode.AUTH_FAILED);
      expect((err as ChatError).message).toBe("Invalid credentials");
    }
  });
});

// ===========================================================================
// generateInviteCode  (bonus — follows the same HTTP helper pattern)
// ===========================================================================
describe("generateInviteCode", () => {
  it("POSTs to /api/invite/generate with username and max_uses", async () => {
    window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, "session-token-1");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: "ABC123" }),
    } as unknown as Response);

    await generateInviteCode("charlie", 3);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/invite/generate");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer session-token-1",
    });
    expect(JSON.parse(init.body)).toEqual({ username: "charlie", max_uses: 3 });
  });

  it("defaults max_uses to 5", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: "DEF456" }),
    } as unknown as Response);

    await generateInviteCode("dave");

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      username: "dave",
      max_uses: 5,
    });
  });
});

// ===========================================================================
// listInviteCodes
// ===========================================================================
describe("listInviteCodes", () => {
  it("GETs /api/invite/list with the username as a query param", async () => {
    window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, "session-token-1");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ codes: [] }),
    } as unknown as Response);

    await listInviteCodes("eve");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/invite/list?username=eve");
    expect(init.headers).toEqual({ Authorization: "Bearer session-token-1" });
  });

  it("returns the codes array on success", async () => {
    const codes = [
      { code: "X", creator: "eve", max_uses: 5, use_count: 0, created_at: 1 },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ codes }),
    } as unknown as Response);

    const result = await listInviteCodes("eve");

    expect(result).toEqual(codes);
  });
});

// ===========================================================================
// ChatError — additional edge cases
// ===========================================================================
describe("ChatError (extended)", () => {
  it("works with an empty message string", () => {
    const err = new ChatError(ErrorCode.CLOSED, "");
    expect(err.message).toBe("");
    expect(err.code).toBe(ErrorCode.CLOSED);
  });

  it("can be constructed with every ErrorCode variant", () => {
    for (const code of Object.values(ErrorCode)) {
      const err = new ChatError(code, `error: ${code}`);
      expect(err.code).toBe(code);
      expect(err.message).toBe(`error: ${code}`);
    }
  });

  it("preserves the ChatError name across all codes", () => {
    for (const code of Object.values(ErrorCode)) {
      const err = new ChatError(code, "msg");
      expect(err.name).toBe("ChatError");
    }
  });
});

// ===========================================================================
// generateInviteCode — error handling
// ===========================================================================
describe("generateInviteCode errors", () => {
  it("throws the server error message when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "Not authorized" }),
    } as unknown as Response);

    await expect(generateInviteCode("dave")).rejects.toThrow("Not authorized");
  });

  it("throws a fallback message when error body is not valid JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("parse error");
      },
    } as unknown as Response);

    await expect(generateInviteCode("dave")).rejects.toThrow(
      "Failed to generate invite code",
    );
  });
});

// ===========================================================================
// listInviteCodes — error handling
// ===========================================================================
describe("listInviteCodes errors", () => {
  it("throws the server error message when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
    } as unknown as Response);

    await expect(listInviteCodes("eve")).rejects.toThrow("Server error");
  });

  it("throws a fallback message when error body is not valid JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("boom");
      },
    } as unknown as Response);

    await expect(listInviteCodes("eve")).rejects.toThrow(
      "Failed to list invite codes",
    );
  });

  it("returns an empty array when codes field is undefined", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "no codes" }),
    } as unknown as Response);

    const result = await listInviteCodes("newuser");
    expect(result).toEqual([]);
  });

  it("URL-encodes the username parameter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ codes: [] }),
    } as unknown as Response);

    await listInviteCodes("user name");

    expect(mockFetch.mock.calls[0][0]).toBe(
      "/api/invite/list?username=user%20name",
    );
  });
});

// ===========================================================================
// chatAPI — singleton and basic properties
// ===========================================================================
describe("chatAPI", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("is exported as a defined singleton", () => {
    expect(chatAPI).toBeDefined();
  });

  it("has a readyState property of type number", () => {
    expect(typeof chatAPI.readyState).toBe("number");
  });

  it("readyState returns WebSocket.CLOSED when no connection is active", () => {
    expect(chatAPI.readyState).toBe(WebSocket.CLOSED);
  });
});

describe("chatAPI reconnect authentication", () => {
  const OriginalWebSocket = globalThis.WebSocket;
  let sockets: FakeWebSocket[] = [];

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = FakeWebSocket.CONNECTING;
    sent: string[] = [];
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    url: string;

    constructor(url: string) {
      this.url = url;
      sockets.push(this);
    }

    send(data: string) {
      this.sent.push(data);
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED;
      this.onclose?.({} as CloseEvent);
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.({} as Event);
    }

    receive(data: unknown) {
      this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    (chatAPI as any).reconnectBaseDelay = 1000;
    (chatAPI as any).reconnectMaxDelay = 30000;
    (chatAPI as any).reconnectAttempt = 0;
  });

  afterEach(() => {
    chatAPI.disconnect();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.stubGlobal("WebSocket", OriginalWebSocket);
  });

  it("keeps the OIDC token when reconnecting after an established socket drops", async () => {
    const connected = chatAPI.connect("alice", "access-token-1");

    sockets[0].open();
    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      type: "join",
      username: "alice",
      token: "access-token-1",
    });
    sockets[0].receive({ type: "history", messages: [] });
    await expect(connected).resolves.toBeUndefined();

    sockets[0].close();
    await vi.advanceTimersByTimeAsync(1000);
    sockets[1].open();

    expect(JSON.parse(sockets[1].sent[0])).toEqual({
      type: "join",
      username: "alice",
      token: "access-token-1",
    });
  });
});

// ===========================================================================
// chatAPI event handling (on / off / dispatch)
// ===========================================================================
describe("chatAPI event handling", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("on() returns an unsubscribe function", () => {
    const handler = vi.fn();
    const unsubscribe = chatAPI.on("test_event", handler);
    expect(typeof unsubscribe).toBe("function");
  });

  it("unsubscribe function removes the registered handler", () => {
    const handler = vi.fn();
    const unsubscribe = chatAPI.on("event_x", handler);
    unsubscribe();

    (chatAPI as any).dispatch("event_x", { type: "event_x" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple handlers for the same event type", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    chatAPI.on("multi_event", handler1);
    chatAPI.on("multi_event", handler2);

    (chatAPI as any).dispatch("multi_event", { type: "multi_event" });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("delivers the correct message data to handlers", () => {
    const handler = vi.fn();
    const msg = { type: "message", content: "hello" };

    chatAPI.on("message", handler);
    (chatAPI as any).dispatch("message", msg);

    expect(handler).toHaveBeenCalledWith(msg);
  });

  it("does not deliver events to handlers registered for a different type", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    chatAPI.on("type_a", handlerA);
    chatAPI.on("type_b", handlerB);

    (chatAPI as any).dispatch("type_a", { type: "type_a" });

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).not.toHaveBeenCalled();
  });

  it("catches errors in handlers and logs them to console.error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const badHandler = vi.fn(() => {
      throw new Error("handler error");
    });

    chatAPI.on("bad", badHandler);

    expect(() => {
      (chatAPI as any).dispatch("bad", { type: "bad" });
    }).not.toThrow();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("handlers registered for '*' receive events dispatched to '*'", () => {
    const wildcardHandler = vi.fn();

    chatAPI.on("*", wildcardHandler);

    (chatAPI as any).dispatch("*", { type: "event_one" });
    (chatAPI as any).dispatch("*", { type: "event_two" });

    expect(wildcardHandler).toHaveBeenCalledTimes(2);
    expect(wildcardHandler).toHaveBeenCalledWith({ type: "event_one" });
    expect(wildcardHandler).toHaveBeenCalledWith({ type: "event_two" });
  });

  it("unsubscribing one handler does not affect other handlers for the same event", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();

    const unsub = chatAPI.on("shared_event", h1);
    chatAPI.on("shared_event", h2);

    unsub(); // remove h1

    (chatAPI as any).dispatch("shared_event", { type: "shared_event" });

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// chatAPI.send — raw send method
// ===========================================================================
describe("chatAPI.send", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("logs a warning when WebSocket is not connected", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    chatAPI.send({ type: "test" });
    expect(warn).toHaveBeenCalledWith(
      "WebSocket not connected, cannot send",
      { type: "test" },
    );
    warn.mockRestore();
  });

  it("sends JSON-stringified data when WebSocket is OPEN", () => {
    const mockWsSend = vi.fn();
    (chatAPI as any).ws = {
      readyState: WebSocket.OPEN,
      send: mockWsSend,
      close: vi.fn(),
    };

    chatAPI.send({ type: "message", content: "hi" });

    expect(mockWsSend).toHaveBeenCalledWith(
      JSON.stringify({ type: "message", content: "hi" }),
    );
  });

  it("queues non-join messages when WebSocket is CONNECTING", () => {
    const mockWsSend = vi.fn();
    (chatAPI as any).ws = {
      readyState: WebSocket.CONNECTING,
      send: mockWsSend,
      close: vi.fn(),
    };

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    chatAPI.send({ type: "test" });

    expect(mockWsSend).not.toHaveBeenCalled();
    expect((chatAPI as any).outboundQueue).toEqual([{ type: "test" }]);
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it("does not send when WebSocket is CLOSING", () => {
    const mockWsSend = vi.fn();
    (chatAPI as any).ws = {
      readyState: WebSocket.CLOSING,
      send: mockWsSend,
      close: vi.fn(),
    };

    chatAPI.send({ type: "test" });

    expect(mockWsSend).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// chatAPI.sendMessage
// ===========================================================================
describe("chatAPI.sendMessage", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("sends a basic message with just content", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendMessage("hello world");
    expect(spy).toHaveBeenCalledWith({
      type: "message",
      content: "hello world",
    });
    spy.mockRestore();
  });

  it("includes reply_to fields when a replyTo message is provided", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    const replyTo = {
      id: "msg-1",
      content: "original",
      username: "alice",
      timestamp: 123,
    };

    chatAPI.sendMessage("reply text", replyTo);

    expect(spy).toHaveBeenCalledWith({
      type: "message",
      content: "reply text",
      reply_to_id: "msg-1",
      reply_to_content: "original",
      reply_to_user: "alice",
    });
    spy.mockRestore();
  });

  it("sends empty content string without error", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendMessage("");
    expect(spy).toHaveBeenCalledWith({ type: "message", content: "" });
    spy.mockRestore();
  });
});

// ===========================================================================
// chatAPI.sendThreadReply / requestThreadMessages
// ===========================================================================
describe("chatAPI thread operations", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("sendThreadReply sends a thread reply with thread_id", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendThreadReply("thread-123", "thread reply");
    expect(spy).toHaveBeenCalledWith({
      type: "message",
      content: "thread reply",
      thread_id: "thread-123",
    });
    spy.mockRestore();
  });

  it("requestThreadMessages sends a thread_messages request", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.requestThreadMessages("parent-1");
    expect(spy).toHaveBeenCalledWith({
      type: "thread_messages",
      parent_message_id: "parent-1",
    });
    spy.mockRestore();
  });
});

// ===========================================================================
// chatAPI.sendPollCreate
// ===========================================================================
describe("chatAPI.sendPollCreate", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("sends poll_create with nested poll object", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendPollCreate("Favorite color?", ["Red", "Blue"], true, false);

    expect(spy).toHaveBeenCalledWith({
      type: "poll_create",
      poll: {
        question: "Favorite color?",
        options: ["Red", "Blue"],
        multiple_choice: true,
        is_anonymous: false,
      },
    });
    spy.mockRestore();
  });

  it("sends poll with empty options array", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendPollCreate("Q?", [], false, true);

    expect(spy).toHaveBeenCalledWith({
      type: "poll_create",
      poll: {
        question: "Q?",
        options: [],
        multiple_choice: false,
        is_anonymous: true,
      },
    });
    spy.mockRestore();
  });
});

// ===========================================================================
// chatAPI typing events
// ===========================================================================
describe("chatAPI typing events", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("sendTypingStart sends public context and preview", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendTypingStart({
      channel: "public",
      preview: "hello...",
    });

    expect(spy).toHaveBeenCalledWith({
      type: "typing_start",
      context: "public",
      preview: "hello...",
    });
    spy.mockRestore();
  });

  it("sendTypingStart defaults to public context", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendTypingStart(undefined);

    expect(spy).toHaveBeenCalledWith({
      type: "typing_start",
      context: "public",
      preview: undefined,
    });
    spy.mockRestore();
  });

  it("sendTypingStop sends public context", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendTypingStop({ channel: "public" });

    expect(spy).toHaveBeenCalledWith({
      type: "typing_stop",
      context: "public",
    });
    spy.mockRestore();
  });

  it("sendTypingStop defaults to public context", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendTypingStop(undefined);

    expect(spy).toHaveBeenCalledWith({
      type: "typing_stop",
      context: "public",
    });
    spy.mockRestore();
  });
});

// ===========================================================================
// chatAPI.disconnect
// ===========================================================================
describe("chatAPI.disconnect", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("clears state without throwing when no connection is active", () => {
    expect(() => chatAPI.disconnect()).not.toThrow();
  });

  it("resets readyState to CLOSED after disconnect", () => {
    chatAPI.disconnect();
    expect(chatAPI.readyState).toBe(WebSocket.CLOSED);
  });

  it("preserves event handlers after disconnect (handlers are lifecycle-managed)", () => {
    const handler = vi.fn();
    const unsub = chatAPI.on("test", handler);
    chatAPI.disconnect();

    // Handlers survive disconnect — they're managed by component lifecycle.
    (chatAPI as any).dispatch("test", { type: "test" });
    expect(handler).toHaveBeenCalled();

    // Cleanup
    unsub();
  });

  it("closes the WebSocket when disconnect is called with an active socket", () => {
    const mockClose = vi.fn();
    (chatAPI as any).ws = { close: mockClose, readyState: WebSocket.OPEN };

    chatAPI.disconnect();

    expect(mockClose).toHaveBeenCalled();
  });
});

// ===========================================================================
// chatAPI message actions (reaction / edit / moderation)
// ===========================================================================
describe("chatAPI message actions", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("sendReaction sends correct payload", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendReaction("msg-1", "\u{1F44D}");
    expect(spy).toHaveBeenCalledWith({
      type: "reaction",
      message_id: "msg-1",
      emoji: "\u{1F44D}",
    });
    spy.mockRestore();
  });

  it("sendMessageEdit sends correct payload", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendMessageEdit("msg-2", "edited text");
    expect(spy).toHaveBeenCalledWith({
      type: "message_edit",
      id: "msg-2",
      content: "edited text",
    });
    spy.mockRestore();
  });

  it("deleteMessage sends correct payload", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.deleteMessage("msg-3");
    expect(spy).toHaveBeenCalledWith({
      type: "message_delete",
      id: "msg-3",
    });
    spy.mockRestore();
  });

  it("sendBlock sends correct payload", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendBlock("spammer");
    expect(spy).toHaveBeenCalledWith({ type: "block", username: "spammer" });
    spy.mockRestore();
  });

  it("sendUnblock sends correct payload", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendUnblock("ex-spammer");
    expect(spy).toHaveBeenCalledWith({
      type: "unblock",
      username: "ex-spammer",
    });
    spy.mockRestore();
  });

  it("sendBlockList sends correct payload", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendBlockList();
    expect(spy).toHaveBeenCalledWith({ type: "block_list" });
    spy.mockRestore();
  });

  it("sendPinMessage sends correct payload", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendPinMessage("msg-pin");
    expect(spy).toHaveBeenCalledWith({
      type: "pin_message",
      id: "msg-pin",
    });
    spy.mockRestore();
  });

  it("sendUnpinMessage sends correct payload", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendUnpinMessage("msg-unpin");
    expect(spy).toHaveBeenCalledWith({
      type: "unpin_message",
      id: "msg-unpin",
    });
    spy.mockRestore();
  });
});

// ===========================================================================
// chatAPI public room operations
// ===========================================================================
describe("chatAPI public room operations", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("sendRoomLeave sends type only", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendRoomLeave();
    expect(spy).toHaveBeenCalledWith({ type: "room_leave" });
    spy.mockRestore();
  });

  it("sendSetTopic sends correct payload", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendSetTopic("Welcome!");
    expect(spy).toHaveBeenCalledWith({
      type: "set_topic",
      topic: "Welcome!",
    });
    spy.mockRestore();
  });

  it("sendLoadHistory sends correct payload", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendLoadHistory(1700000000);
    expect(spy).toHaveBeenCalledWith({
      type: "load_history",
      timestamp: 1700000000,
    });
    spy.mockRestore();
  });
});

// ===========================================================================
// chatAPI public notification preferences
// ===========================================================================
describe("chatAPI public notification preferences", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("sendMarkRead marks the public room", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendMarkRead();
    expect(spy).toHaveBeenCalledWith({
      type: "mark_read",
      context: "public",
    });
    spy.mockRestore();
  });

  it("sendSetNotificationPrefs sends all fields for the public room", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendSetNotificationPrefs("public", 1716159123, true);
    expect(spy).toHaveBeenCalledWith({
      type: "notification_prefs_set",
      key: "public",
      muted_until: 1716159123,
      show_preview: true,
    });
    spy.mockRestore();
  });

  it("sendGetNotificationPrefs sends type only", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendGetNotificationPrefs();
    expect(spy).toHaveBeenCalledWith({ type: "notification_prefs_get" });
    spy.mockRestore();
  });
});

// ===========================================================================
// chatAPI profile / status
// ===========================================================================
describe("chatAPI profile operations", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("sendProfileUpdate sends partial profile data", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendProfileUpdate({
      display_name: "Dr. Who",
      bio: "Time Lord",
    });
    expect(spy).toHaveBeenCalledWith({
      type: "profile_update",
      display_name: "Dr. Who",
      bio: "Time Lord",
    });
    spy.mockRestore();
  });

  it("sendProfileUpdate sends all profile fields", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendProfileUpdate({
      display_name: "Jane",
      avatar_url: "https://example.com/avatar.png",
      bio: "Dev",
      status: "online",
    });
    expect(spy).toHaveBeenCalledWith({
      type: "profile_update",
      display_name: "Jane",
      avatar_url: "https://example.com/avatar.png",
      bio: "Dev",
      status: "online",
    });
    spy.mockRestore();
  });

  it("sendProfileGet sends with username", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendProfileGet("alice");
    expect(spy).toHaveBeenCalledWith({
      type: "profile_get",
      username: "alice",
    });
    spy.mockRestore();
  });

  it("sendProfileGet sends with undefined username when omitted", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendProfileGet();
    expect(spy).toHaveBeenCalledWith({
      type: "profile_get",
      username: undefined,
    });
    spy.mockRestore();
  });

  it("sendStatusUpdate sends status", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendStatusUpdate("AFK");
    expect(spy).toHaveBeenCalledWith({ type: "status_update", status: "AFK" });
    spy.mockRestore();
  });
});

// ===========================================================================
// chatAPI poll operations
// ===========================================================================
describe("chatAPI poll operations", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("sendPollVote sends correct payload", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendPollVote("poll-1", 2);
    expect(spy).toHaveBeenCalledWith({
      type: "poll_vote",
      id: "poll-1",
      option_index: 2,
    });
    spy.mockRestore();
  });

  it("sendPollClose sends correct payload", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendPollClose("poll-2");
    expect(spy).toHaveBeenCalledWith({
      type: "poll_close",
      id: "poll-2",
    });
    spy.mockRestore();
  });
});

// ===========================================================================
// chatAPI emoji and translate operations
// ===========================================================================
describe("chatAPI emoji and translate operations", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("sendCustomEmojiAdd sends name and url", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendCustomEmojiAdd("party_parrot", "https://example.com/parrot.gif");
    expect(spy).toHaveBeenCalledWith({
      type: "custom_emoji_add",
      name: "party_parrot",
      url: "https://example.com/parrot.gif",
    });
    spy.mockRestore();
  });

  it("sendCustomEmojiDelete sends name", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendCustomEmojiDelete("old_emoji");
    expect(spy).toHaveBeenCalledWith({
      type: "custom_emoji_delete",
      name: "old_emoji",
    });
    spy.mockRestore();
  });

  it("sendCustomEmojiList sends list request", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendCustomEmojiList();
    expect(spy).toHaveBeenCalledWith({ type: "custom_emoji_list" });
    spy.mockRestore();
  });

  it("sendTranslateMessage sends message_id, content, and target lang", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendTranslateMessage("msg-1", "Hello", "zh");
    expect(spy).toHaveBeenCalledWith({
      type: "translate_message",
      message_id: "msg-1",
      content: "Hello",
      to: "zh",
    });
    spy.mockRestore();
  });

  it("sendTranslateMessage defaults target lang to empty string", () => {
    const spy = vi.spyOn(chatAPI, "send").mockImplementation(() => {});
    chatAPI.sendTranslateMessage("msg-1", "Hello");
    expect(spy).toHaveBeenCalledWith({
      type: "translate_message",
      message_id: "msg-1",
      content: "Hello",
      to: "",
    });
    spy.mockRestore();
  });
});

// ===========================================================================
// chatAPI HTTP method — fetchLinkPreview
// ===========================================================================
describe("chatAPI fetchLinkPreview", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("GETs /api/link-preview with URL-encoded url param", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: "Example", description: "desc", image: "img.png", url: "https://example.com" }),
    } as unknown as Response);

    await chatAPI.fetchLinkPreview("https://example.com/path?q=1");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/link-preview?url=https%3A%2F%2Fexample.com%2Fpath%3Fq%3D1");
  });

  it("returns parsed LinkPreviewData on success", async () => {
    const preview = { title: "T", description: "D", image: "img.jpg", url: "https://a.com", site_name: "A" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => preview,
    } as unknown as Response);

    const result = await chatAPI.fetchLinkPreview("https://a.com");
    expect(result).toEqual(preview);
  });

  it("returns null when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as unknown as Response);

    const result = await chatAPI.fetchLinkPreview("https://bad.com");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await chatAPI.fetchLinkPreview("https://fail.com");
    expect(result).toBeNull();
  });
});

// ===========================================================================
// HTTP method — fetchPublicMessages
// ===========================================================================
describe("fetchPublicMessages", () => {
  it("GETs /api/messages with the requested limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [] }),
    } as unknown as Response);

    await fetchPublicMessages(25);

    expect(mockFetch.mock.calls[0][0]).toBe("/api/messages?limit=25");
    expect(mockFetch.mock.calls[0][1]).toEqual({ redirect: "manual" });
  });

  it("returns public messages from the response", async () => {
    const messages = [
      { id: "m1", username: "TokenBot", content: "Welcome", timestamp: 1000 },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages }),
    } as unknown as Response);

    await expect(fetchPublicMessages()).resolves.toEqual(messages);
  });

  it("returns an empty list on failed responses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "failed" }),
    } as unknown as Response);

    await expect(fetchPublicMessages()).resolves.toEqual([]);
  });
});

// ===========================================================================
// chatAPI HTTP method — uploadEmoji
// ===========================================================================
describe("chatAPI uploadEmoji", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("POSTs to /api/emoji/upload with file and name in FormData", async () => {
    window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, "session-token-1");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://cdn.example.com/emoji/cool.gif" }),
    } as unknown as Response);

    const file = new File(["gif-data"], "cool.gif", { type: "image/gif" });
    await chatAPI.uploadEmoji(file, "cool_emoji");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/emoji/upload");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer session-token-1" });
    const fd = init.body as FormData;
    expect(fd.get("file")).toBe(file);
    expect(fd.get("name")).toBe("cool_emoji");
  });

  it("returns the url string on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://cdn.example.com/e/cool.gif" }),
    } as unknown as Response);

    const file = new File(["gif"], "e.gif");
    const result = await chatAPI.uploadEmoji(file, "my_emoji");
    expect(result).toBe("https://cdn.example.com/e/cool.gif");
  });

  it("returns null when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid emoji" }),
    } as unknown as Response);

    const result = await chatAPI.uploadEmoji(new File(["x"], "bad.txt"), "bad");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network down"));

    const result = await chatAPI.uploadEmoji(new File(["x"], "e.gif"), "emoji");
    expect(result).toBeNull();
  });
});

// ===========================================================================
// chatAPI HTTP method — exportChat
// ===========================================================================
describe("chatAPI exportChat", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("GETs /api/export with conversation and format params", async () => {
    window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, "session-token-1");
    const blob = new Blob(["chat data"], { type: "application/json" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => blob,
    } as unknown as Response);

    await chatAPI.exportChat("public", "json");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/export?");
    expect(url).toContain("conversation=public");
    expect(url).toContain("format=json");
    expect(init.headers).toEqual({ Authorization: "Bearer session-token-1" });
  });

  it("includes username param when provided", async () => {
    const blob = new Blob(["data"], { type: "text/plain" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => blob,
    } as unknown as Response);

    await chatAPI.exportChat("public", "text", "admin");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("username=admin");
  });

  it("does not include username param when omitted", async () => {
    const blob = new Blob(["data"], { type: "application/json" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => blob,
    } as unknown as Response);

    await chatAPI.exportChat("public", "json");

    const [url] = mockFetch.mock.calls[0];
    expect(url).not.toContain("username=");
  });

  it("returns the Blob on success", async () => {
    const blob = new Blob(["exported"], { type: "application/json" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => blob,
    } as unknown as Response);

    const result = await chatAPI.exportChat("public", "json");
    expect(result).toBe(blob);
  });

  it("throws 'Export failed' when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as unknown as Response);

    await expect(chatAPI.exportChat("public", "json")).rejects.toThrow("Export failed");
  });

  it("supports text format", async () => {
    const blob = new Blob(["plain text"], { type: "text/plain" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => blob,
    } as unknown as Response);

    const result = await chatAPI.exportChat("public", "text");
    expect(result).toBe(blob);
  });
});

// ===========================================================================
// chatAPI HTTP method — searchMessages
// ===========================================================================
describe("chatAPI searchMessages", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  const sampleResults: SearchResult[] = [
    { id: "m1", username: "alice", content: "hello world", timestamp: 1000, snippet: "hello...", rank: 1 },
  ];

  it("GETs /api/search with query param", async () => {
    window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, "session-token-1");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: sampleResults }),
    } as unknown as Response);

    await chatAPI.searchMessages("hello");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/search?");
    expect(url).toContain("q=hello");
    expect(init.headers).toEqual({ Authorization: "Bearer session-token-1" });
  });

  it("includes room param when roomID is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    } as unknown as Response);

    await chatAPI.searchMessages("test", "room-1");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("room=room-1");
  });

  it("returns results array from data.results on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: sampleResults }),
    } as unknown as Response);

    const result = await chatAPI.searchMessages("hello");
    expect(result).toEqual(sampleResults);
  });

  it("falls back to data as array when results field is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleResults,
    } as unknown as Response);

    const result = await chatAPI.searchMessages("hello");
    expect(result).toEqual(sampleResults);
  });

  it("returns empty array when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "fail" }),
    } as unknown as Response);

    const result = await chatAPI.searchMessages("query");
    expect(result).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Offline"));

    const result = await chatAPI.searchMessages("query");
    expect(result).toEqual([]);
  });

  it("URL-encodes the search query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    } as unknown as Response);

    await chatAPI.searchMessages("hello world & special");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("q=hello+world+%26+special");
  });
});

// ===========================================================================
// chatAPI disconnect — reconnectTimer branch coverage
// ===========================================================================
describe("chatAPI disconnect with reconnect timer", () => {
  afterEach(() => {
    chatAPI.disconnect();
  });

  it("clears the reconnect timer when disconnect is called during reconnection", () => {
    const fakeTimer = setTimeout(() => {}, 99999);
    (chatAPI as any).reconnectTimer = fakeTimer;

    const clearSpy = vi.spyOn(globalThis, "clearTimeout");

    chatAPI.disconnect();

    expect(clearSpy).toHaveBeenCalledWith(fakeTimer);
    expect((chatAPI as any).reconnectTimer).toBeNull();

    clearSpy.mockRestore();
  });
});
