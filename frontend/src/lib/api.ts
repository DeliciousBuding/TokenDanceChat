export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export interface PollData {
  id: string;
  room_id: string;
  creator: string;
  question: string;
  options: string[];
  multiple_choice: boolean;
  is_anonymous: boolean;
  is_closed: boolean;
  votes: Record<number, number>;
  voters: Record<number, string[]>;
  created_at: number;
}

export interface ChatMessage {
  id: string;
  client_message_id?: string;
  username: string;
  content: string;
  timestamp: number;
  room_id?: string;
  edited?: boolean;
  reactions?: Record<string, string[]>;
  reply_to_id?: string;
  reply_to_content?: string;
  reply_to_user?: string;
  deleted?: boolean;
  to?: string;
  from?: string;
  group?: string;
  read_by?: string[];
  subtype?: string;
  poll?: PollData;
  thread_id?: string;
  mention_all?: boolean;
}

export interface WSChatMessage extends WSMessage {
  type: "message";
  id: string;
  client_message_id?: string;
  username: string;
  content: string;
  timestamp: number;
  room_id?: string;
  edited?: boolean;
  reactions?: Record<string, string[]>;
}

export interface WSHistoryMessage extends WSMessage {
  type: "history";
  messages: ChatMessage[];
  room_id?: string;
}

export interface WSUserEvent extends WSMessage {
  type: "user_joined" | "user_left";
  username: string;
  online: string[];
  timestamp: number;
}

export interface WSErrorMessage extends WSMessage {
  type: "error";
  content: string;
}

export interface WSTypingEvent extends WSMessage {
  type: "typing";
  username: string;
  context?: string;
  to?: string;
  preview?: string;
}

export interface TypingContext {
  channel: "public";
  preview?: string;
}

export interface UserStatus {
  username: string;
  online: boolean;
  last_seen: number;
  display_name?: string;
  avatar_url?: string;
  status?: string;
}

export interface WSUserStatus extends WSMessage {
  type: "user_status";
  users: UserStatus[];
}

export interface WSStreamEvent extends WSMessage {
  type: "stream";
  username: string;
  content: string;
  done?: boolean;
}

export interface WSJoinRequest {
  type: "join";
  username: string;
}

export interface WSSendMessage {
  type: "message";
  client_message_id?: string;
  content: string;
  reply_to_id?: string;
  reply_to_content?: string;
  reply_to_user?: string;
}

export interface WSMessageDelete {
  type: "message_delete";
  id: string;
}

export interface WSMarkRead {
  type: "mark_read";
}

// Link preview types
export interface LinkPreviewData {
  title: string;
  description: string;
  image: string;
  url: string;
  site_name?: string;
}

// Search types
export interface SearchResult {
  id: string;
  username: string;
  content: string;
  timestamp: number;
  snippet: string;
  rank: number;
}

export interface CustomEmoji {
  id: string;
  name: string;
  url: string;
  uploader: string;
  room_id: string;
  created_at: number;
}

// Reaction types
export interface WSReactionRequest {
  type: "reaction";
  message_id: string;
  emoji: string;
}

export interface WSReactionUpdate extends WSMessage {
  type: "reaction_update";
  id: string;
  reactions: Record<string, string[]>;
}

// Message edit types
export interface WSMessageEditRequest {
  type: "message_edit";
  id: string;
  content: string;
}

export interface WSMessageEditBroadcast extends WSMessage {
  type: "message_edit";
  id: string;
  username: string;
  content: string;
  timestamp: number;
  edited: boolean;
}

// Profile types
export interface WSProfileUpdated extends WSMessage {
  type: "profile_updated" | "profile_get";
  username: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  status?: string;
  last_seen?: number;
}

export interface WSStatusUpdated extends WSMessage {
  type: "status_updated";
  username: string;
  status: string;
}

export type WSEventHandler = (msg: WSMessage) => void;

