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
}

// NewClient creates a new WebSocket client.
func NewClient(h *Hub, conn *websocket.Conn) *Client {
	return &Client{
		hub:  h,
		conn: conn,
		send: make(chan []byte, 256),
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

	// Send history to the joining client.
	historyMessages := c.hub.store.GetMessages(100, 0)
	historyPayload, _ := json.Marshal(Message{
		Type:     "history",
		Messages: historyMessages,
	})
	select {
	case c.send <- historyPayload:
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
	storedMsg, err := c.hub.store.InsertMessage(c.username, content)
	if err != nil {
		log.Printf("failed to insert message: %v", err)
		return
	}

	// Broadcast to all clients.
	broadcastMsg, _ := json.Marshal(Message{
		Type:      "message",
		ID:        storedMsg.ID,
		Username:  storedMsg.Username,
		Content:   storedMsg.Content,
		Timestamp: storedMsg.Timestamp,
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

// handleBotResponse handles the LLM bot response when the bot is @mentioned.
// This runs in its own goroutine.
func (c *Client) handleBotResponse(ctx context.Context, userContent string) {
	// Send typing indicator.
	c.hub.BroadcastJSON(Message{
		Type:     "typing",
		Username: c.hub.BotName(),
	})

	// Build conversation history from memory.
	messages := c.hub.Memory().GetMessages()

	// Call the LLM.
	client := c.hub.LLMClient()
	response, err := client.Chat(ctx, messages)
	if err != nil {
		log.Printf("LLM error: %v", err)
	}

	// Broadcast the bot response (goes through store + broadcast, no rate limiting).
	c.hub.SendBotMessage(response)

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
