package picoclaw

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
)

// ============================================================================
// Bot — Telegram-Bot-API-style interface for PicoClaw
// ============================================================================

// HubClient is the interface the Bot needs from the chat hub.
type HubClient interface {
	SendAssistantMessageToRoom(agentName, content, roomID string)
	BroadcastStreamChunkToRoom(agentName, delta string, done bool, roomID string)
	BroadcastTyping(agentName, kind, context, preview string)
	BroadcastJSON(v any)
	ExecuteHubCommand(cmd HubCmd) HubCmdResponse
}

// HubCmd represents a command from PicoClaw Bot to the hub.
type HubCmd struct {
	Type    string
	RoomID  string
	ToUser  string
	Content string
	Limit   int
	Before  int64
	Params  map[string]any
}

// HubCmdResponse is the hub's response.
type HubCmdResponse struct {
	Success bool
	Data    map[string]any
	Error   string
}

// ============================================================================
// Public API types
// ============================================================================

// Update represents an incoming event from the chat.
type Update struct {
	ID        string   `json:"id"`
	Type      string   `json:"type"` // "message", "command", "reaction"
	From      BotUser  `json:"from"`
	Chat      BotChat  `json:"chat"`
	Text      string   `json:"text,omitempty"`
	Command   string   `json:"command,omitempty"`
	Timestamp int64    `json:"timestamp"`
	MediaURLs []string `json:"media_urls,omitempty"`
	Raw       any      `json:"-"` // original incoming Message
}

// BotUser represents a chat user.
type BotUser struct {
	Username string `json:"username"`
}

// BotChat represents a chat/channel/DM context.
type BotChat struct {
	ID   string `json:"id"`
	Type string `json:"type"` // "public", "dm", "group"
	Name string `json:"name,omitempty"`
}

// BotMessage is a chat message returned by the Bot API.
type BotMessage struct {
	ID        string         `json:"id"`
	From      BotUser        `json:"from,omitempty"`
	Chat      BotChat        `json:"chat"`
	Text      string         `json:"text"`
	Timestamp int64          `json:"timestamp"`
	MediaURLs []string       `json:"media_urls,omitempty"`
	Reactions map[string]int `json:"reactions,omitempty"`
}

// SendMessageOpts contains optional parameters for SendMessage.
type SendMessageOpts struct {
	ReplyToID string   `json:"reply_to_id,omitempty"`
	MediaURLs []string `json:"media_urls,omitempty"`
}

// ============================================================================
// StreamWriter — streaming message interface
// ============================================================================

// StreamWriter provides a streaming message interface.
//
//	sw, _ := bot.SendStream("public")
//	sw.Write("Hello")
//	sw.Write(" World")
//	sw.Done("Hello World")
type StreamWriter struct {
	bot     *Bot
	chatID  string
	mu      sync.Mutex
	closed  bool
}

// Write sends a streaming chunk to the chat.
func (sw *StreamWriter) Write(text string) error {
	sw.mu.Lock()
	defer sw.mu.Unlock()
	if sw.closed {
		return fmt.Errorf("stream already closed")
	}
	sw.bot.hub.BroadcastStreamChunkToRoom(sw.bot.agentName, text, false, sw.chatID)
	return nil
}

// Done signals the end of stream and persists the full message.
func (sw *StreamWriter) Done(fullText string) error {
	sw.mu.Lock()
	defer sw.mu.Unlock()
	if sw.closed {
		return fmt.Errorf("stream already closed")
	}
	sw.closed = true
	sw.bot.hub.BroadcastStreamChunkToRoom(sw.bot.agentName, "", true, sw.chatID)
	sw.bot.hub.SendAssistantMessageToRoom(sw.bot.agentName, fullText, sw.chatID)
	return nil
}

// Cancel aborts the stream without persisting.
func (sw *StreamWriter) Cancel() {
	sw.mu.Lock()
	defer sw.mu.Unlock()
	if !sw.closed {
		sw.closed = true
		sw.bot.hub.BroadcastStreamChunkToRoom(sw.bot.agentName, "", true, sw.chatID)
	}
}

// ============================================================================
// Bot — main struct
// ============================================================================

// Bot provides a Telegram-Bot-API-like interface for TokenDanceChat through PicoClaw.
// It wraps the low-level WebSocket client with high-level messaging, streaming,
// and command methods that feel familiar to Telegram Bot API users.
type Bot struct {
	client    *Client
	hub       HubClient
	agentName string

	onUpdate func(update Update)

	proactiveMu sync.Mutex
	proactive   []proactiveMsg
}

