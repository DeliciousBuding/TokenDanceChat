package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"tokendancechat/backend/hub"
	"tokendancechat/backend/store"

	"github.com/gorilla/websocket"
)

// mockStore is a test implementation of hub.Store.
type mockStore struct {
	messages []hub.StoredMessage
	rooms    []hub.StoredRoom
}

func (m *mockStore) InsertMessage(username, content, replyToID, roomID, toUser, groupName, threadID string) (hub.StoredMessage, error) {
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

func (m *mockStore) GetRoomMessages(roomID string, limit int, before int64) []hub.StoredMessage {
	return m.messages
}

func (m *mockStore) MarkDeleted(msgID string) error { return nil }
func (m *mockStore) TotalUsers() int64              { return 0 }
func (m *mockStore) TotalMessages() int64 {
	return int64(len(m.messages))
}

func (m *mockStore) CreateRoom(name string) (string, error) {
	id := "room-" + name
	m.rooms = append(m.rooms, hub.StoredRoom{ID: id, Name: name})
	return id, nil
}

func (m *mockStore) GetRoomID(name string) (string, error) {
	for _, r := range m.rooms {
		if r.Name == name {
			return r.ID, nil
		}
	}
	return "", nil
}

func (m *mockStore) ListRooms() []hub.StoredRoom {
	return m.rooms
}

func (m *mockStore) DeleteRoom(roomID string) error {
	return nil
}
func (m *mockStore) ToggleReaction(messageID, emoji, username string) (map[string][]string, error) {
	return nil, nil
}
func (m *mockStore) GetReactionsForMessages(messageIDs []string) map[string]map[string][]string {
	return nil
}
func (m *mockStore) UpdateMessage(messageID, content string) (hub.StoredMessage, error) {
	return hub.StoredMessage{}, nil
}
func (m *mockStore) GetMessageByID(messageID string) (hub.StoredMessage, error) {
	return hub.StoredMessage{}, nil
}

func (m *mockStore) SearchMessages(query, roomID string, limit int) ([]store.SearchResult, error) {
	return nil, nil
}
func (m *mockStore) AddFriend(username, friend string) error                          { return nil }
func (m *mockStore) RemoveFriend(username, friend string) error                       { return nil }
func (m *mockStore) GetAllFriends() map[string][]string                               { return nil }
func (m *mockStore) GetFriends(username string) []string                              { return nil }
func (m *mockStore) CreateGroup(name, creator string) error                           { return nil }
func (m *mockStore) AddGroupMember(groupName, username string) error                  { return nil }
func (m *mockStore) RemoveGroupMember(groupName, username string) error               { return nil }
func (m *mockStore) GetGroupMembers(groupName string) []string                        { return nil }
func (m *mockStore) GetAllGroups() map[string][]string                                { return nil }
func (m *mockStore) GetUndeliveredDMs(username string, limit int) []hub.StoredMessage { return nil }
func (m *mockStore) MarkMessagesDelivered(ids []string) error                         { return nil }
func (m *mockStore) BlockUser(username, blocked string) error                         { return nil }
func (m *mockStore) UnblockUser(username, blocked string) error                       { return nil }
func (m *mockStore) IsBlocked(username, blocked string) bool                          { return false }
func (m *mockStore) GetBlockedUsers(username string) []string                         { return nil }
func (m *mockStore) PinMessage(roomID, messageID, pinnedBy string) error              { return nil }
func (m *mockStore) UnpinMessage(roomID, messageID string) error                      { return nil }
func (m *mockStore) GetPinnedMessages(roomID string) []hub.StoredMessage              { return nil }
func (m *mockStore) ArchiveConversation(username, key string) error                   { return nil }
func (m *mockStore) UnarchiveConversation(username, key string) error                 { return nil }
func (m *mockStore) ListArchivedConversations(username string) []string               { return nil }
func (m *mockStore) IsConversationArchived(username, key string) bool                 { return false }
func (m *mockStore) Ping() error                                                      { return nil }
func (m *mockStore) PinConversation(username, key string) error                       { return nil }
func (m *mockStore) UnpinConversation(username, key string) error                     { return nil }
func (m *mockStore) ListPinnedConversations(username string) []string                 { return nil }
func (m *mockStore) MuteConversation(username, key string) error                      { return nil }
func (m *mockStore) UnmuteConversation(username, key string) error                    { return nil }
func (m *mockStore) ListMutedConversations(username string) []string                  { return nil }
func (m *mockStore) IsConversationMuted(username, key string) bool                    { return false }
func (m *mockStore) SetNotificationPrefs(username, key string, mutedUntil int64, showPreview bool) error {
	return nil
}
func (m *mockStore) GetNotificationPrefs(username, key string) (int64, bool, error) {
	return 0, true, nil
}
func (m *mockStore) ListNotificationPrefs(username string) []store.NotificationPref { return nil }

func newTestHandler() *Handler {
	ms := &mockStore{}
	h := hub.New(ms, nil, nil, "")
	go h.Run()
	return New(h, ms, "/tmp/test-uploads")
}

func (m *mockStore) UpsertUserProfile(username, displayName, avatarURL, bio, status string, lastSeen int64) error {
	return nil
}
func (m *mockStore) GetUserProfile(username string) (*store.UserProfile, error) {
	return &store.UserProfile{Username: username}, nil
}
func (m *mockStore) UpdateUserStatus(username, status string) error                 { return nil }
func (m *mockStore) UpdateUserLastSeen(username string) error                       { return nil }
func (m *mockStore) GetAllUserProfiles() ([]store.UserProfile, error)               { return nil, nil }
func (m *mockStore) CreatePoll(poll *hub.Poll) error                                { return nil }
func (m *mockStore) GetPoll(pollID string) (*hub.Poll, error)                       { return nil, nil }
func (m *mockStore) VotePoll(pollID string, username string, optionIndex int) error { return nil }
func (m *mockStore) ClosePoll(pollID string) error                                  { return nil }
func (m *mockStore) ScheduleMessage(msg store.ScheduledMessage) error               { return nil }
func (m *mockStore) GetPendingScheduledMessages(ctx context.Context) ([]store.ScheduledMessage, error) {
	return nil, nil
}
func (m *mockStore) MarkScheduledSent(id string) error                { return nil }
func (m *mockStore) CancelScheduledMessage(id, username string) error { return nil }
func (m *mockStore) GetUserScheduledMessages(username string) ([]store.ScheduledMessage, error) {
	return nil, nil
}
func (m *mockStore) ExportMessages(ctx context.Context, roomID, toUser, groupName, format string, limit int) ([]hub.StoredMessage, error) {
	return nil, nil
}
func (m *mockStore) GetThreadMessages(parentMessageID string) []hub.StoredMessage      { return nil }
func (m *mockStore) GetThreadReplyCount(parentMessageID string) int                    { return 0 }
func (m *mockStore) DeleteGroup(groupName string) error                                { return nil }
func (m *mockStore) GetGroupMembersWithRoles(groupName string) []store.GroupMemberInfo { return nil }
func (m *mockStore) UpdateGroupName(oldName, newName string) error                     { return nil }
func (m *mockStore) SetGroupMemberRole(groupName, username, role string) error         { return nil }
func (m *mockStore) KickGroupMember(groupName, username string) error                  { return nil }
func (m *mockStore) TransferGroupOwnership(groupName, newOwner string) error           { return nil }
func (m *mockStore) LeaveGroup(groupName, username string) error                       { return nil }
func (m *mockStore) GetGroupInfo(groupName string) (*store.GroupInfo, error) {
	return &store.GroupInfo{Name: groupName}, nil
}
func (m *mockStore) GetGroupMemberRole(groupName, username string) (string, error) {
	return "member", nil
}
func (m *mockStore) GetGroupOwner(groupName string) (string, error)                     { return "", nil }
func (m *mockStore) AddCustomEmoji(name, url, uploader, roomID string) error            { return nil }
func (m *mockStore) ListCustomEmojis(roomID string) ([]store.CustomEmoji, error)        { return nil, nil }
func (m *mockStore) DeleteCustomEmoji(name, username string) error                      { return nil }
func (m *mockStore) SearchCustomEmojis(query string) ([]store.CustomEmoji, error)       { return nil, nil }
func (m *mockStore) LogCall(call store.CallRecord) error                                { return nil }
func (m *mockStore) UpdateCallRecord(id, status string, startedAt, endedAt int64) error { return nil }
func (m *mockStore) GetCallHistory(username string, limit int) ([]store.CallRecord, error) {
	return nil, nil
}
func (m *mockStore) RegisterUser(username, passwordHash, inviteCode string) error { return nil }
func (m *mockStore) VerifyUser(username, password string) (bool, error)           { return true, nil }
func (m *mockStore) GenerateInviteCode(creator string, maxUses int) (string, error) {
	return "TESTCODE", nil
}
func (m *mockStore) ListInviteCodes(creator string) ([]store.InviteCodeRecord, error) {
	return nil, nil
}
func (m *mockStore) ValidateInviteCode(code string) (bool, error) { return true, nil }
func (m *mockStore) CreateChatFolder(username, name string) (*store.ChatFolder, error) {
	return &store.ChatFolder{ID: "f1", Name: name}, nil
}
func (m *mockStore) DeleteChatFolder(username, id string) error              { return nil }
func (m *mockStore) RenameChatFolder(username, id, newName string) error     { return nil }
func (m *mockStore) AddToFolder(folderID, key string) error                  { return nil }
func (m *mockStore) RemoveFromFolder(folderID, key string) error             { return nil }
func (m *mockStore) ListFolders(username string) ([]store.ChatFolder, error) { return nil, nil }
func (m *mockStore) GetFolderItems(folderID string) ([]string, error)        { return nil, nil }

func (m *mockStore) CreateWebhook(id, groupName, url, secret, createdBy string) error { return nil }
func (m *mockStore) DeleteWebhook(id, groupName, deletedBy string) error              { return nil }
func (m *mockStore) RotateWebhookSecret(id, groupName, secret, rotatedBy string) (*store.Webhook, error) {
	return nil, nil
}
func (m *mockStore) ListWebhooks(groupName string) ([]store.Webhook, error)           { return nil, nil }
func (m *mockStore) ListWebhookAuditLogs(groupName string, limit int) ([]store.WebhookAuditLog, error) {
	return nil, nil
}
func (m *mockStore) GetWebhookByURL(url string) (*store.Webhook, error)               { return nil, nil }
func (m *mockStore) VerifyWebhookSecret(url, secret string) (*store.Webhook, bool, error) {
	return nil, false, nil
}

// mockStoreScheduled actually stores scheduled messages for testing.
type mockStoreScheduled struct {
	mockStore
	scheduled []store.ScheduledMessage
}

func (m *mockStoreScheduled) ScheduleMessage(msg store.ScheduledMessage) error {
	m.scheduled = append(m.scheduled, msg)
	return nil
}

func (m *mockStoreScheduled) GetUserScheduledMessages(username string) ([]store.ScheduledMessage, error) {
	var result []store.ScheduledMessage
	for _, sm := range m.scheduled {
		if sm.Username == username {
			result = append(result, sm)
		}
	}
	return result, nil
}

func (m *mockStoreScheduled) CancelScheduledMessage(id, username string) error {
	for i, sm := range m.scheduled {
		if sm.ID == id {
			m.scheduled = append(m.scheduled[:i], m.scheduled[i+1:]...)
			return nil
		}
	}
	return nil
}

func newTestHandlerScheduled() *Handler {
	ms := &mockStoreScheduled{}
	h := hub.New(ms, nil, nil, "")
	go h.Run()
	return New(h, ms, "/tmp/test-uploads")
}

// mockStoreThreaded stores thread_id with messages for thread reply testing.
type mockStoreThreaded struct {
	mockStore
}

func (m *mockStoreThreaded) InsertMessage(username, content, replyToID, roomID, toUser, groupName, threadID string) (hub.StoredMessage, error) {
	msg := hub.StoredMessage{
		ID:        "mock-id-" + username,
		Username:  username,
		Content:   content,
		Timestamp: time.Now().UnixMilli(),
		ReplyToID: replyToID,
		RoomID:    roomID,
		ToUser:    toUser,
		GroupName: groupName,
		ThreadID:  threadID,
	}
	m.messages = append(m.messages, msg)
	return msg, nil
}

func (m *mockStoreThreaded) GetThreadMessages(parentMessageID string) []hub.StoredMessage {
	var result []hub.StoredMessage
	for _, msg := range m.messages {
		if msg.ThreadID == parentMessageID {
			result = append(result, msg)
		}
	}
	return result
}

func (m *mockStoreThreaded) GetMessageByID(messageID string) (hub.StoredMessage, error) {
	for _, msg := range m.messages {
		if msg.ID == messageID {
			return msg, nil
		}
	}
	return hub.StoredMessage{}, errors.New("not found")
}

func (m *mockStoreThreaded) GetRoomMessages(roomID string, limit int, before int64) []hub.StoredMessage {
	var result []hub.StoredMessage
	for _, msg := range m.messages {
		if msg.RoomID == roomID {
			result = append(result, msg)
		}
	}
	return result
}

func newTestHandlerThreaded() *Handler {
	ms := &mockStoreThreaded{}
	h := hub.New(ms, nil, nil, "")
	go h.Run()
	return New(h, ms, "/tmp/test-uploads")
}

func TestWebhookHandlerVerifiesHashedSecret(t *testing.T) {
	s, err := store.New(":memory:")
	if err != nil {
		t.Fatalf("store.New returned error: %v", err)
	}
	defer s.Close()

	const (
		webhookURL = "team-hook"
		secret     = "one-time-webhook-secret"
	)
	if err := s.CreateWebhook("wh-1", "team", webhookURL, secret, "alice"); err != nil {
		t.Fatalf("CreateWebhook returned error: %v", err)
	}

	h := hub.New(s, nil, nil, "")
	handler := New(h, s, t.TempDir())

	req := httptest.NewRequest(http.MethodPost, "/api/webhook/"+webhookURL+"?secret="+secret, strings.NewReader(`{"content":"deploy finished","username":"ci"}`))
	w := httptest.NewRecorder()

	handler.WebhookHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected correct webhook secret to return 200, got %d: %s", w.Code, w.Body.String())
	}

	badReq := httptest.NewRequest(http.MethodPost, "/api/webhook/"+webhookURL+"?secret=wrong", strings.NewReader(`{"content":"deploy finished"}`))
	badW := httptest.NewRecorder()

	handler.WebhookHandler(badW, badReq)

	if badW.Code != http.StatusNotFound {
		t.Fatalf("expected wrong webhook secret to return 404, got %d", badW.Code)
	}
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
	h.store.InsertMessage("alice", "hello", "", "", "", "", "")

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

	t.Run("same-origin adds CORS headers", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.Header.Get("Access-Control-Allow-Origin") != "" {
			t.Error("expected empty Access-Control-Allow-Origin for same-origin request")
		}
		if resp.Header.Get("Access-Control-Allow-Methods") != "GET, POST, OPTIONS" {
			t.Error("missing or wrong Access-Control-Allow-Methods header")
		}
	})

	t.Run("cross-origin allowed origin echoes back", func(t *testing.T) {
		os.Setenv("CHAT_ALLOWED_ORIGINS", "example.com")
		defer os.Unsetenv("CHAT_ALLOWED_ORIGINS")

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Origin", "https://example.com")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.Header.Get("Access-Control-Allow-Origin") != "https://example.com" {
			t.Errorf("expected https://example.com, got %q",
				resp.Header.Get("Access-Control-Allow-Origin"))
		}
	})

	t.Run("cross-origin disallowed does not set allow-origin", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Origin", "https://evil.com")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.Header.Get("Access-Control-Allow-Origin") != "" {
			t.Error("should not set Access-Control-Allow-Origin for disallowed origin")
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

func TestUploadImageStoresViaMediaStore(t *testing.T) {
	var storedPath string
	var storedContentType string
	var storedBody []byte

	webdav := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			storedPath = r.URL.Path
			storedContentType = r.Header.Get("Content-Type")
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("failed to read PUT body: %v", err)
			}
			storedBody = body
			w.WriteHeader(http.StatusCreated)
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	}))
	defer webdav.Close()

	h := newTestHandler()
	h.mediaStore = NewWebDAVMediaStore(webdav.URL, "", "")

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "photo.png")
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	if _, err := part.Write([]byte("png-bytes")); err != nil {
		t.Fatalf("failed to write test upload: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()

	h.UploadImage(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	if path.Dir(storedPath) != "/uploads" {
		t.Fatalf("expected WebDAV upload under /uploads, got %s", storedPath)
	}
	if !strings.HasSuffix(storedPath, ".png") {
		t.Fatalf("expected generated .png filename, got %s", storedPath)
	}
	if storedContentType != "image/png" {
		t.Fatalf("expected image/png content type, got %s", storedContentType)
	}
	if string(storedBody) != "png-bytes" {
		t.Fatalf("expected uploaded bytes to be stored, got %q", string(storedBody))
	}

	var payload map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode upload response: %v", err)
	}
	if !strings.HasPrefix(payload["url"], "/uploads/") {
		t.Fatalf("expected same-origin upload URL, got %q", payload["url"])
	}
	if payload["filename"] == "" {
		t.Fatal("expected generated filename in response")
	}
}

func TestUploadEmojiStoresViaMediaStore(t *testing.T) {
	var storedPath string
	var storedContentType string
	var storedBody []byte

	webdav := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			storedPath = r.URL.Path
			storedContentType = r.Header.Get("Content-Type")
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("failed to read PUT body: %v", err)
			}
			storedBody = body
			w.WriteHeader(http.StatusCreated)
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	}))
	defer webdav.Close()

	h := newTestHandler()
	h.mediaStore = NewWebDAVMediaStore(webdav.URL, "", "")

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "party.webp")
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	if _, err := part.Write([]byte("emoji-bytes")); err != nil {
		t.Fatalf("failed to write test upload: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/emoji/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()

	h.UploadEmoji(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	if path.Dir(storedPath) != "/uploads/emojis" {
		t.Fatalf("expected emoji upload under /uploads/emojis, got %s", storedPath)
	}
	if !strings.HasSuffix(storedPath, ".webp") {
		t.Fatalf("expected generated .webp filename, got %s", storedPath)
	}
	if storedContentType != "image/webp" {
		t.Fatalf("expected image/webp content type, got %s", storedContentType)
	}
	if string(storedBody) != "emoji-bytes" {
		t.Fatalf("expected uploaded emoji bytes to be stored, got %q", string(storedBody))
	}

	var payload map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode upload response: %v", err)
	}
	if !strings.HasPrefix(payload["url"], "/uploads/emojis/") {
		t.Fatalf("expected same-origin emoji URL, got %q", payload["url"])
	}
	if payload["filename"] == "" {
		t.Fatal("expected generated emoji filename in response")
	}
}

func TestServeUploadReadsViaMediaStore(t *testing.T) {
	webdav := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("unexpected method %s", r.Method)
		}
		if r.URL.Path != "/uploads/sample.webp" {
			t.Fatalf("expected /uploads/sample.webp, got %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "image/webp")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("webp-bytes"))
	}))
	defer webdav.Close()

	h := newTestHandler()
	h.mediaStore = NewWebDAVMediaStore(webdav.URL, "", "")

	req := httptest.NewRequest(http.MethodGet, "/uploads/sample.webp", nil)
	w := httptest.NewRecorder()

	h.ServeUpload(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "image/webp" {
		t.Fatalf("expected image/webp content type, got %s", ct)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("failed to read response body: %v", err)
	}
	if string(body) != "webp-bytes" {
		t.Fatalf("expected media bytes, got %q", string(body))
	}
}

