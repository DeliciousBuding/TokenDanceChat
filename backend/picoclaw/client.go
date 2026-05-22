package picoclaw

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// -------- 消息类型常量 --------

const (
	MsgTypeProactive = "proactive" // 主动消息（PicoClaw 自发推送）
	MsgTypeSystem    = "system"    // 系统通知
	MsgTypeCommand   = "command"   // 命令（Hub 查询等）
)

// -------- 配置 --------

// Config PicoClaw WebSocket 连接配置。
type Config struct {
	WSURL string // WebSocket 地址，如 ws://localhost:9090/ws
	Token string // 认证 Bearer Token
}

// -------- 消息定义 --------

// Message PicoClaw 消息协议结构体。
// 兼容原有 Pico 协议字段，同时扩展了 TokenDanceChat 专用字段。
type Message struct {
	// --- Pico 协议原有字段 ---
	Type           string         `json:"type,omitempty"`            // 消息类型
	ID             string         `json:"id,omitempty"`              // 消息 ID
	SessionID      string         `json:"session_id,omitempty"`      // 会话 ID
	Timestamp      int64          `json:"timestamp,omitempty"`       // Unix 毫秒时间戳
	Content        string         `json:"content,omitempty"`         // 文本内容
	Thought        string         `json:"thought,omitempty"`         // 思考/推理内容
	ConversationID string         `json:"conversation_id,omitempty"` // 对话 ID
	Error          string         `json:"error,omitempty"`           // 错误信息
	Payload        map[string]any `json:"payload,omitempty"`         // 任意载荷
	IsThought      bool           `json:"-"`                         // 是否为思考内容（内部标记）
	IsPartial      bool           `json:"-"`                         // 是否为流式片段（内部标记）

	// --- TokenDanceChat 扩展字段 ---
	RoomID    string            `json:"room_id,omitempty"`    // 房间 ID，用于房间级消息路由
	MediaURLs []string          `json:"media_urls,omitempty"` // 图片/文件 URL 列表
	Metadata  map[string]string `json:"metadata,omitempty"`   // 可扩展元数据（如来源、标签）
}

// -------- 回调类型 --------

// Callback 消息回调函数类型。
type Callback func(msg Message)

// TypingCallback 输入状态回调函数类型。
type TypingCallback func(start bool)

// ReconnectCallback 重连回调函数类型。
type ReconnectCallback func()

// -------- ResponseHandler --------

// ResponseHandler SendMessage 的返回值，调用方设置回调后调用 Wait() 阻塞等待响应完成。
type ResponseHandler struct {
	OnMessage Callback       // 收到消息时的回调
	OnTyping  TypingCallback // 收到输入状态时的回调
	done      chan struct{}  // 完成信号
	closed    atomic.Bool    // 是否已关闭
}

// Wait 阻塞等待响应完成。
func (h *ResponseHandler) Wait() { <-h.done }

// done_ 标记响应完成（仅执行一次）。
func (h *ResponseHandler) done_() {
	if h.closed.CompareAndSwap(false, true) {
		close(h.done)
	}
}

// -------- SendMessageOptions --------

// SendMessageOptions 发送消息的可选参数。
type SendMessageOptions struct {
	RoomID    string            // 房间 ID
	MediaURLs []string          // 媒体 URL 列表
	Metadata  map[string]string // 元数据
}

// -------- Client --------

// Client PicoClaw WebSocket 客户端。
type Client struct {
	cfg     Config
	conn    *websocket.Conn
	mu      sync.Mutex
	pending *ResponseHandler

	// ProactiveCallback 处理未经请求的消息（无 pending handler 时触发）。
	// 用于 PicoClaw 主动推送：摘要、告警、定时更新等。
	ProactiveCallback func(msg Message)

	// OnReconnect 重连成功回调，用于通知 Hub 房间重连事件。
	OnReconnect ReconnectCallback

	ctx    context.Context
	cancel context.CancelFunc

	// --- 重连控制 ---
	reconnecting  atomic.Bool   // 是否正在重连
	backoff       time.Duration // 当前退避时间
	maxBackoff    time.Duration // 最大退避时间
	backoffMu     sync.Mutex

	// --- 心跳控制 ---
	pingTicker *time.Ticker
	pingDone   chan struct{}
}

// -------- 构造函数 --------

// New 创建 PicoClaw 客户端。
func New(cfg Config) *Client {
	return &Client{
		cfg:        cfg,
		maxBackoff: 30 * time.Second, // 最大重连退避 30 秒
	}
}

// -------- 连接管理 --------

