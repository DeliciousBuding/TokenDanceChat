package hub

import (
	"context"
	"encoding/json"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"

	"tokendancechat/backend/llm"

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
	maxMessageSize = 4096

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
		case "friend_request":
			c.handleFriendRequest(msg)
		case "friend_accept":
			c.handleFriendAccept(msg)
		case "friend_reject":
			c.handleFriendReject(msg)
		case "friend_list":
			c.handleFriendList()
		case "group_create":
			c.handleGroupCreate(msg)
		case "group_invite":
			c.handleGroupInvite(msg)
		case "group_message":
			c.handleGroupMessage(msg)
		case "group_join":
			c.handleGroupJoin(msg)
		case "message_delete":
			c.handleMessageDelete(msg)
		case "typing_start":
			c.handleTypingStart()
		case "typing_stop":
			c.handleTypingStop()
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

	c.username = username
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

	// Broadcast user_joined to all clients.
	now := time.Now().UnixMilli()
	joinMsg, _ := json.Marshal(Message{
		Type:      "user_joined",
		Username:  c.username,
		Online:    c.hub.onlineUsers(),
		Timestamp: now,
	})
	c.hub.broadcast <- joinMsg
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
	storedMsg, err := c.hub.store.InsertMessage(c.username, content, "", c.currentRoomID)
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
	c.hub.broadcast <- broadcastMsg

	// Store the user message in LLM memory.
	if mem := c.hub.Memory(); mem != nil {
		mem.Add(llm.Message{Role: "user", Content: content})
	}

	// Check for @mentions and trigger bot response.
	if botName := c.hub.BotName(); botName != "" && c.hub.LLMClient() != nil && c.username != botName {
		mentions := parseMentions(content)
		for _, m := range mentions {
			if strings.EqualFold(m, botName) {
				go c.handleBotResponse(context.Background(), content)
				break
			}
		}
	}
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
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
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
var mentionRegex = regexp.MustCompile(`@(\w+)`)

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
		Type:     "friend_request",
		From:     c.username,
		To:       to,
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

	c.hub.AddGroupMember(groupName, username)

	// Notify invited user.
	inviteMsg, _ := json.Marshal(Message{
		Type:  "group_invite",
		Group: groupName,
		From:  c.username,
	})
	c.hub.SendToUser(username, inviteMsg)

	// Notify all group members about membership update.
	members := c.hub.GroupMembers(groupName)
	updateMsg, _ := json.Marshal(Message{
		Type:    "group_join",
		Group:   groupName,
		Members: members,
	})
	c.hub.SendToGroup(groupName, updateMsg)
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
	storedMsg, err := c.hub.store.InsertMessage(c.username, content, "", c.currentRoomID)
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
}

func (c *Client) handleGroupJoin(msg Message) {
	if c.username == "" {
		return
	}
	groupName := msg.Group
	if groupName == "" {
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

// --- Message delete handler ---

func (c *Client) handleMessageDelete(msg Message) {
	if c.username == "" {
		return
	}
	messageID := msg.ID
	if messageID == "" {
		return
	}

	// MarkDeleted not yet implemented in store; broadcasting deletion event only.
	// log.Printf("failed to mark message deleted: %v", err)
	// return

	// Broadcast deletion.
	delMsg, _ := json.Marshal(Message{
		Type:    "message_delete",
		ID:      messageID,
		Deleted: true,
	})
	c.hub.broadcast <- delMsg
}
// Rate limited to once per 3 seconds per user.
func (c *Client) handleTypingStart() {
	if c.username == "" {
		return
	}
	if !c.hub.ShouldBroadcastTyping(c.username) {
		return
	}
	c.hub.BroadcastTyping(c.username, "typing")
}

// handleTypingStop broadcasts that the user stopped typing.
func (c *Client) handleTypingStop() {
	if c.username == "" {
		return
	}
	c.hub.BroadcastTyping(c.username, "typing_stop")
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
	c.currentRoomID = roomID

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
	c.currentRoomID = defaultID

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

	// Find the original message from store history (simple lookup).
	allMessages := c.hub.store.GetRoomMessages(c.currentRoomID, 1000, 0)
	var originalContent string
	var originalUser string
	for _, m := range allMessages {
		if m.ID == messageID {
			originalContent = m.Content
			originalUser = m.Username
			break
		}
	}

	if originalContent == "" {
		// Try unfiltered search.
		allMessages = c.hub.store.GetMessages(1000, 0)
		for _, m := range allMessages {
			if m.ID == messageID {
				originalContent = m.Content
				originalUser = m.Username
				break
			}
		}
	}

	if originalContent == "" {
		return
	}

	// Construct forwarded content.
	forwardContent := "Forwarded from " + originalUser + ":\n" + originalContent

	// Persist as a new message.
	storedMsg, err := c.hub.store.InsertMessage(c.username, forwardContent, messageID, c.currentRoomID)
	if err != nil {
		log.Printf("failed to insert forwarded message: %v", err)
		return
	}

	// Broadcast forwarded message.
	fwdMsg, _ := json.Marshal(Message{
		Type:     "message",
		ID:       storedMsg.ID,
		Username: c.username,
		Content:  forwardContent,
		Timestamp: storedMsg.Timestamp,
		RoomID:   c.currentRoomID,
	})
	c.hub.broadcast <- fwdMsg

	// Also send to target user if online.
	forwardPayload, _ := json.Marshal(Message{
		Type:    "forward",
		From:    c.username,
		Content: forwardContent,
		ID:      storedMsg.ID,
		Timestamp: storedMsg.Timestamp,
	})
	c.hub.SendToUser(to, forwardPayload)
}

// handleBotResponse handles the LLM bot response when the bot is @mentioned.
// This runs in its own goroutine and streams the response.
func (c *Client) handleBotResponse(ctx context.Context, userContent string) {
	// Send typing indicator.
	c.hub.BroadcastJSON(Message{
		Type:     "typing",
		Username: c.hub.BotName(),
	})

	// Build conversation history from memory.
	messages := c.hub.Memory().GetMessages()

	// Call the LLM with streaming.
	var fullResponse strings.Builder
	client := c.hub.LLMClient()
	err := client.ChatStream(ctx, messages, func(chunk string) error {
		fullResponse.WriteString(chunk)
		c.hub.BroadcastStreamChunk(c.hub.BotName(), chunk, false)
		return nil
	})

	if err != nil {
		log.Printf("LLM stream error: %v", err)
		errorContent := "Sorry, I encountered an error while generating a response."
		fullResponse.Reset()
		fullResponse.WriteString(errorContent)
		// Send the error as a final stream chunk.
		c.hub.BroadcastStreamChunk(c.hub.BotName(), errorContent, true)
	}

	response := fullResponse.String()
	if response != "" {
		// Broadcast the final done signal for the stream.
		c.hub.BroadcastStreamChunk(c.hub.BotName(), "", true)

		// Persist the complete message to the store and broadcast as a normal message.
		c.hub.SendBotMessage(response, c.currentRoomID)
	}

	// Update memory with the bot response.
	if mem := c.hub.Memory(); mem != nil {
		mem.Add(llm.Message{Role: "assistant", Content: response})
	}
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