type proactiveMsg struct {
	ChatID string
	Text   string
}

// BotConfig configures the Bot.
type BotConfig struct {
	Client    *Client
	Hub       HubClient
	AgentName string
}

// NewBot creates a new Bot.
func NewBot(cfg BotConfig) *Bot {
	return &Bot{
		client:    cfg.Client,
		hub:       cfg.Hub,
		agentName: cfg.AgentName,
	}
}

// ============================================================================
// Core Send Methods
// ============================================================================

// SendMessage sends a text message to a chat.
// chatID can be "public", "dm:username", or "group:groupname".
func (b *Bot) SendMessage(chatID, text string) error {
	return b.SendMessageWithOpts(chatID, text, SendMessageOpts{})
}

// SendMessageWithOpts sends with optional reply and media.
func (b *Bot) SendMessageWithOpts(chatID, text string, opts SendMessageOpts) error {
	if text == "" {
		return fmt.Errorf("text cannot be empty")
	}
	b.hub.SendAssistantMessageToRoom(b.agentName, text, chatID)
	return nil
}

// SendStream starts a streaming message.
func (b *Bot) SendStream(chatID string) (*StreamWriter, error) {
	return &StreamWriter{bot: b, chatID: chatID}, nil
}

// EditMessage edits a previously sent message.
func (b *Bot) EditMessage(messageID, newText string) error {
	if newText == "" {
		return fmt.Errorf("text cannot be empty")
	}
	b.hub.ExecuteHubCommand(HubCmd{
		Type:   "edit_message",
		Params: map[string]any{"message_id": messageID, "content": newText},
	})
	return nil
}

// DeleteMessage deletes a message.
func (b *Bot) DeleteMessage(messageID string) error {
	b.hub.ExecuteHubCommand(HubCmd{
		Type:   "delete_message",
		Params: map[string]any{"message_id": messageID},
	})
	return nil
}

// SendTyping sends a typing indicator.
func (b *Bot) SendTyping(chatID string) {
	b.hub.BroadcastTyping(b.agentName, "typing_start", chatID, "")
}

// StopTyping stops the typing indicator.
func (b *Bot) StopTyping(chatID string) {
	b.hub.BroadcastTyping(b.agentName, "typing_stop", chatID, "")
}

// SendReaction adds a reaction to a message.
func (b *Bot) SendReaction(messageID, emoji string) error {
	b.hub.ExecuteHubCommand(HubCmd{
		Type:   "react",
		Params: map[string]any{"message_id": messageID, "emoji": emoji},
	})
	return nil
}

// ============================================================================
// Rich Media Methods
// ============================================================================

// SendPhoto sends an image to a chat.
func (b *Bot) SendPhoto(chatID, photoURL, caption string) {
	text := fmt.Sprintf("![image](%s)", photoURL)
	if caption != "" {
		text = caption + "\n" + text
	}
	b.hub.SendAssistantMessageToRoom(b.agentName, text, chatID)
}

// SendDocument sends a file link to a chat.
func (b *Bot) SendDocument(chatID, fileURL, caption string) {
	text := fmt.Sprintf("[Download](%s)", fileURL)
	if caption != "" {
		text = caption + "\n" + text
	}
	b.hub.SendAssistantMessageToRoom(b.agentName, text, chatID)
}

// ============================================================================
// Chat/Room Info Methods
// ============================================================================

// GetOnlineUsers returns the list of currently online users.
func (b *Bot) GetOnlineUsers() ([]string, error) {
	resp := b.hub.ExecuteHubCommand(HubCmd{Type: "online_users"})
	if !resp.Success {
		return nil, fmt.Errorf("failed: %s", resp.Error)
	}
	if users, ok := resp.Data["users"].([]any); ok {
		result := make([]string, 0, len(users))
		for _, u := range users {
			if s, ok := u.(string); ok {
				result = append(result, s)
			}
		}
		return result, nil
	}
	return nil, fmt.Errorf("unexpected response type")
}

// GetChatHistory retrieves message history from a chat.
func (b *Bot) GetChatHistory(chatID string, limit int) ([]*BotMessage, error) {
	resp := b.hub.ExecuteHubCommand(HubCmd{Type: "history", RoomID: chatID, Limit: limit})
	if !resp.Success {
		return nil, fmt.Errorf("failed: %s", resp.Error)
	}
	raw, _ := json.Marshal(resp.Data["messages"])
	var msgs []*BotMessage
	if err := json.Unmarshal(raw, &msgs); err != nil {
		return nil, fmt.Errorf("parse error: %w", err)
	}
	return msgs, nil
}