func TestServeEmojiReadsViaMediaStore(t *testing.T) {
	webdav := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("unexpected method %s", r.Method)
		}
		if r.URL.Path != "/uploads/emojis/spark.gif" {
			t.Fatalf("expected /uploads/emojis/spark.gif, got %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "image/gif")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("gif-bytes"))
	}))
	defer webdav.Close()

	h := newTestHandler()
	h.mediaStore = NewWebDAVMediaStore(webdav.URL, "", "")

	req := httptest.NewRequest(http.MethodGet, "/uploads/emojis/spark.gif", nil)
	w := httptest.NewRecorder()

	h.ServeEmoji(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "image/gif" {
		t.Fatalf("expected image/gif content type, got %s", ct)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("failed to read response body: %v", err)
	}
	if string(body) != "gif-bytes" {
		t.Fatalf("expected emoji bytes, got %q", string(body))
	}
}

func TestS3MediaStoreSaveAndOpen(t *testing.T) {
	var putSeen bool
	var getSeen bool
	var storedBody []byte
	var storedContentType string

	s3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/media-bucket/chat-media/sample.png" {
			t.Fatalf("expected S3 path /media-bucket/chat-media/sample.png, got %s", r.URL.Path)
		}
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "AWS4-HMAC-SHA256 Credential=test-access/") {
			t.Fatalf("expected SigV4 Authorization header, got %q", auth)
		}
		if r.Header.Get("X-Amz-Date") == "" {
			t.Fatal("expected X-Amz-Date header")
		}
		if r.Header.Get("X-Amz-Security-Token") != "session-token" {
			t.Fatalf("expected session token header, got %q", r.Header.Get("X-Amz-Security-Token"))
		}

		switch r.Method {
		case http.MethodPut:
			putSeen = true
			if got, want := r.Header.Get("X-Amz-Content-Sha256"), sha256Hex([]byte("png-bytes")); got != want {
				t.Fatalf("expected PUT payload hash %s, got %s", want, got)
			}
			storedContentType = r.Header.Get("Content-Type")
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("failed to read PUT body: %v", err)
			}
			storedBody = body
			w.WriteHeader(http.StatusCreated)
		case http.MethodGet:
			getSeen = true
			if got, want := r.Header.Get("X-Amz-Content-Sha256"), sha256Hex(nil); got != want {
				t.Fatalf("expected GET payload hash %s, got %s", want, got)
			}
			w.Header().Set("Content-Type", storedContentType)
			w.WriteHeader(http.StatusOK)
			w.Write(storedBody)
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	}))
	defer s3.Close()

	store, err := NewS3MediaStore(S3MediaStoreConfig{
		Endpoint:        s3.URL,
		Region:          "auto",
		Bucket:          "media-bucket",
		AccessKeyID:     "test-access",
		SecretAccessKey: "test-secret",
		SessionToken:    "session-token",
		Prefix:          "chat-media",
		UsePathStyle:    true,
	})
	if err != nil {
		t.Fatalf("failed to create S3 media store: %v", err)
	}

	if err := store.Save(context.Background(), "sample.png", "image/png", strings.NewReader("png-bytes")); err != nil {
		t.Fatalf("Save failed: %v", err)
	}
	media, err := store.Open(context.Background(), "sample.png")
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer media.Body.Close()

	body, err := io.ReadAll(media.Body)
	if err != nil {
		t.Fatalf("failed to read stored body: %v", err)
	}
	if string(body) != "png-bytes" {
		t.Fatalf("expected stored png bytes, got %q", string(body))
	}
	if media.ContentType != "image/png" {
		t.Fatalf("expected image/png content type, got %s", media.ContentType)
	}
	if !putSeen || !getSeen {
		t.Fatalf("expected both PUT and GET to be called, put=%t get=%t", putSeen, getSeen)
	}
}

