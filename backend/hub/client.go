package hub

import (
	"context"
	"encoding/json"

	"log"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"tokendancechat/backend/llm"
	"tokendancechat/backend/store"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 8192

	// Rate limit: max messages per second per connection.
	maxMessagesPerSecond = 5
)

// Client represents a single WebSocket connection.
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	username string
	// rate limiting
	msgTimestamps   []int64
	msgTimestampsMu sync.Mutex
	// current room
	currentRoomID string
	roomMu        sync.RWMutex
	// Assistant concurrency guard so a single public message can only trigger
	// one bot reply at a time.
	tokenBotResponding atomic.Bool
}

// getCurrentRoomID returns the client's current room ID with read locking.
func (c *Client) getCurrentRoomID() string {
	c.roomMu.RLock()
	defer c.roomMu.RUnlock()
	return c.currentRoomID
}

// setCurrentRoomID sets the client's current room ID with write locking.
func (c *Client) setCurrentRoomID(roomID string) {
	c.roomMu.Lock()
	c.currentRoomID = roomID
	c.roomMu.Unlock()
}

// NewClient creates a new WebSocket client.
func NewClient(h *Hub, conn *websocket.Conn) *Client {
	defaultRoomID := h.DefaultRoomID()
	return &Client{
		hub:           h,
		conn:          conn,
		send:          make(chan []byte, 256),
		currentRoomID: defaultRoomID,
	}
}

// ReadPump pumps messages from the WebSocket connection to the hub.
func (c *Client) ReadPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("websocket read error: %v", err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("invalid JSON from client: %v", err)
			continue
		}

		switch msg.Type {
		case "join":
			c.handleJoin(msg)
		case "message":
			c.handleChatMessage(msg)
		case "reaction":
			c.handleReaction(msg)
		case "message_edit":
			c.handleMessageEdit(msg)
		case "mark_read":
			// Broadcast read receipt to message senders so they know their
			// messages were seen. Context indicates which conversation was read.
			c.handleMarkRead(msg)
		case "message_delete":
			c.handleMessageDelete(msg)
		case "typing_start":
			c.handleTypingStart(msg)
		case "typing_stop":
			c.handleTypingStop(msg)
		case "block":
			c.handleBlock(msg)
		case "unblock":
			c.handleUnblock(msg)
		case "block_list":
			c.handleBlockList()
		case "pin_message":
			c.handlePinMessage(msg)
		case "unpin_message":
			c.handleUnpinMessage(msg)
		case "load_history":
			c.handleLoadHistory(msg)
		case "thread_messages":
			c.handleThreadMessages(msg)
		case "notification_prefs_set":
			c.handleNotificationPrefsSet(msg)
		case "custom_emoji_add":
			c.handleCustomEmojiAdd(msg)
		case "custom_emoji_list":
			c.handleCustomEmojiList()
		case "custom_emoji_delete":
			c.handleCustomEmojiDelete(msg)
		case "translate_message":
			c.handleTranslateMessage(msg)
		case "profile_update":
			c.handleProfileUpdate(msg)
		case "profile_get":
			c.handleProfileGet(msg)
		case "poll_create":
			c.handlePollCreate(msg)
		case "poll_vote":
			c.handlePollVote(msg)
		case "poll_close":
			c.handlePollClose(msg)
		default:
			log.Printf("unknown message type: %s", msg.Type)
		}
	}
}

