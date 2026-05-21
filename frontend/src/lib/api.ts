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

export interface WSJoinRequest {
  type: "join";
  username: string;
}

export interface WSSendMessage {
  type: "message";
  content: string;
}

export type WSEventHandler = (msg: WSMessage) => void;

class ChatAPI {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Set<WSEventHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private intentionalClose = false;

  constructor(url: string = "ws://localhost:8080/ws") {
    this.url = url;
  }

  connect(username: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.intentionalClose = false;
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        // Send join message
        this.send({ type: "join", username });
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSMessage;
          this.dispatch(data.type, data);
          // Also dispatch to the catch-all "*" handler
          this.dispatch("*", data);
        } catch {
          console.warn("Failed to parse WebSocket message:", event.data);
        }
      };

      this.ws.onclose = () => {
        if (!this.intentionalClose) {
          this.attemptReconnect(username);
        }
      };

      this.ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        if (this.ws?.readyState !== WebSocket.OPEN) {
          reject(new Error("Failed to connect to chat server"));
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
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

    this.reconnectTimer = setTimeout(() => {
      console.log(`Reconnecting... attempt ${this.reconnectAttempts}`);
      this.connect(username).catch(() => {
        // Error already logged in connect
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

    // Return unsubscribe function
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

export const chatAPI = new ChatAPI("ws://localhost:8080/ws");
