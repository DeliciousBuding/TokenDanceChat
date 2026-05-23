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
