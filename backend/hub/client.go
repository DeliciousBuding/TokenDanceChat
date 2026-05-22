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
	"tokendancechat/backend/picoclaw"

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
		case "load_history":
			c.handleLoadHistory(msg)
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
	storedMsg, err := c.hub.store.InsertMessage(c.username, content, "", c.currentRoomID, "", "")
	if err != nil {
		log.Printf("failed to insert message: %v", err)
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
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		go func() {
			defer cancel()
			c.handleBotResponse(ctx, content, currentRoom)
		}()
	}
	if targets.Agent && c.username != c.hub.AgentName() {
		if pc := c.hub.PicoclawClient(); pc != nil {
			go c.handleAgentResponsePicoClaw(context.Background(), content, currentRoom)
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

	// Rate limit.
	if !c.checkRateLimit() {
		return
	}

	// Persist to store.
	storedMsg, err := c.hub.store.InsertMessage(c.username, content, "", "", "", groupName)
	if err != nil {
		log.Printf("failed to insert group message: %v", err)
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
	content := sanitizeContent(msg.Content)
	if content == "" {
		return
	}

	if !c.checkRateLimit() {
		return
	}

	// Persist to store.
	storedMsg, err := c.hub.store.InsertMessage(c.username, content, msg.ReplyToID, c.currentRoomID, msg.To, "")
	if err != nil {
		log.Printf("failed to insert DM message: %v", err)
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
	storedMsg, err := c.hub.store.InsertMessage(c.username, forwardContent, messageID, c.currentRoomID, "", "")
	if err != nil {
		log.Printf("failed to insert forwarded message: %v", err)
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

// handleAgentResponsePicoClaw handles the PicoClaw agent response via gateway.
func (c *Client) handleAgentResponsePicoClaw(ctx context.Context, userContent, roomID string) {
	pc := c.hub.PicoclawClient()
	if pc == nil {
		return
	}
	agentName := c.hub.AgentName()

	// Send typing indicator.
	c.hub.BroadcastJSON(Message{
		Type:     "typing",
		Username: agentName,
		Context:  "public",
	})

	// Channels to collect the response from PicoClaw callbacks.
	chunks := make(chan picoclaw.Message, 64)
	typing := make(chan bool, 4)
	done := make(chan struct{})

	// Send the user message to PicoClaw with per-request handler.
	handler, err := pc.SendMessage(userContent)
	if err != nil {
		log.Printf("PicoClaw send error: %v", err)
		errorContent := "PicoClaw 当前未连接，无法执行 Agent 工作流。"
		c.hub.SendAssistantMessageToRoom(agentName, errorContent, roomID)
		c.hub.BroadcastTyping(agentName, "typing_stop", "public", "")
		return
	}

	handler.OnMessage = func(msg picoclaw.Message) {
		select {
		case chunks <- msg:
		case <-done:
		}
	}
	handler.OnTyping = func(start bool) {
		select {
		case typing <- start:
		case <-done:
		}
	}

	// Store user message in memory.
	if mem := c.hub.Memory(); mem != nil {
		mem.Add(llm.Message{Role: "user", Content: userContent, Username: c.username})
	}

	// Collect streaming response.
	var fullResponse strings.Builder
	lastPicoContent := ""
	var timedOut atomic.Bool
	collectDone := make(chan struct{})

	go func() {
		defer func() {
			close(collectDone)
			c.hub.BroadcastTyping(agentName, "typing_stop", "", "")
		}()
		timeout := time.After(30 * time.Second)
		for {
			select {
			case msg := <-chunks:
				if msg.IsThought {
					continue // skip thinking/reasoning chunks for now
				}
				if msg.IsPartial {
					// Streaming update -- send as stream chunk to frontend.
					var delta string
					lastPicoContent, delta = picoStreamDelta(lastPicoContent, msg.Content)
					fullResponse.Reset()
					fullResponse.WriteString(lastPicoContent)
					if delta != "" {
						c.hub.BroadcastStreamChunkToRoom(agentName, delta, false, roomID)
					}
				} else {
					// Complete message -- initial chunk from message.create.
					var delta string
					lastPicoContent, delta = picoStreamDelta(lastPicoContent, msg.Content)
					fullResponse.Reset()
					fullResponse.WriteString(lastPicoContent)
					if delta != "" {
						c.hub.BroadcastStreamChunkToRoom(agentName, delta, false, roomID)
					}
				}
			case start := <-typing:
				if !start {
					// typing.stop signals end of response.
					timeout = nil
					return
				}
			case <-timeout:
				timedOut.Store(true)
				return
			case <-done:
				return
			case <-ctx.Done():
				return
			}
		}
	}()

	<-collectDone
	close(done)

	response := fullResponse.String()
	if timedOut.Load() && response == "" {
		response = "PicoClaw 响应超时，请稍后重试。"
	}

	if response != "" {
		// Signal stream done.
		c.hub.BroadcastStreamChunkToRoom(agentName, "", true, roomID)
		// Persist to store and broadcast.
		c.hub.SendAssistantMessageToRoom(agentName, response, roomID)
	}

	// Update memory with bot response.
	if mem := c.hub.Memory(); mem != nil {
		mem.Add(llm.Message{Role: "assistant", Content: response, Username: agentName})
	}
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
	// Trim whitespace.
	content = strings.TrimSpace(content)
	// Enforce max length.
	if len([]rune(content)) > maxContentLength {
		content = string([]rune(content)[:maxContentLength])
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