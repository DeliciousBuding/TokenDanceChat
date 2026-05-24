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

// ============================================================================
// 1. Prompt Building / Message Construction
// ============================================================================

// TestMessageConstructionAllFields verifies that SendMessage constructs a
// Message with every field populated correctly: Type, ID prefix, Content,
// Payload mirror, and Timestamp.
func TestMessageConstructionAllFields(t *testing.T) {
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

	_, err := client.SendMessage("You are a helpful assistant. Reply concisely.")
	if err != nil {
		t.Fatalf("SendMessage failed: %v", err)
	}

	select {
	case msg := <-received:
		if msg.Type != "message.send" {
			t.Fatalf("Type = %q, want message.send", msg.Type)
		}
		if !strings.HasPrefix(msg.ID, "tdchat-") {
			t.Fatalf("ID = %q, want tdchat- prefix", msg.ID)
		}
		if msg.Content != "You are a helpful assistant. Reply concisely." {
			t.Fatalf("Content = %q", msg.Content)
		}
		payloadContent, _ := msg.Payload["content"].(string)
		if payloadContent != msg.Content {
			t.Fatalf("Payload[content] = %q, want %q", payloadContent, msg.Content)
		}
		if msg.Timestamp == 0 {
			t.Fatal("Timestamp should not be zero")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for message")
	}
}

// TestSendMessageIDUniqueness verifies that consecutive SendMessage calls
// produce unique message IDs.
func TestSendMessageIDUniqueness(t *testing.T) {
	upgrader := websocket.Upgrader{}
	received := make(chan Message, 3)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()
		for i := 0; i < 3; i++ {
			var inbound Message
			if err := conn.ReadJSON(&inbound); err != nil {
				return
			}
			received <- inbound
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

	for _, content := range []string{"msg-a", "msg-b", "msg-c"} {
		if _, err := client.SendMessage(content); err != nil {
			t.Fatalf("SendMessage(%q) failed: %v", content, err)
		}
		// Small delay to ensure unique nanosecond timestamps in IDs.
		time.Sleep(time.Microsecond)
	}

	ids := make(map[string]bool)
	for i := 0; i < 3; i++ {
		select {
		case msg := <-received:
			if ids[msg.ID] {
				t.Fatalf("duplicate ID: %s", msg.ID)
			}
			ids[msg.ID] = true
			if !strings.HasPrefix(msg.ID, "tdchat-") {
				t.Fatalf("ID = %q, want tdchat- prefix", msg.ID)
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("timeout waiting for message %d", i+1)
		}
	}
}

// TestSendMessageWithOptsAllFields verifies SendMessageWithOpts propagates
// RoomID, MediaURLs, and Metadata into the wire message.
func TestSendMessageWithOptsAllFields(t *testing.T) {
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

	opts := SendMessageOptions{
		RoomID:    "room-general",
		MediaURLs: []string{"https://cdn.example.com/a.png"},
		Metadata:  map[string]string{"lang": "zh-CN", "priority": "normal"},
	}
	_, err := client.SendMessageWithOpts("你好世界", opts)
	if err != nil {
		t.Fatalf("SendMessageWithOpts failed: %v", err)
	}

	select {
	case msg := <-received:
		if msg.RoomID != "room-general" {
			t.Fatalf("RoomID = %q, want room-general", msg.RoomID)
		}
		if len(msg.MediaURLs) != 1 || msg.MediaURLs[0] != "https://cdn.example.com/a.png" {
			t.Fatalf("MediaURLs = %v", msg.MediaURLs)
		}
		if msg.Metadata["lang"] != "zh-CN" {
			t.Fatalf("Metadata[lang] = %q, want zh-CN", msg.Metadata["lang"])
		}
		if msg.Metadata["priority"] != "normal" {
			t.Fatalf("Metadata[priority] = %q, want normal", msg.Metadata["priority"])
		}
		if msg.Content != "你好世界" {
			t.Fatalf("Content = %q, want 你好世界", msg.Content)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for message")
	}
}

// TestSendProactiveMessageZeroOpts verifies SendProactiveMessage works with
// zero-value SendMessageOptions (no RoomID, no MediaURLs, no Metadata).
func TestSendProactiveMessageZeroOpts(t *testing.T) {
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

	_, err := client.SendProactiveMessage("bare proactive", SendMessageOptions{})
	if err != nil {
		t.Fatalf("SendProactiveMessage failed: %v", err)
	}

	select {
	case msg := <-received:
		if msg.Type != MsgTypeProactive {
			t.Fatalf("Type = %q, want %s", msg.Type, MsgTypeProactive)
		}
		if msg.Content != "bare proactive" {
			t.Fatalf("Content = %q", msg.Content)
		}
		if msg.RoomID != "" {
			t.Fatalf("RoomID = %q, want empty", msg.RoomID)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for message")
	}
}

// ============================================================================
// 2. Tool Calling / Command
// ============================================================================

// TestSendCommandResponseWithErrorPayload verifies that a command.response
// containing an error field in the payload is properly delivered.
func TestSendCommandResponseWithErrorPayload(t *testing.T) {
	upgrader := websocket.Upgrader{}

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

		// Simulate an error response from PicoClaw.
		_ = conn.WriteJSON(Message{
			Type: "command.response",
			Payload: map[string]any{
				"command": "fetch_data",
				"error":   "permission denied: insufficient scope",
				"code":    float64(403),
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

	responses := make(chan Message, 1)
	handler, err := client.SendCommand("fetch_data", map[string]any{"url": "https://example.com/api"})
	if err != nil {
		t.Fatalf("SendCommand failed: %v", err)
	}
	handler.OnMessage = func(msg Message) {
		responses <- msg
	}

	select {
	case resp := <-responses:
		if resp.Type != "command.response" {
			t.Fatalf("response type = %q, want command.response", resp.Type)
		}
		errMsg, _ := resp.Payload["error"].(string)
		if errMsg != "permission denied: insufficient scope" {
			t.Fatalf("error = %q, want permission denied message", errMsg)
		}
		code, _ := resp.Payload["code"].(float64)
		if code != 403 {
			t.Fatalf("code = %v, want 403", code)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for error response")
	}
}

// TestSendCommandComplexParams verifies that deeply nested parameters
// survive the round-trip through SendCommand.
func TestSendCommandComplexParams(t *testing.T) {
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

	params := map[string]any{
		"filters": map[string]any{
			"tags": []any{"urgent", "backend"},
			"date_range": map[string]any{
				"start": "2026-01-01",
				"end":   "2026-12-31",
			},
		},
		"sort":  "desc",
		"limit": float64(100),
	}
	_, err := client.SendCommand("search_logs", params)
	if err != nil {
		t.Fatalf("SendCommand failed: %v", err)
	}

	select {
	case msg := <-received:
		if msg.Type != MsgTypeCommand {
			t.Fatalf("type = %q, want %s", msg.Type, MsgTypeCommand)
		}
		cmd, _ := msg.Payload["command"].(string)
		if cmd != "search_logs" {
			t.Fatalf("command = %q, want search_logs", cmd)
		}
		// Verify nested filters survived.
		filters, ok := msg.Payload["filters"].(map[string]any)
		if !ok {
			t.Fatal("filters not found or wrong type in payload")
		}
		tags, _ := filters["tags"].([]any)
		if len(tags) != 2 {
			t.Fatalf("tags len = %d, want 2", len(tags))
		}
		dateRange, _ := filters["date_range"].(map[string]any)
		if dateRange["start"] != "2026-01-01" {
			t.Fatalf("date_range.start = %v", dateRange["start"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for command")
	}
}

// TestSendCommandResponseEmptyPayload verifies that a command.response
// with an empty payload is handled without panicking.
func TestSendCommandResponseEmptyPayload(t *testing.T) {
	upgrader := websocket.Upgrader{}

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

		_ = conn.WriteJSON(Message{
			Type:    "command.response",
			Payload: map[string]any{},
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

	responses := make(chan Message, 1)
	handler, err := client.SendCommand("ping", nil)
	if err != nil {
		t.Fatalf("SendCommand failed: %v", err)
	}
	handler.OnMessage = func(msg Message) {
		responses <- msg
	}

	select {
	case resp := <-responses:
		if resp.Type != "command.response" {
			t.Fatalf("response type = %q, want command.response", resp.Type)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for command response")
	}
}

// ============================================================================
// 3. Response Parsing: Typing, Thought, Streaming, JSON Errors
// ============================================================================

// TestReadLoopTypingDispatch verifies that typing.start and typing.stop
// messages trigger the OnTyping callback with correct bool values.
func TestReadLoopTypingDispatch(t *testing.T) {
	upgrader := websocket.Upgrader{}

	typingEvents := make(chan bool, 4)

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

		// Send typing sequence.
		_ = conn.WriteJSON(Message{Type: "typing.start"})
		time.Sleep(20 * time.Millisecond)
		_ = conn.WriteJSON(Message{Type: "typing.stop"})
		time.Sleep(20 * time.Millisecond)
		_ = conn.WriteJSON(Message{Type: "message.create", Content: "final answer"})
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
	handler, err := client.SendMessage("ping")
	if err != nil {
		t.Fatalf("SendMessage failed: %v", err)
	}
	handler.OnTyping = func(start bool) {
		typingEvents <- start
	}
	handler.OnMessage = func(msg Message) {
		replies <- msg
	}

	// Expect typing.start, typing.stop, then final message.
	select {
	case start := <-typingEvents:
		if !start {
			t.Fatal("first typing event should be start=true")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for typing.start")
	}

	select {
	case start := <-typingEvents:
		if start {
			t.Fatal("second typing event should be stop (start=false)")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for typing.stop")
	}

	select {
	case reply := <-replies:
		if reply.Content != "final answer" {
			t.Fatalf("reply Content = %q, want 'final answer'", reply.Content)
		}
		if reply.IsPartial {
			t.Fatal("message.create should not have IsPartial=true")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for final message")
	}
}

// TestReadLoopThoughtDispatch verifies that thought messages set IsThought
// and are delivered via OnMessage.
func TestReadLoopThoughtDispatch(t *testing.T) {
	upgrader := websocket.Upgrader{}

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

		// Send thought then final message.
		_ = conn.WriteJSON(Message{
			Type:    "thought",
			Content: "Let me think about this carefully...",
		})
		time.Sleep(20 * time.Millisecond)
		_ = conn.WriteJSON(Message{
			Type:    "message.create",
			Content: "Here is my answer.",
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

	messages := make(chan Message, 3)
	handler, err := client.SendMessage("complex question")
	if err != nil {
		t.Fatalf("SendMessage failed: %v", err)
	}
	handler.OnMessage = func(msg Message) {
		messages <- msg
	}

	// First: thought.
	select {
	case msg := <-messages:
		if !msg.IsThought {
			t.Fatal("thought message should have IsThought=true")
		}
		if msg.Content != "Let me think about this carefully..." {
			t.Fatalf("thought Content = %q", msg.Content)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for thought")
	}

	// Second: final answer.
	select {
	case msg := <-messages:
		if msg.IsThought {
			t.Fatal("message.create should not have IsThought=true")
		}
		if msg.Content != "Here is my answer." {
			t.Fatalf("answer Content = %q", msg.Content)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for final answer")
	}
}

// TestReadLoopStreamingUpdateChunks verifies that message.update messages
// are dispatched with IsPartial=true, simulating streaming chunks.
func TestReadLoopStreamingUpdateChunks(t *testing.T) {
	upgrader := websocket.Upgrader{}

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

		// Simulate streaming: 3 partial chunks then final.
		chunks := []string{"Hello", " world", "!"}
		for _, chunk := range chunks {
			_ = conn.WriteJSON(Message{
				Type:    "message.update",
				Content: chunk,
			})
			time.Sleep(10 * time.Millisecond)
		}
		_ = conn.WriteJSON(Message{
			Type:    "message.create",
			Content: "Hello world!",
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

	messages := make(chan Message, 5)
	handler, err := client.SendMessage("say hello")
	if err != nil {
		t.Fatalf("SendMessage failed: %v", err)
	}
	handler.OnMessage = func(msg Message) {
		messages <- msg
	}

	var partialChunks []string
	var finalContent string

	// Collect 4 messages (3 partial + 1 final).
	for i := 0; i < 4; i++ {
		select {
		case msg := <-messages:
			if msg.Type == "message.update" {
				if !msg.IsPartial {
					t.Fatalf("chunk %d: message.update should have IsPartial=true", i)
				}
				partialChunks = append(partialChunks, msg.Content)
			} else if msg.Type == "message.create" {
				finalContent = msg.Content
				if msg.IsPartial {
					t.Fatal("final message.create should NOT have IsPartial=true")
				}
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("timeout waiting for message %d", i+1)
		}
	}

	if len(partialChunks) != 3 {
		t.Fatalf("got %d partial chunks, want 3", len(partialChunks))
	}
	expectedChunks := []string{"Hello", " world", "!"}
	for i, c := range partialChunks {
		if c != expectedChunks[i] {
			t.Fatalf("chunk[%d] = %q, want %q", i, c, expectedChunks[i])
		}
	}
	if finalContent != "Hello world!" {
		t.Fatalf("final = %q, want 'Hello world!'", finalContent)
	}
}

// TestReadLoopJSONUnmarshalErrorRecovery verifies that when the server sends
// malformed JSON, the readLoop logs the error and continues processing
// subsequent valid messages.
func TestReadLoopJSONUnmarshalErrorRecovery(t *testing.T) {
	upgrader := websocket.Upgrader{}

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

		// Send malformed text (not JSON).
		conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
		_ = conn.WriteMessage(websocket.TextMessage, []byte("not-valid-json{{{"))

		time.Sleep(30 * time.Millisecond)

		// Send a valid message — the client should still receive it.
		_ = conn.WriteJSON(Message{
			Type:    "message.create",
			Content: "valid after garbage",
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
	handler, err := client.SendMessage("ping")
	if err != nil {
		t.Fatalf("SendMessage failed: %v", err)
	}
	handler.OnMessage = func(msg Message) {
		replies <- msg
	}

	select {
	case msg := <-replies:
		if msg.Content != "valid after garbage" {
			t.Fatalf("Content = %q, want 'valid after garbage'", msg.Content)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for valid message after JSON error")
	}
}

// TestNormalizePayloadExtractsThoughtFromContent verifies that when payload
// has kind="thought", IsThought is set without overwriting Content.
func TestNormalizePayloadThoughtKindDetection(t *testing.T) {
	// kind="thought" sets IsThought, content comes from payload.
	msg := Message{
		Payload: map[string]any{
			"kind":    "thought",
			"content": "reasoning step 1",
		},
	}
	msg.normalizePayload()

	if !msg.IsThought {
		t.Fatal("IsThought should be true when kind=thought")
	}
	if msg.Content != "reasoning step 1" {
		t.Fatalf("Content = %q, want 'reasoning step 1'", msg.Content)
	}
}

// TestNormalizePayloadMixedThoughtAndRoomID verifies that normalizePayload
// extracts both thought indicators and room_id from the same payload.
func TestNormalizePayloadMixedThoughtAndRoomID(t *testing.T) {
	msg := Message{
		Payload: map[string]any{
			"kind":    "thought",
			"content": "planning next steps",
			"room_id": "room-planning",
			"thought": "detailed internal monologue",
		},
	}
	msg.normalizePayload()

	if !msg.IsThought {
		t.Fatal("IsThought should be true when kind=thought")
	}
	if msg.Content != "planning next steps" {
		t.Fatalf("Content = %q", msg.Content)
	}
	if msg.Thought != "detailed internal monologue" {
		t.Fatalf("Thought = %q", msg.Thought)
	}
	if msg.RoomID != "room-planning" {
		t.Fatalf("RoomID = %q, want room-planning", msg.RoomID)
	}
}

// ============================================================================
// 4. Context Management: Pending Handler Lifecycle
// ============================================================================

// TestPendingHandlerCleanupOnResend verifies that when a second message is
// sent before the first receives a response, the first pending handler is
// cleaned up (done_ called, channel closed).
func TestPendingHandlerCleanupOnResend(t *testing.T) {
	upgrader := websocket.Upgrader{}

	// Server reads messages in a loop but never responds, so the pending
	// handler is never naturally resolved by a response.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			var msg Message
			if err := conn.ReadJSON(&msg); err != nil {
				return
			}
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

	// Send first message.
	handler1, err := client.SendMessage("message-1")
	if err != nil {
		t.Fatalf("first SendMessage failed: %v", err)
	}

	// Send second message — should trigger done_ on handler1.
	handler2, err := client.SendMessage("message-2")
	if err != nil {
		t.Fatalf("second SendMessage failed: %v", err)
	}

	// handler1 must be closed.
	if !handler1.closed.Load() {
		t.Fatal("handler1 should be closed after second send replaces it")
	}

	// handler1.Wait() must return immediately.
	select {
	case <-handler1.done:
		// OK.
	case <-time.After(500 * time.Millisecond):
		t.Fatal("handler1.Wait() should return immediately after cleanup")
	}

	// handler2 should still be open (no response received yet).
	if handler2.closed.Load() {
		t.Fatal("handler2 should NOT be closed yet")
	}
}

// TestProactiveCallbackNoPendingHandler verifies that when a message arrives
// and no pending handler exists, it is routed to ProactiveCallback.
func TestProactiveCallbackNoPendingHandler(t *testing.T) {
	upgrader := websocket.Upgrader{}

	proactive := make(chan Message, 3)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		// Server sends messages without the client sending first.
		_ = conn.WriteJSON(Message{
			Type:    MsgTypeProactive,
			Content: "autonomous update 1",
		})
		time.Sleep(20 * time.Millisecond)
		_ = conn.WriteJSON(Message{
			Type:    MsgTypeProactive,
			Content: "autonomous update 2",
		})
		time.Sleep(100 * time.Millisecond)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})
	client.ProactiveCallback = func(msg Message) {
		proactive <- msg
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	// Should receive both proactive messages.
	for i := 0; i < 2; i++ {
		select {
		case msg := <-proactive:
			if msg.Content == "" {
				t.Fatalf("proactive msg %d has empty content", i+1)
			}
			if msg.Type != MsgTypeProactive {
				t.Fatalf("proactive msg %d type = %q, want %s", i+1, msg.Type, MsgTypeProactive)
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("timeout waiting for proactive message %d", i+1)
		}
	}
}

// TestEmptyContentNoProactiveCallback verifies that messages with empty
// Content do NOT trigger ProactiveCallback (readLoop guard).
func TestEmptyContentNoProactiveCallback(t *testing.T) {
	upgrader := websocket.Upgrader{}

	proactive := make(chan Message, 2)
	var mu sync.Mutex
	var callCount int

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		// Send a message with empty content — should be dropped.
		_ = conn.WriteJSON(Message{
			Type:    MsgTypeProactive,
			Content: "",
		})
		time.Sleep(30 * time.Millisecond)

		// Send a valid proactive message — should be delivered.
		_ = conn.WriteJSON(Message{
			Type:    MsgTypeProactive,
			Content: "real message",
		})
		time.Sleep(100 * time.Millisecond)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})
	client.ProactiveCallback = func(msg Message) {
		mu.Lock()
		callCount++
		mu.Unlock()
		proactive <- msg
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	// Should receive exactly 1 message (the "real message").
	select {
	case msg := <-proactive:
		if msg.Content != "real message" {
			t.Fatalf("Content = %q, want 'real message'", msg.Content)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for real proactive message")
	}

	mu.Lock()
	if callCount != 1 {
		t.Fatalf("ProactiveCallback called %d times, want exactly 1", callCount)
	}
	mu.Unlock()

	// There should be no second message.
	select {
	case msg := <-proactive:
		t.Fatalf("unexpected second proactive message: %q", msg.Content)
	case <-time.After(200 * time.Millisecond):
		// OK — no extra callback.
	}
}

// ============================================================================
// 5. Error Handling
// ============================================================================

// TestHealthCheckNon200Status verifies that HealthCheck returns an error
// for various non-200 HTTP status codes.
func TestHealthCheckNon200Status(t *testing.T) {
	tests := []struct {
		name   string
		status int
	}{
		{"503 Service Unavailable", http.StatusServiceUnavailable},
		{"500 Internal Server Error", http.StatusInternalServerError},
		{"404 Not Found", http.StatusNotFound},
		{"403 Forbidden", http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.status)
			}))
			defer server.Close()

			ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
			defer cancel()

			err := HealthCheck(ctx, server.URL)
			if err == nil {
				t.Fatalf("expected error for status %d, got nil", tt.status)
			}
		})
	}
}

// TestHealthCheckTimeout verifies that HealthCheck respects context
// cancellation and returns an error on timeout.
func TestHealthCheckTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Sleep long enough that the client context deadline fires first,
		// but eventually return so the httptest server can shut down cleanly.
		time.Sleep(5 * time.Second)
	}))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	err := HealthCheck(ctx, server.URL)
	if err == nil {
		t.Fatal("expected timeout error, got nil")
	}
}

// TestNewWithTokenInHeader verifies that the Authorization header is set
// when a Token is configured.
func TestNewWithTokenInHeader(t *testing.T) {
	upgrader := websocket.Upgrader{}

	authHeader := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader <- r.Header.Get("Authorization")
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		conn.Close()
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL, Token: "secret-abc"})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	_ = client.Connect(ctx)

	select {
	case auth := <-authHeader:
		if auth != "Bearer secret-abc" {
			t.Fatalf("Authorization = %q, want 'Bearer secret-abc'", auth)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for auth header")
	}
}

// TestCloseIdempotent verifies that calling Close multiple times does not
// panic or cause issues.
func TestCloseIdempotent(t *testing.T) {
	client := New(Config{WSURL: "ws://localhost:0"})

	// Should not panic on unconnected client.
	client.Close()
	client.Close()
	client.Close()
}

// TestCloseBeforeConnect verifies Close is safe when called before Connect.
func TestCloseBeforeConnect(t *testing.T) {
	client := New(Config{WSURL: "ws://localhost:0"})
	client.Close() // no ctx, no conn, no pingDone

	// After close, IsConnected should still be false.
	if client.IsConnected() {
		t.Fatal("IsConnected should be false after Close on unconnected client")
	}
}

// TestMessageJSONOmitEmpty verifies that omitempty tags suppress zero-value
// fields in JSON output.
func TestMessageJSONOmitEmpty(t *testing.T) {
	msg := Message{Type: MsgTypeProactive, Content: "minimal"}
	raw, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	// These zero-value fields must be absent.
	for _, field := range []string{"id", "session_id", "timestamp", "error",
		"conversation_id", "room_id", "media_urls", "metadata", "payload"} {
		if _, ok := m[field]; ok {
			t.Errorf("field %q should be omitted when empty", field)
		}
	}

	// Type and Content must be present.
	if m["type"] != MsgTypeProactive {
		t.Errorf("type = %v", m["type"])
	}
	if m["content"] != "minimal" {
		t.Errorf("content = %v", m["content"])
	}
}

// TestSendCommandSequential verifies that multiple commands in sequence
// each get their own handler and responses are routed correctly.
func TestSendCommandSequential(t *testing.T) {
	upgrader := websocket.Upgrader{}

	commandCount := 3
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		for i := 0; i < commandCount; i++ {
			var inbound Message
			if err := conn.ReadJSON(&inbound); err != nil {
				t.Fatalf("read inbound %d: %v", i, err)
			}
			cmd, _ := inbound.Payload["command"].(string)
			_ = conn.WriteJSON(Message{
				Type: "command.response",
				Payload: map[string]any{
					"command": cmd,
					"result":  "ok",
				},
			})
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

	for _, cmdName := range []string{"cmd-a", "cmd-b", "cmd-c"} {
		responses := make(chan Message, 1)
		handler, err := client.SendCommand(cmdName, nil)
		if err != nil {
			t.Fatalf("SendCommand(%q) failed: %v", cmdName, err)
		}
		handler.OnMessage = func(msg Message) {
			responses <- msg
		}

		// Wait for the response before sending the next command.
		select {
		case resp := <-responses:
			respCmd, _ := resp.Payload["command"].(string)
			if respCmd != cmdName {
				t.Fatalf("response command = %q, want %q", respCmd, cmdName)
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("timeout waiting for %q response", cmdName)
		}
	}
}
