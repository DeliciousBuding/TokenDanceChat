package picoclaw

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

type Config struct {
	WSURL string
	Token string
}

type Message struct {
	Type           string         `json:"type,omitempty"`
	ID             string         `json:"id,omitempty"`
	SessionID      string         `json:"session_id,omitempty"`
	Timestamp      int64          `json:"timestamp,omitempty"`
	Content        string         `json:"content,omitempty"`
	Thought        string         `json:"thought,omitempty"`
	ConversationID string         `json:"conversation_id,omitempty"`
	Error          string         `json:"error,omitempty"`
	Payload        map[string]any `json:"payload,omitempty"`
	IsThought      bool           `json:"-"`
	IsPartial      bool           `json:"-"`
}

type Callback func(msg Message)
type TypingCallback func(start bool)

// ResponseHandler is returned by SendMessage. The caller sets callbacks
// and calls Wait() to block until the response is complete.
type ResponseHandler struct {
	OnMessage Callback
	OnTyping  TypingCallback
	done      chan struct{}
	closed    atomic.Bool
}

func (h *ResponseHandler) Wait() { <-h.done }
func (h *ResponseHandler) done_() {
	if h.closed.CompareAndSwap(false, true) {
		close(h.done)
	}
}

type Client struct {
	cfg     Config
	conn    *websocket.Conn
	mu      sync.Mutex
	pending *ResponseHandler
	// ProactiveCallback is invoked for unsolicited messages from PicoClaw
	// (no pending request), enabling the agent to send messages on its own
	// initiative — e.g. summarisation, alert, scheduled update.
	ProactiveCallback func(msg Message)
	ctx               context.Context
	cancel            context.CancelFunc
}

func New(cfg Config) *Client {
	return &Client{cfg: cfg}
}

func (c *Client) Connect(ctx context.Context) error {
	c.ctx, c.cancel = context.WithCancel(ctx)
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connectUnsafe(c.ctx)
}

// connectUnsafe connects to PicoClaw WebSocket. Caller must hold c.mu.
func (c *Client) connectUnsafe(ctx context.Context) error {
	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}

	header := http.Header{}
	if c.cfg.Token != "" {
		header.Set("Authorization", "Bearer "+c.cfg.Token)
	}

	conn, _, err := dialer.DialContext(ctx, c.cfg.WSURL, header)
	if err != nil {
		return fmt.Errorf("picoclaw dial: %w", err)
	}
	if c.conn != nil {
		_ = c.conn.Close()
	}
	c.conn = conn
	log.Printf("picoclaw: connected to %s", c.cfg.WSURL)
	go c.readLoop(conn)
	return nil
}

// SendMessage sends content to PicoClaw and returns a ResponseHandler.
// The caller must set OnMessage/OnTyping callbacks on the handler, then
// call handler.Wait() to block until the response completes.
func (c *Client) SendMessage(content string) (*ResponseHandler, error) {
	id := fmt.Sprintf("tdchat-%d", time.Now().UnixNano())
	handler := &ResponseHandler{done: make(chan struct{})}
	return handler, c.send(handler, Message{
		Type:      "message.send",
		ID:        id,
		Timestamp: time.Now().UnixMilli(),
		Payload: map[string]any{
			"content": content,
		},
	})
}

func (c *Client) Close() {
	if c.cancel != nil {
		c.cancel()
	}
	if c.conn != nil {
		c.conn.Close()
	}
}

func (c *Client) send(handler *ResponseHandler, msg Message) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Replace any stale pending handler (previous timed-out request).
	if c.pending != nil {
		c.pending.done_()
	}
	c.pending = handler

	if c.conn == nil {
		if c.ctx == nil {
			c.ctx = context.Background()
		}
		if err := c.connectUnsafe(c.ctx); err != nil {
			c.pending = nil
			return err
		}
	}
	c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if err := c.conn.WriteJSON(msg); err != nil {
		_ = c.conn.Close()
		c.conn = nil
		if err := c.connectUnsafe(c.ctx); err != nil {
			c.pending = nil
			return err
		}
		c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		if err := c.conn.WriteJSON(msg); err != nil {
			c.pending = nil
			return err
		}
	}
	return nil
}

func (c *Client) readLoop(conn *websocket.Conn) {
	defer func() {
		c.mu.Lock()
		if c.conn == conn {
			c.conn.Close()
			c.conn = nil
		}
		c.mu.Unlock()
	}()
	for {
		select {
		case <-c.ctx.Done():
			return
		default:
		}
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var msg Message
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		msg.normalizePayload()

		c.mu.Lock()
		handler := c.pending
		c.mu.Unlock()

		// Only invoke callbacks if the handler hasn't been replaced/closed.
		// Checking closed under handler's own atomic avoids the race where
		// send() replaces c.pending and closes the old handler while readLoop
		// is holding a pointer to it.
		if handler != nil && !handler.closed.Load() {
			switch msg.Type {
			case "message.create":
				if handler.OnMessage != nil {
					handler.OnMessage(msg)
				}
			case "message.update":
				msg.IsPartial = true
				if handler.OnMessage != nil {
					handler.OnMessage(msg)
				}
			case "typing.start":
				if handler.OnTyping != nil {
					handler.OnTyping(true)
				}
			case "typing.stop":
				if handler.OnTyping != nil {
					handler.OnTyping(false)
				}
			case "thought":
				msg.IsThought = true
				if handler.OnMessage != nil {
					handler.OnMessage(msg)
				}
			}
		} else if c.ProactiveCallback != nil && msg.Content != "" {
			c.ProactiveCallback(msg)
		}
	}
}

func (m *Message) normalizePayload() {
	if m.Payload == nil {
		return
	}
	if m.Content == "" {
		if content, ok := m.Payload["content"].(string); ok {
			m.Content = content
		}
	}
	if m.Thought == "" {
		if thought, ok := m.Payload["thought"].(string); ok {
			m.Thought = thought
		}
	}
	if kind, ok := m.Payload["kind"].(string); ok && kind == "thought" {
		m.IsThought = true
	}
	if thought, ok := m.Payload["thought"].(bool); ok && thought {
		m.IsThought = true
	}
}

func HealthCheck(ctx context.Context, baseURL string) error {
	req, err := http.NewRequestWithContext(ctx, "GET", baseURL+"/health", nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health check returned %d", resp.StatusCode)
	}
	return nil
}