func (c *Client) handleJoin(msg Message) {
	username := msg.Username
	if !ValidateUsername(username) {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "invalid username: 1-20 chars, letters, digits, underscore, or Chinese",
			ErrorCode: "INVALID_USERNAME",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Block reserved usernames.
	if IsReservedUsername(username) {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "username is reserved",
			ErrorCode: "RESERVED_USERNAME",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	if _, err := c.hub.store.GetOIDCUserByUsername(username); err == nil {
		if msg.Token == "" {
			c.sendJoinError("OIDC authentication required", "OIDC_REQUIRED")
			return
		}
		if err := c.hub.verifyOIDCJoinToken(username, msg.Token); err != nil {
			c.sendJoinError("OIDC authentication failed", "OIDC_AUTH_FAILED")
			return
		}
	} else {
		registered, err := c.hub.store.UserExists(username)
		if err != nil {
			c.sendJoinError("authentication lookup failed", "AUTH_FAILED")
			return
		}
		if registered {
			if msg.Token == "" {
				c.sendJoinError("authentication required", "AUTH_REQUIRED")
				return
			}
			if err := c.hub.verifySessionJoinToken(username, msg.Token); err != nil {
				c.sendJoinError("authentication failed", "AUTH_FAILED")
				return
			}
		} else if msg.Token != "" {
			c.sendJoinError("authentication failed", "AUTH_FAILED")
			return
		}
	}

	c.username = username
	c.hub.SetLastSeen(c.username, time.Now().UnixMilli())
	c.hub.register <- c

	// Join default room.
	c.hub.JoinRoom(c.currentRoomID, c.username)

	// Send room-specific history to the joining client.
	historyMessages := c.hub.store.GetRoomMessages(c.currentRoomID, 100, 0)
	historyPayload, _ := json.Marshal(Message{
		Type:     "history",
		Messages: historyMessages,
		RoomID:   c.currentRoomID,
	})
	select {
	case c.send <- historyPayload:
	default:
	}

	// Send room list to the joining client.
	rooms := c.hub.ListRooms()
	roomListPayload, _ := json.Marshal(Message{
		Type:  "room_list",
		Rooms: rooms,
	})
	select {
	case c.send <- roomListPayload:
	default:
	}

	// Send notification preferences.
	notifPrefs := c.hub.ListNotificationPrefs(c.username)
	notifPrefsPayload, _ := json.Marshal(Message{
		Type:       "notification_prefs",
		NotifPrefs: notifPrefs,
	})
	select {
	case c.send <- notifPrefsPayload:
	default:
	}

	// Send user status list to the joining client.
	allUsers := c.hub.AllUserStatus()
	userStatusPayload, _ := json.Marshal(Message{
		Type:  "user_status",
		Users: allUsers,
	})
	select {
	case c.send <- userStatusPayload:
	default:
	}

	// Broadcast user_joined to all clients.
	now := time.Now().UnixMilli()
	joinMsg, _ := json.Marshal(Message{
		Type:      "user_joined",
		Username:  c.username,
		Online:    c.hub.onlineUsers(),
		Timestamp: now,
	})
	select {
	case c.hub.broadcast <- joinMsg:
	default:
	}

	// Broadcast updated user_status to all clients.
	statusBroadcast, _ := json.Marshal(Message{
		Type:  "user_status",
		Users: c.hub.AllUserStatus(),
	})
	select {
	case c.hub.broadcast <- statusBroadcast:
	default:
	}
}

func (c *Client) sendJoinError(content, code string) {
	errMsg, _ := json.Marshal(Message{
		Type:      "error",
		Content:   content,
		ErrorCode: code,
	})
	select {
	case c.send <- errMsg:
	default:
	}
}

func (c *Client) handleChatMessage(msg Message) {
	if c.username == "" {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "you must join before sending messages",
			ErrorCode: "NOT_JOINED",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Sanitize content.
	content := sanitizeContent(msg.Content)
	if content == "" {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "message content cannot be empty",
			ErrorCode: "EMPTY_MESSAGE",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Rate limiting: max 5 messages per second.
	if !c.checkRateLimit() {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "rate limit exceeded: max 5 messages per second",
			ErrorCode: "RATE_LIMITED",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	currentRoom := c.getCurrentRoomID()

	// Save to store.
	storedMsg, err := c.hub.store.InsertMessage(c.username, content, msg.ReplyToID, currentRoom, "", "", msg.ThreadID)
	if err != nil {
		log.Printf("failed to insert message: %v", err)
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "failed to save message, please try again",
			ErrorCode: "SERVER_ERROR",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Broadcast only to clients in the current room. Public room messages may
	// contain private context after a room switch, so global fanout is unsafe.
	broadcastMsg, _ := json.Marshal(Message{
		Type:            "message",
		ID:              storedMsg.ID,
		ClientMessageID: msg.ClientMessageID,
		Username:        storedMsg.Username,
		Content:         storedMsg.Content,
		Timestamp:       storedMsg.Timestamp,
		ReplyToID:       storedMsg.ReplyToID,
		ReplyToContent:  msg.ReplyToContent,
		ReplyToUser:     msg.ReplyToUser,
		ThreadID:        storedMsg.ThreadID,
		RoomID:          currentRoom,
		MentionAll:      containsAllMention(content),
	})
	c.hub.BroadcastToRoom(broadcastMsg, currentRoom)

	// Notify @mentioned users (skip self, assistants, and reserved @all/@everyone).
	if containsAllMention(content) {
		allNotify, _ := json.Marshal(Message{
			Type:       "mention_all",
			From:       c.username,
			Content:    content,
			MessageID:  storedMsg.ID,
			RoomID:     currentRoom,
			Timestamp:  storedMsg.Timestamp,
			MentionAll: true,
		})
		c.hub.BroadcastToRoom(allNotify, currentRoom)
	} else {
		for _, mention := range parseMentions(content) {
			if mention == c.username || mention == c.hub.BotName() {
				continue
			}
			notifyMsg, _ := json.Marshal(Message{
				Type:      "mention_notify",
				From:      c.username,
				Content:   content,
				MessageID: storedMsg.ID,
				RoomID:    currentRoom,
				Timestamp: storedMsg.Timestamp,
			})
			c.hub.SendToUserInRoom(mention, currentRoom, notifyMsg)
		}
	}

	// Store the user message in LLM memory.
	if mem := c.hub.Memory(); mem != nil {
		mem.Add(llm.Message{Role: "user", Content: content, Username: c.username})
	}

	// Check for @mentions and route the single bot (TokenBot).
	targets := assistantMentionTarget(content, c.hub.BotName())
	if targets.TokenBot && c.username != c.hub.BotName() && c.hub.LLMClient() != nil {
		if !c.hub.CheckBotCooldown("bot:" + c.username) {
			// Within 30s per-user cooldown, silently skip.
		} else if c.tokenBotResponding.CompareAndSwap(false, true) {
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			go func() {
				defer cancel()
				defer c.tokenBotResponding.Store(false)
				c.handleBotResponse(ctx, content, currentRoom)
			}()
		}
	} else if targets.TokenBot && c.username != c.hub.BotName() && c.hub.LLMClient() == nil {
		// Bot mentioned but not configured — send error feedback
		systemMsg, _ := json.Marshal(Message{
			Type:     "system",
			Username: "system",
			Content:  "TokenBot is not configured on this server.",
			RoomID:   currentRoom,
		})
		c.hub.BroadcastToRoom(systemMsg, currentRoom)
	}
}

// handleReaction processes a reaction toggle request.
func (c *Client) handleReaction(msg Message) {
	if c.username == "" {
		return
	}
	if !c.checkRateLimit() {
		return
	}
	messageID := msg.ID
	if messageID == "" {
		messageID = msg.MessageID
	}
	emoji := msg.Emoji
	if messageID == "" || emoji == "" {
		return
	}

	reactions, err := c.hub.store.ToggleReaction(messageID, emoji, c.username)
	if err != nil {
		log.Printf("failed to toggle reaction: %v", err)
		return
	}

	reactionMsg, _ := json.Marshal(Message{
		Type:      "reaction_update",
		ID:        messageID,
		Reactions: reactions,
	})
	select {
	case c.hub.broadcast <- reactionMsg:
	default:
	}
}

// handleMessageEdit processes a message edit request.
func (c *Client) handleMessageEdit(msg Message) {
	if c.username == "" {
		return
	}
	messageID := msg.ID
	content := sanitizeContent(msg.Content)
	if messageID == "" || content == "" {
		return
	}

	stored, err := c.hub.store.GetMessageByID(messageID)
	if err != nil {
		log.Printf("message_edit: message not found: %v", err)
		return
	}
	if stored.Username != c.username {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "you can only edit your own messages",
			ErrorCode: "NOT_OWNER",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	if !c.checkRateLimit() {
		return
	}

	updated, err := c.hub.store.UpdateMessage(messageID, content)
	if err != nil {
		log.Printf("failed to update message: %v", err)
		return
	}

	editMsg, _ := json.Marshal(Message{
		Type:      "message_edit",
		ID:        updated.ID,
		Username:  updated.Username,
		Content:   updated.Content,
		Timestamp: updated.Timestamp,
		Edited:    true,
	})
	c.hub.BroadcastToRoom(editMsg, updated.RoomID)
}

// checkRateLimit returns true if the message is allowed (within rate limit).
func (c *Client) checkRateLimit() bool {
	c.msgTimestampsMu.Lock()
	defer c.msgTimestampsMu.Unlock()

	now := time.Now().UnixMilli()
	oneSecondAgo := now - 1000

	// Filter out old timestamps.
	filtered := make([]int64, 0, len(c.msgTimestamps))
	for _, ts := range c.msgTimestamps {
		if ts > oneSecondAgo {
			filtered = append(filtered, ts)
		}
	}

	if len(filtered) >= maxMessagesPerSecond {
		c.msgTimestamps = filtered
		return false
	}

	filtered = append(filtered, now)
	c.msgTimestamps = filtered
	return true
}

// WritePump pumps messages from the hub to the WebSocket connection.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		// Notify hub to unregister on write failure.
		select {
		case c.hub.unregister <- c:
		default:
		}
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel.
				c.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("websocket write error: %v", err)
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

const maxContentLength = 2000

// mentionRegex matches @username patterns in message content.
var mentionRegex = regexp.MustCompile(`@([\p{Han}\p{L}\p{N}_]+)`)

// allMentionRegex matches @all / @everyone / @here / @channel mentions.
var allMentionRegex = regexp.MustCompile(`(?i)@(all|everyone|here|channel)\b`)

// parseMentions extracts all @mentioned usernames from content.
func parseMentions(content string) []string {
	matches := mentionRegex.FindAllStringSubmatch(content, -1)
	mentions := make([]string, 0, len(matches))
	seen := make(map[string]bool)
	for _, m := range matches {
		if len(m) > 1 {
			username := m[1]
			if !seen[username] {
				seen[username] = true
				mentions = append(mentions, username)
			}
		}
	}
	return mentions
}

// containsAllMention returns true if the content contains @all, @everyone, @here, or @channel.
func containsAllMention(content string) bool {
	return allMentionRegex.MatchString(content)
}

type assistantMentionTargets struct {
	TokenBot bool
}

func assistantMentionTarget(content, botName string) assistantMentionTargets {
	targets := assistantMentionTargets{}
	for _, mention := range parseMentions(content) {
		if isAssistantAlias(mention, botName, "bot", "tokenbot", "webuichat", "webuibot", "webui") {
			targets.TokenBot = true
		}
	}
	return targets
}

func isAssistantAlias(mention, canonical string, aliases ...string) bool {
	if canonical != "" && strings.EqualFold(mention, canonical) {
		return true
	}
	for _, alias := range aliases {
		if strings.EqualFold(mention, alias) {
			return true
		}
	}
	return false
}

// Notify the requester.

// Update the accepter's friend list.

// Notify the requester that their request was rejected.

// --- Group system handlers ---

// Notify creator with group info.

// Record pending invite.

// Notify invited user — they must accept or decline.

// Auto-unarchive the group conversation for the sender.

// Rate limit.

// Persist to store.

// Send to all group members.

// Notify @mentioned users (skip self and assistants).
// If @all / @everyone / @here is used, notify all group members instead.

// Require a pending invite or existing membership.

// Notify group members.

// Send confirmation to joiner.

// Block check: if recipient has blocked sender, reject.

// Auto-unarchive the DM conversation for the sender.

// Persist to store.

// Send to recipient.

// Only mark delivered if recipient was online.

// Send echo back to sender.

func (c *Client) handleMessageDelete(msg Message) {
	if c.username == "" {
		return
	}
	messageID := msg.ID
	if messageID == "" {
		return
	}

	// Verify ownership: only the message author can delete.
	stored, err := c.hub.store.GetMessageByID(messageID)
	if err != nil {
		log.Printf("message_delete: message not found: %v", err)
		return
	}
	if stored.Username != c.username {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "you can only delete your own messages",
			ErrorCode: "NOT_OWNER",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	if err := c.hub.store.MarkDeleted(messageID); err != nil {
		log.Printf("failed to mark message deleted: %v", err)
		return
	}

	// Broadcast deletion.
	delMsg, _ := json.Marshal(Message{
		Type:    "message_delete",
		ID:      messageID,
		Deleted: true,
	})
	select {
	case c.hub.broadcast <- delMsg:
	default:
	}
}

// Rate limited to once per 3 seconds per user.
func (c *Client) handleTypingStart(msg Message) {
	if c.username == "" {
		return
	}
	if !c.hub.ShouldBroadcastTyping(c.username) {
		return
	}
	c.hub.BroadcastTyping(c.username, "typing", msg.Context, msg.To)
}

// handleTypingStop broadcasts that the user stopped typing.
func (c *Client) handleTypingStop(msg Message) {
	if c.username == "" {
		return
	}
	c.hub.BroadcastTyping(c.username, "typing_stop", msg.Context, msg.To)
}

// --- Room system handlers ---

// Notify all clients of the new room list.

// Confirm to creator.

// Leave current room.

// Join new room.

// Send room history.

// Notify frontend of room switch.

// Join default room.

// Send default room history.

// Notify frontend.

// --- Forward message handler ---

// Block forwarding of private DM messages.

// Block forwarding of deleted messages.

// Persist as a new message.

// Broadcast forwarded message.

// Also send to target user if online.

// handlePinMessage pins a message in the current room.
func (c *Client) handlePinMessage(msg Message) {
	if c.username == "" {
		return
	}
	messageID := msg.ID
	if messageID == "" {
		return
	}
	roomID := c.getCurrentRoomID()
	if err := c.hub.PinMessage(roomID, messageID, c.username); err != nil {
		log.Printf("pin error: %v", err)
		return
	}
	// Broadcast pin event.
	pinMsg, _ := json.Marshal(Message{
		Type:     "pinned",
		ID:       messageID,
		RoomID:   roomID,
		PinnedBy: c.username,
		PinnedAt: time.Now().UnixMilli(),
		Pinned:   true,
	})
	c.hub.BroadcastToRoom(pinMsg, roomID)
}

// handleUnpinMessage unpins a message in the current room.
func (c *Client) handleUnpinMessage(msg Message) {
	if c.username == "" {
		return
	}
	messageID := msg.ID
	if messageID == "" {
		return
	}
	roomID := c.getCurrentRoomID()
	c.hub.UnpinMessage(roomID, messageID)
	// Broadcast unpin event.
	unpinMsg, _ := json.Marshal(Message{
		Type:   "unpinned",
		ID:     messageID,
		RoomID: roomID,
		Pinned: false,
	})
	c.hub.BroadcastToRoom(unpinMsg, roomID)
}

// handlePinConversation pins a conversation for the current user.

// Send updated list to all sessions of this user.

// handleUnpinConversation unpins a conversation for the current user.

// Send updated list to all sessions of this user.

// handleMuteConversation mutes a conversation for the current user.

// Send updated list to all sessions of this user.

// handleUnmuteConversation unmutes a conversation for the current user.

// Send updated list to all sessions of this user.

// handleArchiveConversation archives a conversation for the current user.

// Send updated list to all sessions of this user.

// handleUnarchiveConversation unarchives a conversation for the current user.

// Send updated list to all sessions of this user.

// handleNotificationPrefsSet stores notification preferences for a conversation and
// also syncs the old muted_conversations table for backward compatibility.
func (c *Client) handleNotificationPrefsSet(msg Message) {
	if c.username == "" {
		return
	}
	key := msg.Key
	if key == "" {
		return
	}
	mutedUntil := msg.MutedUntil
	showPreview := true
	if msg.ShowPreview != nil {
		showPreview = *msg.ShowPreview
	}
	if err := c.hub.SetNotificationPrefs(c.username, key, mutedUntil, showPreview); err != nil {
		log.Printf("notification_prefs_set error: %v", err)
		return
	}

	// Echo back the updated prefs for this conversation.
	mutedUntilVal, showPreviewVal, _ := c.hub.GetNotificationPrefs(c.username, key)
	showPreviewBool := showPreviewVal
	confirm, _ := json.Marshal(Message{
		Type:        "notification_prefs",
		Key:         key,
		MutedUntil:  mutedUntilVal,
		ShowPreview: &showPreviewBool,
	})
	select {
	case c.send <- confirm:
	default:
	}
}

// handleNotificationPrefsGet returns all notification preferences for the current user.

// handleLoadHistory sends older messages to the requesting client for pagination.
func (c *Client) handleLoadHistory(msg Message) {
	if c.username == "" {
		return
	}
	roomID := c.getCurrentRoomID()
	limit := 50
	before := msg.Timestamp
	if before <= 0 {
		return
	}
	messages := c.hub.store.GetRoomMessages(roomID, limit, before)
	historyPayload, _ := json.Marshal(Message{
		Type:     "history",
		Messages: messages,
		RoomID:   roomID,
	})
	select {
	case c.send <- historyPayload:
	default:
	}
}

// --- Block handlers ---

func (c *Client) handleBlock(msg Message) {
	if c.username == "" {
		return
	}
	blocked := msg.Username
	if blocked == "" || blocked == c.username {
		return
	}
	if err := c.hub.BlockUser(c.username, blocked); err != nil {
		log.Printf("block error: %v", err)
		return
	}
	confirm, _ := json.Marshal(Message{
		Type:     "block",
		Username: blocked,
	})
	select {
	case c.send <- confirm:
	default:
	}
}

func (c *Client) handleUnblock(msg Message) {
	if c.username == "" {
		return
	}
	blocked := msg.Username
	if blocked == "" {
		return
	}
	c.hub.UnblockUser(c.username, blocked)
	confirm, _ := json.Marshal(Message{
		Type:     "unblock",
		Username: blocked,
	})
	select {
	case c.send <- confirm:
	default:
	}
}

func (c *Client) handleBlockList() {
	if c.username == "" {
		return
	}
	blocked := c.hub.store.GetBlockedUsers(c.username)
	list, _ := json.Marshal(Message{
		Type:    "block_list",
		Blocked: blocked,
	})
	select {
	case c.send <- list:
	default:
	}
}

// handleGroupInviteAccept handles accepting a group invite.

// handleGroupInviteDecline handles declining a group invite.

// handleMarkRead broadcasts a read receipt so message senders know their messages were seen.
func (c *Client) handleMarkRead(msg Message) {
	if c.username == "" {
		return
	}
	// Notify users who sent messages to this reader based on context.
	receipt := Message{
		Type:    "read_receipt",
		From:    c.username,
		Context: msg.Context,
		To:      msg.To,
	}
	data, err := json.Marshal(receipt)
	if err != nil {
		return
	}
	// Broadcast to all so senders can see their messages were read.
	select {
	case c.hub.broadcast <- data:
	default:
	}
}

// This runs in its own goroutine and streams the response.
func (c *Client) handleBotResponse(ctx context.Context, userContent, roomID string) {
	// Send typing indicator.
	c.hub.BroadcastJSON(Message{
		Type:     "typing",
		Username: c.hub.BotName(),
		Context:  "public",
	})

	// Build conversation history from memory.
	var messages []llm.Message
	if mem := c.hub.Memory(); mem != nil {
		messages = mem.GetMessages()
	}

	client := c.hub.LLMClient()
	systemPrompt := c.hub.BuildSystemPrompt()

	var fullResponse strings.Builder
	err := client.ChatStream(ctx, systemPrompt, messages, func(chunk string) error {
		fullResponse.WriteString(chunk)
		c.hub.BroadcastStreamChunkToRoom(c.hub.BotName(), chunk, false, roomID)
		return nil
	})

	if err != nil {
		log.Printf("LLM stream error: %v", err)
		errorContent := "Sorry, I encountered an error while generating a response."
		// Send the error as a final stream chunk and persist.
		c.hub.BroadcastStreamChunkToRoom(c.hub.BotName(), errorContent, true, roomID)
		c.hub.SendBotMessageToRoom(errorContent, roomID)
		c.hub.BroadcastTyping(c.hub.BotName(), "typing_stop", "", "")
		return
	}

	response := fullResponse.String()
	response = sanitizeBotContent(response)
	if response != "" {
		// Broadcast the final done signal for the stream.
		c.hub.BroadcastStreamChunkToRoom(c.hub.BotName(), "", true, roomID)

		// Persist the complete message to the store and broadcast as a normal message.
		c.hub.SendBotMessageToRoom(response, roomID)

		// Stop typing indicator after bot finishes responding.
		c.hub.BroadcastTyping(c.hub.BotName(), "typing_stop", "", "")
	}

	// Update memory with the bot response.
	if mem := c.hub.Memory(); mem != nil {
		mem.Add(llm.Message{Role: "assistant", Content: response, Username: c.hub.BotName()})
	}
}

// sanitizeContent trims whitespace, strips null bytes, and enforces max length.
// Returns empty string if the result is whitespace-only.
func sanitizeContent(content string) string {
	// Strip null bytes.
	content = strings.ReplaceAll(content, "\x00", "")
	// Strip HTML tags to prevent stored XSS.
	content = htmlTagRe.ReplaceAllString(content, "")
	// Strip javascript: protocol and common event handlers.
	content = strings.ReplaceAll(content, "javascript:", "")
	// Trim whitespace.
	content = strings.TrimSpace(content)
	// Enforce max length.
	if len([]rune(content)) > maxContentLength {
		content = string([]rune(content)[:maxContentLength])
	}
	return content
}

// maxBotContentLength is the maximum char count for bot/agent response content.
const maxBotContentLength = 10000

// htmlTagRe matches HTML tags for stripping from user content.
var htmlTagRe = regexp.MustCompile(`<[^>]*>`)

// sanitizeBotContent strips null bytes and enforces max length for bot responses.
// Unlike sanitizeContent, it does NOT strip HTML tags, since bots may
// legitimately emit code snippets and markup. The frontend is responsible
// for HTML escaping in display.
func sanitizeBotContent(content string) string {
	content = strings.ReplaceAll(content, "\x00", "")
	content = strings.TrimSpace(content)
	if len([]rune(content)) > maxBotContentLength {
		content = string([]rune(content)[:maxBotContentLength])
	}
	return content
}

// IsReservedUsername blocks system and infrastructure usernames.
func IsReservedUsername(username string) bool {
	lower := strings.ToLower(username)
	reserved := []string{"system", "server", "admin", "moderator", "mod", "root", "null", "undefined", "everyone", "all", "chat", "here", "channel"}
	for _, r := range reserved {
		if lower == r {
			return true
		}
	}
	return false
}

// --- Thread message handlers ---

// handleThreadMessages returns all replies in a thread for a given parent message.
func (c *Client) handleThreadMessages(msg Message) {
	if c.username == "" {
		return
	}
	parentMessageID := msg.ParentMessageID
	if parentMessageID == "" {
		parentMessageID = msg.ID
	}
	if parentMessageID == "" {
		return
	}
	threadMessages := c.hub.store.GetThreadMessages(parentMessageID)
	payload, _ := json.Marshal(Message{
		Type:            "thread_messages",
		ParentMessageID: parentMessageID,
		Messages:        threadMessages,
	})
	select {
	case c.send <- payload:
	default:
	}
}

// --- Profile handlers ---

func (c *Client) handleProfileUpdate(msg Message) {
	if c.username == "" {
		return
	}
	if err := c.hub.store.UpsertUserProfile(c.username, msg.DisplayName, msg.AvatarURL, msg.Bio, msg.Status, time.Now().UnixMilli()); err != nil {
		log.Printf("profile_update: upsert error: %v", err)
		return
	}
	// Broadcast updated user_status to all clients.
	statusMsg, _ := json.Marshal(Message{Type: "user_status", Users: c.hub.AllUserStatus()})
	select {
	case c.hub.broadcast <- statusMsg:
	default:
	}
}

func (c *Client) handleProfileGet(msg Message) {
	if c.username == "" {
		return
	}
	target := msg.Username
	if target == "" {
		target = c.username
	}
	profile, err := c.hub.store.GetUserProfile(target)
	if err != nil {
		profile = &store.UserProfile{Username: target}
	}
	resp, _ := json.Marshal(Message{
		Type: "profile_get", Username: profile.Username,
		DisplayName: profile.DisplayName, AvatarURL: profile.AvatarURL,
		Bio: profile.Bio, Status: profile.Status,
	})
	select {
	case c.send <- resp:
	default:
	}
}

// --- Poll handlers ---

func (c *Client) handlePollCreate(msg Message) {
	if c.username == "" || msg.Poll == nil || msg.Poll.Question == "" || len(msg.Poll.Options) < 2 {
		return
	}
	if !c.checkRateLimit() {
		return
	}
	roomID := c.getCurrentRoomID()
	pollID := msg.Poll.ID
	if pollID == "" {
		pollID = uuid.New().String()
	}
	poll := &Poll{
		ID:             pollID,
		RoomID:         roomID,
		Creator:        c.username,
		Question:       sanitizeContent(msg.Poll.Question),
		Options:        msg.Poll.Options,
		MultipleChoice: msg.Poll.MultipleChoice,
		IsAnonymous:    msg.Poll.IsAnonymous,
		IsClosed:       false,
		Votes:          make(map[int]int),
		Voters:         make(map[int][]string),
		CreatedAt:      time.Now().UnixMilli(),
	}
	for i := range poll.Options {
		poll.Options[i] = sanitizeContent(poll.Options[i])
	}
	if err := c.hub.store.CreatePoll(poll); err != nil {
		log.Printf("poll_create: failed: %v", err)
		return
	}
	broadcastMsg, _ := json.Marshal(Message{Type: "poll_created", ID: poll.ID, Username: c.username, RoomID: roomID, Poll: poll})
	c.hub.BroadcastToRoom(broadcastMsg, roomID)
}

func (c *Client) handlePollVote(msg Message) {
	if c.username == "" || msg.ID == "" {
		return
	}
	if !c.checkRateLimit() {
		return
	}
	if err := c.hub.store.VotePoll(msg.ID, c.username, msg.OptionIndex); err != nil {
		log.Printf("poll_vote: failed: %v", err)
		return
	}
	updated, err := c.hub.store.GetPoll(msg.ID)
	if err != nil {
		return
	}
	broadcastMsg, _ := json.Marshal(Message{Type: "poll_vote_update", ID: msg.ID, Poll: updated, RoomID: updated.RoomID})
	c.hub.BroadcastToRoom(broadcastMsg, updated.RoomID)
}

func (c *Client) handlePollClose(msg Message) {
	if c.username == "" || msg.ID == "" {
		return
	}
	poll, err := c.hub.store.GetPoll(msg.ID)
	if err != nil {
		return
	}
	if poll.Creator != c.username {
		errMsg, _ := json.Marshal(Message{Type: "error", Content: "only the poll creator can close the poll", ErrorCode: "NOT_OWNER"})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}
	if err := c.hub.store.ClosePoll(msg.ID); err != nil {
		return
	}
	updated, _ := c.hub.store.GetPoll(msg.ID)
	broadcastMsg, _ := json.Marshal(Message{Type: "poll_closed", ID: msg.ID, Poll: updated, RoomID: updated.RoomID})
	c.hub.BroadcastToRoom(broadcastMsg, updated.RoomID)
}

// handleCancelScheduledMessage processes a cancel_scheduled_message request.

// handleScheduledMessagesList returns the user's scheduled messages.

// --- Group admin handlers ---

// handleGroupKick kicks a member from a group. Only owner and admin can kick.
// Cannot kick the owner.

// Permission check: must be owner or admin.

// Cannot kick the owner.

// Admins can only kick regular members.

// Remove from in-memory group.

// Notify the kicked user.

// Broadcast updated member list to group.

// handleGroupSetRole changes a member's role. Only owner can promote/demote.
// Cannot change the owner's role.

// Only owner can set roles.

// Cannot change owner's own role.

// Broadcast to group.

// Also send the updated member list.

// handleGroupRename renames a group. Only owner can rename.

// Only owner can rename.

// Check that new name doesn't collide with an existing group.

// Update in-memory group key.

// Broadcast rename to all group members.

// old name in content

// handleGroupTransfer transfers group ownership to another member.
// Only the current owner can transfer.

// Only current owner can transfer.

// New owner must be a group member.

// Broadcast to group.

// old owner

// Send updated member list with new roles.

// handleGroupLeave removes the current user from the group.

// Store the group members before leaving (for notification).

// Remove from in-memory group.

// Notify the leaver.

// Check if the group still exists after leaving (owner leave might have deleted it).

// Broadcast to remaining group members.

// old owner left

// handleGroupInfo returns group metadata and member list with roles.

// sendError sends an error message to the current client.
func (c *Client) sendError(content, errorCode string) {
	errMsg, _ := json.Marshal(Message{
		Type:      "error",
		Content:   content,
		ErrorCode: errorCode,
	})
	select {
	case c.send <- errMsg:
	default:
	}
}

// msgsToMessages converts []ScheduledMessage to []StoredMessage for JSON serialization
// within the Message struct.

// --- Call signaling handlers ---

// Group call room routing: forward directly to the target user within the room.

// Verify sender and target are in the room.

// 1:1 call (original logic)

// Log the call start.

// Forward to target user as incoming call.

// Callee is offline — mark as missed.

// Group call room routing: forward answer SDP to the caller directly.

// In room context, the "from" field is the original caller.

// 1:1 call (original logic)

// Only the callee can accept.

// Forward answer SDP to caller.

// Only the callee can reject.

// Notify caller.

// Group call room: notify the specific peer.

// 1:1 call (original logic)

// Either party can end.

// Notify the other party.

// Group call room: relay to the target peer directly.

// 1:1 call (original logic)

// Either party can send ICE candidates.

// Relay to the other party.

// --- Call room handlers (multi-party group calls) ---

// Include the creator as a participant.

// Confirm to creator.

// Send invite to each participant (excluding creator).

// Already in the room — still send existing participants.

// Send existing participants to the joiner (excluding self).

// Notify existing participants about the new joiner.

// Notify remaining participants.

// handleCustomEmojiAdd handles uploading/registering a new custom emoji.
func (c *Client) handleCustomEmojiAdd(msg Message) {
	if c.username == "" {
		return
	}
	if !c.checkRateLimit() {
		return
	}

	name := strings.TrimSpace(msg.EmojiName)
	url := strings.TrimSpace(msg.EmojiURL)
	if name == "" || url == "" {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "emoji name and URL are required",
			ErrorCode: "INVALID_EMOJI",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Validate name: alphanumeric + underscore, max 32 chars.
	if len(name) > 32 {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "emoji name must be 32 characters or fewer",
			ErrorCode: "INVALID_EMOJI",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}
	if !regexp.MustCompile(`^[a-zA-Z0-9_]+$`).MatchString(name) {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "emoji name must contain only letters, digits, and underscores",
			ErrorCode: "INVALID_EMOJI",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	roomID := c.getCurrentRoomID()
	if err := c.hub.store.AddCustomEmoji(name, url, c.username, roomID); err != nil {
		log.Printf("custom_emoji_add: error: %v", err)
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "failed to add emoji (name may already exist)",
			ErrorCode: "EMOJI_ADD_FAILED",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Broadcast the new emoji to all clients.
	broadcast, _ := json.Marshal(Message{
		Type:      "custom_emoji_added",
		EmojiName: name,
		EmojiURL:  url,
		Username:  c.username,
	})
	c.hub.broadcast <- broadcast

	// Also send updated list to the client.
	emojis, err := c.hub.store.ListCustomEmojis(roomID)
	if err != nil {
		log.Printf("custom_emoji_list: error: %v", err)
		emojis = []store.CustomEmoji{}
	}
	payload2, _ := json.Marshal(Message{
		Type:   "custom_emoji_list",
		Emojis: emojis,
	})
	select {
	case c.send <- payload2:
	default:
	}
}

// handleCustomEmojiList handles listing all custom emojis.
func (c *Client) handleCustomEmojiList() {
	if c.username == "" {
		return
	}

	roomID := c.getCurrentRoomID()
	emojis, err := c.hub.store.ListCustomEmojis(roomID)
	if err != nil {
		log.Printf("custom_emoji_list: error: %v", err)
		emojis = []store.CustomEmoji{}
	}
	payload, _ := json.Marshal(Message{
		Type:   "custom_emoji_list",
		Emojis: emojis,
	})
	select {
	case c.send <- payload:
	default:
	}
}

// handleCustomEmojiDelete handles deleting a custom emoji.
func (c *Client) handleCustomEmojiDelete(msg Message) {
	if c.username == "" {
		return
	}
	if !c.checkRateLimit() {
		return
	}

	name := strings.TrimSpace(msg.EmojiName)
	if name == "" {
		return
	}

	if err := c.hub.store.DeleteCustomEmoji(name, c.username); err != nil {
		log.Printf("custom_emoji_delete: error: %v", err)
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   err.Error(),
			ErrorCode: "EMOJI_DELETE_FAILED",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Broadcast deletion to all clients.
	broadcast, _ := json.Marshal(Message{
		Type:      "custom_emoji_deleted",
		EmojiName: name,
		Username:  c.username,
	})
	c.hub.broadcast <- broadcast
}

// handleTranslateMessage translates a message using the LLM and sends the result back.
func (c *Client) handleTranslateMessage(msg Message) {
	if c.username == "" {
		return
	}
	text := strings.TrimSpace(msg.Content)
	if text == "" {
		return
	}
	targetLang := msg.To
	if targetLang == "" {
		targetLang = "Chinese"
	}
	client := c.hub.LLMClient()
	if client == nil {
		errMsg, _ := json.Marshal(Message{
			Type:      "translate_result",
			MessageID: msg.MessageID,
			Content:   "[Translation unavailable]",
			To:        targetLang,
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}
	// Translate asynchronously via goroutine.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		prompt := "Translate the following text to " + targetLang + ". Only output the translation, nothing else."
		resp, err := client.Chat(ctx, prompt, []llm.Message{{Role: "user", Content: text}})
		var resultMsg Message
		if err == nil && resp != "" {
			resultMsg = Message{
				Type:      "translate_result",
				MessageID: msg.MessageID,
				Content:   resp,
				To:        targetLang,
			}
		} else {
			resultMsg = Message{
				Type:      "translate_result",
				MessageID: msg.MessageID,
				Content:   "[Translation failed]",
				To:        targetLang,
			}
		}
		data, _ := json.Marshal(resultMsg)
		select {
		case c.send <- data:
		default:
		}
	}()
}

// --- Chat folder handlers ---

// Fetch items for each folder.

// --- Webhook handlers ---

// Check admin: user must be group owner or admin

// Strip secrets before sending to client.