export const ErrorCode = {
  TIMEOUT: "ERR_TIMEOUT",
  CLOSED: "ERR_CLOSED",
  CANNOT_CONNECT: "ERR_CANNOT_CONNECT",
  AUTH_FAILED: "ERR_AUTH_FAILED",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class ChatError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ChatError";
  }
}

class ChatAPI {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Set<WSEventHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 10;
  private reconnectBaseDelay = 1000;
  private reconnectMaxDelay = 30000;
  private reconnectUsername: string | null = null;
  private reconnectToken: string | null = null;
  private wasReconnecting = false;
  private connectGeneration = 0;
  private outboundQueue: Array<Record<string, unknown>> = [];
  private pendingJoin:
    | {
        resolve: () => void;
        reject: (err: Error) => void;
      }
    | null = null;

  constructor(url: string = "ws://localhost:8080/ws") {
    this.url = url;
  }

  connect(username: string, token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws?.close();
      this.outboundQueue = [];
      const gen = ++this.connectGeneration;
      this.reconnectUsername = username;
      this.reconnectToken = token ?? null;
      this.pendingJoin = { resolve, reject };
      this.ws = new WebSocket(this.url);

      const timeout = setTimeout(() => {
        if (gen !== this.connectGeneration) return;
        if (this.pendingJoin) {
          this.pendingJoin.reject(
            new ChatError(ErrorCode.TIMEOUT, "Connection timed out"),
          );
          this.pendingJoin = null;
        }
        this.ws?.close();
      }, 15000);

      this.ws.onopen = () => {
        if (gen !== this.connectGeneration) return;
        clearTimeout(timeout);
        if (!this.pendingJoin) return; // Timed out, ignore.
        this.reconnectAttempt = 0;
        const joinMsg: Record<string, unknown> = { type: "join", username };
        if (token) joinMsg.token = token;
        this.send(joinMsg);
      };

      this.ws.onmessage = (event) => {
        if (gen !== this.connectGeneration) return;
        try {
          const data = JSON.parse(event.data) as WSMessage;

          // Handle error during join phase.
          if (data.type === "error" && this.pendingJoin) {
            clearTimeout(timeout);
            this.pendingJoin.reject(new Error(data.content as string));
            this.pendingJoin = null;
            this.ws?.close();
            return;
          }

          // Handle kick (duplicate login) during join phase.
          if (data.type === "kicked" && this.pendingJoin) {
            clearTimeout(timeout);
            this.pendingJoin.reject(new Error("Kicked by new login"));
            this.pendingJoin = null;
            // Don't close — the server already closed it.
            return;
          }

          // Handle kick while already connected — prevent reconnect loop.
          if (data.type === "kicked") {
            this.reconnectUsername = null;
            this.reconnectToken = null;
            this.wasReconnecting = false;
          }

          // Confirm join when we receive history.
          if (data.type === "history" && this.pendingJoin) {
            clearTimeout(timeout);
            this.pendingJoin.resolve();
            this.pendingJoin = null;
            this.flushOutboundQueue();
            if (this.wasReconnecting) {
              this.wasReconnecting = false;
              this.dispatch("reconnected", { type: "reconnected" });
            }
          }

          this.dispatch(data.type, data);
          this.dispatch("*", data);
        } catch {
          console.warn("Failed to parse WebSocket message:", event.data);
        }
      };

      this.ws.onclose = () => {
        // Stale close from a previous socket — ignore.
        if (gen !== this.connectGeneration) return;
        if (this.pendingJoin) {
          clearTimeout(timeout);
          this.pendingJoin.reject(
            new ChatError(ErrorCode.CLOSED, "Connection closed"),
          );
          this.pendingJoin = null;
          // Initial connection failed — do NOT auto-reconnect.
          // The caller (tryAutoConnect or AuthModal) decides the next step.
          return;
        }
        // Established connection dropped — attempt automatic reconnection.
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        if (gen !== this.connectGeneration) return;
        if (this.pendingJoin) {
          clearTimeout(timeout);
          this.pendingJoin.reject(
            new ChatError(ErrorCode.CANNOT_CONNECT, "Cannot connect to server"),
          );
          this.pendingJoin = null;
        }
      };
    });
  }

  private attemptReconnect() {
    const username = this.reconnectUsername;
    if (!username) return;

    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      console.warn("Max reconnection attempts reached", { attempt: this.reconnectAttempt, username: this.reconnectUsername });
      this.dispatch("reconnect_failed", { type: "reconnect_failed", attempt: this.reconnectAttempt });
      return;
    }

    this.wasReconnecting = true;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, ..., capped at 30s.
    const rawDelay = Math.min(
      this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempt),
      this.reconnectMaxDelay,
    );
    // Jitter: +/- 20% to prevent thundering herd.
    const jitter = rawDelay * 0.2 * (Math.random() * 2 - 1);
    const delay = Math.round(rawDelay + jitter);

    const attempt = this.reconnectAttempt;
    this.dispatch("reconnecting", {
      type: "reconnecting",
      attempt,
      delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      const token = this.reconnectToken ?? undefined;
      this.connect(username, token).catch(() => {
        // Error already logged in connect; onclose will trigger next attempt.
      });
    }, delay);
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN && (!this.pendingJoin || data.type === "join")) {
      this.ws.send(JSON.stringify(data));
    } else if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING ||
        this.ws.readyState === WebSocket.OPEN) &&
      data.type !== "join"
    ) {
      this.outboundQueue.push(data);
      if (this.outboundQueue.length > 100) {
        this.outboundQueue.shift();
      }
    } else {
      console.warn("WebSocket not connected, cannot send", { type: (data as { type?: string }).type });
    }
  }

  private flushOutboundQueue(): void {
    if (this.ws?.readyState !== WebSocket.OPEN || this.pendingJoin) return;
    const queued = this.outboundQueue.splice(0);
    for (const item of queued) {
      this.ws.send(JSON.stringify(item));
    }
  }

  sendMessage(content: string, replyTo?: ChatMessage, clientMessageId?: string): void {
    if (replyTo) {
      this.send({
        type: "message",
        client_message_id: clientMessageId,
        content,
        reply_to_id: replyTo.id,
        reply_to_content: replyTo.content,
        reply_to_user: replyTo.username,
      });
    } else {
      this.send({ type: "message", client_message_id: clientMessageId, content });
    }
  }

  sendThreadReply(threadId: string, content: string): void {
    this.send({
      type: "message",
      content,
      thread_id: threadId,
    });
  }

  requestThreadMessages(parentMessageId: string): void {
    this.send({
      type: "thread_messages",
      parent_message_id: parentMessageId,
    });
  }

  deleteMessage(id: string): void {
    this.send({ type: "message_delete", id });
  }

  sendMarkRead(): void {
    this.send({ type: "mark_read", context: "public" });
  }

  sendRoomLeave(): void {
    this.send({ type: "room_leave" });
  }

  sendTypingStart(ctx?: TypingContext): void {
    this.send({ type: "typing_start", context: ctx?.channel ?? "public", preview: ctx?.preview });
  }

  sendTypingStop(ctx?: TypingContext): void {
    this.send({ type: "typing_stop", context: ctx?.channel ?? "public" });
  }

  sendReaction(messageId: string, emoji: string): void {
    this.send({ type: "reaction", message_id: messageId, emoji });
  }

  sendMessageEdit(messageId: string, content: string): void {
    this.send({ type: "message_edit", id: messageId, content });
  }

  sendSetTopic(topic: string): void {
    this.send({ type: "set_topic", topic });
  }

  sendBlock(username: string): void {
    this.send({ type: "block", username });
  }

  sendUnblock(username: string): void {
    this.send({ type: "unblock", username });
  }

  sendBlockList(): void {
    this.send({ type: "block_list" });
  }

  sendLoadHistory(before: number): void {
    this.send({ type: "load_history", timestamp: before });
  }

  sendPinMessage(messageId: string): void {
    this.send({ type: "pin_message", id: messageId });
  }

  sendUnpinMessage(messageId: string): void {
    this.send({ type: "unpin_message", id: messageId });
  }

  sendSetNotificationPrefs(key: string, mutedUntil: number, showPreview: boolean): void {
    this.send({ type: "notification_prefs_set", key, muted_until: mutedUntil, show_preview: showPreview });
  }

  sendGetNotificationPrefs(): void {
    this.send({ type: "notification_prefs_get" });
  }

  sendPollCreate(question: string, options: string[], multipleChoice: boolean, isAnonymous: boolean): void {
    this.send({
      type: "poll_create",
      poll: {
        question,
        options,
        multiple_choice: multipleChoice,
        is_anonymous: isAnonymous,
      },
    });
  }

  sendPollVote(pollId: string, optionIndex: number): void {
    this.send({ type: "poll_vote", id: pollId, option_index: optionIndex });
  }

  sendPollClose(pollId: string): void {
    this.send({ type: "poll_close", id: pollId });
  }

  sendProfileUpdate(profile: {
    display_name?: string;
    avatar_url?: string;
    bio?: string;
    status?: string;
  }): void {
    this.send({ type: "profile_update", ...profile });
  }

  sendProfileGet(username?: string): void {
    this.send({ type: "profile_get", username });
  }

  sendStatusUpdate(status: string): void {
    this.send({ type: "status_update", status });
  }

  async fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
    try {
      const resp = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
      if (!resp.ok) return null;
      return await resp.json() as LinkPreviewData;
    } catch {
      return null;
    }
  }

  async uploadEmoji(file: File, name: string): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      const resp = await fetch("/api/emoji/upload", {
        method: "POST",
        headers: getSessionAuthHeaders(),
        body: formData,
      });
      if (!resp.ok) return null;
      const data = await resp.json() as { url: string };
      return data.url;
    } catch {
      return null;
    }
  }

  sendCustomEmojiAdd(name: string, url: string): void {
    this.send({ type: "custom_emoji_add", name, url });
  }

  sendCustomEmojiDelete(name: string): void {
    this.send({ type: "custom_emoji_delete", name });
  }

  sendCustomEmojiList(): void {
    this.send({ type: "custom_emoji_list" });
  }

  async exportChat(conversation: "public", format: 'json' | 'text', username?: string): Promise<Blob> {
    const params = new URLSearchParams({ conversation, format });
    if (username) params.set("username", username);
    const resp = await fetch(`/api/export?${params}`, {
      headers: getSessionAuthHeaders(),
    });
    if (!resp.ok) {
      throw new Error("Export failed");
    }
    return await resp.blob();
  }

  async searchMessages(query: string, roomID?: string): Promise<SearchResult[]> {
    try {
      const params = new URLSearchParams({ q: query });
      if (roomID) params.set("room", roomID);
      const resp = await fetch(`/api/search?${params}`, {
        headers: getSessionAuthHeaders(),
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      return data.results ?? data as SearchResult[];
    } catch {
      return [];
    }
  }

  on(event: string, handler: WSEventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  private dispatch(event: string, data: WSMessage): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (err) {
          console.error(`Error in handler for event "${event}":`, err);
        }
      });
    }
  }

  sendTranslateMessage(messageId: string, content: string, targetLang?: string): void {
    this.send({ type: "translate_message", message_id: messageId, content, to: targetLang || "" });
  }

  disconnect(): void {
    ++this.connectGeneration; // Stale onclose from old socket will be ignored
    this.wasReconnecting = false;
    this.reconnectUsername = null;
    this.reconnectToken = null;
    this.pendingJoin = null;
    this.outboundQueue = [];
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    // Note: we intentionally do NOT clear handlers here.
    // Handlers are managed by component lifecycle (on/off).
  }
}