func TestMediaStoreRejectsTraversalKeys(t *testing.T) {
	local := NewLocalMediaStore(t.TempDir())
	if err := local.Save(context.Background(), "../escape.png", "image/png", strings.NewReader("x")); err == nil {
		t.Fatal("expected local media store to reject traversal key")
	}

	s3, err := NewS3MediaStore(S3MediaStoreConfig{
		Endpoint:        "https://s3.example.test",
		Region:          "auto",
		Bucket:          "media-bucket",
		AccessKeyID:     "test-access",
		SecretAccessKey: "test-secret",
		UsePathStyle:    true,
	})
	if err != nil {
		t.Fatalf("failed to create S3 media store: %v", err)
	}
	if err := s3.Save(context.Background(), "emojis/../escape.png", "image/png", strings.NewReader("x")); err == nil {
		t.Fatal("expected S3 media store to reject traversal key")
	}
}

// mockStoreDBError is a mockStore variant that returns an error from Ping.
type mockStoreDBError struct {
	mockStore
}

func (m *mockStoreDBError) ArchiveConversation(username, key string) error     { return nil }
func (m *mockStoreDBError) UnarchiveConversation(username, key string) error   { return nil }
func (m *mockStoreDBError) ListArchivedConversations(username string) []string { return nil }
func (m *mockStoreDBError) IsConversationArchived(username, key string) bool   { return false }
func (m *mockStoreDBError) Ping() error {
	return errors.New("database connection lost")
}

func newTestHandlerWithDBError() *Handler {
	ms := &mockStoreDBError{}
	h := hub.New(ms, nil, nil, "")
	go h.Run()
	return New(h, ms, "/tmp/test-uploads")
}

// TestHealthCheckDBError verifies that HealthCheck returns 503 when the database ping fails.
func TestHealthCheckDBError(t *testing.T) {
	h := newTestHandlerWithDBError()

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()

	h.HealthCheck(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", resp.StatusCode)
	}

	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", ct)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}

	if body["status"] != "error" {
		t.Errorf("expected status 'error', got '%v'", body["status"])
	}
	if body["db"] != "error" {
		t.Errorf("expected db 'error', got '%v'", body["db"])
	}
	if body["service"] != "tokendancechat" {
		t.Errorf("expected service 'tokendancechat', got '%v'", body["service"])
	}
}

// TestCSPHeaders verifies that SecurityHeadersMiddleware sets the expected security headers.
func TestCSPHeaders(t *testing.T) {
	handler := SecurityHeadersMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	// Verify each security header.
	tests := []struct {
		header string
		want   string
	}{
		{"X-Content-Type-Options", "nosniff"},
		{"X-Frame-Options", "DENY"},
		{"Referrer-Policy", "strict-origin-when-cross-origin"},
		{"X-XSS-Protection", "0"},
		{"Permissions-Policy", "camera=(), microphone=(), geolocation=()"},
	}

	for _, tc := range tests {
		t.Run(tc.header, func(t *testing.T) {
			got := resp.Header.Get(tc.header)
			if got != tc.want {
				t.Errorf("%s: expected %q, got %q", tc.header, tc.want, got)
			}
		})
	}

	// Verify Content-Security-Policy is present and contains key directives.
	csp := resp.Header.Get("Content-Security-Policy")
	if csp == "" {
		t.Error("missing Content-Security-Policy header")
	} else {
		requiredDirectives := []string{
			"default-src",
			"script-src",
			"style-src",
			"img-src",
		}
		for _, directive := range requiredDirectives {
			if !strings.Contains(csp, directive) {
				t.Errorf("CSP missing directive: %s", directive)
			}
		}
	}
}

// TestUploadRejectsInvalidFileType verifies that uploading a file with an
// unsupported extension (e.g. .exe) returns HTTP 400.
func TestUploadRejectsInvalidFileType(t *testing.T) {
	h := newTestHandler()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "malware.exe")
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	if _, err := part.Write([]byte("evil payload")); err != nil {
		t.Fatalf("failed to write test payload: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()

	h.UploadImage(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400 for .exe upload, got %d", resp.StatusCode)
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}
	if payload["code"] != "INVALID_FILE_TYPE" {
		t.Errorf("expected code INVALID_FILE_TYPE, got %q", payload["code"])
	}
}

// TestUploadRejectsMissingFileField verifies that POST without a "file" form
// field returns HTTP 400.
func TestUploadRejectsMissingFileField(t *testing.T) {
	h := newTestHandler()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	// Write a non-file field instead.
	if err := writer.WriteField("username", "testuser"); err != nil {
		t.Fatalf("failed to write field: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()

	h.UploadImage(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400 for missing file field, got %d", resp.StatusCode)
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}
	if payload["code"] != "MISSING_FILE" {
		t.Errorf("expected code MISSING_FILE, got %q", payload["code"])
	}
}

// TestCORSubdomainWildcard verifies that the CORS middleware supports the
// subdomain wildcard pattern: setting CHAT_ALLOWED_ORIGINS=.example.com
// allows any *.example.com origin.
func TestCORSubdomainWildcard(t *testing.T) {
	os.Setenv("CHAT_ALLOWED_ORIGINS", ".example.com")
	defer os.Unsetenv("CHAT_ALLOWED_ORIGINS")

	handler := CORSMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))

	t.Run("subdomain allowed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Origin", "https://app.example.com")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.Header.Get("Access-Control-Allow-Origin") != "https://app.example.com" {
			t.Errorf("expected https://app.example.com, got %q",
				resp.Header.Get("Access-Control-Allow-Origin"))
		}
	})

	t.Run("nested subdomain allowed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Origin", "https://chat.dev.example.com")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.Header.Get("Access-Control-Allow-Origin") != "https://chat.dev.example.com" {
			t.Errorf("expected https://chat.dev.example.com, got %q",
				resp.Header.Get("Access-Control-Allow-Origin"))
		}
	})

	t.Run("bare domain without subdomain disallowed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Origin", "https://example.com")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.Header.Get("Access-Control-Allow-Origin") != "" {
			t.Error("should not set Access-Control-Allow-Origin for bare .example.com wildcard")
		}
	})
}

// TestStatsHandler verifies that GET /api/stats returns the expected JSON
// structure with connections, messages_total, uptime_seconds, and started_at.
func TestStatsHandler(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/stats", nil)
	w := httptest.NewRecorder()

	h.Stats(w, req)

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
		t.Fatalf("failed to decode JSON: %v", err)
	}

	// Verify required fields exist.
	requiredFields := []string{"connections", "messages_total", "uptime_seconds", "dropped_messages", "started_at"}
	for _, field := range requiredFields {
		if _, ok := body[field]; !ok {
			t.Errorf("missing field %q in stats response", field)
		}
	}

	// connections should be a number (float64 from JSON decode).
	if _, ok := body["connections"].(float64); !ok {
		t.Errorf("expected connections to be a number, got %T", body["connections"])
	}

	// started_at should be a non-empty string.
	startedAt, _ := body["started_at"].(string)
	if startedAt == "" {
		t.Error("expected started_at to be a non-empty string")
	}
}

// TestAdminStatsHandler verifies that GET /api/admin/stats returns the
// expected dashboard keys with all expected numeric fields.
func TestAdminStatsHandler(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/admin/stats", nil)
	w := httptest.NewRecorder()

	h.AdminStats(w, req)

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
		t.Fatalf("failed to decode JSON: %v", err)
	}

	// Verify all expected dashboard fields exist.
	expectedFields := []string{
		"total_messages", "active_connections", "rooms",
		"groups", "friends", "registered_users",
	}
	for _, field := range expectedFields {
		if _, ok := body[field]; !ok {
			t.Errorf("missing field %q in admin stats response", field)
		}
	}
}