// Connect 连接到 PicoClaw WebSocket 服务端。
func (c *Client) Connect(ctx context.Context) error {
	c.ctx, c.cancel = context.WithCancel(ctx)
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connectUnsafe(c.ctx)
}

// connectUnsafe 内部连接实现，调用方必须持有 c.mu。
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

	// 启动读协程。
	go c.readLoop(conn)

	// 启动心跳写协程。
	c.startPingLoop(conn)

	return nil
}

// startPingLoop 启动 ping 定时器，利用 gorilla/websocket 自带 ping/pong 机制保持连接活跃。
func (c *Client) startPingLoop(conn *websocket.Conn) {
	// 停止旧的 ping 协程（如有）。
	if c.pingDone != nil {
		close(c.pingDone)
	}
	c.pingDone = make(chan struct{})
	c.pingTicker = time.NewTicker(30 * time.Second) // 每 30 秒发送 ping

	go func() {
		defer c.pingTicker.Stop()
		for {
			select {
			case <-c.pingTicker.C:
				c.mu.Lock()
				if c.conn == conn {
					conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
					if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
						log.Printf("picoclaw: ping write error: %v", err)
					}
				}
				c.mu.Unlock()
			case <-c.pingDone:
				return
			case <-c.ctx.Done():
				return
			}
		}
	}()
}

// -------- 重连机制 --------

// ReconnectLoop 启动自动重连循环（指数退避）。
// 应在独立的 goroutine 中运行，Connect 失败或 readLoop 退出后调用。
func (c *Client) ReconnectLoop(ctx context.Context) {
	if !c.reconnecting.CompareAndSwap(false, true) {
		return // 已在重连循环中
	}
	defer c.reconnecting.Store(false)

	for {
		select {
		case <-ctx.Done():
			return
		case <-c.ctx.Done():
			return
		default:
		}

		// 计算退避时间。
		c.backoffMu.Lock()
		delay := c.backoff
		if delay == 0 {
			delay = 1 * time.Second // 初始 1 秒
		} else {
			delay = time.Duration(math.Min(float64(delay*2), float64(c.maxBackoff)))
		}
		c.backoff = delay
		c.backoffMu.Unlock()

		log.Printf("picoclaw: reconnecting in %v...", delay)
		select {
		case <-time.After(delay):
		case <-ctx.Done():
			return
		case <-c.ctx.Done():
			return
		}

		c.mu.Lock()
		err := c.connectUnsafe(c.ctx)
		c.mu.Unlock()
		if err != nil {
			log.Printf("picoclaw: reconnect failed: %v", err)
			continue
		}

		// 重连成功 → 重置退避并通知回调。
		c.backoffMu.Lock()
		c.backoff = 0
		c.backoffMu.Unlock()

		log.Printf("picoclaw: reconnected successfully")
		if c.OnReconnect != nil {
			c.OnReconnect()
		}
		return // 重连成功，退出循环
	}
}

// SetReconnectCallback 设置重连回调，供 Hub 注册房间通知逻辑。
func (c *Client) SetReconnectCallback(cb ReconnectCallback) {
	c.OnReconnect = cb
}

// -------- 消息发送 --------

// SendMessage 发送消息到 PicoClaw 并返回 ResponseHandler。
// 保持向后兼容：content 即为消息文本。
func (c *Client) SendMessage(content string) (*ResponseHandler, error) {
	return c.SendMessageWithOpts(content, SendMessageOptions{})
}

// SendMessageWithOpts 发送消息并携带可选的 RoomID、MediaURLs、Metadata。
func (c *Client) SendMessageWithOpts(content string, opts SendMessageOptions) (*ResponseHandler, error) {
	id := fmt.Sprintf("tdchat-%d", time.Now().UnixNano())
	handler := &ResponseHandler{done: make(chan struct{})}
	msg := Message{
		Type:      "message.send",
		ID:        id,
		Timestamp: time.Now().UnixMilli(),
			Content:   content,
		RoomID:    opts.RoomID,
		MediaURLs: opts.MediaURLs,
		Metadata:  opts.Metadata,
		Payload: map[string]any{
			"content": content,
		},
	}
	return handler, c.send(handler, msg)
}

// SendProactiveMessage 发送主动消息（PicoClaw 自发推送，不等待回复）。
// 用于摘要、告警、定时通知等场景。
func (c *Client) SendProactiveMessage(content string, opts SendMessageOptions) (*ResponseHandler, error) {
	id := fmt.Sprintf("tdchat-p-%d", time.Now().UnixNano())
	handler := &ResponseHandler{done: make(chan struct{})}
	msg := Message{
		Type:      MsgTypeProactive,
		ID:        id,
		Timestamp: time.Now().UnixMilli(),
		Content:   content,
		RoomID:    opts.RoomID,
		MediaURLs: opts.MediaURLs,
		Metadata:  opts.Metadata,
	}
	return handler, c.send(handler, msg)
}

