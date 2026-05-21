export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  username: string;
  content: string;
  timestamp: number;
}

export interface WSChatMessage extends WSMessage {
  type: "message";
  id: string;
  username: string;
  content: string;
  timestamp: number;
}

export interface WSHistoryMessage extends WSMessage {
  type: "history";
  messages: ChatMessage[];
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

export interface WSJoinRequest {
  type: "join";
  username: string;
}

export interface WSSendMessage {
  type: "message";
  content: string;
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

  send(data: WSJoinRequest | WSSendMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("WebSocket not connected, cannot send message");
    }
  }

  sendMessage(content: string): void {
    this.send({ type: "message", content });
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