// TestInviteGenerate verifies that POST /api/invite/generate with a valid body
// returns 200 and a non-empty invite code.
func TestInviteGenerate(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	body := `{"username":"alice","max_uses":3}`
	req := httptest.NewRequest(http.MethodPost, "/api/invite/generate", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.1:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.InviteGenerate(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", resp.StatusCode, w.Body.String())
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}

	code, ok := result["code"].(string)
	if !ok {
		t.Fatal("expected 'code' field of type string in response")
	}
	if code == "" {
		t.Error("expected non-empty invite code")
	}
	if code != "TESTCODE" {
		t.Errorf("expected code 'TESTCODE', got %q", code)
	}
}

// TestInviteGenerateMissingUsername verifies that POST /api/invite/generate
// without a username returns 400 with code MISSING_USERNAME.
func TestInviteGenerateMissingUsername(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	body := `{"max_uses":3}`
	req := httptest.NewRequest(http.MethodPost, "/api/invite/generate", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.2:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.InviteGenerate(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "MISSING_USERNAME" {
		t.Errorf("expected code MISSING_USERNAME, got %q", result["code"])
	}
}

// TestInviteList verifies that GET /api/invite/list returns 200 and a JSON
// response containing a "codes" key.
func TestInviteList(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/invite/list?username=alice", nil)
	w := httptest.NewRecorder()

	h.InviteList(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", resp.StatusCode, w.Body.String())
	}

	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", ct)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}

	if _, ok := result["codes"]; !ok {
		t.Error("expected 'codes' key in response")
	}
}

// TestInviteListMissingUsername verifies that GET /api/invite/list without a
// username query parameter returns 400.
func TestInviteListMissingUsername(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/invite/list", nil)
	w := httptest.NewRecorder()

	h.InviteList(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "MISSING_USERNAME" {
		t.Errorf("expected code MISSING_USERNAME, got %q", result["code"])
	}
}

// TestExportMessagesJSON verifies that GET /api/export returns 200, sets
// Content-Disposition header, and returns application/json content.
func TestExportMessagesJSON(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/export?conversation=public&username=alice", nil)
	w := httptest.NewRecorder()

	h.ExportMessages(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", resp.StatusCode, w.Body.String())
	}

	cd := resp.Header.Get("Content-Disposition")
	if cd == "" {
		t.Error("expected Content-Disposition header")
	}
	if !strings.Contains(cd, "attachment") {
		t.Errorf("expected Content-Disposition to contain 'attachment', got %q", cd)
	}

	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "application/json") {
		t.Errorf("expected Content-Type to contain application/json, got %q", ct)
	}
}

// TestExportMessagesText verifies that GET /api/export?format=text returns 200
// and text/plain content with a header and export metadata.
func TestExportMessagesText(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/export?conversation=public&format=text&username=alice", nil)
	w := httptest.NewRecorder()

	h.ExportMessages(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", resp.StatusCode, w.Body.String())
	}

	cd := resp.Header.Get("Content-Disposition")
	if cd == "" {
		t.Error("expected Content-Disposition header")
	}

	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/plain") {
		t.Errorf("expected Content-Type to contain text/plain, got %q", ct)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("failed to read response body: %v", err)
	}
	bodyStr := string(body)
	if !strings.Contains(bodyStr, "TokenDanceChat Export") {
		t.Error("expected text export to contain 'TokenDanceChat Export' header")
	}
}

// failingMediaStore is a MediaStore that returns os.ErrNotExist from Open,
// used to test ServeUpload/ServeEmoji not-found paths without real files.
type failingMediaStore struct{}

func (f *failingMediaStore) Save(ctx context.Context, filename, contentType string, body io.Reader) error {
	return errors.New("not implemented")
}

func (f *failingMediaStore) Open(ctx context.Context, filename string) (*StoredMedia, error) {
	return nil, os.ErrNotExist
}

// --- UploadImage edge cases ---

func TestUploadImageWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/upload", nil)
	w := httptest.NewRecorder()
	h.UploadImage(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for GET /api/upload, got %d", w.Code)
	}
}

// --- ServeUpload edge cases ---

func TestServeUploadRootPath(t *testing.T) {
	h := newTestHandler()
	h.mediaStore = &failingMediaStore{}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	h.ServeUpload(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for /, got %d", w.Code)
	}
}

func TestServeUploadNonexistentFile(t *testing.T) {
	h := newTestHandler()
	h.mediaStore = &failingMediaStore{}

	req := httptest.NewRequest(http.MethodGet, "/uploads/nonexistent.png", nil)
	w := httptest.NewRecorder()
	h.ServeUpload(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for nonexistent file, got %d", w.Code)
	}
}

// --- LinkPreview edge cases ---

func TestLinkPreviewMissingURL(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/link-preview", nil)
	w := httptest.NewRecorder()
	h.LinkPreview(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing url, got %d", w.Code)
	}
}

func TestLinkPreviewInvalidURL(t *testing.T) {
	h := newTestHandler()

	tests := []struct {
		name string
		url  string
	}{
		{"non-https scheme", "http://example.com"},
		{"no scheme", "example.com/path"},
		{"empty host with scheme", "https:///path"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/link-preview?url="+tt.url, nil)
			w := httptest.NewRecorder()
			h.LinkPreview(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for %q, got %d", tt.url, w.Code)
			}
		})
	}
}

func TestLinkPreviewWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/link-preview", nil)
	w := httptest.NewRecorder()
	h.LinkPreview(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST /api/link-preview, got %d", w.Code)
	}
}

// --- Giphy edge cases ---

func TestGiphySearchMissingQuery(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/giphy/search", nil)
	w := httptest.NewRecorder()
	h.GiphySearch(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing q, got %d", w.Code)
	}
}

func TestGiphySearchWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/giphy/search", nil)
	w := httptest.NewRecorder()
	h.GiphySearch(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST /api/giphy/search, got %d", w.Code)
	}
}

func TestGiphyTrendingWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/giphy/trending", nil)
	w := httptest.NewRecorder()
	h.GiphyTrending(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST /api/giphy/trending, got %d", w.Code)
	}
}

// --- Search edge cases ---

func TestSearchMissingQuery(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/search", nil)
	w := httptest.NewRecorder()
	h.Search(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing q, got %d", w.Code)
	}
}

func TestSearchWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/search", nil)
	w := httptest.NewRecorder()
	h.Search(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST /api/search, got %d", w.Code)
	}
}

// --- Stats / AdminStats edge cases ---

func TestStatsWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/stats", nil)
	w := httptest.NewRecorder()
	h.Stats(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST /api/stats, got %d", w.Code)
	}
}

func TestAdminStatsWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/admin/stats", nil)
	w := httptest.NewRecorder()
	h.AdminStats(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST /api/admin/stats, got %d", w.Code)
	}
}

// --- Auth endpoint edge cases ---

func TestRegisterWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/register", nil)
	w := httptest.NewRecorder()
	h.Register(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for GET /api/register, got %d", w.Code)
	}
}

func TestLoginWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/login", nil)
	w := httptest.NewRecorder()
	h.Login(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for GET /api/login, got %d", w.Code)
	}
}

// --- Export edge cases ---

func TestExportMessagesInvalidFormat(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/export?conversation=public&format=pdf&username=alice", nil)
	w := httptest.NewRecorder()
	h.ExportMessages(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid format, got %d: %s", w.Code, w.Body.String())
	}
}

func TestExportMessagesMissingUsernameForDM(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/export?conversation=dm:bob", nil)
	w := httptest.NewRecorder()
	h.ExportMessages(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for DM export without username, got %d: %s", w.Code, w.Body.String())
	}
}

func TestExportMessagesWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/export", nil)
	w := httptest.NewRecorder()
	h.ExportMessages(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST /api/export, got %d", w.Code)
	}
}

// --- Invite endpoint edge cases ---

func TestInviteGenerateWrongMethod(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/invite/generate", nil)
	w := httptest.NewRecorder()
	h.InviteGenerate(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for GET /api/invite/generate, got %d", w.Code)
	}
}

func TestInviteListWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/invite/list", nil)
	w := httptest.NewRecorder()
	h.InviteList(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST /api/invite/list, got %d", w.Code)
	}
}

// --- Webhook handler edge cases ---

func TestWebhookHandlerWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/webhook/test-hook", nil)
	w := httptest.NewRecorder()
	h.WebhookHandler(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for GET /api/webhook, got %d", w.Code)
	}
}

func TestWebhookHandlerMissingURL(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/webhook/", nil)
	w := httptest.NewRecorder()
	h.WebhookHandler(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing webhook URL, got %d", w.Code)
	}
}

// --- GetMessages / GetOnlineUsers edge cases ---

func TestGetMessagesWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/messages", nil)
	w := httptest.NewRecorder()
	h.GetMessages(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST /api/messages, got %d", w.Code)
	}
}

func TestGetOnlineUsersWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/users/online", nil)
	w := httptest.NewRecorder()
	h.GetOnlineUsers(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST /api/users/online, got %d", w.Code)
	}
}

func TestGetMessagesWithLimitParam(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/messages?limit=50", nil)
	w := httptest.NewRecorder()
	h.GetMessages(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

// --- Helper function tests ---

func TestContentTypeForFilename(t *testing.T) {
	tests := []struct {
		filename string
		want     string
	}{
		{"photo.png", "image/png"},
		{"photo.jpg", "image/jpeg"},
		{"photo.jpeg", "image/jpeg"},
		{"photo.gif", "image/gif"},
		{"photo.webp", "image/webp"},
		{"video.webm", "audio/webm"},
		{"audio.ogg", "audio/ogg"},
		{"audio.mp3", "audio/mpeg"},
		{"audio.wav", "audio/wav"},
		{"audio.m4a", "audio/mp4"},
		{"file.pdf", "application/pdf"},
		{"file.txt", "text/plain; charset=utf-8"},
		{"unknown.xyz", "application/octet-stream"},
	}
	for _, tt := range tests {
		t.Run(tt.filename, func(t *testing.T) {
			got := contentTypeForFilename(tt.filename)
			if got != tt.want {
				t.Errorf("contentTypeForFilename(%q) = %q, want %q", tt.filename, got, tt.want)
			}
		})
	}
}

func TestIsPrivateHost(t *testing.T) {
	tests := []struct {
		host string
		want bool
	}{
		{"127.0.0.1", true},
		{"192.168.1.1", true},
		{"10.0.0.1", true},
		{"172.16.0.1", true},
		{"0.0.0.0", true},
	}
	for _, tt := range tests {
		t.Run(tt.host, func(t *testing.T) {
			got := isPrivateHost(tt.host)
			if got != tt.want {
				t.Errorf("isPrivateHost(%q) = %v, want %v", tt.host, got, tt.want)
			}
		})
	}
}

func TestSanitizeExportName(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"empty", "", "public"},
		{"spaces", "Public Chat", "Public_Chat"},
		{"slash", "test/name", "test_name"},
		{"angle brackets", "a<b>c", "a_b_c"},
		{"colon", "test:file", "test_file"},
		{"chinese chars", "测试", "测试"},
		{"special chars", "Hello@World!", "Hello_World_"},
		{"alphanumeric and dash", "chat-2024_01", "chat-2024_01"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeExportName(tt.input)
			if got != tt.want {
				t.Errorf("sanitizeExportName(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

// --- UploadEmoji edge cases ---

func TestUploadEmojiWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/emoji/upload", nil)
	w := httptest.NewRecorder()
	h.UploadEmoji(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for GET /api/emoji/upload, got %d", w.Code)
	}
}

func TestUploadEmojiInvalidFileType(t *testing.T) {
	h := newTestHandler()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "readme.txt")
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	if _, err := part.Write([]byte("not an image")); err != nil {
		t.Fatalf("failed to write test payload: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/emoji/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()

	h.UploadEmoji(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400 for .txt emoji upload, got %d", resp.StatusCode)
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}
	if payload["code"] != "INVALID_FILE_TYPE" {
		t.Errorf("expected code INVALID_FILE_TYPE, got %q", payload["code"])
	}
}

// --- ServeEmoji edge cases ---

func TestServeEmojiRootPath(t *testing.T) {
	h := newTestHandler()
	h.mediaStore = &failingMediaStore{}

	req := httptest.NewRequest(http.MethodGet, "/uploads/emojis/", nil)
	w := httptest.NewRecorder()
	h.ServeEmoji(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for /uploads/emojis/, got %d", w.Code)
	}
}

func TestServeEmojiNonexistentFile(t *testing.T) {
	h := newTestHandler()
	h.mediaStore = &failingMediaStore{}

	req := httptest.NewRequest(http.MethodGet, "/uploads/emojis/nonexistent.gif", nil)
	w := httptest.NewRecorder()
	h.ServeEmoji(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for nonexistent emoji, got %d", w.Code)
	}
}

// --- LoggingMiddleware tests ---

func TestLoggingMiddlewareRequestID(t *testing.T) {
	var capturedReqID string
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedReqID = requestIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	wrapped := LoggingMiddleware(inner)

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)

	if capturedReqID == "" {
		t.Error("expected non-empty request_id in context")
	}
	if len(capturedReqID) != 8 {
		t.Errorf("expected 8-character request_id (UUID[:8]), got %q (len=%d)", capturedReqID, len(capturedReqID))
	}
}

func TestLoggingMiddlewareRequestIDInError(t *testing.T) {
	h := newTestHandler()

	// Wrap GetMessages with LoggingMiddleware so request_id is injected into context.
	wrapped := LoggingMiddleware(http.HandlerFunc(h.GetMessages))

	// POST to trigger method-not-allowed error response.
	req := httptest.NewRequest(http.MethodPost, "/api/messages", nil)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON error: %v", err)
	}

	reqID, _ := body["request_id"].(string)
	if reqID == "" {
		t.Error("expected non-empty request_id in error response JSON")
	}
	if len(reqID) != 8 {
		t.Errorf("expected 8-character request_id, got %q (len=%d)", reqID, len(reqID))
	}
	if body["code"] != "METHOD_NOT_ALLOWED" {
		t.Errorf("expected code METHOD_NOT_ALLOWED, got %q", body["code"])
	}
}

// --- CORSMiddleware additional cases ---

func TestCORSWildcardAll(t *testing.T) {
	os.Setenv("CHAT_ALLOWED_ORIGINS", "*")
	defer os.Unsetenv("CHAT_ALLOWED_ORIGINS")

	handler := CORSMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	t.Run("any origin allowed with wildcard", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Origin", "https://any-random-domain.io")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.Header.Get("Access-Control-Allow-Origin") != "https://any-random-domain.io" {
			t.Errorf("expected wildcard to echo origin, got %q",
				resp.Header.Get("Access-Control-Allow-Origin"))
		}
	})

	t.Run("different origin also allowed with wildcard", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Origin", "https://completely-different.example")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.Header.Get("Access-Control-Allow-Origin") != "https://completely-different.example" {
			t.Errorf("expected wildcard to echo any origin, got %q",
				resp.Header.Get("Access-Control-Allow-Origin"))
		}
	})

	t.Run("same-origin still works with wildcard", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		// No Origin header (same-origin).
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		// Same-origin requests with wildcard: the origin==“” branch sets allow=true,
		// and then Access-Control-Allow-Origin is set to "" (empty).
		if resp.Header.Get("Access-Control-Allow-Origin") != "" {
			t.Error("expected empty Access-Control-Allow-Origin for same-origin with wildcard")
		}
	})
}

