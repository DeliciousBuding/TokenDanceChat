package picoclaw

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
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

type Client struct {
	cfg       Config
	conn      *websocket.Conn
	mu        sync.Mutex
	onMessage Callback
	onTyping  TypingCallback
	ctx       context.Context
	cancel    context.CancelFunc
}

func New(cfg Config) *Client {
	return &Client{cfg: cfg}
}

func (c *Client) Connect(ctx context.Context) error {
	c.ctx, c.cancel = context.WithCancel(ctx)
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connectLocked(c.ctx)
}

func (c *Client) connectLocked(ctx context.Context) error {
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

func (c *Client) SendMessage(content string) (string, error) {
	id := fmt.Sprintf("tdchat-%d", time.Now().UnixNano())
	return id, c.send(Message{
		Type:      "message.send",
		ID:        id,
		Timestamp: time.Now().UnixMilli(),
		Payload: map[string]any{
			"content": content,
		},
	})
}

func (c *Client) OnMessage(cb Callback)      { c.onMessage = cb }
func (c *Client) OnTyping(cb TypingCallback) { c.onTyping = cb }

func (c *Client) Close() {
	if c.cancel != nil {
		c.cancel()
	}
	if c.conn != nil {
		c.conn.Close()
	}
}

func (c *Client) send(msg Message) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == nil {
		if c.ctx == nil {
			c.ctx = context.Background()
		}
		if err := c.connectLocked(c.ctx); err != nil {
			return err
		}
	}
	c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if err := c.conn.WriteJSON(msg); err != nil {
		_ = c.conn.Close()
		c.conn = nil
		if err := c.connectLocked(c.ctx); err != nil {
			return err
		}
		c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		return c.conn.WriteJSON(msg)
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

		switch msg.Type {
		case "message.create":
			if c.onMessage != nil {
				c.onMessage(msg)
			}
		case "message.update":
			msg.IsPartial = true
			if c.onMessage != nil {
				c.onMessage(msg)
			}
		case "typing.start":
			if c.onTyping != nil {
				c.onTyping(true)
			}
		case "typing.stop":
			if c.onTyping != nil {
				c.onTyping(false)
			}
		case "thought":
			msg.IsThought = true
			if c.onMessage != nil {
				c.onMessage(msg)
			}
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
	if m.IsThought {
		return
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
