package picoclaw

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// -------- 已有测试保持不动 --------

func TestClientUsesPicoPayloadProtocol(t *testing.T) {
	upgrader := websocket.Upgrader{}
	received := make(chan Message, 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var inbound Message
		if err := conn.ReadJSON(&inbound); err != nil {
			t.Fatalf("read inbound: %v", err)
		}
		received <- inbound

		_ = conn.WriteJSON(Message{
			Type: "message.create",
			Payload: map[string]any{
				"content": "agent reply",
			},
		})
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	replies := make(chan Message, 1)
	handler, err := client.SendMessage("run workflow")
	if err != nil {
		t.Fatalf("SendMessage failed: %v", err)
	}
	handler.OnMessage = func(msg Message) {
		replies <- msg
	}

	select {
	case msg := <-received:
		if msg.Type != "message.send" {
			t.Fatalf("sent type = %q, want message.send", msg.Type)
		}
		if got, _ := msg.Payload["content"].(string); got != "run workflow" {
			raw, _ := json.Marshal(msg)
			t.Fatalf("sent payload content = %q, want run workflow; raw=%s", got, raw)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for inbound message")
	}

	select {
	case msg := <-replies:
		if msg.Content != "agent reply" {
			t.Fatalf("reply content = %q, want agent reply", msg.Content)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for reply")
	}
}

func TestClientReconnectsBeforeSendingAfterConnectionDrops(t *testing.T) {
	upgrader := websocket.Upgrader{}
	received := make(chan string, 2)
	connected := make(chan struct{}, 2)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		connected <- struct{}{}
		defer conn.Close()

		var inbound Message
		if err := conn.ReadJSON(&inbound); err != nil {
			return
		}
		if content, _ := inbound.Payload["content"].(string); content != "" {
			received <- content
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	if _, err := client.SendMessage("first"); err != nil {
		t.Fatalf("first SendMessage failed: %v", err)
	}
	select {
	case got := <-received:
		if got != "first" {
			t.Fatalf("first received = %q, want first", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for first send")
	}

	deadline := time.After(2 * time.Second)
	for {
		client.mu.Lock()
		disconnected := client.conn == nil
		client.mu.Unlock()
		if disconnected {
			break
		}
		select {
		case <-deadline:
			t.Fatal("timeout waiting for dropped PicoClaw connection")
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}

	if _, err := client.SendMessage("second"); err != nil {
		t.Fatalf("second SendMessage failed after reconnect: %v", err)
	}
	select {
	case got := <-received:
		if got != "second" {
			t.Fatalf("second received = %q, want second", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for second send")
	}

	if len(connected) < 2 {
		t.Fatalf("expected reconnect to open second websocket, got %d connection(s)", len(connected))
	}
}

// -------- 新增测试 --------

// TestSendMessageWithOpts 测试带扩展选项发送消息。
func TestSendMessageWithOpts(t *testing.T) {
	upgrader := websocket.Upgrader{}
	received := make(chan Message, 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var inbound Message
		if err := conn.ReadJSON(&inbound); err != nil {
			t.Fatalf("read inbound: %v", err)
		}
		received <- inbound
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	// 发送带 RoomID、MediaURLs、Metadata 的消息。
	opts := SendMessageOptions{
		RoomID:    "room-123",
		MediaURLs: []string{"https://example.com/img.png", "https://example.com/file.pdf"},
		Metadata:  map[string]string{"source": "pipeline", "priority": "high"},
	}
	_, err := client.SendMessageWithOpts("带元数据的消息", opts)
	if err != nil {
		t.Fatalf("SendMessageWithOpts failed: %v", err)
	}

	select {
	case msg := <-received:
		if msg.RoomID != "room-123" {
			t.Fatalf("RoomID = %q, want room-123", msg.RoomID)
		}
		if len(msg.MediaURLs) != 2 {
			t.Fatalf("len(MediaURLs) = %d, want 2", len(msg.MediaURLs))
		}
		if msg.MediaURLs[0] != "https://example.com/img.png" {
			t.Fatalf("MediaURLs[0] = %q, want img url", msg.MediaURLs[0])
		}
		if got, ok := msg.Metadata["source"]; !ok || got != "pipeline" {
			t.Fatalf("Metadata[source] = %q, want pipeline", got)
		}
		if got, ok := msg.Metadata["priority"]; !ok || got != "high" {
			t.Fatalf("Metadata[priority] = %q, want high", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for message")
	}
}

// TestSendProactiveMessage 测试发送主动消息。
func TestSendProactiveMessage(t *testing.T) {
	upgrader := websocket.Upgrader{}
	received := make(chan Message, 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var inbound Message
		if err := conn.ReadJSON(&inbound); err != nil {
			t.Fatalf("read inbound: %v", err)
		}
		received <- inbound
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	_, err := client.SendProactiveMessage("每日摘要：今日活跃用户 42 人", SendMessageOptions{
		RoomID: "room-main",
	})
	if err != nil {
		t.Fatalf("SendProactiveMessage failed: %v", err)
	}

	select {
	case msg := <-received:
		if msg.Type != MsgTypeProactive {
			t.Fatalf("type = %q, want %s", msg.Type, MsgTypeProactive)
		}
		if msg.Content != "每日摘要：今日活跃用户 42 人" {
			t.Fatalf("content = %q", msg.Content)
		}
		if msg.RoomID != "room-main" {
			t.Fatalf("RoomID = %q, want room-main", msg.RoomID)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for message")
	}
}

// TestSendSystemNotification 测试发送系统通知。
func TestSendSystemNotification(t *testing.T) {
	upgrader := websocket.Upgrader{}
	received := make(chan Message, 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var inbound Message
		if err := conn.ReadJSON(&inbound); err != nil {
			t.Fatalf("read inbound: %v", err)
		}
		received <- inbound
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	_, err := client.SendSystemNotification("服务器将于 5 分钟后重启维护", "room-001")
	if err != nil {
		t.Fatalf("SendSystemNotification failed: %v", err)
	}

	select {
	case msg := <-received:
		if msg.Type != MsgTypeSystem {
			t.Fatalf("type = %q, want %s", msg.Type, MsgTypeSystem)
		}
		if msg.Content != "服务器将于 5 分钟后重启维护" {
			t.Fatalf("content = %q", msg.Content)
		}
		if msg.RoomID != "room-001" {
			t.Fatalf("RoomID = %q, want room-001", msg.RoomID)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for notification")
	}
}

// TestSendCommand 测试发送命令。
func TestSendCommand(t *testing.T) {
	upgrader := websocket.Upgrader{}
	received := make(chan Message, 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var inbound Message
		if err := conn.ReadJSON(&inbound); err != nil {
			t.Fatalf("read inbound: %v", err)
		}
		received <- inbound

		// 模拟 PicoClaw 返回命令响应。
		_ = conn.WriteJSON(Message{
			Type: "command.response",
			Payload: map[string]any{
				"command": "online_users",
				"result": map[string]any{
					"online": []string{"alice", "bob"},
					"count":  2,
				},
			},
		})
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	params := map[string]any{
		"limit": float64(20),
	}
	handler, err := client.SendCommand("online_users", params)
	if err != nil {
		t.Fatalf("SendCommand failed: %v", err)
	}

	// 收集命令响应。
	responses := make(chan Message, 1)
	handler.OnMessage = func(msg Message) {
		responses <- msg
	}

	// 验证发出的是 command 类型。
	select {
	case msg := <-received:
		if msg.Type != MsgTypeCommand {
			t.Fatalf("type = %q, want %s", msg.Type, MsgTypeCommand)
		}
		if cmd, _ := msg.Payload["command"].(string); cmd != "online_users" {
			t.Fatalf("command = %q, want online_users", cmd)
		}
		if lim, _ := msg.Payload["limit"].(float64); lim != 20 {
			t.Fatalf("limit = %v, want 20", lim)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for command message")
	}

	// 验证收到命令响应。
	select {
	case resp := <-responses:
		if resp.Type != "command.response" {
			t.Fatalf("response type = %q, want command.response", resp.Type)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for command response")
	}
}

// TestReconnectCallback 测试重连回调。
func TestReconnectCallback(t *testing.T) {
	upgrader := websocket.Upgrader{}

	// firstConn 标记是否为首次连接。
	var firstConn syncBool
	firstConn.set(true)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}

		if firstConn.get() {
			// 首次连接立即关闭（模拟断线）。
			firstConn.set(false)
			conn.Close()
			return
		}
		// 第二次连接保持打开（模拟正常连接）。
		defer conn.Close()

		// 等待客户端发消息。
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			return
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})

	// 记录重连回调触发次数。
	var cbCount int
	var cbMu sync.Mutex
	client.SetReconnectCallback(func() {
		cbMu.Lock()
		cbCount++
		cbMu.Unlock()
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	// 等待 readLoop 检测到断线并自动重连。
	// readLoop 退出时调用 ReconnectLoop，ReconnectLoop 成功后调用回调。
	// 首次连接会被服务器立即关闭 → readLoop 退出 → ReconnectLoop 运行。
	deadline := time.After(8 * time.Second)
	for {
		cbMu.Lock()
		count := cbCount
		cbMu.Unlock()
		if count >= 1 {
			break
		}
		select {
		case <-deadline:
			t.Fatalf("timeout waiting for reconnect callback, got %d callbacks", count)
		default:
			time.Sleep(50 * time.Millisecond)
		}
	}

	// 验证回调只触发一次。
	cbMu.Lock()
	if cbCount != 1 {
		t.Fatalf("reconnect callback count = %d, want 1", cbCount)
	}
	cbMu.Unlock()
}

// TestIsConnectedState 测试连接状态查询。
func TestIsConnectedState(t *testing.T) {
	client := New(Config{WSURL: "ws://localhost:0"})

	// 未连接时应返回 false。
	if client.IsConnected() {
		t.Fatal("expected IsConnected=false before Connect")
	}

	// 无需真正连接，只需验证方法存在且不 panic。
	client.Close()
}

// TestNormalizePayloadExtractsRoomID 测试 normalizePayload 提取 room_id。
func TestNormalizePayloadExtractsRoomID(t *testing.T) {
	msg := Message{
		Payload: map[string]any{
			"room_id": "room-xyz",
			"content": "hello",
		},
		RoomID: "", // 设为主字段为空。
	}
	msg.normalizePayload()

	if msg.RoomID != "room-xyz" {
		t.Fatalf("RoomID = %q, want room-xyz", msg.RoomID)
	}
	if msg.Content != "hello" {
		t.Fatalf("Content = %q, want hello", msg.Content)
	}
}

// TestNormalizePayloadExtractsMetadata 测试 normalizePayload 提取 metadata。
func TestNormalizePayloadExtractsMetadata(t *testing.T) {
	msg := Message{
		Payload: map[string]any{
			"metadata": map[string]any{
				"key1": "val1",
				"key2": "value2",
			},
		},
	}
	msg.normalizePayload()

	if msg.Metadata == nil {
		t.Fatal("Metadata should not be nil")
	}
	if msg.Metadata["key1"] != "val1" {
		t.Fatalf("Metadata[key1] = %q, want val1", msg.Metadata["key1"])
	}
	if msg.Metadata["key2"] != "value2" {
		t.Fatalf("Metadata[key2] = %q, want value2", msg.Metadata["key2"])
	}
}

// TestProactiveCallbackDispatch 测试主动消息回调按类型分派。
func TestProactiveCallbackDispatch(t *testing.T) {
	upgrader := websocket.Upgrader{}

	proactiveMessages := make(chan Message, 5)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		// 发送一条主动消息（没有 pending handler 时触发 ProactiveCallback）。
		_ = conn.WriteJSON(Message{
			Type:      MsgTypeProactive,
			Content:   "这是一条主动推送消息",
			RoomID:    "room-001",
			Timestamp: time.Now().UnixMilli(),
		})

		// 发送一条系统通知。
		_ = conn.WriteJSON(Message{
			Type:      MsgTypeSystem,
			Content:   "系统维护通知",
			RoomID:    "room-001",
			Timestamp: time.Now().UnixMilli(),
		})

		// 等待片刻确保客户端收到。
		time.Sleep(100 * time.Millisecond)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})

	client.ProactiveCallback = func(msg Message) {
		proactiveMessages <- msg
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	// 应该收到两条主动消息。
	messages := make([]Message, 0, 2)
	deadline := time.After(3 * time.Second)
	for i := 0; i < 2; i++ {
		select {
		case msg := <-proactiveMessages:
			messages = append(messages, msg)
		case <-deadline:
			t.Fatalf("timeout waiting for proactive message %d, got %d", i+1, len(messages))
		}
	}

	// 验证消息类型。
	types := make(map[string]bool)
	for _, m := range messages {
		types[m.Type] = true
	}
	if !types[MsgTypeProactive] {
		t.Error("missing proactive type in callback dispatch")
	}
	if !types[MsgTypeSystem] {
		t.Error("missing system type in callback dispatch")
	}
}

// TestSendProactiveMessagePreservesRoomID 测试主动消息携带 RoomID。
func TestSendProactiveMessagePreservesRoomID(t *testing.T) {
	upgrader := websocket.Upgrader{}
	received := make(chan Message, 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var inbound Message
		if err := conn.ReadJSON(&inbound); err != nil {
			t.Fatalf("read inbound: %v", err)
		}
		received <- inbound
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	_, err := client.SendProactiveMessage("房间专属通知", SendMessageOptions{
		RoomID:    "private-room-42",
		MediaURLs: []string{"https://cdn.example.com/alert.png"},
		Metadata: map[string]string{
			"type": "alert",
		},
	})
	if err != nil {
		t.Fatalf("SendProactiveMessage failed: %v", err)
	}

	select {
	case msg := <-received:
		if msg.Type != MsgTypeProactive {
			t.Fatalf("type = %q, want %s", msg.Type, MsgTypeProactive)
		}
		if msg.RoomID != "private-room-42" {
			t.Fatalf("RoomID = %q, want private-room-42", msg.RoomID)
		}
		if msg.Content != "房间专属通知" {
			t.Fatalf("Content = %q", msg.Content)
		}
		if len(msg.MediaURLs) != 1 || msg.MediaURLs[0] != "https://cdn.example.com/alert.png" {
			t.Fatalf("MediaURLs = %v, want [https://cdn.example.com/alert.png]", msg.MediaURLs)
		}
		if msg.Metadata["type"] != "alert" {
			t.Fatalf("Metadata[type] = %q, want alert", msg.Metadata["type"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for proactive message")
	}
}

// TestMessageFieldsJSONRoundTrip 测试 Message 新字段的 JSON 序列化往返。
func TestMessageFieldsJSONRoundTrip(t *testing.T) {
	original := Message{
		Type:      MsgTypeProactive,
		ID:        "msg-001",
		Timestamp: 1717000000000,
		Content:   "测试消息",
		RoomID:    "room-abc",
		MediaURLs: []string{"https://img.example.com/1.png", "https://file.example.com/doc.pdf"},
		Metadata: map[string]string{
			"source": "test",
			"tag":    "important",
		},
	}

	// 序列化。
	raw, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	// 反序列化。
	var restored Message
	if err := json.Unmarshal(raw, &restored); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	// 验证所有字段。
	if restored.Type != MsgTypeProactive {
		t.Fatalf("Type = %q, want %s", restored.Type, MsgTypeProactive)
	}
	if restored.ID != "msg-001" {
		t.Fatalf("ID = %q, want msg-001", restored.ID)
	}
	if restored.Content != "测试消息" {
		t.Fatalf("Content = %q", restored.Content)
	}
	if restored.RoomID != "room-abc" {
		t.Fatalf("RoomID = %q, want room-abc", restored.RoomID)
	}
	if len(restored.MediaURLs) != 2 {
		t.Fatalf("len(MediaURLs) = %d, want 2", len(restored.MediaURLs))
	}
	if restored.Metadata["source"] != "test" {
		t.Fatalf("Metadata[source] = %q, want test", restored.Metadata["source"])
	}
	if restored.Metadata["tag"] != "important" {
		t.Fatalf("Metadata[tag] = %q, want important", restored.Metadata["tag"])
	}
}

// TestNilParamsSafety 测试 SendCommand 在 params 为 nil 时不 panic。
func TestNilParamsSafety(t *testing.T) {
	upgrader := websocket.Upgrader{}
	received := make(chan Message, 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var inbound Message
		if err := conn.ReadJSON(&inbound); err != nil {
			t.Fatalf("read inbound: %v", err)
		}
		received <- inbound
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	// 传 nil params 不应 panic。
	_, err := client.SendCommand("ping", nil)
	if err != nil {
		t.Fatalf("SendCommand with nil params failed: %v", err)
	}

	select {
	case msg := <-received:
		if cmd, _ := msg.Payload["command"].(string); cmd != "ping" {
			t.Fatalf("command = %q, want ping", cmd)
		}
		// 验证 Payload 不为 nil（已在 SendCommand 中初始化）。
		if msg.Payload == nil {
			t.Fatal("Payload should not be nil after SendCommand(nil)")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for command")
	}
}

// TestZeroValueMediaURLs 测试零值 MediaURLs 的 JSON 序列化。
func TestZeroValueMediaURLs(t *testing.T) {
	msg := Message{
		Type:    MsgTypeProactive,
		Content: "无媒体消息",
	}

	raw, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var restored map[string]any
	if err := json.Unmarshal(raw, &restored); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	// media_urls 在零值时应被 omitempty 省略。
	if _, exists := restored["media_urls"]; exists {
		t.Fatal("media_urls should be omitted when empty")
	}
}

// -------- 纯逻辑 / 构造函数测试 --------

// TestNewValidConfig verifies New stores config correctly and sets defaults.
func TestNewValidConfig(t *testing.T) {
	cfg := Config{
		WSURL: "ws://example.com/ws",
		Token: "secret-token",
	}
	c := New(cfg)
	if c == nil {
		t.Fatal("New returned nil")
	}
	if c.cfg.WSURL != "ws://example.com/ws" {
		t.Errorf("WSURL = %q, want ws://example.com/ws", c.cfg.WSURL)
	}
	if c.cfg.Token != "secret-token" {
		t.Errorf("Token = %q, want secret-token", c.cfg.Token)
	}
	if c.maxBackoff != 30*time.Second {
		t.Errorf("maxBackoff = %v, want 30s", c.maxBackoff)
	}
}

// TestNewZeroConfig verifies New handles zero-value Config without panicking.
func TestNewZeroConfig(t *testing.T) {
	c := New(Config{})
	if c == nil {
		t.Fatal("New(Config{}) returned nil")
	}
	if c.cfg.WSURL != "" {
		t.Errorf("WSURL = %q, want empty", c.cfg.WSURL)
	}
	if c.cfg.Token != "" {
		t.Errorf("Token = %q, want empty", c.cfg.Token)
	}
	if c.maxBackoff != 30*time.Second {
		t.Errorf("maxBackoff = %v, want 30s", c.maxBackoff)
	}
	if c.IsConnected() {
		t.Error("expected IsConnected=false for zero-config client")
	}
}

// TestResponseHandlerWaitAndDone verifies that Wait unblocks after done_
// and that done_ is safe to call multiple times (idempotent).
func TestResponseHandlerWaitAndDone(t *testing.T) {
	handler := &ResponseHandler{done: make(chan struct{})}

	done := make(chan bool, 1)
	go func() {
		handler.Wait()
		done <- true
	}()

	// Signal completion.
	handler.done_()

	select {
	case <-done:
		// OK — Wait returned.
	case <-time.After(1 * time.Second):
		t.Fatal("Wait() did not return after done_()")
	}

	// Second done_ must not panic (idempotent via atomic.CompareAndSwap).
	handler.done_()
}

// TestResponseHandlerDoubleDone verifies that calling done_ twice does not
// double-close the channel.
func TestResponseHandlerDoubleDone(t *testing.T) {
	handler := &ResponseHandler{done: make(chan struct{})}
	handler.done_()
	// Must not panic.
	handler.done_()
	// Wait must return immediately.
	handler.Wait()
}

// TestNormalizePayloadNilAndEmpty verifies normalizePayload is safe with nil
// and empty payloads.
func TestNormalizePayloadNilAndEmpty(t *testing.T) {
	// Nil payload — must not panic, must preserve existing Content.
	msg1 := Message{Content: "original", RoomID: "r1"}
	msg1.normalizePayload()
	if msg1.Content != "original" {
		t.Errorf("Content changed after nil payload: %q", msg1.Content)
	}
	if msg1.RoomID != "r1" {
		t.Errorf("RoomID changed after nil payload: %q", msg1.RoomID)
	}

	// Empty payload — must not panic.
	msg2 := Message{Content: "keep", Payload: map[string]any{}}
	msg2.normalizePayload()
	if msg2.Content != "keep" {
		t.Errorf("Content changed after empty payload: %q", msg2.Content)
	}

	// Payload with unrelated keys — must not overwrite.
	msg3 := Message{Payload: map[string]any{"other": "value"}}
	msg3.normalizePayload()
	if msg3.Content != "" {
		t.Errorf("Content = %q, want empty", msg3.Content)
	}
	if msg3.Thought != "" {
		t.Errorf("Thought = %q, want empty", msg3.Thought)
	}
}

// TestNormalizePayloadThoughtExtraction verifies thought field extraction
// from payload, including kind-based and bool-based IsThought detection.
func TestNormalizePayloadThoughtExtraction(t *testing.T) {
	// thought as string.
	msg1 := Message{Payload: map[string]any{"thought": "internal reasoning"}}
	msg1.normalizePayload()
	if msg1.Thought != "internal reasoning" {
		t.Errorf("Thought = %q, want 'internal reasoning'", msg1.Thought)
	}

	// kind="thought" sets IsThought.
	msg2 := Message{Payload: map[string]any{"kind": "thought"}}
	msg2.normalizePayload()
	if !msg2.IsThought {
		t.Error("IsThought should be true when kind=thought")
	}

	// thought=true (bool) sets IsThought.
	msg3 := Message{Payload: map[string]any{"thought": true}}
	msg3.normalizePayload()
	if !msg3.IsThought {
		t.Error("IsThought should be true when thought=true (bool)")
	}

	// thought=false (bool) should NOT set IsThought.
	msg4 := Message{Payload: map[string]any{"thought": false}}
	msg4.normalizePayload()
	if msg4.IsThought {
		t.Error("IsThought should be false when thought=false (bool)")
	}
}

// TestHealthCheckInvalidURL verifies HealthCheck returns an error for an
// unreachable URL (pure-logic code path without real network side effects).
func TestHealthCheckInvalidURL(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	err := HealthCheck(ctx, "http://127.0.0.1:0")
	if err == nil {
		t.Fatal("expected error for invalid health check URL")
	}
}

// TestHealthCheckSuccess verifies HealthCheck succeeds against a healthy HTTP server.
func TestHealthCheckSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := HealthCheck(ctx, server.URL); err != nil {
		t.Fatalf("HealthCheck failed: %v", err)
	}
}

// -------- 测试辅助类型 --------

// syncBool 线程安全的布尔值。
type syncBool struct {
	mu  sync.Mutex
	val bool
}

func (s *syncBool) set(v bool) {
	s.mu.Lock()
	s.val = v
	s.mu.Unlock()
}

func (s *syncBool) get() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.val
}