// --- GetMessages additional cases ---

func TestGetMessagesWithBeforeParam(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/messages?before=1700000000000", nil)
	w := httptest.NewRecorder()
	h.GetMessages(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 with valid before param, got %d", w.Code)
	}

	// Verify response is valid JSON with messages array.
	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if _, ok := body["messages"]; !ok {
		t.Error("expected 'messages' key in response")
	}
}

func TestGetMessagesWithInvalidBefore(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/messages?before=not-a-number", nil)
	w := httptest.NewRecorder()
	h.GetMessages(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 when invalid before is silently ignored, got %d", w.Code)
	}

	// Verify response is still valid JSON with messages array.
	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if _, ok := body["messages"]; !ok {
		t.Error("expected 'messages' key in response with invalid before")
	}
}

func TestGetMessagesWithLimitAndBefore(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/messages?limit=10&before=1700000000000", nil)
	w := httptest.NewRecorder()
	h.GetMessages(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 with limit and before params, got %d", w.Code)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if _, ok := body["messages"]; !ok {
		t.Error("expected 'messages' key in response")
	}
}

// --- Auth endpoint deep tests ---

// mockStoreUsernameTaken is a mockStore that returns "already registered" from RegisterUser.
type mockStoreUsernameTaken struct {
	mockStore
}

func (m *mockStoreUsernameTaken) RegisterUser(username, passwordHash, inviteCode string) error {
	return errors.New("already registered")
}

func newTestHandlerWithUsernameTaken() *Handler {
	ms := &mockStoreUsernameTaken{}
	h := hub.New(ms, nil, nil, "")
	go h.Run()
	return New(h, ms, "/tmp/test-uploads")
}