// SendSystemNotification 发送系统通知。
// 用于连接状态、服务器事件等广播。
func (c *Client) SendSystemNotification(content string, roomID string) (*ResponseHandler, error) {
	id := fmt.Sprintf("tdchat-s-%d", time.Now().UnixNano())
	handler := &ResponseHandler{done: make(chan struct{})}
	msg := Message{
		Type:      MsgTypeSystem,
		ID:        id,
		Timestamp: time.Now().UnixMilli(),
		Content:   content,
		RoomID:    roomID,
	}
	return handler, c.send(handler, msg)
}

// SendCommand 发送命令（Hub 查询等）。
// command: 命令名，如 "online_users"、"history"、"send_dm"。
// params: 命令参数，直接序列化到 Payload。
func (c *Client) SendCommand(command string, params map[string]any) (*ResponseHandler, error) {
	id := fmt.Sprintf("tdchat-cmd-%d", time.Now().UnixNano())
	handler := &ResponseHandler{done: make(chan struct{})}
	if params == nil {
		params = make(map[string]any)
	}
	params["command"] = command
	msg := Message{
		Type:      MsgTypeCommand,
		ID:        id,
		Timestamp: time.Now().UnixMilli(),
		Payload:   params,
	}
	return handler, c.send(handler, msg)
}

// -------- 底层发送 --------

// send 底层发送实现，处理断线重连。
func (c *Client) send(handler *ResponseHandler, msg Message) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// 替换旧的未完成 handler（上次请求可能已超时）。
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
		// 断线重试一次。
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

// -------- 关闭 --------

// Close 断开客户端连接并取消所有后台协程。
func (c *Client) Close() {
	if c.cancel != nil {
		c.cancel()
	}
	if c.pingDone != nil {
		close(c.pingDone)
	}
	if c.conn != nil {
		c.conn.Close()
	}
}

// IsConnected 返回当前是否已连接。
func (c *Client) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn != nil
}

// -------- 读循环 --------

// readLoop 读取 WebSocket 消息并分派到合适的回调。
func (c *Client) readLoop(conn *websocket.Conn) {
	defer func() {
		c.mu.Lock()
		if c.conn == conn {
			c.conn.Close()
			c.conn = nil
		}
		c.mu.Unlock()

		// 连接断开后，如果客户端未取消，尝试自动重连。
		if c.ctx != nil && c.ctx.Err() == nil {
			go c.ReconnectLoop(c.ctx)
		}
	}()

	for {
		select {
		case <-c.ctx.Done():
			return
		default:
		}
		conn.SetReadDeadline(time.Now().Add(300 * time.Second))
		_, raw, err := conn.ReadMessage()
		if err != nil {
			log.Printf("picoclaw: read error: %v", err)
			return
		}
		var msg Message
		if err := json.Unmarshal(raw, &msg); err != nil {
			log.Printf("picoclaw: unmarshal error: %v", err)
			continue
		}
		msg.normalizePayload()

		c.mu.Lock()
		handler := c.pending
		c.mu.Unlock()

		// 只有 handler 未被替换/关闭时才调用回调。
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
			// 处理 PicoClaw 发来的命令响应。
			case "command.response":
				if handler.OnMessage != nil {
					handler.OnMessage(msg)
				}
			}
		} else if c.ProactiveCallback != nil && msg.Content != "" {
			// 无 pending handler 时，视为主动消息。
			c.ProactiveCallback(msg)
		}
	}
}

// -------- 辅助函数 --------

// normalizePayload 从 Payload 中提取 Content、Thought 等字段到 Message 顶层。
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
	// 提取扩展字段。
	if m.RoomID == "" {
		if rid, ok := m.Payload["room_id"].(string); ok {
			m.RoomID = rid
		}
	}
	// 提取 metadata（如果 PicoClaw 在 payload 中提供了）。
	if m.Metadata == nil {
		if meta, ok := m.Payload["metadata"].(map[string]any); ok {
			m.Metadata = make(map[string]string)
			for k, v := range meta {
				if s, ok := v.(string); ok {
					m.Metadata[k] = s
				}
			}
		}
	}
}

// -------- 健康检查（HTTP） --------

// HealthCheck 对 PicoClaw 的 HTTP 健康端点执行 GET 请求。
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
