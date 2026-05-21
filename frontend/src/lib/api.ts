export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
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
}

export interface WSChatMessage extends WSMessage {
  type: "message";
  id: string;
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
}

export interface TypingContext {
  channel: "public" | "dm" | "group";
  target?: string;
}

export interface UserStatus {
  username: string;
  online: boolean;
  last_seen: number;
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
  content: string;
  reply_to_id?: string;
  reply_to_content?: string;
  reply_to_user?: string;
}

export interface WSDMMessage {
  type: "dm_message";
  content: string;
  to: string;
  reply_to_id?: string;
  reply_to_content?: string;
  reply_to_user?: string;
}

export interface WSGroupMessage {
  type: "group_message";
  content: string;
  group: string;
  reply_to_id?: string;
  reply_to_content?: string;
  reply_to_user?: string;
}

export interface WSFriendRequest {
  type: "friend_request";
  to: string;
}

export interface WSFriendAccept {
  type: "friend_accept";
  from: string;
}

export interface WSFriendReject {
  type: "friend_reject";
  from: string;
}

export interface WSGroupCreate {
  type: "group_create";
  group: string;
  members?: string[];
}

export interface WSGroupInvite {
  type: "group_invite";
  group: string;
  username: string;
}

export interface WSMessageDelete {
  type: "message_delete";
  id: string;
}

export interface WSMarkRead {
  type: "mark_read";
}

// Room types
export interface RoomInfo {
  id: string;
  name: string;
}

export interface WSRoomList extends WSMessage {
  type: "room_list";
  rooms: RoomInfo[];
}

export interface WSRoomJoin extends WSMessage {
  type: "room_join";
  room_id: string;
}

// Link preview types
export interface LinkPreviewData {
  title: string;
  description: string;
  image: string;
  url: string;
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

// Forward types
export interface WSForwardEvent extends WSMessage {
  type: "forward";
  from: string;
  content: string;
  id: string;
  timestamp: number;
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

export type WSEventHandler = (msg: WSMessage) => void;

export const ErrorCode = {
  TIMEOUT: "ERR_TIMEOUT",
  CLOSED: "ERR_CLOSED",
  CANNOT_CONNECT: "ERR_CANNOT_CONNECT",
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
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private intentionalClose = false;
  private pendingJoin:
    | {
        resolve: () => void;
        reject: (err: Error) => void;
      }
    | null = null;

  constructor(url: string = "ws://localhost:8080/ws") {
    this.url = url;
  }

  connect(username: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.intentionalClose = false;
      this.pendingJoin = { resolve, reject };
      this.ws = new WebSocket(this.url);

      const timeout = setTimeout(() => {
        if (this.pendingJoin) {
          this.pendingJoin.reject(
            new ChatError(ErrorCode.TIMEOUT, "Connection timed out"),
          );
          this.pendingJoin = null;
        }
      }, 8000);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.send({ type: "join", username });
      };

      this.ws.onmessage = (event) => {
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

          // Confirm join when we receive history.
          if (data.type === "history" && this.pendingJoin) {
            clearTimeout(timeout);
            this.pendingJoin.resolve();
            this.pendingJoin = null;
          }

          this.dispatch(data.type, data);
          this.dispatch("*", data);
        } catch {
          console.warn("Failed to parse WebSocket message:", event.data);
        }
      };

      this.ws.onclose = () => {
        if (this.pendingJoin) {
          clearTimeout(timeout);
          this.pendingJoin.reject(
            new ChatError(ErrorCode.CLOSED, "Connection closed"),
          );
          this.pendingJoin = null;
        }
        if (!this.intentionalClose) {
          this.attemptReconnect(username);
        }
      };

      this.ws.onerror = () => {
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

  private attemptReconnect(username: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn("Max reconnection attempts reached");
      this.dispatch("connection_lost", { type: "connection_lost" });
      return;
    }

    this.reconnectAttempts++;
    const delay =
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

    this.reconnectTimer = setTimeout(() => {
      console.log(`Reconnecting... attempt ${this.reconnectAttempts}`);
      this.connect(username).catch(() => {
        // Error already logged in connect.
      });
    }, delay);
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("WebSocket not connected, cannot send message");
    }
  }

  sendMessage(content: string, replyTo?: ChatMessage): void {
    if (replyTo) {
      this.send({
        type: "message",
        content,
        reply_to_id: replyTo.id,
        reply_to_content: replyTo.content,
        reply_to_user: replyTo.username,
      });
    } else {
      this.send({ type: "message", content });
    }
  }

  sendDMMessage(to: string, content: string, replyTo?: ChatMessage): void {
    this.send({
      type: "dm_message",
      content,
      to,
      ...(replyTo
        ? {
            reply_to_id: replyTo.id,
            reply_to_content: replyTo.content,
            reply_to_user: replyTo.username,
          }
        : {}),
    });
  }

  sendGroupMessage(
    group: string,
    content: string,
    replyTo?: ChatMessage,
  ): void {
    this.send({
      type: "group_message",
      content,
      group,
      ...(replyTo
        ? {
            reply_to_id: replyTo.id,
            reply_to_content: replyTo.content,
            reply_to_user: replyTo.username,
          }
        : {}),
    });
  }

  sendFriendRequest(to: string): void {
    this.send({ type: "friend_request", to });
  }

  sendFriendAccept(from: string): void {
    this.send({ type: "friend_accept", from });
  }

  sendFriendReject(from: string): void {
    this.send({ type: "friend_reject", from });
  }

  sendGroupCreate(name: string, members?: string[]): void {
    this.send({ type: "group_create", group: name, members });
  }

  sendGroupInvite(group: string, username: string): void {
    this.send({ type: "group_invite", group, username });
  }

  deleteMessage(id: string): void {
    this.send({ type: "message_delete", id });
  }

  sendMarkRead(): void {
    this.send({ type: "mark_read" });
  }

  sendRoomJoin(roomID: string): void {
    this.send({ type: "room_join", room_id: roomID });
  }

  sendRoomCreate(name: string): void {
    this.send({ type: "room_create", group: name });
  }

  sendRoomLeave(): void {
    this.send({ type: "room_leave" });
  }

  sendForward(messageID: string, toUsername: string): void {
    this.send({ type: "forward", id: messageID, to: toUsername });
  }

  sendTypingStart(ctx?: TypingContext): void {
    this.send({ type: "typing_start", context: ctx?.channel, to: ctx?.target });
  }

  sendTypingStop(ctx?: TypingContext): void {
    this.send({ type: "typing_stop", context: ctx?.channel, to: ctx?.target });
  }

  sendReaction(messageId: string, emoji: string): void {
    this.send({ type: "reaction", message_id: messageId, emoji });
  }

  sendMessageEdit(messageId: string, content: string): void {
    this.send({ type: "message_edit", id: messageId, content });
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

  async uploadImage(file: File): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch("/api/upload", { method: "POST", body: formData });
      if (!resp.ok) return null;
      const data = await resp.json() as { url: string };
      return data.url;
    } catch {
      return null;
    }
  }

  async searchMessages(query: string, roomID?: string): Promise<SearchResult[]> {
    try {
      const params = new URLSearchParams({ q: query });
      if (roomID) params.set("room", roomID);
      const resp = await fetch(`/api/search?${params}`);
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

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.handlers.clear();
  }
}

function getDefaultWSURL(): string {
  // Use current page host in production, localhost in dev.
  const host = window.location.host || "localhost:8080";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${host}/ws`;
}

export const chatAPI = new ChatAPI(getDefaultWSURL());