func TestInviteGenerateInvalidJSON(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	body := `{invalid`
	req := httptest.NewRequest(http.MethodPost, "/api/invite/generate", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.3:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.InviteGenerate(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "INVALID_JSON" {
		t.Errorf("expected code INVALID_JSON, got %q", result["code"])
	}
}

func TestRegisterInvalidJSON(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	body := `{broken`
	req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.4:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "INVALID_JSON" {
		t.Errorf("expected code INVALID_JSON, got %q", result["code"])
	}
}

func TestRegisterEmptyInviteCode(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	body := `{"username":"alice","password":"secret123","invite_code":""}`
	req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.5:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "MISSING_INVITE_CODE" {
		t.Errorf("expected code MISSING_INVITE_CODE, got %q", result["code"])
	}
}

func TestRegisterUsernameAlreadyTaken(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandlerWithUsernameTaken()

	body := `{"username":"alice","password":"secret123","invite_code":"VALIDCODE"}`
	req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.6:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("expected status 409, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "USERNAME_TAKEN" {
		t.Errorf("expected code USERNAME_TAKEN, got %q", result["code"])
	}
}

func TestLoginInvalidJSON(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	body := `not-json`
	req := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.7:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "INVALID_JSON" {
		t.Errorf("expected code INVALID_JSON, got %q", result["code"])
	}
}

func TestLoginEmptyUsername(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	body := `{"username":"","password":"secret123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.8:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "MISSING_FIELDS" {
		t.Errorf("expected code MISSING_FIELDS, got %q", result["code"])
	}
}

func TestLoginEmptyPassword(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	body := `{"username":"alice","password":""}`
	req := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.9:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "MISSING_FIELDS" {
		t.Errorf("expected code MISSING_FIELDS, got %q", result["code"])
	}
}

// --- MediaStore key validation deep tests ---

func TestCleanMediaKeyEdgeCases(t *testing.T) {
	tests := []struct {
		name    string
		key     string
		wantErr bool
	}{
		{"valid simple", "photo.png", false},
		{"valid nested dir", "emojis/smile.png", false},
		{"valid deep nested", "a/b/c/d.png", false},
		{"empty string", "", true},
		{"single dot", ".", true},
		{"double dot", "..", true},
		{"starts with dot slash", "./photo.png", true},
		{"starts with dot dot slash", "../photo.png", true},
		{"bare dot dot in path", "a/../photo.png", true},
		{"bare dot in path", "a/./photo.png", true},
		{"double slash empty segment", "a//photo.png", true},
		{"trailing slash", "photo.png/", true},
		{"leading slash", "/photo.png", false},
		{"backslash traversal", `..\escape.png`, true},
		{"backslash nested ok", `a\b\photo.png`, false},
		{"triple dot ok", ".../photo.png", false},
		{"clean results in dot", "a/..", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := cleanMediaKey(tt.key)
			if (err != nil) != tt.wantErr {
				t.Errorf("cleanMediaKey(%q) error = %v, wantErr = %v", tt.key, err, tt.wantErr)
			}
		})
	}
}

func TestContentTypeForFilenameSVG(t *testing.T) {
	// SVG is not in the explicit switch, falls through to mime.TypeByExtension.
	got := contentTypeForFilename("icon.svg")
	if got != "image/svg+xml" {
		t.Errorf("contentTypeForFilename(icon.svg) = %q, want image/svg+xml", got)
	}
}

func TestContentTypeForFilenameUnknownBinary(t *testing.T) {
	// Unknown extension with no mime mapping falls to application/octet-stream.
	got := contentTypeForFilename("data.bin")
	if got != "application/octet-stream" {
		t.Errorf("contentTypeForFilename(data.bin) = %q, want application/octet-stream", got)
	}
}

// TestLocalMediaStoreSaveAndOpen verifies a full round-trip: Save then Open.
func TestLocalMediaStoreSaveAndOpen(t *testing.T) {
	dir := t.TempDir()
	store := NewLocalMediaStore(dir)

	// Save a file.
	err := store.Save(context.Background(), "hello.txt", "text/plain; charset=utf-8", strings.NewReader("hello world"))
	if err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Verify on-disk file exists.
	if _, err := os.Stat(filepath.Join(dir, "hello.txt")); os.IsNotExist(err) {
		t.Error("expected file to exist on disk after Save")
	}

	// Open and verify round-trip.
	media, err := store.Open(context.Background(), "hello.txt")
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer media.Body.Close()

	body, err := io.ReadAll(media.Body)
	if err != nil {
		t.Fatalf("failed to read body: %v", err)
	}
	if string(body) != "hello world" {
		t.Errorf("expected 'hello world', got %q", string(body))
	}
	if media.ContentType != "text/plain; charset=utf-8" {
		t.Errorf("expected text/plain; charset=utf-8, got %s", media.ContentType)
	}
}

// --- Register validation edge cases ---

// TestRegisterPasswordTooShort verifies that registering with a password
// shorter than 6 characters returns HTTP 400 with code WEAK_PASSWORD.
func TestRegisterPasswordTooShort(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	body := `{"username":"alice","password":"12345","invite_code":"VALIDCODE"}`
	req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.10:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400 for too-short password, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "WEAK_PASSWORD" {
		t.Errorf("expected code WEAK_PASSWORD, got %q", result["code"])
	}
}

// TestRegisterPasswordTooLong verifies that registering with a password
// longer than 72 characters returns HTTP 400 with code PASSWORD_TOO_LONG.
func TestRegisterPasswordTooLong(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	longPassword := strings.Repeat("a", 73)
	body := `{"username":"alice","password":"` + longPassword + `","invite_code":"VALIDCODE"}`
	req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.11:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400 for too-long password, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "PASSWORD_TOO_LONG" {
		t.Errorf("expected code PASSWORD_TOO_LONG, got %q", result["code"])
	}
}

// TestRegisterInvalidUsername verifies that registering with invalid usernames
// (special characters, too long) returns HTTP 400 with code INVALID_USERNAME.
func TestRegisterInvalidUsername(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	tests := []struct {
		name     string
		username string
	}{
		{"special characters", "user@name"},
		{"too long (>20 chars)", "abcdefghijklmnopqrstu"},
		{"empty after trim", "   "},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := `{"username":"` + tt.username + `","password":"secret123","invite_code":"VALIDCODE"}`
			req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(body))
			req.RemoteAddr = "192.0.2.12:1234"
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.Register(w, req)

			resp := w.Result()
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("expected status 400 for username %q, got %d", tt.username, resp.StatusCode)
				return
			}

			var result map[string]interface{}
			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				t.Fatalf("failed to decode JSON: %v", err)
			}
			if result["code"] != "INVALID_USERNAME" {
				t.Errorf("expected code INVALID_USERNAME for %q, got %q", tt.username, result["code"])
			}
		})
	}
}

// --- InviteGenerate default max_uses ---

// mockStoreInviteCapture is a mockStore variant that captures the maxUses
// argument passed to GenerateInviteCode.
type mockStoreInviteCapture struct {
	mockStore
	capturedMaxUses int
}

func (m *mockStoreInviteCapture) GenerateInviteCode(creator string, maxUses int) (string, error) {
	m.capturedMaxUses = maxUses
	return "INVITEDEFAULT", nil
}

func newTestHandlerWithInviteCapture() (*Handler, *mockStoreInviteCapture) {
	ms := &mockStoreInviteCapture{}
	h := hub.New(ms, nil, nil, "")
	go h.Run()
	return New(h, ms, "/tmp/test-uploads"), ms
}

// TestInviteGenerateDefaultMaxUses verifies that when max_uses is omitted or set
// to 0, the handler defaults it to 5 and passes that to the store.
func TestInviteGenerateDefaultMaxUses(t *testing.T) {
	t.Run("max_uses omitted", func(t *testing.T) {
		ResetRateLimiter()
		h, capture := newTestHandlerWithInviteCapture()

		body := `{"username":"alice"}`
		req := httptest.NewRequest(http.MethodPost, "/api/invite/generate", strings.NewReader(body))
		req.RemoteAddr = "192.0.2.20:1234"
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		h.InviteGenerate(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", resp.StatusCode, w.Body.String())
		}

		if capture.capturedMaxUses != 5 {
			t.Errorf("expected default max_uses=5 when omitted, got %d", capture.capturedMaxUses)
		}
	})

	t.Run("max_uses zero", func(t *testing.T) {
		ResetRateLimiter()
		h, capture := newTestHandlerWithInviteCapture()

		body := `{"username":"alice","max_uses":0}`
		req := httptest.NewRequest(http.MethodPost, "/api/invite/generate", strings.NewReader(body))
		req.RemoteAddr = "192.0.2.21:1234"
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		h.InviteGenerate(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", resp.StatusCode, w.Body.String())
		}

		if capture.capturedMaxUses != 5 {
			t.Errorf("expected default max_uses=5 when zero, got %d", capture.capturedMaxUses)
		}
	})

	t.Run("max_uses explicitly set", func(t *testing.T) {
		ResetRateLimiter()
		h, capture := newTestHandlerWithInviteCapture()

		body := `{"username":"alice","max_uses":10}`
		req := httptest.NewRequest(http.MethodPost, "/api/invite/generate", strings.NewReader(body))
		req.RemoteAddr = "192.0.2.22:1234"
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		h.InviteGenerate(w, req)

		resp := w.Result()
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", resp.StatusCode, w.Body.String())
		}

		if capture.capturedMaxUses != 10 {
			t.Errorf("expected max_uses=10 when explicitly set, got %d", capture.capturedMaxUses)
		}
	})
}

// --- Register reserved username tests ---

// TestRegisterReservedUsername verifies that reserved usernames
// ("system", "server", "admin", "moderator", "root") are rejected during
// registration with code RESERVED_USERNAME.
func TestRegisterReservedUsername(t *testing.T) {
	reserved := []string{"system", "server", "admin", "moderator", "root"}
	ips := []string{"192.0.2.50", "192.0.2.51", "192.0.2.52", "192.0.2.53", "192.0.2.54"}
	for i, username := range reserved {
		t.Run(username, func(t *testing.T) {
			ResetRateLimiter()
			h := newTestHandler()

			body := "{\"username\":\"" + username + "\",\"password\":\"secret123\",\"invite_code\":\"VALIDCODE\"}"
			req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(body))
			req.RemoteAddr = ips[i] + ":1234"
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.Register(w, req)

			resp := w.Result()
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("expected status 400 for reserved username %q, got %d", username, resp.StatusCode)
				return
			}

			var result map[string]interface{}
			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				t.Fatalf("failed to decode JSON: %v", err)
			}
			if result["code"] != "RESERVED_USERNAME" {
				t.Errorf("expected code RESERVED_USERNAME for %q, got %q", username, result["code"])
			}
		})
	}
}

// TestLoginLongUsername verifies that Login with a 200-character username
// is handled gracefully without crashing.
func TestLoginLongUsername(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	longUsername := strings.Repeat("a", 200)
	body := "{\"username\":\"" + longUsername + "\",\"password\":\"secret123\"}"
	req := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.60:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	// Should handle gracefully, not crash.
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200 for long username, got %d: %s", resp.StatusCode, w.Body.String())
	}
}

// TestHealthCheckWrongMethod verifies that POST /api/health returns 405.
func TestHealthCheckWrongMethod(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/health", nil)
	w := httptest.NewRecorder()

	h.HealthCheck(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST /api/health, got %d", w.Code)
	}
}

// TestServeUploadPathTraversal verifies that GET /uploads/../something
// returns 404 (path traversal is neutralized by filepath.Base).
func TestServeUploadPathTraversal(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/uploads/../something", nil)
	w := httptest.NewRecorder()
	h.ServeUpload(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for path traversal /uploads/../something, got %d", w.Code)
	}
}

// --- Giphy edge case: empty type defaults to gif ---

// TestGiphySearchEmptyTypeDefaultsToGif verifies that when the type query
// parameter is omitted from GET /api/giphy/search, the handler defaults to
// "gif" and passes validation (reaches fetchGiphy rather than returning 400).
func TestGiphySearchEmptyTypeDefaultsToGif(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/giphy/search?q=cat", nil)
	w := httptest.NewRecorder()
	h.GiphySearch(w, req)

	// Should pass validation — no MISSING_QUERY error. The upstream Giphy
	// call may succeed (200) or fail (502), but must not be a 4xx from our
	// handler's input validation.
	if w.Code == http.StatusBadRequest {
		t.Errorf("expected giphy search with q param to pass validation, got 400: %s", w.Body.String())
	}
	if w.Code == http.StatusMethodNotAllowed {
		t.Errorf("expected giphy search to pass method check, got 405")
	}
}

// --- Giphy edge case: trending with sticker type ---

// TestGiphyTrendingStickerType verifies that GET /api/giphy/trending?type=sticker
// passes validation and maps to the stickers/trending endpoint.
func TestGiphyTrendingStickerType(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/giphy/trending?type=sticker", nil)
	w := httptest.NewRecorder()
	h.GiphyTrending(w, req)

	// type=sticker is valid and maps to stickers/trending endpoint internally.
	// The upstream Giphy call may succeed (200) or fail (502), but must not be
	// a 4xx from handler input validation.
	if w.Code == http.StatusBadRequest {
		t.Errorf("expected giphy trending with type=sticker to pass validation, got 400: %s", w.Body.String())
	}
	if w.Code == http.StatusMethodNotAllowed {
		t.Errorf("expected giphy trending to pass method check, got 405")
	}
}

// --- ExportMessages edge case: very large limit capped at 10000 ---

// mockStoreExportCapture captures the limit argument passed to ExportMessages.
type mockStoreExportCapture struct {
	mockStore
	capturedLimit int
}

func (m *mockStoreExportCapture) ExportMessages(ctx context.Context, roomID, toUser, groupName, username string, limit int) ([]hub.StoredMessage, error) {
	m.capturedLimit = limit
	return nil, nil
}

func newTestHandlerWithExportCapture() (*Handler, *mockStoreExportCapture) {
	ms := &mockStoreExportCapture{}
	h := hub.New(ms, nil, nil, "")
	go h.Run()
	return New(h, ms, "/tmp/test-uploads"), ms
}

// TestExportMessagesVeryLargeLimit verifies that a limit >10000 is capped at 10000
// before being passed to the store.
func TestExportMessagesVeryLargeLimit(t *testing.T) {
	h, capture := newTestHandlerWithExportCapture()

	req := httptest.NewRequest(http.MethodGet, "/api/export?limit=50000&username=alice", nil)
	w := httptest.NewRecorder()
	h.ExportMessages(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for export with large limit, got %d: %s", w.Code, w.Body.String())
	}

	if capture.capturedLimit != 10000 {
		t.Errorf("expected limit capped at 10000, got %d", capture.capturedLimit)
	}
}

// TestExportMessagesWithinLimit verifies that a limit <=10000 is passed through
// unchanged to the store.
func TestExportMessagesWithinLimit(t *testing.T) {
	h, capture := newTestHandlerWithExportCapture()

	req := httptest.NewRequest(http.MethodGet, "/api/export?limit=500&username=alice", nil)
	w := httptest.NewRecorder()
	h.ExportMessages(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for export with limit=500, got %d: %s", w.Code, w.Body.String())
	}

	if capture.capturedLimit != 500 {
		t.Errorf("expected limit 500 passed through, got %d", capture.capturedLimit)
	}
}

// TestExportMessagesZeroLimit verifies that limit=0 results in no limit (0 passed
// through, which means "all messages" at the store layer).
func TestExportMessagesZeroLimit(t *testing.T) {
	h, capture := newTestHandlerWithExportCapture()

	req := httptest.NewRequest(http.MethodGet, "/api/export?limit=0&username=alice", nil)
	w := httptest.NewRecorder()
	h.ExportMessages(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for export with limit=0, got %d: %s", w.Code, w.Body.String())
	}

	// limit=0 means "not set" — the handler skips the parseInt block, so
	// limit stays at its zero value of 0, which the store interprets as
	// "return all messages".
	if capture.capturedLimit != 0 {
		t.Errorf("expected limit 0 (unlimited), got %d", capture.capturedLimit)
	}
}

// --- LinkPreview edge case: http URL explicitly rejected ---

// TestLinkPreviewHTTPURLRejected verifies that an http:// URL (non-https scheme)
// returns 400 with code INVALID_URL, since only https is allowed to prevent SSRF.
func TestLinkPreviewHTTPURLRejected(t *testing.T) {
	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/link-preview?url=http://example.com", nil)
	w := httptest.NewRecorder()
	h.LinkPreview(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for http:// URL, got %d", w.Code)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if body["code"] != "INVALID_URL" {
		t.Errorf("expected code INVALID_URL, got %q", body["code"])
	}
}

// --- ServeUpload edge case: empty / dot filename path ---

// TestServeUploadDotPath verifies that a URL path resolving to "." (no filename)
// returns 404 Not Found.
func TestServeUploadDotPath(t *testing.T) {
	h := newTestHandler()
	h.mediaStore = &failingMediaStore{}

	// /uploads/. → filepath.Base returns "." → 404
	req := httptest.NewRequest(http.MethodGet, "/uploads/.", nil)
	w := httptest.NewRecorder()
	h.ServeUpload(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for /uploads/., got %d", w.Code)
	}
}

// TestServeUploadDoubleSlashPath verifies that a URL path with double slashes
// (empty segment) still resolves safely (filepath.Base collapses it).
func TestServeUploadDoubleSlashPath(t *testing.T) {
	h := newTestHandler()
	h.mediaStore = &failingMediaStore{}

	// /uploads// → double slash resolves to empty segment; filepath.Base
	// returns "." on some platforms or the preceding segment on others.
	// Either way the handler should 404.
	req := httptest.NewRequest(http.MethodGet, "/uploads//", nil)
	w := httptest.NewRecorder()
	h.ServeUpload(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for /uploads//, got %d", w.Code)
	}
}

// --- LoggingMiddleware: preserves existing headers ---

// TestLoggingMiddlewarePreservesExistingHeaders verifies that headers set by
// the inner handler before LoggingMiddleware are preserved in the response.
func TestLoggingMiddlewarePreservesExistingHeaders(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Custom-Header", "test-value")
		w.Header().Set("X-Another", "another-value")
		w.WriteHeader(http.StatusOK)
	})
	wrapped := LoggingMiddleware(inner)

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if got := resp.Header.Get("X-Custom-Header"); got != "test-value" {
		t.Errorf("expected X-Custom-Header 'test-value', got %q", got)
	}
	if got := resp.Header.Get("X-Another"); got != "another-value" {
		t.Errorf("expected X-Another 'another-value', got %q", got)
	}
}

// TestLoggingMiddlewarePreservesSecurityHeaders verifies that
// SecurityHeadersMiddleware headers survive when chained after LoggingMiddleware.
func TestLoggingMiddlewarePreservesSecurityHeaders(t *testing.T) {
	inner := SecurityHeadersMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	wrapped := LoggingMiddleware(inner)

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if got := resp.Header.Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("expected X-Content-Type-Options nosniff after logging middleware, got %q", got)
	}
	if got := resp.Header.Get("X-Frame-Options"); got != "DENY" {
		t.Errorf("expected X-Frame-Options DENY after logging middleware, got %q", got)
	}
}

// --- Register with invalid invite code format ---

// mockStoreInvalidInvite is a mockStore variant that returns an
// "invalid invite code" error from RegisterUser.
type mockStoreInvalidInvite struct {
	mockStore
}

func (m *mockStoreInvalidInvite) RegisterUser(username, passwordHash, inviteCode string) error {
	return errors.New("invalid invite code: bad format")
}

func newTestHandlerWithInvalidInvite() *Handler {
	ms := &mockStoreInvalidInvite{}
	h := hub.New(ms, nil, nil, "")
	go h.Run()
	return New(h, ms, "/tmp/test-uploads")
}

// TestRegisterInvalidInviteCode verifies that Register returns 400 with
// code INVALID_INVITE_CODE when the store rejects the invite code.
func TestRegisterInvalidInviteCode(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandlerWithInvalidInvite()

	body := `{"username":"alice","password":"secret123","invite_code":"BADCODE"}`
	req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.70:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400 for invalid invite code, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "INVALID_INVITE_CODE" {
		t.Errorf("expected code INVALID_INVITE_CODE, got %q", result["code"])
	}
}

// TestHealthCheckAllKeys verifies that the health endpoint JSON response
// contains all three expected keys: status, service, and db.
func TestHealthCheckAllKeys(t *testing.T) {
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
		t.Fatalf("failed to decode JSON: %v", err)
	}

	// Verify all three expected keys.
	expectedKeys := map[string]string{
		"status":  "ok",
		"service": "tokendancechat",
		"db":      "ok",
	}
	for key, wantVal := range expectedKeys {
		got, ok := body[key]
		if !ok {
			t.Errorf("missing key %q in health response", key)
			continue
		}
		if got != wantVal {
			t.Errorf("health[%q] = %v, want %q", key, got, wantVal)
		}
	}

	// Verify no unexpected keys.
	if len(body) != len(expectedKeys) {
		t.Errorf("expected %d keys in health response, got %d", len(expectedKeys), len(body))
	}
}

// TestCORSPreflightOnAPIEndpoint verifies that an OPTIONS request to an
// API endpoint returns 204 with proper CORS headers.
func TestCORSPreflightOnAPIEndpoint(t *testing.T) {
	corsHandler := CORSMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/api/health", nil)
	req.Header.Set("Origin", "https://chat.example.com")
	req.Header.Set("Access-Control-Request-Method", "GET")
	w := httptest.NewRecorder()

	corsHandler.ServeHTTP(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("expected status 204 for OPTIONS preflight, got %d", resp.StatusCode)
	}

	if resp.Header.Get("Access-Control-Allow-Methods") != "GET, POST, OPTIONS" {
		t.Errorf("missing or wrong Access-Control-Allow-Methods: %q",
			resp.Header.Get("Access-Control-Allow-Methods"))
	}

	if resp.Header.Get("Access-Control-Allow-Headers") == "" {
		t.Error("expected Access-Control-Allow-Headers to be set on preflight")
	}
}

// TestRateLimitMiddlewareReturns429 verifies that the API rate limit
// middleware returns HTTP 429 with code RATE_LIMITED and Retry-After
// header after 30 requests from the same IP.
func TestRateLimitMiddlewareReturns429(t *testing.T) {
	ResetRateLimiter()

	wrapped := RateLimitMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))

	ip := "203.0.113.200:12345"

	// First 30 requests should pass.
	for i := 0; i < 30; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		req.RemoteAddr = ip
		w := httptest.NewRecorder()
		wrapped.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("request %d: expected 200, got %d", i+1, w.Code)
		}
	}

	// 31st request should return 429.
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.RemoteAddr = ip
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429 Too Many Requests, got %d", w.Code)
	}

	if w.Header().Get("Retry-After") != "60" {
		t.Errorf("expected Retry-After: 60, got %q", w.Header().Get("Retry-After"))
	}

	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", ct)
	}

	body := w.Body.String()
	if !strings.Contains(body, "RATE_LIMITED") {
		t.Errorf("expected response body to contain RATE_LIMITED, got %q", body)
	}
}


// =============================================================================
// Login flow tests
// =============================================================================

// mockStoreLoginFail has VerifyUser always return false, simulating wrong
// password or non-existent user (the handler returns 401 for both).
type mockStoreLoginFail struct {
	mockStore
}

func (m *mockStoreLoginFail) VerifyUser(username, password string) (bool, error) {
	return false, nil
}

func newTestHandlerLoginFail() *Handler {
	ms := &mockStoreLoginFail{}
	h := hub.New(ms, nil, nil, "")
	go h.Run()
	return New(h, ms, "/tmp/test-uploads")
}

// TestLoginSuccess verifies that POST /api/login with valid credentials
// returns 200 and a success response with the username.
func TestLoginSuccess(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	body := `{"username":"alice","password":"secret123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.100:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", resp.StatusCode, w.Body.String())
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["success"] != true {
		t.Error("expected success=true in login response")
	}
	if result["username"] != "alice" {
		t.Errorf("expected username 'alice', got %v", result["username"])
	}
}

// TestLoginWrongPassword verifies that POST /api/login with an incorrect
// password returns 401 with code INVALID_CREDENTIALS.
func TestLoginWrongPassword(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandlerLoginFail()

	body := `{"username":"alice","password":"wrongpassword"}`
	req := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.101:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "INVALID_CREDENTIALS" {
		t.Errorf("expected code INVALID_CREDENTIALS, got %q", result["code"])
	}
}

// TestLoginNonExistentUser verifies that POST /api/login for a user that does
// not exist returns 401 (the handler does not distinguish between wrong
// password and non-existent user at the HTTP level).
func TestLoginNonExistentUser(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandlerLoginFail()

	body := `{"username":"nosuchuser","password":"secret123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.102:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["code"] != "INVALID_CREDENTIALS" {
		t.Errorf("expected code INVALID_CREDENTIALS, got %q", result["code"])
	}
}

// =============================================================================
// Register flow tests
// =============================================================================

// TestRegisterSuccess verifies that POST /api/register with valid fields
// returns 201 Created with success=true and the username.
func TestRegisterSuccess(t *testing.T) {
	ResetRateLimiter()
	h := newTestHandler()

	body := `{"username":"newuser","password":"secret123","invite_code":"VALIDCODE"}`
	req := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.110:1234"
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected status 201, got %d: %s", resp.StatusCode, w.Body.String())
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if result["success"] != true {
		t.Error("expected success=true in register response")
	}
	if result["username"] != "newuser" {
		t.Errorf("expected username 'newuser', got %v", result["username"])
	}
}

// =============================================================================
// DM operation tests (via WebSocket)
// =============================================================================

// wsDrainUntil reads WebSocket messages until one with the given type is found.
// Returns the message and true, or zero-value and false on timeout/error.
func wsDrainUntil(conn *websocket.Conn, wantType string, timeout time.Duration) (hub.Message, bool) {
	conn.SetReadDeadline(time.Now().Add(timeout))
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return hub.Message{}, false
		}
		var msg hub.Message
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		if msg.Type == wantType {
			return msg, true
		}
	}
}

// wsSkipUntil reads and discards WebSocket messages until one with the given type.
func wsSkipUntil(conn *websocket.Conn, wantType string, timeout time.Duration) {
	wsDrainUntil(conn, wantType, timeout)
}

// wsJoin sends a join message and drains until the user_joined broadcast.
func wsJoin(conn *websocket.Conn, username string) {
	conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"join","username":"`+username+`"}`))
	wsSkipUntil(conn, "user_joined", 5*time.Second)
}

