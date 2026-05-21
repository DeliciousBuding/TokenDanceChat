package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"tokendancechat/backend/hub"

	"github.com/gorilla/websocket"
)

// mockStore is a test implementation of hub.Store.
type mockStore struct {
	messages []hub.StoredMessage
}

func (m *mockStore) InsertMessage(username, content, replyToID string) (hub.StoredMessage, error) {
	msg := hub.StoredMessage{
		ID:        "mock-id-" + username,
		Username:  username,
		Content:   content,
		Timestamp: time.Now().UnixMilli(),
	}
	m.messages = append(m.messages, msg)
	return msg, nil
}

func (m *mockStore) GetMessages(limit int, before int64) []hub.StoredMessage {
	return m.messages
}

func (m *mockStore) MarkDeleted(msgID string) (hub.StoredMessage, error) { return hub.StoredMessage{}, nil }
func (m *mockStore) TotalMessages() int64 {
	return int64(len(m.messages))
}

func newTestHandler() *Handler {
	ms := &mockStore{}
	h := hub.New(ms, nil, "")
	go h.Run()
	return New(h, ms)
}

func TestHealthCheck(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()

	h.HealthCheck(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", ct)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}

	if body["status"] != "ok" {
		t.Errorf("expected status 'ok', got '%v'", body["status"])
	}
	if body["service"] != "tokendancechat" {
		t.Errorf("expected service 'tokendancechat', got '%v'", body["service"])
	}
}

func TestGetMessagesEmpty(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/messages", nil)
	w := httptest.NewRecorder()

	h.GetMessages(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}

	messages, ok := body["messages"].([]interface{})
	if !ok {
		t.Fatal("expected 'messages' field to be an array")
	}
	if len(messages) != 0 {
		t.Errorf("expected empty messages array, got %d items", len(messages))
	}
}

func TestGetMessagesAfterInsert(t *testing.T) {
	h := newTestHandler()

	// Insert a message via the store.
	h.store.InsertMessage("alice", "hello", "")

	req := httptest.NewRequest(http.MethodGet, "/api/messages", nil)
	w := httptest.NewRecorder()

	h.GetMessages(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}

	messages, ok := body["messages"].([]interface{})
	if !ok {
		t.Fatal("expected 'messages' field to be an array")
	}
	if len(messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(messages))
	}

	msg := messages[0].(map[string]interface{})
	if msg["username"] != "alice" {
		t.Errorf("expected username 'alice', got '%v'", msg["username"])
	}
	if msg["content"] != "hello" {
		t.Errorf("expected content 'hello', got '%v'", msg["content"])
	}
}

func TestGetOnlineUsersEmpty(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/users/online", nil)
	w := httptest.NewRecorder()

	h.GetOnlineUsers(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}

	online, ok := body["online"].([]interface{})
	if !ok {
		t.Fatal("expected 'online' field to be an array")
	}
	if len(online) != 0 {
		t.Errorf("expected empty online array, got %d items", len(online))
	}

	count, ok := body["count"].(float64)
	if !ok {
		t.Fatal("expected 'count' field to be a number")
	}
	if count != 0 {
		t.Errorf("expected count 0, got %v", count)
	}
}

func TestCORSMiddleware(t *testing.T) {
	_ = newTestHandler()

	// Create a simple handler to wrap.
	handler := CORSMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))

	t.Run("GET request adds CORS headers", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.Header.Get("Access-Control-Allow-Origin") != "*" {
			t.Error("missing Access-Control-Allow-Origin header")
		}
		if resp.Header.Get("Access-Control-Allow-Methods") != "GET, POST, OPTIONS" {
			t.Error("missing or wrong Access-Control-Allow-Methods header")
		}
		if resp.Header.Get("Access-Control-Allow-Headers") != "Content-Type, Authorization" {
			t.Error("missing or wrong Access-Control-Allow-Headers header")
		}
		if resp.Header.Get("Access-Control-Max-Age") != "86400" {
			t.Error("missing or wrong Access-Control-Max-Age header")
		}
	})

	t.Run("OPTIONS preflight returns 204", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/test", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusNoContent {
			t.Errorf("expected status 204 for OPTIONS, got %d", resp.StatusCode)
		}
		// CORS headers should still be present on OPTIONS.
		if resp.Header.Get("Access-Control-Allow-Origin") != "*" {
			t.Error("missing CORS header on OPTIONS response")
		}
	})
}

func TestWebSocketUpgrade(t *testing.T) {
	h := newTestHandler()

	// Create a test server.
	srv := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	defer srv.Close()

	// Convert http:// to ws://
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	// Connect via WebSocket.
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to dial WebSocket: %v", err)
	}
	defer conn.Close()

	// Connection should be established.
	if conn == nil {
		t.Fatal("expected non-nil WebSocket connection")
	}
}

func TestWebSocketFullFlow(t *testing.T) {
	h := newTestHandler()

	srv := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	// --- Connect ---
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to dial WebSocket: %v", err)
	}
	defer conn.Close()

	// Set a read deadline to prevent hanging if the test fails.
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	// --- Join ---
	joinMsg := `{"type":"join","username":"alice"}`
	if err := conn.WriteMessage(websocket.TextMessage, []byte(joinMsg)); err != nil {
		t.Fatalf("failed to send join: %v", err)
	}

	// Read: should receive history first (possibly empty).
	var receivedHistory bool
	var receivedUserJoined bool

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg hub.Message
		if err := json.Unmarshal(data, &msg); err != nil {
			t.Logf("unmarshal error (skipping): %v", err)
			continue
		}

		if msg.Type == "history" {
			receivedHistory = true
		}
		if msg.Type == "user_joined" && msg.Username == "alice" {
			receivedUserJoined = true
			break
		}
	}

	if !receivedHistory {
		t.Error("expected to receive 'history' message after join")
	}
	if !receivedUserJoined {
		t.Error("expected to receive 'user_joined' broadcast after join")
	}

	// --- Send a message ---
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	chatMsg := `{"type":"message","content":"hello everyone"}`
	if err := conn.WriteMessage(websocket.TextMessage, []byte(chatMsg)); err != nil {
		t.Fatalf("failed to send chat message: %v", err)
	}

	// Read: should receive the broadcast of our own message.
	var receivedBroadcast bool
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg hub.Message
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		if msg.Type == "message" && msg.Content == "hello everyone" {
			receivedBroadcast = true
			break
		}
	}
	if !receivedBroadcast {
		t.Error("expected to receive broadcast of sent message")
	}

	// --- Disconnect ---
	// Closing the connection triggers unregister and user_left broadcast.
	conn.Close()

	// Wait briefly for the hub to process the unregister.
	time.Sleep(100 * time.Millisecond)

	// Verify user is no longer online.
	users := h.hub.OnlineUsers()
	if len(users) != 0 {
		t.Errorf("expected 0 online users after disconnect, got %d: %v", len(users), users)
	}
}
