import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ErrorCode,
  ChatError,
  registerUser,
  loginUser,
  generateInviteCode,
  listInviteCodes,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

// ===========================================================================
// ErrorCode
// ===========================================================================
describe("ErrorCode", () => {
  it("defines the expected error-code constants", () => {
    expect(ErrorCode.TIMEOUT).toBe("ERR_TIMEOUT");
    expect(ErrorCode.CLOSED).toBe("ERR_CLOSED");
    expect(ErrorCode.CANNOT_CONNECT).toBe("ERR_CANNOT_CONNECT");
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
    } as Response);
  }

  it("sends a POST to /api/register with the correct JSON body", async () => {
    mockJsonResponse({ success: true, username });

    await registerUser(username, password, inviteCode);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/register");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      username,
      password,
      invite_code: inviteCode,
    });
  });

  it("resolves with RegisterResponse on success", async () => {
    mockJsonResponse({ success: true, username });

    const result = await registerUser(username, password, inviteCode);

    expect(result).toEqual({ success: true, username });
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
    } as Response);

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
    } as Response);
  }

  it("sends a POST to /api/login with the correct JSON body", async () => {
    mockJsonResponse({ success: true, username });

    await loginUser(username, password);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ username, password });
  });

  it("resolves with LoginResponse on success", async () => {
    mockJsonResponse({ success: true, username });

    const result = await loginUser(username, password);

    expect(result).toEqual({ success: true, username });
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
    } as Response);

    await expect(loginUser(username, password)).rejects.toThrow("Login failed");
  });
});

// ===========================================================================
// generateInviteCode  (bonus — follows the same HTTP helper pattern)
// ===========================================================================
describe("generateInviteCode", () => {
  it("POSTs to /api/invite/generate with username and max_uses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: "ABC123" }),
    } as Response);

    await generateInviteCode("charlie", 3);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/invite/generate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ username: "charlie", max_uses: 3 });
  });

  it("defaults max_uses to 5", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: "DEF456" }),
    } as Response);

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
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ codes: [] }),
    } as Response);

    await listInviteCodes("eve");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/invite/list?username=eve");
  });

  it("returns the codes array on success", async () => {
    const codes = [
      { code: "X", creator: "eve", max_uses: 5, use_count: 0, created_at: 1 },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ codes }),
    } as Response);

    const result = await listInviteCodes("eve");

    expect(result).toEqual(codes);
  });
});