// ============================================================================
// Proactive / Direct Messaging
// ============================================================================

// SendDM sends a direct message to a specific user.
func (b *Bot) SendDM(username, text string) {
	b.hub.ExecuteHubCommand(HubCmd{Type: "send_dm", ToUser: username, Content: text})
}

// Broadcast broadcasts to the public chat.
func (b *Bot) Broadcast(text string) {
	b.hub.SendAssistantMessageToRoom(b.agentName, text, "")
}

// NotifyAll sends a system notification to all users.
func (b *Bot) NotifyAll(text string) {
	b.hub.BroadcastJSON(map[string]any{
		"type":     "system",
		"username": "system",
		"content":  text,
	})
}

// ============================================================================
// Update Handling (incoming messages)
// ============================================================================

// OnUpdate registers a handler for incoming updates.
func (b *Bot) OnUpdate(handler func(update Update)) {
	b.onUpdate = handler
}

// HandleIncoming processes a raw incoming PicoClaw Message and routes to the update handler.
func (b *Bot) HandleIncoming(msg Message) {
	if b.onUpdate == nil {
		return
	}

	update := Update{
		ID:        msg.ID,
		Type:      "message",
		From:      BotUser{Username: ""},
		Chat:      BotChat{ID: msg.RoomID},
		Text:      msg.Content,
		Timestamp: msg.Timestamp,
		MediaURLs: msg.MediaURLs,
		Raw:       msg,
	}

	if msg.Type == MsgTypeCommand || msg.Type == "command" {
		update.Type = "command"
		if cmd, ok := msg.Payload["command"].(string); ok {
			update.Command = cmd
		}
	}

	if update.Text == "" && msg.Payload != nil {
		if content, ok := msg.Payload["content"].(string); ok {
			update.Text = content
		}
	}

	b.onUpdate(update)

	// Drain proactive queue.
	b.proactiveMu.Lock()
	if len(b.proactive) > 0 {
		for _, pm := range b.proactive {
			b.hub.SendAssistantMessageToRoom(b.agentName, pm.Text, pm.ChatID)
		}
		b.proactive = nil
	}
	b.proactiveMu.Unlock()
}

// QueueProactive queues a message to be sent on the next incoming update.
func (b *Bot) QueueProactive(chatID, text string) {
	b.proactiveMu.Lock()
	b.proactive = append(b.proactive, proactiveMsg{ChatID: chatID, Text: text})
	b.proactiveMu.Unlock()
}

// ============================================================================
// Connection Management
// ============================================================================

// Connect establishes the WebSocket connection and starts the proactive callback.
func (b *Bot) Connect(ctx context.Context) error {
	// Wire proactive callback — when PicoClaw sends unsolicited messages, route them to the handler.
	b.client.ProactiveCallback = func(msg Message) {
		if b.onUpdate != nil {
			b.HandleIncoming(msg)
		}
	}

	if err := b.client.Connect(ctx); err != nil {
		return fmt.Errorf("bot connect: %w", err)
	}

	log.Printf("picoclaw bot: connected and listening")
	return nil
}

// Close disconnects the bot.
func (b *Bot) Close() {
	b.client.Close()
}

// IsConnected returns whether the bot is currently connected.
func (b *Bot) IsConnected() bool {
	return b.client.IsConnected()
}

// Client returns the underlying low-level PicoClaw client.
func (b *Bot) Client() *Client {
	return b.client
}

// ============================================================================
// Parse helpers
// ============================================================================

// ParseUpdate converts a raw JSON message into an Update.
func ParseUpdate(raw []byte) (*Update, error) {
	var msg Message
	if err := json.Unmarshal(raw, &msg); err != nil {
		return nil, fmt.Errorf("parse update: %w", err)
	}
	msg.normalizePayload()

	update := &Update{
		ID:        msg.ID,
		Type:      "message",
		Chat:      BotChat{ID: msg.RoomID},
		Text:      msg.Content,
		Timestamp: msg.Timestamp,
		MediaURLs: msg.MediaURLs,
		Raw:       msg,
	}

	if msg.Type == MsgTypeCommand || msg.Type == "command" {
		update.Type = "command"
		if cmd, ok := msg.Payload["command"].(string); ok {
			update.Command = cmd
		}
	}

	return update, nil
}