function getDefaultWSURL(): string {
  // Use current page host in production, localhost in dev.
  const host = window.location.host || "localhost:8080";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${host}/ws`;
}

export const chatAPI = new ChatAPI(getDefaultWSURL());

// --- Auth API (HTTP-based, not WebSocket) ---

export const SESSION_TOKEN_STORAGE_KEY = "tokendance:sessionToken";

export function getSessionToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistSessionToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    }
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

export function getSessionAuthHeaders(): HeadersInit {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface RegisterResponse {
  success: boolean;
  username: string;
  session_token: string;
}

export interface LoginResponse {
  success: boolean;
  username: string;
  session_token: string;
}

export interface InviteCode {
  code: string;
  creator: string;
  max_uses: number;
  use_count: number;
  created_at: number;
}

export async function registerUser(username: string, password: string, inviteCode: string, turnstileToken?: string | null): Promise<RegisterResponse> {
  const resp = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, invite_code: inviteCode, cf_turnstile_response: turnstileToken ?? "" }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: "Registration failed" }));
    throw new Error((data as { error?: string }).error || "Registration failed");
  }
  return await resp.json() as RegisterResponse;
}

export async function loginUser(username: string, password: string, turnstileToken?: string | null): Promise<LoginResponse> {
  const resp = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, cf_turnstile_response: turnstileToken ?? "" }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: "Login failed" }));
    const msg = (data as { error?: string }).error || "Login failed";
    if (resp.status === 401) {
      throw new ChatError(ErrorCode.AUTH_FAILED, msg);
    }
    throw new Error(msg);
  }
  return await resp.json() as LoginResponse;
}

export async function generateInviteCode(username: string, maxUses: number = 5): Promise<{ code: string }> {
  const resp = await fetch("/api/invite/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getSessionAuthHeaders() },
    body: JSON.stringify({ username, max_uses: maxUses }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: "Failed to generate invite code" }));
    throw new Error((data as { error?: string }).error || "Failed to generate invite code");
  }
  return await resp.json() as { code: string };
}

export async function listInviteCodes(username: string): Promise<InviteCode[]> {
  const resp = await fetch(`/api/invite/list?username=${encodeURIComponent(username)}`, {
    headers: getSessionAuthHeaders(),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: "Failed to list invite codes" }));
    throw new Error((data as { error?: string }).error || "Failed to list invite codes");
  }
  const json = await resp.json() as { codes: InviteCode[] };
  return json.codes || [];
}

export async function fetchPublicMessages(limit = 100): Promise<ChatMessage[]> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    const resp = await fetch(`/api/messages?${params}`, { redirect: "manual" });
    if (!resp.ok) return [];
    const data = await resp.json() as { messages?: ChatMessage[] };
    return data.messages || [];
  } catch {
    return [];
  }
}

// ─── OIDC (TokenDance ID) ──────────────────────────────────────────

export interface OIDCConfig {
  enabled: boolean;
  issuer: string;
  client_id: string;
  redirect_uri: string;
  auth_url: string;
  token_url: string;
}

export interface OIDCExchangeResponse {
  success: boolean;
  username: string;
  access_token: string;
  refresh_token?: string;
  session_token: string;
}

export async function fetchOIDCConfig(): Promise<OIDCConfig> {
  const resp = await fetch("/api/oidc/config", { redirect: "manual" });
  if (!resp.ok) throw new Error("OIDC not available");
  return (await resp.json()) as OIDCConfig;
}

export async function oidcExchangeCode(
  code: string,
  codeVerifier: string,
): Promise<OIDCExchangeResponse> {
  const resp = await fetch("/api/oidc/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: codeVerifier }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: "Token exchange failed" }));
    throw new Error(
      (data as { error?: string }).error || "Token exchange failed",
    );
  }
  return (await resp.json()) as OIDCExchangeResponse;
}

export async function oidcRefreshToken(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const resp = await fetch("/api/oidc/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!resp.ok) throw new Error("Token refresh failed");
  return await resp.json();
}