// TestDMSend verifies that sending a DM via WebSocket delivers the message
// to the recipient and echoes it back to the sender.
func TestDMSend(t *testing.T) {
	h := newTestHandler()
	srv := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	alice, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("alice dial failed: %v", err)
	}
	defer alice.Close()

	bob, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("bob dial failed: %v", err)
	}
	defer bob.Close()

	wsJoin(alice, "alice")
	wsJoin(bob, "bob")

	// Alice sends DM to Bob.
	alice.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := alice.WriteMessage(websocket.TextMessage, []byte(`{"type":"dm_message","content":"Hi Bob","to":"bob"}`)); err != nil {
		t.Fatalf("alice write failed: %v", err)
	}

	// Alice should receive echo of her DM.
	echo, ok := wsDrainUntil(alice, "dm_message", 5*time.Second)
	if !ok {
		t.Fatal("alice did not receive echo of her DM")
	}
	if echo.Content != "Hi Bob" {
		t.Errorf("alice echo content = %q, want 'Hi Bob'", echo.Content)
	}

	// Bob should receive the DM.
	dm, ok := wsDrainUntil(bob, "dm_message", 5*time.Second)
	if !ok {
		t.Fatal("bob did not receive DM from alice")
	}
	if dm.Content != "Hi Bob" {
		t.Errorf("bob DM content = %q, want 'Hi Bob'", dm.Content)
	}
	if dm.From != "alice" {
		t.Errorf("bob DM from = %q, want 'alice'", dm.From)
	}
}

// mockStoreBlocking tracks blocks in memory so that BlockUser and IsBlocked
// work correctly during DM blocked-user tests.
type mockStoreBlocking struct {
	mockStore
	blocked map[string]map[string]bool
}

func (m *mockStoreBlocking) BlockUser(username, blocked string) error {
	if m.blocked == nil {
		m.blocked = make(map[string]map[string]bool)
	}
	if m.blocked[username] == nil {
		m.blocked[username] = make(map[string]bool)
	}
	m.blocked[username][blocked] = true
	return nil
}

func (m *mockStoreBlocking) UnblockUser(username, blocked string) error {
	if m.blocked != nil && m.blocked[username] != nil {
		delete(m.blocked[username], blocked)
	}
	return nil
}

func (m *mockStoreBlocking) IsBlocked(username, blocked string) bool {
	if m.blocked == nil || m.blocked[username] == nil {
		return false
	}
	return m.blocked[username][blocked]
}

func (m *mockStoreBlocking) GetBlockedUsers(username string) []string {
	if m.blocked == nil || m.blocked[username] == nil {
		return nil
	}
	var users []string
	for u := range m.blocked[username] {
		users = append(users, u)
	}
	return users
}

