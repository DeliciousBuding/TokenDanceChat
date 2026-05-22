export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export interface ChatFolder {
  id: string;
  username: string;
  name: string;
  sort_order: number;
  created_at: number;
  item_count: number;
  items: string[];
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
  channel: "public" | "dm" | "group";
  target?: string;
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

// Forward types
export interface WSForwardEvent extends WSMessage {
  type: "forward";
  from: string;
  content: string;
  id: string;
  timestamp: number;
}

// Scheduled message types
export interface ScheduledMessage {
  id: string;
  username: string;
  content: string;
  room_id: string;
  to_user: string;
  group_name: string;
  reply_to_id: string;
  thread_id: string;
  send_at: number;
  created_at: number;
  sent: number;
}

export interface CustomEmoji {
  id: string;
  name: string;
  url: string;
  uploader: string;
  room_id: string;
  created_at: number;
}

export interface WSScheduledMessageConfirm extends WSMessage {
  type: "scheduled_message_confirm";
  id: string;
  content: string;
  username: string;
  timestamp: number;
  room_id?: string;
  to?: string;
  group?: string;
}

export interface WSScheduledMessagesList extends WSMessage {
  type: "scheduled_messages_list";
  messages: ScheduledMessage[];
}

export interface WSScheduledMessageSent extends WSMessage {
  type: "scheduled_message_sent";
  id: string;
  content: string;
  username: string;
  timestamp: number;
}

export interface WSScheduledMessageCancelled extends WSMessage {
  type: "scheduled_message_cancelled";
  id: string;
}

// Call signaling types
export interface CallRecord {
  id: string;
  caller: string;
  callee: string;
  call_type: string;
  status: string;
  started_at: number;
  ended_at: number;
  created_at: number;
}

export interface WSCallIncoming extends WSMessage {
  type: "call_incoming";
  call_id: string;
  from: string;
  to: string;
  call_type: string;
  sdp: string;
}

export interface WSCallAccepted extends WSMessage {
  type: "call_accepted";
  call_id: string;
  from: string;
  to: string;
  call_type: string;
  sdp: string;
}

export interface WSCallRejected extends WSMessage {
  type: "call_rejected";
  call_id: string;
  from: string;
  to: string;
  call_type: string;
  content: string;
}

export interface WSCallEnded extends WSMessage {
  type: "call_ended";
  call_id: string;
  from: string;
  to: string;
  call_type: string;
}

export interface WSCallIceCandidate extends WSMessage {
  type: "call_ice_candidate";
  call_id: string;
  from: string;
  to: string;
  candidate: string;
}

export interface WSCallList extends WSMessage {
  type: "call_list";
  calls: CallRecord[];
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
        // Close the timed-out socket to prevent orphaned onopen from
        // writing to a newer connection.
        this.ws?.close();
      }, 8000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        if (!this.pendingJoin) return; // Timed out, ignore.
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

  sendGroupInviteAccept(group: string, from: string): void {
    this.send({ type: "group_invite_accept", group, from });
  }

  sendGroupInviteDecline(group: string): void {
    this.send({ type: "group_invite_decline", group });
  }

  deleteMessage(id: string): void {
    this.send({ type: "message_delete", id });
  }

  sendMarkRead(context?: string, to?: string): void {
    this.send({ type: "mark_read", context, to });
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
    this.send({ type: "typing_start", context: ctx?.channel, to: ctx?.target, preview: ctx?.preview });
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

  sendPinConversation(key: string): void {
    this.send({ type: "pin_conversation", key });
  }

  sendUnpinConversation(key: string): void {
    this.send({ type: "unpin_conversation", key });
  }

  sendMuteConversation(key: string): void {
    this.send({ type: "mute_conversation", key });
  }

  sendUnmuteConversation(key: string): void {
    this.send({ type: "unmute_conversation", key });
  }

  sendSetNotificationPrefs(key: string, mutedUntil: number, showPreview: boolean): void {
    this.send({ type: "notification_prefs_set", key, muted_until: mutedUntil, show_preview: showPreview });
  }

  sendGetNotificationPrefs(): void {
    this.send({ type: "notification_prefs_get" });
  }

  sendArchiveConversation(key: string): void {
    this.send({ type: "archive_conversation", key });
  }

  sendUnarchiveConversation(key: string): void {
    this.send({ type: "unarchive_conversation", key });
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

  sendScheduleMessage(content: string, sendAt: number, roomId?: string, to?: string, group?: string, replyToId?: string, threadId?: string): void {
    this.send({
      type: "schedule_message",
      content,
      timestamp: sendAt,
      room_id: roomId ?? "",
      to: to ?? "",
      group: group ?? "",
      reply_to_id: replyToId ?? "",
      thread_id: threadId ?? "",
    });
  }

  sendCancelScheduledMessage(id: string): void {
    this.send({ type: "cancel_scheduled_message", id });
  }

  sendScheduledMessagesList(): void {
    this.send({ type: "scheduled_messages_list" });
  }

  // Group admin
  sendGroupKick(group: string, username: string): void {
    this.send({ type: "group_kick", group, username });
  }

  sendGroupSetRole(group: string, username: string, role: string): void {
    this.send({ type: "group_set_role", group, username, role });
  }

  sendGroupRename(group: string, newName: string): void {
    this.send({ type: "group_rename", group, content: newName });
  }

  sendGroupTransfer(group: string, newOwner: string): void {
    this.send({ type: "group_transfer", group, username: newOwner });
  }

  sendGroupLeave(group: string): void {
    this.send({ type: "group_leave", group });
  }

  sendGroupInfo(group: string): void {
    this.send({ type: "group_info", group });
  }

  // Call signaling
  sendCallStart(to: string, callType: "video" | "voice", sdp: string): void {
    this.send({ type: "call_start", to, call_type: callType, sdp });
  }

  sendCallAccept(callId: string, sdp: string): void {
    this.send({ type: "call_accept", call_id: callId, sdp });
  }

  sendCallReject(callId: string): void {
    this.send({ type: "call_reject", call_id: callId });
  }

  sendCallEnd(callId: string): void {
    this.send({ type: "call_end", call_id: callId });
  }

  sendCallIceCandidate(callId: string, candidate: string): void {
    this.send({ type: "call_ice_candidate", call_id: callId, candidate });
  }

  sendCallList(): void {
    this.send({ type: "call_list" });
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

  async uploadEmoji(file: File, name: string): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      const resp = await fetch("/api/upload/emoji", { method: "POST", body: formData });
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

  async exportChat(conversation: string, format: 'json' | 'text', username?: string): Promise<Blob> {
    const params = new URLSearchParams({ conversation, format });
    if (username) params.set("username", username);
    const resp = await fetch(`/api/export?${params}`);
    if (!resp.ok) {
      throw new Error("Export failed");
    }
    return await resp.blob();
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

  sendFolderCreate(name: string): void {
    this.send({ type: "folder_create", content: name });
  }

  sendFolderDelete(id: string): void {
    this.send({ type: "folder_delete", id });
  }

  sendFolderRename(id: string, newName: string): void {
    this.send({ type: "folder_rename", id, content: newName });
  }

  sendFolderAddConversation(folderId: string, key: string): void {
    this.send({ type: "folder_add_conversation", id: folderId, key });
  }

  sendFolderRemoveConversation(folderId: string, key: string): void {
    this.send({ type: "folder_remove_conversation", id: folderId, key });
  }

  sendFolderList(): void {
    this.send({ type: "folder_list" });
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

// --- Auth API (HTTP-based, not WebSocket) ---

export interface RegisterResponse {
  success: boolean;
  username: string;
}

export interface LoginResponse {
  success: boolean;
  username: string;
}

export interface InviteCode {
  code: string;
  creator: string;
  max_uses: number;
  use_count: number;
  created_at: number;
}

export async function registerUser(username: string, password: string, inviteCode: string): Promise<RegisterResponse> {
  const resp = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, invite_code: inviteCode }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: "Registration failed" }));
    throw new Error((data as { error?: string }).error || "Registration failed");
  }
  return await resp.json() as RegisterResponse;
}

export async function loginUser(username: string, password: string): Promise<LoginResponse> {
  const resp = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: "Login failed" }));
    throw new Error((data as { error?: string }).error || "Login failed");
  }
  return await resp.json() as LoginResponse;
}

export async function generateInviteCode(username: string, maxUses: number = 5): Promise<{ code: string }> {
  const resp = await fetch("/api/invite/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, max_uses: maxUses }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: "Failed to generate invite code" }));
    throw new Error((data as { error?: string }).error || "Failed to generate invite code");
  }
  return await resp.json() as { code: string };
}

export async function listInviteCodes(username: string): Promise<InviteCode[]> {
  const resp = await fetch(`/api/invite/list?username=${encodeURIComponent(username)}`);
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: "Failed to list invite codes" }));
    throw new Error((data as { error?: string }).error || "Failed to list invite codes");
  }
  const json = await resp.json() as { codes: InviteCode[] };
  return json.codes || [];
}
