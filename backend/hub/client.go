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
	// bot concurrency guard
	botResponding atomic.Bool
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
		case "friend_request":
			c.handleFriendRequest(msg)
		case "friend_accept":
			c.handleFriendAccept(msg)
		case "friend_reject":
			c.handleFriendReject(msg)
		case "friend_list":
			c.handleFriendList()
		case "mark_read":
			// Broadcast read receipt to message senders so they know their
			// messages were seen. Context indicates which conversation was read.
			c.handleMarkRead(msg)
		case "group_create":
			c.handleGroupCreate(msg)
		case "group_invite":
			c.handleGroupInvite(msg)
		case "group_invite_accept":
			c.handleGroupInviteAccept(msg)
		case "group_invite_decline":
			c.handleGroupInviteDecline(msg)
		case "group_message":
			c.handleGroupMessage(msg)
		case "group_join":
			c.handleGroupJoin(msg)
		case "dm_message":
			c.handleDMMessage(msg)
		case "message_delete":
			c.handleMessageDelete(msg)
		case "typing_start":
			c.handleTypingStart(msg)
		case "typing_stop":
			c.handleTypingStop(msg)
		case "room_create":
			c.handleRoomCreate(msg)
		case "room_join":
			c.handleRoomJoin(msg)
		case "room_leave":
			c.handleRoomLeave(msg)
		case "room_list":
			c.handleRoomList()
		case "forward":
			c.handleForward(msg)
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
		case "pin_conversation":
			c.handlePinConversation(msg)
		case "unpin_conversation":
			c.handleUnpinConversation(msg)
		case "mute_conversation":
			c.handleMuteConversation(msg)
		case "unmute_conversation":
			c.handleUnmuteConversation(msg)
		case "archive_conversation":
			c.handleArchiveConversation(msg)
		case "unarchive_conversation":
			c.handleUnarchiveConversation(msg)
		case "load_history":
			c.handleLoadHistory(msg)
		case "thread_messages":
			c.handleThreadMessages(msg)
		case "notification_prefs_set":
			c.handleNotificationPrefsSet(msg)
		case "notification_prefs_get":
			c.handleNotificationPrefsGet()
		case "schedule_message":
			c.handleScheduleMessage(msg)
		case "cancel_scheduled_message":
			c.handleCancelScheduledMessage(msg)
		case "scheduled_messages_list":
			c.handleScheduledMessagesList()
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

	// Check for duplicate username.
	if c.hub.IsUsernameTaken(username) {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "username already taken, please choose another",
			ErrorCode: "USERNAME_TAKEN",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Block reserved usernames.
	if isReservedUsername(username) {
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

	// Send friend list to the joining client.
	friends := c.hub.GetFriends(c.username)
	friendPayload, _ := json.Marshal(Message{
		Type:    "friend_list",
		Friends: friends,
	})
	select {
	case c.send <- friendPayload:
	default:
	}

	// Send pinned conversations list.
	pinnedKeys := c.hub.ListPinnedConversations(c.username)
	pinnedPayload, _ := json.Marshal(Message{
		Type: "pinned_conversations",
		Keys: pinnedKeys,
	})
	select {
	case c.send <- pinnedPayload:
	default:
	}

	// Send muted conversations list.
	mutedKeys := c.hub.ListMutedConversations(c.username)
	mutedPayload, _ := json.Marshal(Message{
		Type: "muted_conversations",
		Keys: mutedKeys,
	})
	select {
	case c.send <- mutedPayload:
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

	// Send archived conversations list.
	archivedKeys := c.hub.ListArchivedConversations(c.username)
	archivedPayload, _ := json.Marshal(Message{
		Type: "archived_conversations",
		Keys: archivedKeys,
	})
	select {
	case c.send <- archivedPayload:
	default:
	}

	// Deliver pending DMs that arrived while offline.
	pendingDMs := c.hub.store.GetUndeliveredDMs(c.username, 50)
	if len(pendingDMs) > 0 {
		var deliveredIDs []string
		for _, dm := range pendingDMs {
			dmPayload, _ := json.Marshal(Message{
				Type:           "dm_message",
				ID:             dm.ID,
				Username:       dm.Username,
				Content:        dm.Content,
				Timestamp:      dm.Timestamp,
				To:             dm.ToUser,
				From:           dm.Username,
				ReplyToID:      dm.ReplyToID,
			})
			select {
			case c.send <- dmPayload:
				deliveredIDs = append(deliveredIDs, dm.ID)
			default:
			}
		}
		if len(deliveredIDs) > 0 {
			c.hub.store.MarkMessagesDelivered(deliveredIDs)
		}
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

	// Save to store.
	storedMsg, err := c.hub.store.InsertMessage(c.username, content, "", c.currentRoomID, "", "", msg.ThreadID)
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

	// Broadcast to all clients.
	broadcastMsg, _ := json.Marshal(Message{
		Type:           "message",
		ID:             storedMsg.ID,
		Username:       storedMsg.Username,
		Content:        storedMsg.Content,
		Timestamp:      storedMsg.Timestamp,
		ReplyToID:      storedMsg.ReplyToID,
		ReplyToContent: msg.ReplyToContent,
		ReplyToUser:    msg.ReplyToUser,
		ThreadID:       storedMsg.ThreadID,
		RoomID:         c.currentRoomID,
	})
	select {
	case c.hub.broadcast <- broadcastMsg:
	default:
	}

	// Notify @mentioned users (skip self and assistants).
	for _, mention := range parseMentions(content) {
		if mention == c.username || mention == c.hub.BotName() || mention == c.hub.AgentName() {
			continue
		}
		notifyMsg, _ := json.Marshal(Message{
			Type:      "mention_notify",
			From:      c.username,
			Content:   content,
			MessageID: storedMsg.ID,
			RoomID:    c.currentRoomID,
			Timestamp: storedMsg.Timestamp,
		})
		c.hub.SendToUser(mention, notifyMsg)
	}

	// Store the user message in LLM memory.
	if mem := c.hub.Memory(); mem != nil {
		mem.Add(llm.Message{Role: "user", Content: content, Username: c.username})
	}

	// Check for @mentions and route TokenBot and PicoClaw independently.
	targets := assistantMentionTarget(content, c.hub.BotName(), c.hub.AgentName())
	currentRoom := c.getCurrentRoomID()
	if targets.TokenBot && c.username != c.hub.BotName() && c.hub.LLMClient() != nil {
		if !c.hub.CheckBotCooldown("bot:" + c.username) {
			// Within 30s per-user cooldown, silently skip.
		} else if c.botResponding.CompareAndSwap(false, true) {
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			go func() {
				defer cancel()
				defer c.botResponding.Store(false)
				c.handleBotResponse(ctx, content, currentRoom)
			}()
		}
	} else if targets.TokenBot && c.username != c.hub.BotName() && c.hub.LLMClient() == nil {
		// Bot mentioned but not configured — send error feedback
		c.hub.BroadcastJSON(Message{
			Type:     "system",
			Username: "system",
			Content:  "TokenBot is not configured on this server.",
			RoomID:   currentRoom,
		})
	}
	if targets.Agent && c.username != c.hub.AgentName() {
		if pc := c.hub.PicoclawClient(); pc != nil {
			if !c.hub.CheckBotCooldown("agent:" + c.username) {
				// Within 30s per-user cooldown, silently skip.
			} else if c.botResponding.CompareAndSwap(false, true) {
				go func() {
					defer c.botResponding.Store(false)
					c.handleAgentResponsePicoClaw(context.Background(), content, currentRoom)
				}()
			}
		} else {
			// Agent mentioned but not configured — send error feedback
			c.hub.BroadcastJSON(Message{
				Type:     "system",
				Username: "system",
				Content:  "PicoClaw is not configured on this server.",
				RoomID:   currentRoom,
			})
		}
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

type assistantMentionTargets struct {
	TokenBot bool
	Agent    bool
}

func assistantMentionTarget(content, botName, agentName string) assistantMentionTargets {
	targets := assistantMentionTargets{}
	for _, mention := range parseMentions(content) {
		if isAssistantAlias(mention, botName, "bot", "tokenbot") {
			targets.TokenBot = true
		}
		if isAssistantAlias(mention, agentName, "claw", "picoclaw") {
			targets.Agent = true
		}
	}
	// Auto-reply: respond to messages that clearly seek a response even
	// without an explicit @mention.  Intent signals in priority order:
	if !targets.TokenBot && botName != "" {
		lower := strings.ToLower(content)
		// Keyword trigger — always reply
		for _, kw := range []string{"help", "帮助", "bot", "机器人"} {
			if strings.Contains(lower, kw) {
				targets.TokenBot = true
				break
			}
		}
		// Question trigger — 50% chance
		if !targets.TokenBot && (strings.Contains(content, "?") || strings.Contains(content, "？")) {
			if shouldTrigger(50) {
				targets.TokenBot = true
			}
		}
	}
	if !targets.Agent && agentName != "" {
		// PicoClaw keyword triggers — respond to task/agent-related intent
		lower := strings.ToLower(content)
		for _, kw := range []string{
			"agent", "claw", "picoclaw", "pico",
			"task", "workflow", "工作流", "任务",
			"分析", "analyze", "执行", "execute", "帮我", "help me",
			"总结", "summarize", "翻译", "translate", "搜索", "search",
			"生成", "generate", "写", "write", "代码", "code",
		} {
			if strings.Contains(lower, kw) {
				targets.Agent = true
				break
			}
		}
		// Question trigger — 50% chance (independent coin flip)
		if !targets.Agent && (strings.Contains(content, "?") || strings.Contains(content, "？")) {
			if shouldTrigger(50) {
				targets.Agent = true
			}
		}
	}
	return targets
}

// shouldTrigger returns true percent% of the time.
// Pure deterministic hash-based — no math/rand to avoid seeding races.
func shouldTrigger(percent int) bool {
	return percent > 0 && uint32(time.Now().UnixNano())%100 < uint32(percent)
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

// --- Friend system handlers ---

func (c *Client) handleFriendRequest(msg Message) {
	if c.username == "" {
		return
	}
	to := msg.To
	if to == "" || to == c.username {
		return
	}
	if !ValidateUsername(to) {
		return
	}
	if c.hub.IsFriend(c.username, to) {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "already friends with " + to,
			ErrorCode: "ALREADY_FRIENDS",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Send friend_request to the target user.
	reqMsg, _ := json.Marshal(Message{
		Type: "friend_request",
		From: c.username,
		To:   to,
	})
	c.hub.SendToUser(to, reqMsg)
}

func (c *Client) handleFriendAccept(msg Message) {
	if c.username == "" {
		return
	}
	from := msg.From
	if from == "" || from == c.username {
		return
	}

	c.hub.AddFriend(c.username, from)

	// Notify the requester.
	acceptMsgToRequester, _ := json.Marshal(Message{
		Type:    "friend_accept",
		From:    c.username,
		To:      from,
		Friends: c.hub.GetFriends(from),
	})
	c.hub.SendToUser(from, acceptMsgToRequester)

	// Update the accepter's friend list.
	acceptMsgToSelf, _ := json.Marshal(Message{
		Type:    "friend_list",
		Friends: c.hub.GetFriends(c.username),
	})
	select {
	case c.send <- acceptMsgToSelf:
	default:
	}
}

func (c *Client) handleFriendReject(msg Message) {
	if c.username == "" {
		return
	}
	from := msg.From
	if from == "" {
		return
	}

	// Notify the requester that their request was rejected.
	rejectMsg, _ := json.Marshal(Message{
		Type: "friend_reject",
		From: c.username,
		To:   from,
	})
	c.hub.SendToUser(from, rejectMsg)
}

func (c *Client) handleFriendList() {
	if c.username == "" {
		return
	}
	friends := c.hub.GetFriends(c.username)
	fl, _ := json.Marshal(Message{
		Type:    "friend_list",
		Friends: friends,
	})
	select {
	case c.send <- fl:
	default:
	}
}

// --- Group system handlers ---

func (c *Client) handleGroupCreate(msg Message) {
	if c.username == "" {
		return
	}
	groupName := sanitizeContent(msg.Group)
	if groupName == "" || !ValidateGroupName(groupName) {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "invalid group name: 1-30 chars, letters, digits, underscores, hyphens or Chinese",
			ErrorCode: "INVALID_GROUP_NAME",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	if !c.hub.CreateGroup(groupName, c.username) {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "group name already exists",
			ErrorCode: "GROUP_EXISTS",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Notify creator with group info.
	createMsg, _ := json.Marshal(Message{
		Type:    "group_create",
		Group:   groupName,
		Members: c.hub.GroupMembers(groupName),
	})
	select {
	case c.send <- createMsg:
	default:
	}
}

func (c *Client) handleGroupInvite(msg Message) {
	if c.username == "" {
		return
	}
	groupName := msg.Group
	username := msg.Username
	if groupName == "" || username == "" {
		return
	}

	if !c.hub.InGroup(c.username, groupName) {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "you are not a member of this group",
			ErrorCode: "NOT_IN_GROUP",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Record pending invite.
	c.hub.AddPendingInvite(username, groupName, c.username)

	// Notify invited user — they must accept or decline.
	inviteMsg, _ := json.Marshal(Message{
		Type:  "group_invite",
		Group: groupName,
		From:  c.username,
	})
	c.hub.SendToUser(username, inviteMsg)
}

func (c *Client) handleGroupMessage(msg Message) {
	if c.username == "" {
		return
	}
	groupName := msg.Group
	content := sanitizeContent(msg.Content)
	if groupName == "" || content == "" {
		return
	}

	if !c.hub.InGroup(c.username, groupName) {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "you are not a member of this group",
			ErrorCode: "NOT_IN_GROUP",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Auto-unarchive the group conversation for the sender.
	groupKey := "group:" + groupName
	if c.hub.IsConversationArchived(c.username, groupKey) {
		c.hub.UnarchiveConversation(c.username, groupKey)
		archivedKeys := c.hub.ListArchivedConversations(c.username)
		archivedPayload, _ := json.Marshal(Message{
			Type: "archived_conversations",
			Keys: archivedKeys,
		})
		c.hub.SendToAllSessions(c.username, archivedPayload)
	}

	// Rate limit.
	if !c.checkRateLimit() {
		return
	}

	// Persist to store.
	storedMsg, err := c.hub.store.InsertMessage(c.username, content, "", "", "", groupName, "")
	if err != nil {
		log.Printf("failed to insert group message: %v", err)
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "failed to save group message, please try again",
			ErrorCode: "SERVER_ERROR",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Send to all group members.
	gm, _ := json.Marshal(Message{
		Type:           "group_message",
		ID:             storedMsg.ID,
		Group:          groupName,
		Username:       c.username,
		Content:        content,
		Timestamp:      storedMsg.Timestamp,
		ReplyToID:      msg.ReplyToID,
		ReplyToContent: msg.ReplyToContent,
		ReplyToUser:    msg.ReplyToUser,
	})
	c.hub.SendToGroup(groupName, gm)

	// Notify @mentioned users (skip self and assistants).
	for _, mention := range parseMentions(content) {
		if mention == c.username || mention == c.hub.BotName() || mention == c.hub.AgentName() {
			continue
		}
		notifyMsg, _ := json.Marshal(Message{
			Type:      "mention_notify",
			From:      c.username,
			Content:   content,
			MessageID: storedMsg.ID,
			Group:     groupName,
			Timestamp: storedMsg.Timestamp,
		})
		c.hub.SendToUser(mention, notifyMsg)
	}
}

func (c *Client) handleGroupJoin(msg Message) {
	if c.username == "" {
		return
	}
	groupName := msg.Group
	if groupName == "" {
		return
	}

	// Require a pending invite or existing membership.
	if !c.hub.InGroup(c.username, groupName) && !c.hub.ConsumePendingInvite(c.username, groupName) {
		return
	}

	if c.hub.AddGroupMember(groupName, c.username) {
		// Notify group members.
		members := c.hub.GroupMembers(groupName)
		updateMsg, _ := json.Marshal(Message{
			Type:    "group_join",
			Group:   groupName,
			Members: members,
		})
		c.hub.SendToGroup(groupName, updateMsg)

		// Send confirmation to joiner.
		joinMsg, _ := json.Marshal(Message{
			Type:    "group_join",
			Group:   groupName,
			Members: members,
		})
		select {
		case c.send <- joinMsg:
		default:
		}
	}
}

func (c *Client) handleDMMessage(msg Message) {
	if c.username == "" {
		return
	}
	to := msg.To
	if to == "" || to == c.username {
		return
	}
	// Block check: if recipient has blocked sender, reject.
	if c.hub.IsBlocked(to, c.username) {
		return
	}
	// Auto-unarchive the DM conversation for the sender.
	dmKey := "dm:" + to
	if c.hub.IsConversationArchived(c.username, dmKey) {
		c.hub.UnarchiveConversation(c.username, dmKey)
		archivedKeys := c.hub.ListArchivedConversations(c.username)
		archivedPayload, _ := json.Marshal(Message{
			Type: "archived_conversations",
			Keys: archivedKeys,
		})
		c.hub.SendToAllSessions(c.username, archivedPayload)
	}
	content := sanitizeContent(msg.Content)
	if content == "" {
		return
	}

	if !c.checkRateLimit() {
		return
	}

	// Persist to store.
	storedMsg, err := c.hub.store.InsertMessage(c.username, content, msg.ReplyToID, c.currentRoomID, msg.To, "", "")
	if err != nil {
		log.Printf("failed to insert DM message: %v", err)
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "failed to send DM, please try again",
			ErrorCode: "SERVER_ERROR",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Send to recipient.
	dmMsgTo, _ := json.Marshal(Message{
		Type:           "dm_message",
		ID:             storedMsg.ID,
		Username:       c.username,
		Content:        content,
		Timestamp:      storedMsg.Timestamp,
		To:             to,
		From:           c.username,
		ReplyToID:      msg.ReplyToID,
		ReplyToContent: msg.ReplyToContent,
		ReplyToUser:    msg.ReplyToUser,
	})
	delivered := c.hub.SendToUser(to, dmMsgTo)

	// Only mark delivered if recipient was online.
	if delivered {
		c.hub.store.MarkMessagesDelivered([]string{storedMsg.ID})
	}

	// Send echo back to sender.
	dmMsgFrom, _ := json.Marshal(Message{
		Type:           "dm_message",
		ID:             storedMsg.ID,
		Username:       c.username,
		Content:        content,
		Timestamp:      storedMsg.Timestamp,
		To:             to,
		From:           c.username,
		ReplyToID:      msg.ReplyToID,
		ReplyToContent: msg.ReplyToContent,
		ReplyToUser:    msg.ReplyToUser,
	})
	select {
	case c.send <- dmMsgFrom:
	default:
	}
}

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

func (c *Client) handleRoomCreate(msg Message) {
	if c.username == "" {
		return
	}
	roomName := sanitizeContent(msg.Group)
	if roomName == "" || !ValidateGroupName(roomName) {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "invalid room name: 1-30 chars",
			ErrorCode: "INVALID_ROOM_NAME",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	roomID, err := c.hub.CreateRoom(roomName)
	if err != nil {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "room already exists",
			ErrorCode: "ROOM_EXISTS",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Notify all clients of the new room list.
	rooms := c.hub.ListRooms()
	roomListMsg, _ := json.Marshal(Message{
		Type:  "room_list",
		Rooms: rooms,
	})
	c.hub.broadcast <- roomListMsg

	// Confirm to creator.
	confirmMsg, _ := json.Marshal(Message{
		Type:   "room_create",
		RoomID: roomID,
		Group:  roomName,
	})
	select {
	case c.send <- confirmMsg:
	default:
	}
}

func (c *Client) handleRoomJoin(msg Message) {
	if c.username == "" {
		return
	}
	if !c.checkRateLimit() {
		return
	}
	roomID := msg.RoomID
	if roomID == "" {
		return
	}

	// Leave current room.
	c.hub.LeaveRoom(c.currentRoomID, c.username)

	// Join new room.
	c.hub.JoinRoom(roomID, c.username)
	c.setCurrentRoomID(roomID)

	// Send room history.
	historyMessages := c.hub.store.GetRoomMessages(roomID, 100, 0)
	historyPayload, _ := json.Marshal(Message{
		Type:     "history",
		Messages: historyMessages,
		RoomID:   roomID,
	})
	select {
	case c.send <- historyPayload:
	default:
	}

	// Notify frontend of room switch.
	switchMsg, _ := json.Marshal(Message{
		Type:   "room_join",
		RoomID: roomID,
	})
	select {
	case c.send <- switchMsg:
	default:
	}
}

func (c *Client) handleRoomLeave(msg Message) {
	if c.username == "" {
		return
	}

	c.hub.LeaveRoom(c.currentRoomID, c.username)

	// Join default room.
	defaultID := c.hub.DefaultRoomID()
	c.hub.JoinRoom(defaultID, c.username)
	c.setCurrentRoomID(defaultID)

	// Send default room history.
	historyMessages := c.hub.store.GetRoomMessages(defaultID, 100, 0)
	historyPayload, _ := json.Marshal(Message{
		Type:     "history",
		Messages: historyMessages,
		RoomID:   defaultID,
	})
	select {
	case c.send <- historyPayload:
	default:
	}

	// Notify frontend.
	leaveMsg, _ := json.Marshal(Message{
		Type:   "room_join",
		RoomID: defaultID,
	})
	select {
	case c.send <- leaveMsg:
	default:
	}
}

func (c *Client) handleRoomList() {
	rooms := c.hub.ListRooms()
	rl, _ := json.Marshal(Message{
		Type:  "room_list",
		Rooms: rooms,
	})
	select {
	case c.send <- rl:
	default:
	}
}

// --- Forward message handler ---

func (c *Client) handleForward(msg Message) {
	if c.username == "" {
		return
	}
	messageID := msg.ID
	to := msg.To
	if messageID == "" || to == "" {
		return
	}

	stored, err := c.hub.store.GetMessageByID(messageID)
	if err != nil {
		log.Printf("forward: message not found %s: %v", messageID, err)
		return
	}

	// Block forwarding of private DM messages.
	if stored.ToUser != "" {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "cannot forward private messages",
			ErrorCode: "FORWARD_BLOCKED",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Block forwarding of deleted messages.
	if stored.Deleted {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "cannot forward deleted messages",
			ErrorCode: "FORWARD_BLOCKED",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	forwardContent := "Forwarded from " + stored.Username + ":\n" + stored.Content

	// Persist as a new message.
	storedMsg, err := c.hub.store.InsertMessage(c.username, forwardContent, messageID, c.currentRoomID, "", "", "")
	if err != nil {
		log.Printf("failed to insert forwarded message: %v", err)
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "failed to forward message, please try again",
			ErrorCode: "SERVER_ERROR",
		})
		select {
		case c.send <- errMsg:
		default:
		}
		return
	}

	// Broadcast forwarded message.
	fwdMsg, _ := json.Marshal(Message{
		Type:      "message",
		ID:        storedMsg.ID,
		Username:  c.username,
		Content:   forwardContent,
		Timestamp: storedMsg.Timestamp,
		RoomID:    c.currentRoomID,
	})
	c.hub.BroadcastToRoom(fwdMsg, c.currentRoomID)

	// Also send to target user if online.
	forwardPayload, _ := json.Marshal(Message{
		Type:      "forward",
		From:      c.username,
		Content:   forwardContent,
		ID:        storedMsg.ID,
		Timestamp: storedMsg.Timestamp,
	})
	c.hub.SendToUser(to, forwardPayload)
}

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
		Type:      "pinned",
		ID:        messageID,
		RoomID:    roomID,
		PinnedBy:  c.username,
		PinnedAt:  time.Now().UnixMilli(),
		Pinned:    true,
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
func (c *Client) handlePinConversation(msg Message) {
	if c.username == "" {
		return
	}
	key := msg.Key
	if key == "" {
		return
	}
	if err := c.hub.PinConversation(c.username, key); err != nil {
		log.Printf("pin_conversation error: %v", err)
		return
	}
	// Send updated list to all sessions of this user.
	pinnedKeys := c.hub.ListPinnedConversations(c.username)
	pinnedPayload, _ := json.Marshal(Message{
		Type: "pinned_conversations",
		Keys: pinnedKeys,
	})
	c.hub.SendToAllSessions(c.username, pinnedPayload)
}

// handleUnpinConversation unpins a conversation for the current user.
func (c *Client) handleUnpinConversation(msg Message) {
	if c.username == "" {
		return
	}
	key := msg.Key
	if key == "" {
		return
	}
	if err := c.hub.UnpinConversation(c.username, key); err != nil {
		log.Printf("unpin_conversation error: %v", err)
		return
	}
	// Send updated list to all sessions of this user.
	pinnedKeys := c.hub.ListPinnedConversations(c.username)
	pinnedPayload, _ := json.Marshal(Message{
		Type: "pinned_conversations",
		Keys: pinnedKeys,
	})
	c.hub.SendToAllSessions(c.username, pinnedPayload)
}

// handleMuteConversation mutes a conversation for the current user.
func (c *Client) handleMuteConversation(msg Message) {
	if c.username == "" {
		return
	}
	key := msg.Key
	if key == "" {
		return
	}
	if err := c.hub.MuteConversation(c.username, key); err != nil {
		log.Printf("mute_conversation error: %v", err)
		return
	}
	// Send updated list to all sessions of this user.
	mutedKeys := c.hub.ListMutedConversations(c.username)
	mutedPayload, _ := json.Marshal(Message{
		Type: "muted_conversations",
		Keys: mutedKeys,
	})
	c.hub.SendToAllSessions(c.username, mutedPayload)
}

// handleUnmuteConversation unmutes a conversation for the current user.
func (c *Client) handleUnmuteConversation(msg Message) {
	if c.username == "" {
		return
	}
	key := msg.Key
	if key == "" {
		return
	}
	if err := c.hub.UnmuteConversation(c.username, key); err != nil {
		log.Printf("unmute_conversation error: %v", err)
		return
	}
	// Send updated list to all sessions of this user.
	mutedKeys := c.hub.ListMutedConversations(c.username)
	mutedPayload, _ := json.Marshal(Message{
		Type: "muted_conversations",
		Keys: mutedKeys,
	})
	c.hub.SendToAllSessions(c.username, mutedPayload)
}

// handleArchiveConversation archives a conversation for the current user.
func (c *Client) handleArchiveConversation(msg Message) {
	if c.username == "" {
		return
	}
	key := msg.Key
	if key == "" {
		return
	}
	if err := c.hub.ArchiveConversation(c.username, key); err != nil {
		log.Printf("archive_conversation error: %v", err)
		return
	}
	// Send updated list to all sessions of this user.
	archivedKeys := c.hub.ListArchivedConversations(c.username)
	archivedPayload, _ := json.Marshal(Message{
		Type: "archived_conversations",
		Keys: archivedKeys,
	})
	c.hub.SendToAllSessions(c.username, archivedPayload)
}

// handleUnarchiveConversation unarchives a conversation for the current user.
func (c *Client) handleUnarchiveConversation(msg Message) {
	if c.username == "" {
		return
	}
	key := msg.Key
	if key == "" {
		return
	}
	if err := c.hub.UnarchiveConversation(c.username, key); err != nil {
		log.Printf("unarchive_conversation error: %v", err)
		return
	}
	// Send updated list to all sessions of this user.
	archivedKeys := c.hub.ListArchivedConversations(c.username)
	archivedPayload, _ := json.Marshal(Message{
		Type: "archived_conversations",
		Keys: archivedKeys,
	})
	c.hub.SendToAllSessions(c.username, archivedPayload)
}

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

	// Sync with old muted_conversations for backward compatibility.
	now := time.Now().UnixMilli()
	if mutedUntil > 0 && mutedUntil > now {
		_ = c.hub.MuteConversation(c.username, key)
	} else {
		_ = c.hub.UnmuteConversation(c.username, key)
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
func (c *Client) handleNotificationPrefsGet() {
	if c.username == "" {
		return
	}
	prefs := c.hub.ListNotificationPrefs(c.username)
	payload, _ := json.Marshal(Message{
		Type:       "notification_prefs",
		NotifPrefs: prefs,
	})
	select {
	case c.send <- payload:
	default:
	}
}

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
func (c *Client) handleGroupInviteAccept(msg Message) {
	if c.username == "" {
		return
	}
	groupName := msg.Group
	if groupName == "" {
		return
	}
	if !c.hub.ConsumePendingInvite(c.username, groupName) {
		return
	}
	c.hub.AddGroupMember(groupName, c.username)
	members := c.hub.GroupMembers(groupName)
	updateMsg, _ := json.Marshal(Message{
		Type:    "group_join",
		Group:   groupName,
		Members: members,
	})
	c.hub.SendToGroup(groupName, updateMsg)
	confirmMsg, _ := json.Marshal(Message{
		Type:    "group_join",
		Group:   groupName,
		Members: members,
	})
	select {
	case c.send <- confirmMsg:
	default:
	}
}

// handleGroupInviteDecline handles declining a group invite.
func (c *Client) handleGroupInviteDecline(msg Message) {
	if c.username == "" {
		return
	}
	groupName := msg.Group
	if groupName == "" {
		return
	}
	c.hub.RemovePendingInvite(c.username, groupName)
}

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
	// If reading a DM, tell the DM partner their messages were read.
	if msg.Context == "dm" && msg.To != "" {
		c.hub.SendToUser(msg.To, data)
		return
	}
	// For public/group, broadcast to all so senders can see their messages were read.
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

// handleAgentResponsePicoClaw handles the PicoClaw agent response via gateway,
// with automatic fallback to direct LLM API if the WebSocket gateway doesn't respond.

// fallbackPicoClawToLLM calls the LLM API directly when PicoClaw WebSocket fails.
func (c *Client) fallbackPicoClawToLLM(ctx context.Context, userContent, agentName, roomID, username string) {
	c.hub.BroadcastTyping(agentName, "typing_start", "", "")
	var messages []llm.Message
	if mem := c.hub.Memory(); mem != nil {
		messages = mem.GetMessages()
	}
	systemPrompt := "你是一个名叫 PicoClaw 的 AI 助手，运行在 TokenDanceChat 平台上。" +
		"你是一个 Agent 工作流机器人，可以帮用户分析问题、执行任务、搜索信息。" +
		"请用中文回复，保持简洁友好。" +
		"当用户说'帮我'或'分析'时，主动提供详细的帮助。"
	client := c.hub.LLMClient()

	var fullResponse strings.Builder
	err := client.ChatStream(ctx, systemPrompt, messages, func(chunk string) error {
		fullResponse.WriteString(chunk)
		c.hub.BroadcastStreamChunkToRoom(agentName, chunk, false, roomID)
		return nil
	})
	if err != nil {
		log.Printf("PicoClaw LLM fallback error: %v", err)
	}

	response := fullResponse.String()
	response = sanitizeBotContent(response)
	if response == "" {
		response = "PicoClaw 正在思考中，请稍后再试。"
	}
	c.hub.BroadcastStreamChunkToRoom(agentName, "", true, roomID)
	c.hub.SendAssistantMessageToRoom(agentName, response, roomID)
	c.hub.BroadcastTyping(agentName, "typing_stop", "", "")

	if mem := c.hub.Memory(); mem != nil {
		mem.Add(llm.Message{Role: "user", Content: userContent, Username: username})
		mem.Add(llm.Message{Role: "assistant", Content: response, Username: agentName})
	}
}

func (c *Client) handleAgentResponsePicoClaw(ctx context.Context, userContent, roomID string) {
	// PicoClaw now responds directly via LLM API for reliability.
	// The PicoClaw WebSocket gateway is retained for proactive notifications only.
	c.fallbackPicoClawToLLM(ctx, userContent, c.hub.AgentName(), roomID, c.username)
}

func picoStreamDelta(previous, current string) (string, string) {
	if current == "" {
		return previous, ""
	}
	if strings.HasPrefix(current, previous) {
		return current, strings.TrimPrefix(current, previous)
	}
	return current, current
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

// isReservedUsername blocks system and infrastructure usernames.
func isReservedUsername(username string) bool {
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
	select { case c.hub.broadcast <- statusMsg: default: }
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
	select { case c.send <- resp: default: }
}

func (c *Client) handleStatusUpdate(msg Message) {
	if c.username == "" {
		return
	}
	status := msg.Status
	if len([]rune(status)) > 50 {
		status = string([]rune(status)[:50])
	}
	if err := c.hub.store.UpdateUserStatus(c.username, status); err != nil {
		log.Printf("status_update: error: %v", err)
		return
	}
	statusMsg, _ := json.Marshal(Message{Type: "status_updated", Username: c.username, Status: status})
	select { case c.hub.broadcast <- statusMsg: default: }
	userStatusMsg, _ := json.Marshal(Message{Type: "user_status", Users: c.hub.AllUserStatus()})
	select { case c.hub.broadcast <- userStatusMsg: default: }
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
	poll := &Poll{
		ID:             msg.Poll.ID,
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
		select { case c.send <- errMsg: default: }
		return
	}
	if err := c.hub.store.ClosePoll(msg.ID); err != nil {
		return
	}
	updated, _ := c.hub.store.GetPoll(msg.ID)
	broadcastMsg, _ := json.Marshal(Message{Type: "poll_closed", ID: msg.ID, Poll: updated, RoomID: updated.RoomID})
	c.hub.BroadcastToRoom(broadcastMsg, updated.RoomID)
}

// --- Scheduled message handlers ---

// handleScheduleMessage processes a schedule_message request.
func (c *Client) handleScheduleMessage(msg Message) {
	if c.username == "" {
		return
	}
	content := sanitizeContent(msg.Content)
	if content == "" {
		return
	}
	sendAt := msg.Timestamp
	if sendAt <= time.Now().UnixMilli() {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "send_at must be in the future",
			ErrorCode: "INVALID_SCHEDULE_TIME",
		})
		select { case c.send <- errMsg: default: }
		return
	}
	if sendAt > time.Now().UnixMilli()+365*24*60*60*1000 {
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "cannot schedule more than 1 year in advance",
			ErrorCode: "SCHEDULE_TOO_FAR",
		})
		select { case c.send <- errMsg: default: }
		return
	}

	sm := ScheduledMessage{
		ID:        uuid.NewString(),
		Username:  c.username,
		Content:   content,
		RoomID:    msg.RoomID,
		ToUser:    msg.To,
		GroupName: msg.Group,
		ReplyToID: msg.ReplyToID,
		ThreadID:  msg.ThreadID,
		SendAt:    sendAt,
		CreatedAt: time.Now().UnixMilli(),
	}

	if sm.RoomID == "" {
		sm.RoomID = c.getCurrentRoomID()
	}

	if err := c.hub.store.ScheduleMessage(sm); err != nil {
		log.Printf("schedule_message: insert error: %v", err)
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "failed to schedule message",
			ErrorCode: "SERVER_ERROR",
		})
		select { case c.send <- errMsg: default: }
		return
	}

	confirm, _ := json.Marshal(Message{
		Type:      "scheduled_message_confirm",
		ID:        sm.ID,
		Content:   sm.Content,
		Username:  sm.Username,
		Timestamp: sm.SendAt,
		RoomID:    sm.RoomID,
		To:        sm.ToUser,
		Group:     sm.GroupName,
	})
	select { case c.send <- confirm: default: }
}

// handleCancelScheduledMessage processes a cancel_scheduled_message request.
func (c *Client) handleCancelScheduledMessage(msg Message) {
	if c.username == "" {
		return
	}
	id := msg.ID
	if id == "" {
		return
	}

	if err := c.hub.store.CancelScheduledMessage(id, c.username); err != nil {
		log.Printf("cancel_scheduled_message: error: %v", err)
		errMsg, _ := json.Marshal(Message{
			Type:      "error",
			Content:   "failed to cancel scheduled message or not authorized",
			ErrorCode: "CANCEL_SCHEDULE_FAILED",
		})
		select { case c.send <- errMsg: default: }
		return
	}

	confirm, _ := json.Marshal(Message{
		Type: "scheduled_message_cancelled",
		ID:   id,
	})
	select { case c.send <- confirm: default: }
}

// handleScheduledMessagesList returns the user's scheduled messages.
func (c *Client) handleScheduledMessagesList() {
	if c.username == "" {
		return
	}

	msgs, err := c.hub.store.GetUserScheduledMessages(c.username)
	if err != nil {
		log.Printf("scheduled_messages_list: error: %v", err)
		return
	}

	payload, _ := json.Marshal(Message{
		Type:     "scheduled_messages_list",
		Messages: msgsToMessages(msgs),
	})
	select { case c.send <- payload: default: }
}

// msgsToMessages converts []ScheduledMessage to []StoredMessage for JSON serialization
// within the Message struct.
func msgsToMessages(sms []ScheduledMessage) []StoredMessage {
	result := make([]StoredMessage, 0, len(sms))
	for _, sm := range sms {
		result = append(result, StoredMessage{
			ID:        sm.ID,
			Username:  sm.Username,
			Content:   sm.Content,
			Timestamp: sm.SendAt,
			RoomID:    sm.RoomID,
			ToUser:    sm.ToUser,
			GroupName: sm.GroupName,
			ReplyToID: sm.ReplyToID,
			ThreadID:  sm.ThreadID,
		})
	}
	return result
}