func newTestHandlerBlocking() *Handler {
	ms := &mockStoreBlocking{}
	h := hub.New(ms, nil, nil, "")
	go h.Run()
	return New(h, ms, "/tmp/test-uploads")
}

// TestDMBlockedUser verifies that when Alice blocks Bob, Bob's DM to Alice
// is silently dropped and Alice does not receive it.
func TestDMBlockedUser(t *testing.T) {
	h := newTestHandlerBlocking()
	srv := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	alice, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("alice dial failed: %v", err)
	}
	defer alice.Close()

	bob, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("bob dial failed: %v", err)
	}
	defer bob.Close()

	wsJoin(alice, "alice")
	wsJoin(bob, "bob")

	// Alice blocks Bob.
	alice.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := alice.WriteMessage(websocket.TextMessage, []byte(`{"type":"block","username":"bob"}`)); err != nil {
		t.Fatalf("alice block write failed: %v", err)
	}

	// Alice should receive block confirmation.
	blockConfirm, ok := wsDrainUntil(alice, "block", 5*time.Second)
	if !ok {
		t.Fatal("alice did not receive block confirmation")
	}
	if blockConfirm.Username != "bob" {
		t.Errorf("expected blocked username 'bob', got %q", blockConfirm.Username)
	}

	// Bob sends DM to Alice (should be silently dropped since Alice blocked Bob).
	bob.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := bob.WriteMessage(websocket.TextMessage, []byte(`{"type":"dm_message","content":"Are you there?","to":"alice"}`)); err != nil {
		t.Fatalf("bob write failed: %v", err)
	}

	// Alice should NOT receive the DM.
	alice.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		_, data, err := alice.ReadMessage()
		if err != nil {
			break // timeout means no message — success
		}
		var msg hub.Message
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		if msg.Type == "dm_message" && msg.From == "bob" {
			t.Error("alice received DM from bob despite having blocked him")
			break
		}
	}
}

// TestDMToSelf verifies that sending a DM to oneself is silently dropped
// (no echo, no delivery).
func TestDMToSelf(t *testing.T) {
	h := newTestHandler()
	srv := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	alice, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("alice dial failed: %v", err)
	}
	defer alice.Close()

	wsJoin(alice, "alice")

	// Alice sends DM to herself.
	alice.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := alice.WriteMessage(websocket.TextMessage, []byte(`{"type":"dm_message","content":"Self note","to":"alice"}`)); err != nil {
		t.Fatalf("alice write failed: %v", err)
	}

	// Alice should NOT receive any dm_message (self-DM is dropped).
	alice.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		_, data, err := alice.ReadMessage()
		if err != nil {
			break // timeout with no dm_message — success
		}
		var msg hub.Message
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		if msg.Type == "dm_message" && msg.To == "alice" && msg.From == "alice" {
			t.Error("alice received DM to self, should have been dropped")
			break
		}
	}
}

// =============================================================================
// Group operation tests (via WebSocket)
// =============================================================================

// TestGroupCreateValid verifies that creating a group with a valid name
// returns a group_create confirmation message.
func TestGroupCreateValid(t *testing.T) {
	h := newTestHandler()
	srv := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	alice, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("alice dial failed: %v", err)
	}
	defer alice.Close()

	wsJoin(alice, "alice")

	alice.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := alice.WriteMessage(websocket.TextMessage, []byte(`{"type":"group_create","group":"DevTeam"}`)); err != nil {
		t.Fatalf("alice write failed: %v", err)
	}

	msg, ok := wsDrainUntil(alice, "group_create", 5*time.Second)
	if !ok {
		t.Fatal("alice did not receive group_create confirmation")
	}
	if msg.Group != "DevTeam" {
		t.Errorf("expected group 'DevTeam', got %q", msg.Group)
	}
	if len(msg.Members) == 0 {
		t.Error("expected non-empty members list after group create")
	}
}

// TestGroupCreateInvalidName verifies that creating a group with an invalid
// name returns an error with code INVALID_GROUP_NAME.
func TestGroupCreateInvalidName(t *testing.T) {
	h := newTestHandler()
	srv := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	alice, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("alice dial failed: %v", err)
	}
	defer alice.Close()

	wsJoin(alice, "alice")

	tests := []struct {
		name      string
		groupName string
	}{
		{"empty name", ""},
		{"too long >30 chars", "abcdefghijklmnopqrstuvwxyz12345"},
		{"special characters", "Dev@Team!"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			alice.SetWriteDeadline(time.Now().Add(5 * time.Second))
			body := `{"type":"group_create","group":"` + tt.groupName + `"}`
			if err := alice.WriteMessage(websocket.TextMessage, []byte(body)); err != nil {
				t.Fatalf("alice write failed: %v", err)
			}

			msg, ok := wsDrainUntil(alice, "error", 5*time.Second)
			if !ok {
				t.Fatal("expected error message for invalid group name")
			}
			if msg.ErrorCode != "INVALID_GROUP_NAME" {
				t.Errorf("expected code INVALID_GROUP_NAME, got %q", msg.ErrorCode)
			}
		})
	}
}

// TestGroupCreateDuplicateName verifies that creating a group with a name that
// already exists returns an error with code GROUP_EXISTS.
func TestGroupCreateDuplicateName(t *testing.T) {
	h := newTestHandler()
	srv := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	alice, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("alice dial failed: %v", err)
	}
	defer alice.Close()

	wsJoin(alice, "alice")

	// First create succeeds.
	alice.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := alice.WriteMessage(websocket.TextMessage, []byte(`{"type":"group_create","group":"MyGroup"}`)); err != nil {
		t.Fatalf("first group_create write failed: %v", err)
	}
	_, ok := wsDrainUntil(alice, "group_create", 5*time.Second)
	if !ok {
		t.Fatal("first group_create did not succeed")
	}

	// Second create with same name should fail.
	alice.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := alice.WriteMessage(websocket.TextMessage, []byte(`{"type":"group_create","group":"MyGroup"}`)); err != nil {
		t.Fatalf("second group_create write failed: %v", err)
	}

	errMsg, ok := wsDrainUntil(alice, "error", 5*time.Second)
	if !ok {
		t.Fatal("expected error for duplicate group name")
	}
	if errMsg.ErrorCode != "GROUP_EXISTS" {
		t.Errorf("expected code GROUP_EXISTS, got %q", errMsg.ErrorCode)
	}
}

// TestGroupAddMember verifies the invite+accept flow: Alice creates a group,
// invites Bob, Bob accepts, and both receive group_join.
func TestGroupAddMember(t *testing.T) {
	h := newTestHandler()
	srv := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	alice, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("alice dial failed: %v", err)
	}
	defer alice.Close()

	bob, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("bob dial failed: %v", err)
	}
	defer bob.Close()

	wsJoin(alice, "alice")
	wsJoin(bob, "bob")

	// Alice creates a group.
	alice.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := alice.WriteMessage(websocket.TextMessage, []byte(`{"type":"group_create","group":"StudyGroup"}`)); err != nil {
		t.Fatalf("group_create write failed: %v", err)
	}
	_, ok := wsDrainUntil(alice, "group_create", 5*time.Second)
	if !ok {
		t.Fatal("group_create did not succeed")
	}

	// Alice invites Bob.
	alice.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := alice.WriteMessage(websocket.TextMessage, []byte(`{"type":"group_invite","group":"StudyGroup","username":"bob"}`)); err != nil {
		t.Fatalf("group_invite write failed: %v", err)
	}

	// Bob receives the invite.
	invite, ok := wsDrainUntil(bob, "group_invite", 5*time.Second)
	if !ok {
		t.Fatal("bob did not receive group_invite")
	}
	if invite.Group != "StudyGroup" {
		t.Errorf("invite group = %q, want 'StudyGroup'", invite.Group)
	}

	// Bob accepts the invite.
	bob.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := bob.WriteMessage(websocket.TextMessage, []byte(`{"type":"group_invite_accept","group":"StudyGroup","from":"alice"}`)); err != nil {
		t.Fatalf("group_invite_accept write failed: %v", err)
	}

	// Bob receives group_join.
	bobJoin, ok := wsDrainUntil(bob, "group_join", 5*time.Second)
	if !ok {
		t.Fatal("bob did not receive group_join")
	}
	if bobJoin.Group != "StudyGroup" {
		t.Errorf("bob join group = %q, want 'StudyGroup'", bobJoin.Group)
	}

	// Alice also receives group_join for Bob.
	aliceJoin, ok := wsDrainUntil(alice, "group_join", 5*time.Second)
	if !ok {
		t.Fatal("alice did not receive group_join for bob")
	}
	if aliceJoin.Group != "StudyGroup" {
		t.Errorf("alice join group = %q, want 'StudyGroup'", aliceJoin.Group)
	}
}

// TestGroupRemoveMember verifies that a member can leave a group: Alice
// creates a group, invites Bob who accepts. Bob then leaves the group
// and both receive group_leave notifications.
func TestGroupRemoveMember(t *testing.T) {
	h := newTestHandler()
	srv := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	alice, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("alice dial failed: %v", err)
	}
	defer alice.Close()

	bob, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("bob dial failed: %v", err)
	}
	defer bob.Close()

	wsJoin(alice, "alice")
	wsJoin(bob, "bob")

	// Alice creates a group.
	alice.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := alice.WriteMessage(websocket.TextMessage, []byte(`{"type":"group_create","group":"TempGroup"}`)); err != nil {
		t.Fatalf("group_create write failed: %v", err)
	}
	wsSkipUntil(alice, "group_create", 5*time.Second)

	// Alice invites Bob and Bob accepts.
	alice.SetWriteDeadline(time.Now().Add(5 * time.Second))
	alice.WriteMessage(websocket.TextMessage, []byte(`{"type":"group_invite","group":"TempGroup","username":"bob"}`))
	wsSkipUntil(bob, "group_invite", 5*time.Second)

	bob.SetWriteDeadline(time.Now().Add(5 * time.Second))
	bob.WriteMessage(websocket.TextMessage, []byte(`{"type":"group_invite_accept","group":"TempGroup","from":"alice"}`))
	wsSkipUntil(bob, "group_join", 5*time.Second)
	wsSkipUntil(alice, "group_join", 5*time.Second)

	// Bob leaves the group.
	bob.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := bob.WriteMessage(websocket.TextMessage, []byte(`{"type":"group_leave","group":"TempGroup"}`)); err != nil {
		t.Fatalf("group_leave write failed: %v", err)
	}

	// Bob should receive group_member_left confirmation.
	bobLeave, ok := wsDrainUntil(bob, "group_member_left", 5*time.Second)
	if !ok {
		t.Fatal("bob did not receive group_member_left confirmation")
	}
	if bobLeave.Group != "TempGroup" {
		t.Errorf("bob leave group = %q, want 'TempGroup'", bobLeave.Group)
	}

	// Alice should also receive group_member_left notification.
	aliceLeave, ok := wsDrainUntil(alice, "group_member_left", 5*time.Second)
	if !ok {
		t.Fatal("alice did not receive group_member_left notification")
	}
	if aliceLeave.Group != "TempGroup" {
		t.Errorf("alice leave group = %q, want 'TempGroup'", aliceLeave.Group)
	}
}
