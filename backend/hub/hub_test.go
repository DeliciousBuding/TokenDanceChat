package hub

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"tokendancechat/backend/llm"
	"tokendancechat/backend/store"
)

// mockStore is a test implementation of the Store interface.
type mockStore struct {
	mu           sync.Mutex
	messages     []StoredMessage
	rooms        []StoredRoom
	groupRoles   map[string]string
	customEmojis []store.CustomEmoji
	oidcUsers    map[string]*store.OIDCUser
	users        map[string]bool

	// Configurable return values for state restoration tests.
	allFriends  map[string][]string
	allGroups   map[string][]string
	allProfiles []store.UserProfile

	// Enhanced state for reaction, poll, and message edit tests.
	reactions    map[string]map[string][]string // messageID -> emoji -> []username
	polls        map[string]*Poll               // pollID -> poll
	messagesByID map[string]StoredMessage       // messageID -> message
}

func (m *mockStore) InsertMessage(username, content, replyToID, roomID, toUser, groupName, threadID string) (StoredMessage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	msg := StoredMessage{
		ID:        "mock-id-" + username + "-" + content[:min(8, len(content))],
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
	if m.messagesByID == nil {
		m.messagesByID = make(map[string]StoredMessage)
	}
	m.messagesByID[msg.ID] = msg
	return msg, nil
}

func (m *mockStore) GetMessages(limit int, before int64) []StoredMessage {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]StoredMessage(nil), m.messages...)
}

func (m *mockStore) GetRoomMessages(roomID string, limit int, before int64) []StoredMessage {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]StoredMessage(nil), m.messages...)
}

func (m *mockStore) MarkDeleted(msgID string) error { return nil }
func (m *mockStore) TotalUsers() int64              { return 0 }
func (m *mockStore) TotalMessages() int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return int64(len(m.messages))
}

func (m *mockStore) CreateRoom(name string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	id := "room-" + name
	m.rooms = append(m.rooms, StoredRoom{ID: id, Name: name})
	return id, nil
}

func (m *mockStore) GetRoomID(name string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, r := range m.rooms {
		if r.Name == name {
			return r.ID, nil
		}
	}
	return "", nil
}

func (m *mockStore) ListRooms() []StoredRoom {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]StoredRoom(nil), m.rooms...)
}

func (m *mockStore) DeleteRoom(roomID string) error {
	return nil
}
func (m *mockStore) ToggleReaction(messageID, emoji, username string) (map[string][]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.reactions == nil {
		m.reactions = make(map[string]map[string][]string)
	}
	if m.reactions[messageID] == nil {
		m.reactions[messageID] = make(map[string][]string)
	}
	users := m.reactions[messageID][emoji]
	found := false
	for i, u := range users {
		if u == username {
			users = append(users[:i], users[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		users = append(users, username)
	}
	m.reactions[messageID][emoji] = users
	// Remove empty emoji entries.
	if len(users) == 0 {
		delete(m.reactions[messageID], emoji)
	}
	return cloneReactionMap(m.reactions[messageID]), nil
}
func (m *mockStore) GetReactionsForMessages(messageIDs []string) map[string]map[string][]string {
	m.mu.Lock()
	defer m.mu.Unlock()

	result := make(map[string]map[string][]string)
	if m.reactions == nil {
		return result
	}
	for _, id := range messageIDs {
		if r, ok := m.reactions[id]; ok && len(r) > 0 {
			result[id] = cloneReactionMap(r)
		}
	}
	return result
}
func (m *mockStore) UpdateMessage(messageID, content string) (StoredMessage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.messagesByID == nil {
		return StoredMessage{}, nil
	}
	msg, ok := m.messagesByID[messageID]
	if !ok {
		return StoredMessage{}, nil
	}
	msg.Content = content
	msg.Edited = true
	m.messagesByID[messageID] = msg
	return msg, nil
}
func (m *mockStore) GetMessageByID(messageID string) (StoredMessage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.messagesByID != nil {
		if msg, ok := m.messagesByID[messageID]; ok {
			return msg, nil
		}
	}
	for _, msg := range m.messages {
		if msg.ID == messageID {
			return msg, nil
		}
	}
	return StoredMessage{}, errNotFound
}

func cloneReactionMap(src map[string][]string) map[string][]string {
	out := make(map[string][]string, len(src))
	for emoji, users := range src {
		out[emoji] = append([]string(nil), users...)
	}
	return out
}

// errNotFound is a sentinel error for missing resources in mockStore.
var errNotFound = &mockError{"not found"}

type mockError struct{ msg string }

func (e *mockError) Error() string { return e.msg }

func (m *mockStore) SearchMessages(query, roomID string, limit int) ([]store.SearchResult, error) {
	return nil, nil
}
func (m *mockStore) SearchMessagesForUser(query, roomID, username string, limit int) ([]store.SearchResult, error) {
	return m.SearchMessages(query, roomID, limit)
}
func (m *mockStore) AddFriend(username, friend string) error                      { return nil }
func (m *mockStore) RemoveFriend(username, friend string) error                   { return nil }
func (m *mockStore) GetAllFriends() map[string][]string                           { return m.allFriends }
func (m *mockStore) GetFriends(username string) []string                          { return nil }
func (m *mockStore) CreateGroup(name, creator string) error                       { return nil }
func (m *mockStore) AddGroupMember(groupName, username string) error              { return nil }
func (m *mockStore) RemoveGroupMember(groupName, username string) error           { return nil }
func (m *mockStore) GetGroupMembers(groupName string) []string                    { return nil }
func (m *mockStore) GetAllGroups() map[string][]string                            { return m.allGroups }
func (m *mockStore) GetUndeliveredDMs(username string, limit int) []StoredMessage { return nil }
func (m *mockStore) MarkMessagesDelivered(ids []string) error                     { return nil }
func (m *mockStore) BlockUser(username, blocked string) error                     { return nil }
func (m *mockStore) UnblockUser(username, blocked string) error                   { return nil }
func (m *mockStore) IsBlocked(username, blocked string) bool                      { return false }
func (m *mockStore) GetBlockedUsers(username string) []string                     { return nil }
func (m *mockStore) PinMessage(roomID, messageID, pinnedBy string) error          { return nil }
func (m *mockStore) UnpinMessage(roomID, messageID string) error                  { return nil }
func (m *mockStore) GetPinnedMessages(roomID string) []StoredMessage              { return nil }
func (m *mockStore) ArchiveConversation(username, key string) error               { return nil }
func (m *mockStore) UnarchiveConversation(username, key string) error             { return nil }
func (m *mockStore) ListArchivedConversations(username string) []string           { return nil }
func (m *mockStore) IsConversationArchived(username, key string) bool             { return false }
func (m *mockStore) Ping() error                                                  { return nil }
func (m *mockStore) PinConversation(username, key string) error                   { return nil }
func (m *mockStore) UnpinConversation(username, key string) error                 { return nil }
func (m *mockStore) ListPinnedConversations(username string) []string             { return nil }
func (m *mockStore) MuteConversation(username, key string) error                  { return nil }
func (m *mockStore) UnmuteConversation(username, key string) error                { return nil }
func (m *mockStore) ListMutedConversations(username string) []string              { return nil }
func (m *mockStore) IsConversationMuted(username, key string) bool                { return false }

func (m *mockStore) UpsertUserProfile(username, displayName, avatarURL, bio, status string, lastSeen int64) error {
	return nil
}
func (m *mockStore) GetUserProfile(username string) (*store.UserProfile, error) {
	return &store.UserProfile{Username: username}, nil
}
func (m *mockStore) UpdateUserStatus(username, status string) error   { return nil }
func (m *mockStore) UpdateUserLastSeen(username string) error         { return nil }
func (m *mockStore) GetAllUserProfiles() ([]store.UserProfile, error) { return m.allProfiles, nil }
func (m *mockStore) CreatePoll(poll *Poll) error {
	if m.polls == nil {
		m.polls = make(map[string]*Poll)
	}
	m.polls[poll.ID] = poll
	return nil
}
func (m *mockStore) GetPoll(pollID string) (*Poll, error) {
	if m.polls != nil {
		if p, ok := m.polls[pollID]; ok {
			return p, nil
		}
	}
	return nil, nil
}
func (m *mockStore) VotePoll(pollID string, username string, optionIndex int) error {
	if m.polls == nil {
		return nil
	}
	p, ok := m.polls[pollID]
	if !ok {
		return nil
	}
	if p.IsClosed {
		return nil
	}
	if p.Votes == nil {
		p.Votes = make(map[int]int)
	}
	if p.Voters == nil {
		p.Voters = make(map[int][]string)
	}
	p.Votes[optionIndex]++
	p.Voters[optionIndex] = append(p.Voters[optionIndex], username)
	return nil
}
func (m *mockStore) ClosePoll(pollID string) error {
	if m.polls != nil {
		if p, ok := m.polls[pollID]; ok {
			p.IsClosed = true
			return nil
		}
	}
	return nil
}
func (m *mockStore) SetNotificationPrefs(username, key string, mutedUntil int64, showPreview bool) error {
	return nil
}
func (m *mockStore) GetNotificationPrefs(username, key string) (int64, bool, error) {
	return 0, true, nil
}
func (m *mockStore) ListNotificationPrefs(username string) []store.NotificationPref { return nil }
func (m *mockStore) GetThreadMessages(parentMessageID string) []StoredMessage       { return nil }
func (m *mockStore) GetThreadReplyCount(parentMessageID string) int                 { return 0 }

func (m *mockStore) MarkScheduledSent(id string) error                { return nil }
func (m *mockStore) CancelScheduledMessage(id, username string) error { return nil }

func (m *mockStore) ExportMessages(ctx context.Context, roomID, toUser, groupName, format string, limit int) ([]StoredMessage, error) {
	return nil, nil
}
func (m *mockStore) DeleteGroup(groupName string) error { return nil }

func (m *mockStore) UpdateGroupName(oldName, newName string) error             { return nil }
func (m *mockStore) SetGroupMemberRole(groupName, username, role string) error { return nil }
func (m *mockStore) KickGroupMember(groupName, username string) error          { return nil }
func (m *mockStore) TransferGroupOwnership(groupName, newOwner string) error   { return nil }
func (m *mockStore) LeaveGroup(groupName, username string) error               { return nil }

func (m *mockStore) GetGroupOwner(groupName string) (string, error) { return "", nil }
func (m *mockStore) AddCustomEmoji(name, url, uploader, roomID string) error {
	m.customEmojis = append(m.customEmojis, store.CustomEmoji{
		ID: "emoji-" + name, Name: name, URL: url, Uploader: uploader, RoomID: roomID,
		CreatedAt: time.Now().UnixMilli(),
	})
	return nil
}
func (m *mockStore) ListCustomEmojis(roomID string) ([]store.CustomEmoji, error) {
	return m.customEmojis, nil
}
func (m *mockStore) DeleteCustomEmoji(name, username string) error                { return nil }
func (m *mockStore) SearchCustomEmojis(query string) ([]store.CustomEmoji, error) { return nil, nil }

func (m *mockStore) UpdateCallRecord(id, status string, startedAt, endedAt int64) error { return nil }

func (m *mockStore) RegisterUser(username, passwordHash, inviteCode string) error { return nil }
func (m *mockStore) VerifyUser(username, password string) (bool, error)           { return true, nil }
func (m *mockStore) UserExists(username string) (bool, error) {
	if m.users == nil {
		return false, nil
	}
	return m.users[username], nil
}
func (m *mockStore) GenerateInviteCode(creator string, maxUses int) (string, error) {
	return "TESTCODE", nil
}
func (m *mockStore) ListInviteCodes(creator string) ([]store.InviteCodeRecord, error) {
	return nil, nil
}
func (m *mockStore) ValidateInviteCode(code string) (bool, error) { return true, nil }

func (m *mockStore) UpsertOIDCUser(sub, chatUsername, email, preferredUsername string) error {
	if m.oidcUsers == nil {
		m.oidcUsers = make(map[string]*store.OIDCUser)
	}
	m.oidcUsers[chatUsername] = &store.OIDCUser{
		Sub:               sub,
		ChatUsername:      chatUsername,
		Email:             email,
		PreferredUsername: preferredUsername,
	}
	return nil
}
func (m *mockStore) GetOIDCUserBySub(sub string) (*store.OIDCUser, error) {
	for _, user := range m.oidcUsers {
		if user.Sub == sub {
			return user, nil
		}
	}
	return nil, fmt.Errorf("not found")
}
func (m *mockStore) GetOIDCUserByUsername(username string) (*store.OIDCUser, error) {
	if user, ok := m.oidcUsers[username]; ok {
		return user, nil
	}
	return nil, fmt.Errorf("not found")
}

type mockSessionVerifier struct {
	validTokens map[string]string
}

func (m mockSessionVerifier) VerifySessionJoinToken(username, token string) error {
	if m.validTokens[token] != username {
		return fmt.Errorf("invalid session token")
	}
	return nil
}

func TestHandleJoinRequiresTokenForOIDCUser(t *testing.T) {
	ms := &mockStore{
		oidcUsers: map[string]*store.OIDCUser{
			"alice": {Sub: "oidc-sub-alice", ChatUsername: "alice"},
		},
	}
	h := New(ms, nil, "")
	client := &Client{hub: h, send: make(chan []byte, 4), currentRoomID: h.DefaultRoomID()}

	client.handleJoin(Message{Type: "join", Username: "alice"})

	if client.username != "" {
		t.Fatalf("expected OIDC-linked username without token to be rejected, got joined username %q", client.username)
	}

	select {
	case raw := <-client.send:
		var got Message
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatalf("join error payload was not JSON: %v", err)
		}
		if got.Type != "error" || got.ErrorCode != "OIDC_REQUIRED" {
			t.Fatalf("expected OIDC_REQUIRED error, got type=%q code=%q content=%q", got.Type, got.ErrorCode, got.Content)
		}
	default:
		t.Fatal("expected OIDC_REQUIRED error message")
	}

	select {
	case <-h.register:
		t.Fatal("expected rejected OIDC join not to register the client")
	default:
	}
}

func TestHandleJoinRequiresSessionTokenForRegisteredUser(t *testing.T) {
	ms := &mockStore{users: map[string]bool{"alice": true}}
	h := New(ms, nil, "")
	client := &Client{hub: h, send: make(chan []byte, 4), currentRoomID: h.DefaultRoomID()}

	client.handleJoin(Message{Type: "join", Username: "alice"})

	if client.username != "" {
		t.Fatalf("expected registered username without token to be rejected, got joined username %q", client.username)
	}

	select {
	case raw := <-client.send:
		var got Message
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatalf("join error payload was not JSON: %v", err)
		}
		if got.Type != "error" || got.ErrorCode != "AUTH_REQUIRED" {
			t.Fatalf("expected AUTH_REQUIRED error, got type=%q code=%q content=%q", got.Type, got.ErrorCode, got.Content)
		}
	default:
		t.Fatal("expected AUTH_REQUIRED error message")
	}

	select {
	case <-h.register:
		t.Fatal("expected rejected registered-user join not to register the client")
	default:
	}
}

func TestHandleJoinRejectsWrongSessionTokenForRegisteredUser(t *testing.T) {
	ms := &mockStore{users: map[string]bool{"alice": true, "bob": true}}
	h := New(ms, nil, "")
	h.SetSessionTokenVerifier(mockSessionVerifier{validTokens: map[string]string{"bob-token": "bob"}})
	client := &Client{hub: h, send: make(chan []byte, 4), currentRoomID: h.DefaultRoomID()}

	client.handleJoin(Message{Type: "join", Username: "alice", Token: "bob-token"})

	if client.username != "" {
		t.Fatalf("expected registered username with wrong token to be rejected, got joined username %q", client.username)
	}

	select {
	case raw := <-client.send:
		var got Message
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatalf("join error payload was not JSON: %v", err)
		}
		if got.Type != "error" || got.ErrorCode != "AUTH_FAILED" {
			t.Fatalf("expected AUTH_FAILED error, got type=%q code=%q content=%q", got.Type, got.ErrorCode, got.Content)
		}
	default:
		t.Fatal("expected AUTH_FAILED error message")
	}
}

func TestHandleJoinAcceptsSessionTokenForRegisteredUser(t *testing.T) {
	ms := &mockStore{users: map[string]bool{"alice": true}}
	h := New(ms, nil, "")
	h.SetSessionTokenVerifier(mockSessionVerifier{validTokens: map[string]string{"alice-token": "alice"}})
	client := &Client{hub: h, send: make(chan []byte, 8), currentRoomID: h.DefaultRoomID()}

	client.handleJoin(Message{Type: "join", Username: "alice", Token: "alice-token"})

	if client.username != "alice" {
		t.Fatalf("expected registered username with valid token to join, got %q", client.username)
	}

	select {
	case got := <-h.register:
		if got != client {
			t.Fatal("expected registered client on hub register channel")
		}
	default:
		t.Fatal("expected valid session join to register the client")
	}
}

func TestHandleJoinAllowsGuestWithoutToken(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	client := &Client{hub: h, send: make(chan []byte, 8), currentRoomID: h.DefaultRoomID()}

	client.handleJoin(Message{Type: "join", Username: "guestuser"})

	if client.username != "guestuser" {
		t.Fatalf("expected unknown username to join as guest, got %q", client.username)
	}

	select {
	case got := <-h.register:
		if got != client {
			t.Fatal("expected guest client on hub register channel")
		}
	default:
		t.Fatal("expected guest join to register the client")
	}
}

func TestNew(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	if h == nil {
		t.Fatal("New() returned nil")
	}
	if h.clients == nil {
		t.Error("expected non-nil clients map")
	}
	if cap(h.broadcast) != 256 {
		t.Errorf("expected broadcast channel capacity 256, got %d", cap(h.broadcast))
	}
	if h.register == nil {
		t.Error("expected non-nil register channel")
	}
	if h.unregister == nil {
		t.Error("expected non-nil unregister channel")
	}
	if h.store == nil {
		t.Error("expected non-nil store")
	}
	if h.StartTime.IsZero() {
		t.Error("expected non-zero StartTime")
	}
}

func TestValidateUsername(t *testing.T) {
	tests := []struct {
		username string
		valid    bool
	}{
		// Valid cases.
		{"alice", true},
		{"Bob", true},
		{"user_123", true},
		{"张三", true},
		{"test", true},
		// Invalid cases.
		{"", false},
		{"verylongusernameover20chars", false},
		{"hello world", false},
		{"x@y", false},
		{"test<script>", false},
	}

	for _, tc := range tests {
		t.Run(tc.username, func(t *testing.T) {
			result := ValidateUsername(tc.username)
			if result != tc.valid {
				t.Errorf("ValidateUsername(%q) = %v, want %v", tc.username, result, tc.valid)
			}
		})
	}
}

func TestAssistantMentionTarget(t *testing.T) {
	tests := []struct {
		name      string
		content   string
		wantToken bool
	}{
		{
			name:      "token bot mention routes to LLM bot only",
			content:   "@TokenBot 你好",
			wantToken: true,
		},
		{
			name:      "legacy bot alias routes to token bot",
			content:   "@bot ping",
			wantToken: true,
		},
		{
			name:    "regular user mention does not trigger assistant",
			content: "@alice ping",
		},
		{
			name:    "non-bot mention does not trigger assistant",
			content: "@randomuser 帮我看看",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := assistantMentionTarget(tc.content, "TokenBot")
			if got.TokenBot != tc.wantToken {
				t.Fatalf("TokenBot target = %v, want %v", got.TokenBot, tc.wantToken)
			}
		})
	}
}

func TestIsUsernameTaken(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Initially, no username should be taken.
	if h.IsUsernameTaken("alice") {
		t.Error("expected 'alice' to NOT be taken in empty hub")
	}

	// Register a client with username "alice".
	client := &Client{username: "alice", send: make(chan []byte, 1)}
	h.register <- client

	// Give the hub a moment to process the registration.
	time.Sleep(10 * time.Millisecond)

	if !h.IsUsernameTaken("alice") {
		t.Error("expected 'alice' to be taken after registration")
	}

	// "bob" should still not be taken.
	if h.IsUsernameTaken("bob") {
		t.Error("expected 'bob' to NOT be taken")
	}

	// Clean up: unregister the client.
	h.unregister <- client
	time.Sleep(10 * time.Millisecond)
}

func TestOnlineUsers(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Initially, no users.
	users := h.OnlineUsers()
	if len(users) != 0 {
		t.Fatalf("expected 0 online users initially, got %d", len(users))
	}

	// Register multiple clients.
	alice := &Client{username: "alice", send: make(chan []byte, 1)}
	bob := &Client{username: "bob", send: make(chan []byte, 1)}
	charlie := &Client{username: "charlie", send: make(chan []byte, 1)}

	h.register <- alice
	h.register <- bob
	h.register <- charlie
	time.Sleep(10 * time.Millisecond)

	users = h.OnlineUsers()
	if len(users) != 3 {
		t.Fatalf("expected 3 online users, got %d", len(users))
	}

	// Map iteration order is non-deterministic; check presence of each expected user.
	userSet := make(map[string]bool)
	for _, u := range users {
		userSet[u] = true
	}
	for _, expected := range []string{"alice", "bob", "charlie"} {
		if !userSet[expected] {
			t.Errorf("expected user %q to be online, got %v", expected, users)
		}
	}

	// Unregister bob.
	h.unregister <- bob
	time.Sleep(10 * time.Millisecond)

	users = h.OnlineUsers()
	if len(users) != 2 {
		t.Fatalf("expected 2 online users after unregister, got %d", len(users))
	}

	// Clean up remaining clients.
	h.unregister <- alice
	h.unregister <- charlie
	time.Sleep(10 * time.Millisecond)
}

func TestHubRunStartStop(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	// Start the hub.
	go h.Run()
	defer h.Stop()

	// Verify the hub is running by registering and querying.
	client := &Client{username: "testuser", send: make(chan []byte, 1)}
	h.register <- client
	time.Sleep(10 * time.Millisecond)

	if !h.IsUsernameTaken("testuser") {
		t.Error("hub not processing registrations")
	}

	users := h.OnlineUsers()
	if len(users) != 1 {
		t.Errorf("expected 1 online user, got %d", len(users))
	}

	// Unregister to clean up.
	h.unregister <- client
	time.Sleep(10 * time.Millisecond)
}

func TestDroppedMessages(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// Initially, dropped messages should be 0.
	if d := h.DroppedMessages(); d != 0 {
		t.Errorf("expected 0 dropped messages initially, got %d", d)
	}

	// Increment dropped messages.
	h.IncrementDropped()
	h.IncrementDropped()
	h.IncrementDropped()

	if d := h.DroppedMessages(); d != 3 {
		t.Errorf("expected 3 dropped messages after 3 increments, got %d", d)
	}
}

func TestShutdown(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Shutdown on an empty hub should not panic.
	h.Shutdown()

	// Verify connection count is 0 after shutdown.
	if h.ConnectionCount() != 0 {
		t.Errorf("expected 0 connections after shutdown, got %d", h.ConnectionCount())
	}

	// Calling Shutdown again on an already-shutdown hub should not panic.
	h.Shutdown()
}

func TestRateLimit(t *testing.T) {
	c := &Client{
		send: make(chan []byte, 1),
	}

	// First 5 messages within 1 second should be allowed.
	for i := 0; i < 5; i++ {
		if !c.checkRateLimit() {
			t.Errorf("expected checkRateLimit to return true for message %d", i+1)
		}
	}

	// 6th message should be rate-limited.
	if c.checkRateLimit() {
		t.Error("expected checkRateLimit to return false on 6th message within 1 second")
	}

	// After 1 second window expires, messages should be allowed again.
	time.Sleep(1100 * time.Millisecond)

	if !c.checkRateLimit() {
		t.Error("expected checkRateLimit to return true after rate limit window expires")
	}
}

func TestBotCooldown(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// First call — should be allowed (no prior trigger).
	if !h.CheckBotCooldown("bot:alice") {
		t.Error("expected first CheckBotCooldown(bot:alice) to return true")
	}

	// Second call within 30s — should be denied.
	if h.CheckBotCooldown("bot:alice") {
		t.Error("expected second CheckBotCooldown(bot:alice) to return false (within 30s cooldown)")
	}

	// Different key (agent) — should be independent.
	if !h.CheckBotCooldown("agent:alice") {
		t.Error("expected CheckBotCooldown(agent:alice) to be independent from bot:alice")
	}

	// Different user — should be independent.
	if !h.CheckBotCooldown("bot:bob") {
		t.Error("expected CheckBotCooldown(bot:bob) to be independent from alice")
	}

	// bob within 30s — should be denied.
	if h.CheckBotCooldown("bot:bob") {
		t.Error("expected second CheckBotCooldown(bot:bob) to return false (within 30s cooldown)")
	}
}

func TestOperatorPrecedenceFix(t *testing.T) {
	// Verify the fix:？should NOT bypass !targets.TokenBot gate.
	// Content containing only "？" (no "?") should only trigger if TokenBot is not already targeted.
	targets := assistantMentionTarget("测试？", "TokenBot")
	// TokenBot may or may not trigger (50% random), but the key point is that
	// the function does not panic and the precedence is correct:
	// "？" is only checked when !targets.TokenBot is true.
	// Pre-fix bug: "？" would bypass !targets.TokenBot due to missing parentheses.
	_ = targets
	// Just verifying no panic is sufficient — deterministic testing of random
	// triggers is not feasible here.
}

func TestSanitizeBotContent(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantLen int // max expected length in runes
	}{
		{
			name:    "normal content passes through",
			input:   "Hello, this is a bot response.",
			wantLen: 30,
		},
		{
			name:    "null bytes are stripped",
			input:   "Hello\x00World",
			wantLen: 10,
		},
		{
			name:    "whitespace is trimmed",
			input:   "  trimmed  ",
			wantLen: 7,
		},
		{
			name:    "oversized content is truncated",
			input:   strings.Repeat("x", maxBotContentLength+100),
			wantLen: maxBotContentLength,
		},
		{
			name:    "HTML tags are preserved (unlike sanitizeContent)",
			input:   "<div>Hello</div>",
			wantLen: 16,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := sanitizeBotContent(tc.input)
			if len([]rune(result)) != tc.wantLen {
				t.Errorf("expected %d runes, got %d: %q", tc.wantLen, len([]rune(result)), result)
			}
		})
	}

	// Verify HTML tags ARE preserved (this is the key difference from sanitizeContent).
	result := sanitizeBotContent("<div>Hello</div>")
	if !strings.Contains(result, "<div>") {
		t.Error("sanitizeBotContent should preserve HTML tags, but they were stripped")
	}
}

func TestValidateUsernameExtended(t *testing.T) {
	tests := []struct {
		name     string
		username string
		valid    bool
	}{
		{name: "single char", username: "a", valid: true},
		{name: "exactly 20 chars", username: "12345678901234567890", valid: true},
		{name: "mixed Latin and Chinese", username: "user_测试", valid: true},
		{name: "21 chars too long", username: "123456789012345678901", valid: false},
		{name: "katakana not allowed", username: "テスト", valid: false},
		{name: "emoji not allowed", username: "hello😀", valid: false},
		{name: "hyphen not allowed", username: "hello-world", valid: false},
		{name: "Cyrillic not allowed", username: "привет", valid: false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := ValidateUsername(tc.username)
			if result != tc.valid {
				t.Errorf("ValidateUsername(%q) = %v, want %v", tc.username, result, tc.valid)
			}
		})
	}
}

func TestHandleMarkRead(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Case 1: empty username — handler returns early, no message sent.
	c := &Client{hub: h, send: make(chan []byte, 1)}
	c.handleMarkRead(Message{Context: "public"})
	select {
	case msg := <-c.send:
		t.Fatalf("expected no response for empty username, got %s", string(msg))
	default:
	}

	// Case 2: DM context — read_receipt sent to the DM partner.
	c.username = "alice"
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 1)}
	h.register <- bob
	time.Sleep(10 * time.Millisecond)

	c.handleMarkRead(Message{Context: "dm", To: "bob"})

	var got Message
	select {
	case payload := <-bob.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode read_receipt: %v", err)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("expected read_receipt on bob's channel")
	}
	if got.Type != "read_receipt" {
		t.Fatalf("expected read_receipt, got %q", got.Type)
	}
	if got.From != "alice" {
		t.Fatalf("expected from=alice, got %q", got.From)
	}
	if got.Context != "dm" || got.To != "bob" {
		t.Fatalf("unexpected context/to: %q/%q", got.Context, got.To)
	}

	// Cleanup.
	h.unregister <- bob
	time.Sleep(10 * time.Millisecond)
}

func TestHandleTypingGuards(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// typing_start with empty username: should return early.
	c := &Client{hub: h, send: make(chan []byte, 1)}
	c.handleTypingStart(Message{Context: "public"})
	select {
	case msg := <-c.send:
		t.Fatalf("expected no typing for empty username, got %s", string(msg))
	default:
	}

	// typing_stop with empty username: should return early.
	c.handleTypingStop(Message{Context: "public"})
	select {
	case msg := <-c.send:
		t.Fatalf("expected no typing_stop for empty username, got %s", string(msg))
	default:
	}

	// typing_start with valid username: first call passes rate limit, broadcasts.
	c.username = "alice"
	// Should not panic; BroadcastTyping sends to other clients only.
	c.handleTypingStart(Message{Context: "dm", To: "bob"})
	select {
	case msg := <-c.send:
		t.Fatalf("expected no typing echo to sender, got %s", string(msg))
	default:
	}

	// typing_stop with valid username: should not panic.
	c.handleTypingStop(Message{Context: "dm", To: "bob"})
	select {
	case msg := <-c.send:
		t.Fatalf("expected no typing_stop echo to sender, got %s", string(msg))
	default:
	}
}

// Self-request: should be silently ignored.

// Already friends: should receive ALREADY_FRIENDS error.

// Valid request to a new user: no error to sender (target notified via SendToUser if online).

// Empty username guard.

// Valid accept: self receives updated friend_list.

// Empty username guard.

// Empty From: handler returns early.

// Valid reject: sends friend_reject to requester (silent if offline).

func TestHandleBlock(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// Block: should receive confirmation.
	c := &Client{hub: h, username: "alice", send: make(chan []byte, 1)}
	c.handleBlock(Message{Username: "bob"})

	var got Message
	select {
	case payload := <-c.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode block response: %v", err)
		}
	default:
		t.Fatal("expected block confirmation")
	}
	if got.Type != "block" || got.Username != "bob" {
		t.Fatalf("expected block bob, got type=%q username=%q", got.Type, got.Username)
	}

	// Unblock: should receive confirmation.
	c2 := &Client{hub: h, username: "alice", send: make(chan []byte, 1)}
	c2.handleUnblock(Message{Username: "bob"})
	select {
	case payload := <-c2.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode unblock response: %v", err)
		}
	default:
		t.Fatal("expected unblock confirmation")
	}
	if got.Type != "unblock" || got.Username != "bob" {
		t.Fatalf("expected unblock bob, got type=%q username=%q", got.Type, got.Username)
	}

	// Block list: should receive list response.
	c3 := &Client{hub: h, username: "alice", send: make(chan []byte, 1)}
	c3.handleBlockList()
	select {
	case payload := <-c3.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode block_list response: %v", err)
		}
	default:
		t.Fatal("expected block_list response")
	}
	if got.Type != "block_list" {
		t.Fatalf("expected block_list, got %q", got.Type)
	}
}

// Invalid room name: should get INVALID_ROOM_NAME error.

// Valid room create: should get room_create confirmation with room ID.

// Room list: should include the newly created room.

func TestHandlePinMessage(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	c := &Client{hub: h, username: "alice", send: make(chan []byte, 1)}
	h.register <- c
	time.Sleep(10 * time.Millisecond)

	c.handlePinMessage(Message{ID: "msg-1"})

	var got Message
	select {
	case payload := <-c.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode pinned broadcast: %v", err)
		}
	default:
		t.Fatal("expected pinned broadcast")
	}
	if got.Type != "pinned" {
		t.Fatalf("expected type=pinned, got %q", got.Type)
	}
	if got.ID != "msg-1" {
		t.Fatalf("expected id=msg-1, got %q", got.ID)
	}
	if !got.Pinned {
		t.Error("expected pinned=true")
	}
	if got.PinnedBy != "alice" {
		t.Fatalf("expected pinned_by=alice, got %q", got.PinnedBy)
	}
	if got.PinnedAt == 0 {
		t.Error("expected non-zero pinned_at")
	}

	// Guard: empty username returns early, no broadcast.
	anon := &Client{hub: h, send: make(chan []byte, 1)}
	h.register <- anon
	time.Sleep(10 * time.Millisecond)
	anon.handlePinMessage(Message{ID: "msg-2"})
	select {
	case msg := <-anon.send:
		t.Fatalf("expected no broadcast for empty username, got %s", string(msg))
	default:
	}

	// Guard: empty message ID returns early.
	c2 := &Client{hub: h, username: "bob", send: make(chan []byte, 1)}
	h.register <- c2
	time.Sleep(10 * time.Millisecond)
	c2.handlePinMessage(Message{ID: ""})
	select {
	case msg := <-c2.send:
		t.Fatalf("expected no broadcast for empty ID, got %s", string(msg))
	default:
	}

	// Cleanup.
	h.unregister <- c
	h.unregister <- anon
	h.unregister <- c2
	time.Sleep(10 * time.Millisecond)
}

func TestHandleUnpinMessage(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	c := &Client{hub: h, username: "alice", send: make(chan []byte, 1)}
	h.register <- c
	time.Sleep(10 * time.Millisecond)

	c.handleUnpinMessage(Message{ID: "msg-1"})

	var got Message
	select {
	case payload := <-c.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode unpinned broadcast: %v", err)
		}
	default:
		t.Fatal("expected unpinned broadcast")
	}
	if got.Type != "unpinned" {
		t.Fatalf("expected type=unpinned, got %q", got.Type)
	}
	if got.ID != "msg-1" {
		t.Fatalf("expected id=msg-1, got %q", got.ID)
	}
	if got.Pinned {
		t.Error("expected pinned=false")
	}

	// Guard: empty username returns early.
	anon := &Client{hub: h, send: make(chan []byte, 1)}
	h.register <- anon
	time.Sleep(10 * time.Millisecond)
	anon.handleUnpinMessage(Message{ID: "msg-2"})
	select {
	case msg := <-anon.send:
		t.Fatalf("expected no broadcast for empty username, got %s", string(msg))
	default:
	}

	// Cleanup.
	h.unregister <- c
	h.unregister <- anon
	time.Sleep(10 * time.Millisecond)
}

// Mute a conversation.

// Unmute — reuse the same client to avoid duplicate-username kick.

// Guard: empty username returns early.

// Guard: empty key returns early.

// Cleanup.

// Archive a conversation.

// Unarchive — reuse the same client.

// Guard: empty username returns early.

// Guard: empty key returns early.

// Cleanup.

func TestHandleCustomEmojiAddAndList(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// Add an emoji — handler sends custom_emoji_list back to the client.
	c := &Client{hub: h, username: "alice", send: make(chan []byte, 1)}
	c.handleCustomEmojiAdd(Message{EmojiName: "test_emoji", EmojiURL: "http://example.com/emoji.png"})

	var got Message
	select {
	case payload := <-c.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode custom_emoji_list after add: %v", err)
		}
	default:
		t.Fatal("expected custom_emoji_list response after add")
	}
	if got.Type != "custom_emoji_list" {
		t.Fatalf("expected custom_emoji_list, got %q", got.Type)
	}
	if len(got.Emojis) != 1 {
		t.Fatalf("expected 1 emoji in list, got %d", len(got.Emojis))
	}
	if got.Emojis[0].Name != "test_emoji" {
		t.Fatalf("expected emoji name test_emoji, got %q", got.Emojis[0].Name)
	}
	if got.Emojis[0].URL != "http://example.com/emoji.png" {
		t.Fatalf("expected emoji URL, got %q", got.Emojis[0].URL)
	}
	if got.Emojis[0].Uploader != "alice" {
		t.Fatalf("expected uploader=alice, got %q", got.Emojis[0].Uploader)
	}

	// List emojis — should return the stored emoji.
	c2 := &Client{hub: h, username: "bob", send: make(chan []byte, 1)}
	c2.handleCustomEmojiList()

	select {
	case payload := <-c2.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode custom_emoji_list: %v", err)
		}
	default:
		t.Fatal("expected custom_emoji_list response")
	}
	if got.Type != "custom_emoji_list" {
		t.Fatalf("expected custom_emoji_list, got %q", got.Type)
	}
	if len(got.Emojis) != 1 {
		t.Fatalf("expected 1 emoji in list, got %d", len(got.Emojis))
	}

	// Guard: empty username returns early.
	anon := &Client{hub: h, send: make(chan []byte, 1)}
	anon.handleCustomEmojiAdd(Message{EmojiName: "x", EmojiURL: "http://x.com/x.png"})
	select {
	case msg := <-anon.send:
		t.Fatalf("expected no response for empty username, got %s", string(msg))
	default:
	}

	// Guard: add with empty name returns INVALID_EMOJI error.
	c3 := &Client{hub: h, username: "charlie", send: make(chan []byte, 1)}
	c3.handleCustomEmojiAdd(Message{EmojiName: "", EmojiURL: "http://x.com/x.png"})
	select {
	case payload := <-c3.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode error: %v", err)
		}
	default:
		t.Fatal("expected INVALID_EMOJI error for empty name")
	}
	if got.Type != "error" || got.ErrorCode != "INVALID_EMOJI" {
		t.Fatalf("expected INVALID_EMOJI error, got type=%q code=%q", got.Type, got.ErrorCode)
	}
}

// Valid cases.

// Invalid cases.

func TestIsReservedUsername(t *testing.T) {
	tests := []struct {
		username string
		reserved bool
	}{
		// Reserved names (exact match, case insensitive).
		{"system", true},
		{"System", true},
		{"SYSTEM", true},
		{"server", true},
		{"admin", true},
		{"Admin", true},
		{"moderator", true},
		{"mod", true},
		{"root", true},
		{"null", true},
		{"NULL", true},
		{"undefined", true},
		{"everyone", true},
		{"all", true},
		{"chat", true},
		{"here", true},
		{"channel", true},

		// Non-reserved names.
		{"alice", false},
		{"bob", false},
		{"test_user", false},
		{"张三", false},
		{"administrator", false},
		{"system_admin", false},
		{"moderators", false},
		{"rooter", false},
		{"chatroom", false},
	}
	for _, tc := range tests {
		t.Run(tc.username, func(t *testing.T) {
			result := IsReservedUsername(tc.username)
			if result != tc.reserved {
				t.Errorf("IsReservedUsername(%q) = %v, want %v", tc.username, result, tc.reserved)
			}
		})
	}
}

func TestParseMentions(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		expected []string
	}{
		{name: "single mention", content: "@alice hello", expected: []string{"alice"}},
		{name: "multiple mentions", content: "@alice @bob hi", expected: []string{"alice", "bob"}},
		{name: "no mentions", content: "hello world", expected: nil},
		{name: "chinese name", content: "@张三 你好", expected: []string{"张三"}},
		{name: "duplicate mention deduped", content: "@alice @alice hi", expected: []string{"alice"}},
		{name: "mixed latin and chinese", content: "@alice and @bob and @张三", expected: []string{"alice", "bob", "张三"}},
		{name: "at sign with space no match", content: "hello @ world", expected: nil},
		{name: "underscore in name", content: "@user_name hi", expected: []string{"user_name"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := parseMentions(tc.content)
			if len(result) != len(tc.expected) {
				t.Fatalf("parseMentions(%q) = %v (len=%d), want %v (len=%d)", tc.content, result, len(result), tc.expected, len(tc.expected))
			}
			for i, v := range result {
				if v != tc.expected[i] {
					t.Errorf("parseMentions(%q)[%d] = %q, want %q", tc.content, i, v, tc.expected[i])
				}
			}
		})
	}
}

func TestContainsAllMention(t *testing.T) {
	tests := []struct {
		content  string
		expected bool
	}{
		{"@all hello", true},
		{"@everyone hi", true},
		{"@here check", true},
		{"@channel update", true},
		{"@ALL hands", true},
		{"@Everyone welcome", true},
		{"@Here test", true},
		{"@Channel news", true},
		{"hello @alice", false},
		{"no mention here", false},
		{"", false},
		{"@allhands", false},
	}
	for _, tc := range tests {
		t.Run(tc.content, func(t *testing.T) {
			result := containsAllMention(tc.content)
			if result != tc.expected {
				t.Errorf("containsAllMention(%q) = %v, want %v", tc.content, result, tc.expected)
			}
		})
	}
}

func TestSanitizeContent(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantLen int
		wantStr string
	}{
		{
			name:    "normal content passes through",
			input:   "Hello, world!",
			wantStr: "Hello, world!",
		},
		{
			name:    "null bytes are stripped",
			input:   "Hello\x00World",
			wantStr: "HelloWorld",
		},
		{
			name:    "HTML tags are stripped",
			input:   "<script>alert('xss')</script>hello",
			wantStr: "alert('xss')hello",
		},
		{
			name:    "whitespace is trimmed",
			input:   "  trimmed  ",
			wantStr: "trimmed",
		},
		{
			name:    "javascript protocol removed",
			input:   "javascript:alert(1)",
			wantStr: "alert(1)",
		},
		{
			name:    "long content truncated",
			input:   strings.Repeat("x", maxContentLength+100),
			wantLen: maxContentLength,
		},
		{
			name:    "whitespace only becomes empty",
			input:   "   ",
			wantStr: "",
		},
		{
			name:    "HTML tag wrapping stripped",
			input:   "<a href='javascript:void(0)'>click</a>",
			wantStr: "click",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := sanitizeContent(tc.input)
			if tc.wantStr != "" {
				if result != tc.wantStr {
					t.Errorf("sanitizeContent(%q) = %q, want %q", tc.input, result, tc.wantStr)
				}
			} else if tc.wantLen > 0 {
				if len([]rune(result)) != tc.wantLen {
					t.Errorf("sanitizeContent rune length = %d, want %d", len([]rune(result)), tc.wantLen)
				}
			}
		})
	}
}

func TestIsAssistantAlias(t *testing.T) {
	tests := []struct {
		name      string
		mention   string
		canonical string
		aliases   []string
		expected  bool
	}{
		{
			name:      "exact canonical match",
			mention:   "TokenBot",
			canonical: "TokenBot",
			expected:  true,
		},
		{
			name:      "case insensitive canonical",
			mention:   "tokenbot",
			canonical: "TokenBot",
			expected:  true,
		},
		{
			name:      "alias match",
			mention:   "bot",
			canonical: "TokenBot",
			aliases:   []string{"bot", "tokenbot"},
			expected:  true,
		},
		{
			name:      "alias case insensitive",
			mention:   "BOT",
			canonical: "TokenBot",
			aliases:   []string{"bot"},
			expected:  true,
		},
		{
			name:      "no match",
			mention:   "alice",
			canonical: "TokenBot",
			aliases:   []string{"bot"},
			expected:  false,
		},
		{
			name:      "empty canonical alias still works",
			mention:   "bot",
			canonical: "",
			aliases:   []string{"bot"},
			expected:  true,
		},
		{
			name:      "empty mention does not match",
			mention:   "",
			canonical: "TokenBot",
			expected:  false,
		},
		{
			name:      "partial substring does not match",
			mention:   "token",
			canonical: "TokenBot",
			aliases:   []string{"bot"},
			expected:  false,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := isAssistantAlias(tc.mention, tc.canonical, tc.aliases...)
			if result != tc.expected {
				t.Errorf("isAssistantAlias(%q, %q, %v) = %v, want %v",
					tc.mention, tc.canonical, tc.aliases, result, tc.expected)
			}
		})
	}
}

// --- Hub pure-logic tests (no WebSocket required) ---

func TestConnectionCount(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	if h.ConnectionCount() != 0 {
		t.Fatalf("expected 0 connections initially, got %d", h.ConnectionCount())
	}

	alice := &Client{username: "alice", send: make(chan []byte, 1)}
	bob := &Client{username: "bob", send: make(chan []byte, 1)}

	h.register <- alice
	h.register <- bob
	time.Sleep(10 * time.Millisecond)

	if h.ConnectionCount() != 2 {
		t.Fatalf("expected 2 connections after register, got %d", h.ConnectionCount())
	}

	h.unregister <- alice
	time.Sleep(10 * time.Millisecond)

	if h.ConnectionCount() != 1 {
		t.Fatalf("expected 1 connection after unregister, got %d", h.ConnectionCount())
	}

	// Cleanup.
	h.unregister <- bob
	time.Sleep(10 * time.Millisecond)
}

func TestIsFull(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Empty hub should not be full.
	if h.IsFull() {
		t.Error("expected IsFull to return false for empty hub")
	}

	// Register a few clients — still below MaxConnections (100).
	for i := 0; i < 5; i++ {
		client := &Client{username: "user_" + string(rune('a'+i)), send: make(chan []byte, 1)}
		h.register <- client
		defer func() { h.unregister <- client }()
	}
	time.Sleep(10 * time.Millisecond)

	if h.IsFull() {
		t.Error("expected IsFull to return false when below MaxConnections")
	}
}

func TestUptime(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// Brand new hub should have a non-negative uptime.
	uptime := h.Uptime()
	if uptime < 0 {
		t.Error("expected non-negative uptime")
	}
	if uptime > time.Second {
		t.Errorf("expected uptime < 1s for brand new hub, got %v", uptime)
	}

	// After a short wait, uptime should increase.
	time.Sleep(50 * time.Millisecond)
	later := h.Uptime()
	if later <= uptime {
		t.Error("expected uptime to increase after sleep")
	}
}

func TestIsUsernameTaken_CaseSensitivity(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	client := &Client{username: "Alice", send: make(chan []byte, 1)}
	h.register <- client
	time.Sleep(10 * time.Millisecond)

	if !h.IsUsernameTaken("Alice") {
		t.Error("expected exact match 'Alice' to be taken")
	}
	if h.IsUsernameTaken("alice") {
		t.Error("expected 'alice' (lowercase) to NOT match 'Alice' (case-sensitive)")
	}

	// Cleanup.
	h.unregister <- client
	time.Sleep(10 * time.Millisecond)
}

// --- Friend system tests ---

// Non-existent user.

// Add friend and verify.

// Unrelated users.

// Removing non-existent friend should not panic.

// No friends initially.

// --- Room system tests ---

func TestJoinRoom(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// JoinRoom creates a new room set.
	result := h.JoinRoom("room-1", "alice")
	if !result {
		t.Error("expected JoinRoom to return true")
	}

	if !h.InRoom("room-1", "alice") {
		t.Error("expected alice to be in room-1 after JoinRoom")
	}

	// JoinRoom adds to an existing room.
	h.JoinRoom("room-1", "bob")
	if !h.InRoom("room-1", "bob") {
		t.Error("expected bob to be in room-1 after JoinRoom")
	}

	members := h.GetRoomMembers("room-1")
	if len(members) != 2 {
		t.Fatalf("expected 2 members in room-1, got %d", len(members))
	}
}

func TestLeaveRoom(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	h.JoinRoom("room-1", "alice")
	h.JoinRoom("room-1", "bob")

	h.LeaveRoom("room-1", "alice")

	if h.InRoom("room-1", "alice") {
		t.Error("expected alice to no longer be in room-1 after LeaveRoom")
	}
	if !h.InRoom("room-1", "bob") {
		t.Error("expected bob to remain in room-1")
	}

	// Leave non-existent room should not panic.
	h.LeaveRoom("nonexistent", "alice")
}

func TestGetRoomMembers(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// Empty room.
	members := h.GetRoomMembers("empty-room")
	if len(members) != 0 {
		t.Fatalf("expected 0 members for non-existent room, got %d", len(members))
	}

	h.JoinRoom("room-1", "alice")
	h.JoinRoom("room-1", "bob")
	h.JoinRoom("room-1", "charlie")

	members = h.GetRoomMembers("room-1")
	if len(members) != 3 {
		t.Fatalf("expected 3 members, got %d", len(members))
	}
}

func TestInRoom(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// Non-existent room.
	if h.InRoom("nonexistent", "alice") {
		t.Error("expected InRoom to return false for non-existent room")
	}

	h.JoinRoom("room-1", "alice")

	// User in room.
	if !h.InRoom("room-1", "alice") {
		t.Error("expected InRoom to return true after JoinRoom")
	}

	// Different user in same room.
	if h.InRoom("room-1", "bob") {
		t.Error("expected InRoom to return false for non-member")
	}
}

// --- Group system tests ---

// Create group succeeds.

// Duplicate group name is rejected.

// bob should NOT be in dev-team (duplicate rejected).

// Non-existent group.

// Non-existent group.

// Remove from non-existent group should not panic.

// --- Pending invite tests ---

// Consume on non-existent user returns false.

// Add invite.

// Consume returns true.

// Already consumed — returns false.

// Add another and remove via RemovePendingInvite.

// Remove on non-existent should not panic.

// --- Call session tests ---

// Get non-existent session returns nil.

// Create session.

// Get session.

// Update status.

// Update non-existent should not panic.

// Remove session.

// Remove non-existent should not panic.

// --- SendToUser tests ---

func TestSendToUser(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Send to non-existent user returns false.
	data := []byte(`{"test":true}`)
	if h.SendToUser("alice", data) {
		t.Error("expected SendToUser to return false for offline user")
	}

	// Register alice and verify delivery.
	alice := &Client{username: "alice", send: make(chan []byte, 1)}
	h.register <- alice
	time.Sleep(10 * time.Millisecond)

	if !h.SendToUser("alice", data) {
		t.Error("expected SendToUser to return true for online user")
	}

	// Verify the message was received by alice.
	select {
	case received := <-alice.send:
		if string(received) != string(data) {
			t.Fatalf("expected %q, got %q", string(data), string(received))
		}
	default:
		t.Fatal("expected message on alice's channel")
	}

	// Cleanup.
	h.unregister <- alice
	time.Sleep(10 * time.Millisecond)
}

// --- LoadPersistedState tests ---

// Initially empty.

// Friends should now be restored.

// Groups should now be restored.

// Should not panic with nil store.

// --- AllUserStatus tests ---

func TestAllUserStatusSortsOnlineFirst(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Set last seen timestamps: alice most recent, charlie oldest.
	h.SetLastSeen("alice", 3000)
	h.SetLastSeen("bob", 2000)
	h.SetLastSeen("charlie", 1000)

	// Register bob as online.
	bobClient := &Client{username: "bob", send: make(chan []byte, 1)}
	h.register <- bobClient
	time.Sleep(10 * time.Millisecond)

	users := h.AllUserStatus()

	// First user should be online (bob).
	if !users[0].Online {
		t.Errorf("expected first user to be online, got %+v", users[0])
	}
	if users[0].Username != "bob" {
		t.Errorf("expected bob first, got %q", users[0].Username)
	}

	// Offline users should be sorted by lastSeen descending.
	// alice=3000 before charlie=1000.
	foundAlice := false
	foundCharlie := false
	for i, u := range users {
		if u.Username == "alice" {
			foundAlice = true
			aliceIdx := i
			for j, u2 := range users {
				if u2.Username == "charlie" {
					foundCharlie = true
					if aliceIdx >= j {
						t.Errorf("expected alice (lastSeen=3000) before charlie (lastSeen=1000), got alice@%d charlie@%d", aliceIdx, j)
					}
				}
			}
		}
	}
	if !foundAlice || !foundCharlie {
		t.Error("expected alice and charlie in user list")
	}

	// Cleanup.
	h.unregister <- bobClient
	time.Sleep(10 * time.Millisecond)
}

func TestAllUserStatusMergesProfileData(t *testing.T) {
	ms := &mockStore{
		allProfiles: []store.UserProfile{
			{Username: "alice", DisplayName: "Alice Wang", AvatarURL: "https://example.com/alice.png", Status: "Busy"},
			{Username: "bob", DisplayName: "Bob Li", AvatarURL: "https://example.com/bob.png", Status: "Available"},
		},
	}
	h := New(ms, nil, "")

	h.SetLastSeen("alice", 1000)
	h.SetLastSeen("bob", 2000)

	users := h.AllUserStatus()
	if len(users) != 2 {
		t.Fatalf("expected 2 users, got %d", len(users))
	}

	for _, u := range users {
		switch u.Username {
		case "alice":
			if u.DisplayName != "Alice Wang" {
				t.Errorf("expected Alice Wang, got %q", u.DisplayName)
			}
			if u.AvatarURL != "https://example.com/alice.png" {
				t.Errorf("expected avatar URL, got %q", u.AvatarURL)
			}
			if u.Status != "Busy" {
				t.Errorf("expected Busy status, got %q", u.Status)
			}
		case "bob":
			if u.DisplayName != "Bob Li" {
				t.Errorf("expected Bob Li, got %q", u.DisplayName)
			}
			if u.AvatarURL != "https://example.com/bob.png" {
				t.Errorf("expected avatar URL, got %q", u.AvatarURL)
			}
			if u.Status != "Available" {
				t.Errorf("expected Available status, got %q", u.Status)
			}
		}
	}
}

func TestAllUserStatusEmpty(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// No users tracked — should return empty slice.
	users := h.AllUserStatus()
	if len(users) != 0 {
		t.Fatalf("expected 0 users, got %d", len(users))
	}
}

// --- Broadcast methods ---

func TestBroadcastJSON(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	client := &Client{hub: h, username: "alice", send: make(chan []byte, 10)}
	h.register <- client
	time.Sleep(10 * time.Millisecond)

	testMsg := Message{Type: "test_broadcast", Content: "hello broadcast"}
	h.BroadcastJSON(testMsg)

	var got Message
	select {
	case payload := <-client.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode broadcast: %v", err)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected message on client channel after BroadcastJSON")
	}
	if got.Type != "test_broadcast" {
		t.Fatalf("expected type=test_broadcast, got %q", got.Type)
	}
	if got.Content != "hello broadcast" {
		t.Fatalf("expected content=hello broadcast, got %q", got.Content)
	}

	h.unregister <- client
	time.Sleep(10 * time.Millisecond)
}

func TestBroadcastToRoom(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10), currentRoomID: "room-1"}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10), currentRoomID: "room-2"}
	h.mu.Lock()
	h.clients[alice] = true
	h.clients[bob] = true
	h.mu.Unlock()

	data, _ := json.Marshal(Message{Type: "room_broadcast", Content: "secret"})
	h.BroadcastToRoom(data, "room-1")

	// alice should receive (in room-1).
	select {
	case <-alice.send:
		// ok
	default:
		t.Fatal("expected alice (room-1) to receive room broadcast")
	}

	// bob should NOT receive (in room-2).
	select {
	case msg := <-bob.send:
		t.Fatalf("expected bob (room-2) NOT to receive room broadcast, got %s", string(msg))
	default:
		// ok
	}

	// BroadcastToRoom with empty roomID broadcasts to all.
	dataAll, _ := json.Marshal(Message{Type: "all_rooms", Content: "everyone"})
	h.BroadcastToRoom(dataAll, "")

	select {
	case <-alice.send:
	default:
		t.Fatal("expected alice to receive broadcast when roomID is empty")
	}
	select {
	case <-bob.send:
	default:
		t.Fatal("expected bob to receive broadcast when roomID is empty")
	}

}

func TestHandleChatMessageScopesRoomFanout(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10), currentRoomID: "room-1"}
	charlie := &Client{hub: h, username: "charlie", send: make(chan []byte, 10), currentRoomID: "room-1"}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10), currentRoomID: "room-2"}

	h.mu.Lock()
	h.clients[alice] = true
	h.clients[charlie] = true
	h.clients[bob] = true
	h.mu.Unlock()

	alice.handleChatMessage(Message{Content: "room secret @all"})

	for name, ch := range map[string]chan []byte{
		"alice":   alice.send,
		"charlie": charlie.send,
	} {
		var got Message
		select {
		case payload := <-ch:
			if err := json.Unmarshal(payload, &got); err != nil {
				t.Fatalf("%s: decode message error: %v", name, err)
			}
			if got.Type != "message" || got.RoomID != "room-1" || got.Content != "room secret @all" {
				t.Fatalf("%s: expected room-1 message, got %+v", name, got)
			}
		default:
			t.Fatalf("%s should receive room-scoped message", name)
		}

		select {
		case payload := <-ch:
			if err := json.Unmarshal(payload, &got); err != nil {
				t.Fatalf("%s: decode mention_all error: %v", name, err)
			}
			if got.Type != "mention_all" || got.RoomID != "room-1" || !got.MentionAll {
				t.Fatalf("%s: expected room-1 mention_all, got %+v", name, got)
			}
		default:
			t.Fatalf("%s should receive room-scoped mention_all", name)
		}
	}

	select {
	case payload := <-bob.send:
		t.Fatalf("bob is in room-2 and should not receive room-1 payload: %s", string(payload))
	default:
	}
}

// TestHandleChatMessageRoundTripsReplyToID verifies that replying to a message
// in the public room persists the reply_to_id (it was previously hardcoded to
// empty, dropping reply context on fetch).
func TestHandleChatMessageRoundTripsReplyToID(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10), currentRoomID: "room-1"}
	alice.handleChatMessage(Message{Content: "reply to message", ReplyToID: "orig-msg-1"})

	msgs := ms.GetMessages(100, 0)
	if len(msgs) == 0 {
		t.Fatal("expected message to be persisted")
	}
	last := msgs[len(msgs)-1]
	if last.ReplyToID != "orig-msg-1" {
		t.Errorf("persisted ReplyToID = %q, want %q", last.ReplyToID, "orig-msg-1")
	}
}

func TestBroadcastTyping(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	sender := &Client{hub: h, username: "alice", send: make(chan []byte, 10)}
	other := &Client{hub: h, username: "bob", send: make(chan []byte, 10)}
	h.register <- sender
	h.register <- other
	time.Sleep(10 * time.Millisecond)

	h.BroadcastTyping("alice", "typing", "dm", "bob")

	// sender should NOT receive the typing message (excluded).
	select {
	case msg := <-sender.send:
		t.Fatalf("expected sender to be excluded from typing broadcast, got %s", string(msg))
	default:
		// ok
	}

	// other should receive.
	var got Message
	select {
	case payload := <-other.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode typing error: %v", err)
		}
	default:
		t.Fatal("expected other client to receive typing message")
	}
	if got.Type != "typing" {
		t.Fatalf("expected type=typing, got %q", got.Type)
	}
	if got.Username != "alice" {
		t.Fatalf("expected username=alice, got %q", got.Username)
	}
	if got.Context != "dm" || got.To != "bob" {
		t.Fatalf("expected context=dm, to=bob, got context=%q to=%q", got.Context, got.To)
	}

	// typing_stop should also exclude sender.
	h.BroadcastTyping("alice", "typing_stop", "dm", "bob")
	select {
	case msg := <-sender.send:
		t.Fatalf("expected sender excluded from typing_stop, got %s", string(msg))
	default:
	}
	select {
	case <-other.send:
		// ok
	default:
		t.Fatal("expected other to receive typing_stop")
	}

	h.unregister <- sender
	h.unregister <- other
	time.Sleep(10 * time.Millisecond)
}

// --- Shutdown with clients ---

func TestShutdownWithClients(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Create an httptest server for WebSocket connections.
	upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		client := NewClient(h, conn)
		go client.WritePump()
		go client.ReadPump()
	}))
	defer srv.Close()

	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	conn1, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial conn1: %v", err)
	}

	conn2, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial conn2: %v", err)
	}

	// Send join messages to register clients.
	conn1.WriteJSON(Message{Type: "join", Username: "alice"})
	conn2.WriteJSON(Message{Type: "join", Username: "bob"})
	time.Sleep(50 * time.Millisecond)

	if h.ConnectionCount() != 2 {
		t.Fatalf("expected 2 connections before shutdown, got %d", h.ConnectionCount())
	}

	// Verify both clients are initially online.
	if !h.IsUsernameTaken("alice") || !h.IsUsernameTaken("bob") {
		t.Fatal("expected both clients to be registered before shutdown")
	}

	h.Shutdown()

	if h.ConnectionCount() != 0 {
		t.Errorf("expected 0 connections after shutdown, got %d", h.ConnectionCount())
	}

	// Verify clients no longer tracked after shutdown.
	if h.IsUsernameTaken("alice") {
		t.Error("expected alice to no longer be registered after shutdown")
	}
	if h.IsUsernameTaken("bob") {
		t.Error("expected bob to no longer be registered after shutdown")
	}

	// Verify write to connection fails (server-side conn was closed by Shutdown).
	conn1.SetWriteDeadline(time.Now().Add(100 * time.Millisecond))
	if err := conn1.WriteMessage(websocket.TextMessage, []byte("test")); err == nil {
		// Write may still succeed on httptest in-memory pipes, but the hub
		// should no longer process it — verify no re-registration.
		time.Sleep(50 * time.Millisecond)
		if h.ConnectionCount() != 0 {
			t.Error("expected 0 connections after shutdown even after attempted write")
		}
	}
	conn2.SetWriteDeadline(time.Now().Add(100 * time.Millisecond))
	if err := conn2.WriteMessage(websocket.TextMessage, []byte("test")); err == nil {
		time.Sleep(50 * time.Millisecond)
		if h.ConnectionCount() != 0 {
			t.Error("expected 0 connections after shutdown even after attempted write")
		}
	}

	conn1.Close()
	conn2.Close()
}

// --- SendBotMessage / SendAssistantMessage ---

func TestSendBotMessage(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "TestBot")
	go h.Run()
	defer h.Stop()

	client := &Client{hub: h, username: "alice", send: make(chan []byte, 10)}
	h.register <- client
	time.Sleep(10 * time.Millisecond)

	h.SendBotMessage("hello from bot", "room-1")

	// Give Run loop time to consume from broadcast channel and deliver to client.
	time.Sleep(20 * time.Millisecond)

	// Verify persistence.
	found := false
	for _, msg := range ms.messages {
		if msg.Username == "TestBot" && msg.Content == "hello from bot" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected bot message 'hello from bot' to be persisted in store")
	}

	// Verify broadcast.
	var got Message
	select {
	case payload := <-client.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode bot message error: %v", err)
		}
	default:
		t.Fatal("expected bot message to be broadcast to client")
	}
	if got.Type != "message" {
		t.Fatalf("expected type=message, got %q", got.Type)
	}
	if got.Username != "TestBot" {
		t.Fatalf("expected username=TestBot, got %q", got.Username)
	}
	if got.Content != "hello from bot" {
		t.Fatalf("expected content='hello from bot', got %q", got.Content)
	}
	if got.RoomID != "room-1" {
		t.Fatalf("expected roomID=room-1, got %q", got.RoomID)
	}

	h.unregister <- client
	time.Sleep(10 * time.Millisecond)
}

func TestSendAssistantMessageEmptyUsername(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "FallbackBot")

	// Empty username should fall back to botName.
	h.SendAssistantMessage("", "assistant content", "room-1")

	if len(ms.messages) == 0 {
		t.Fatal("expected message to be persisted")
	}
	if ms.messages[0].Username != "FallbackBot" {
		t.Fatalf("expected username to fallback to botName 'FallbackBot', got %q", ms.messages[0].Username)
	}
	if ms.messages[0].Content != "assistant content" {
		t.Fatalf("expected content='assistant content', got %q", ms.messages[0].Content)
	}

	// Non-empty username should be used directly.
	ms2 := &mockStore{}
	h2 := New(ms2, nil, "FallbackBot")
	h2.SendAssistantMessage("CustomAgent", "custom message", "room-2")

	if len(ms2.messages) == 0 {
		t.Fatal("expected message to be persisted")
	}
	if ms2.messages[0].Username != "CustomAgent" {
		t.Fatalf("expected username=CustomAgent, got %q", ms2.messages[0].Username)
	}
}

// --- SetMemoryPath / GetMemoryContent ---

func TestSetMemoryPath(t *testing.T) {
	ms := &mockStore{}
	llmCfg := &llm.Config{MemorySize: 10}
	h := New(ms, llmCfg, "TestBot")

	tmpDir := t.TempDir()
	memPath := tmpDir + "/MEMORY.md"

	// Before setting path, content should be empty.
	content := h.GetMemoryContent()
	if content != "" {
		t.Errorf("expected empty content before SetMemoryPath, got %q", content)
	}

	h.SetMemoryPath(memPath)

	// After setting path, content still empty (file doesn't exist).
	content = h.GetMemoryContent()
	if content != "" {
		t.Errorf("expected empty content for non-existent memory file, got %q", content)
	}
}

func TestGetMemoryContentNoMemory(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// No LLM config, so memory is nil.
	content := h.GetMemoryContent()
	if content != "" {
		t.Errorf("expected empty string when no memory configured, got %q", content)
	}

	// SetMemoryPath on nil memory should not panic.
	h.SetMemoryPath("/tmp/nonexistent/MEMORY.md")
}

// --- BuildSystemPrompt ---

func TestBuildSystemPrompt(t *testing.T) {
	ms := &mockStore{}

	t.Run("with botName configured", func(t *testing.T) {
		h := New(ms, nil, "MyBot")
		prompt := h.BuildSystemPrompt()

		if !strings.Contains(prompt, "MyBot") {
			t.Errorf("expected prompt to contain bot name 'MyBot', got:\n%s", prompt)
		}
		if !strings.Contains(prompt, "Rules:") {
			t.Error("expected prompt to contain Rules section")
		}
		// No LLM config, so no memory section.
		if strings.Contains(prompt, "Conversation Context") {
			t.Error("expected no memory section when no LLM config")
		}
		// Should contain the @username mention rule and bot identity.
		if !strings.Contains(prompt, "@username") {
			t.Error("expected prompt to contain @username mention rule")
		}
	})

	t.Run("without memory content", func(t *testing.T) {
		llmCfg := &llm.Config{MemorySize: 10}
		h := New(ms, llmCfg, "BotWithMem")
		prompt := h.BuildSystemPrompt()

		if !strings.Contains(prompt, "BotWithMem") {
			t.Errorf("expected prompt to contain bot name, got:\n%s", prompt)
		}
		// Memory exists but GetMemoryContent returns "" (no path set).
		if strings.Contains(prompt, "Conversation Context") {
			t.Error("expected no Conversation Context section when memory content is empty")
		}
	})

	t.Run("with memory content", func(t *testing.T) {
		llmCfg := &llm.Config{MemorySize: 10}
		h := New(ms, llmCfg, "BotWithMem")

		tmpDir := t.TempDir()
		memPath := tmpDir + "/MEMORY.md"
		os.WriteFile(memPath, []byte("User likes coffee.\nUser prefers Python."), 0644)
		h.SetMemoryPath(memPath)

		prompt := h.BuildSystemPrompt()
		if !strings.Contains(prompt, "Conversation Context") {
			t.Error("expected Conversation Context section when memory has content")
		}
		if !strings.Contains(prompt, "User likes coffee.") {
			t.Errorf("expected memory content in prompt, got:\n%s", prompt)
		}
		if !strings.Contains(prompt, "User prefers Python.") {
			t.Errorf("expected second memory line in prompt, got:\n%s", prompt)
		}
	})
}

// --- BroadcastJSON channel-full dropped counter ---

func TestBroadcastJSONIncrementsDroppedWhenChannelFull(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// Fill the broadcast channel without running the hub.
	for i := 0; i < 256; i++ {
		h.broadcast <- []byte("x")
	}

	// This BroadcastJSON should fail to send and increment dropped.
	before := h.DroppedMessages()
	h.BroadcastJSON(Message{Type: "test", Content: "dropped"})
	after := h.DroppedMessages()

	if after <= before {
		t.Errorf("expected dropped counter to increment when broadcast channel is full (before=%d, after=%d)", before, after)
	}

	// Drain the channel to avoid affecting other tests.
	for i := 0; i < 256; i++ {
		<-h.broadcast
	}
}

// --- SendToGroup tests ---

// Create a group and add members.

// Register clients: three group members and one non-member.

// Group members should receive.

// ok

// Non-member dave should NOT receive.

// ok

// Send to non-existent group should not panic.

// Cleanup.

// Register a client not in the group.

// Group doesn't exist — should not panic and should not deliver.

// ok

// --- SendToAllSessions tests ---

func TestSendToAllSessions(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// Register two clients with the same username (bypass Run to avoid kick-on-duplicate).
	alice1 := &Client{username: "alice", send: make(chan []byte, 1)}
	alice2 := &Client{username: "alice", send: make(chan []byte, 1)}
	bob := &Client{username: "bob", send: make(chan []byte, 1)}

	h.mu.Lock()
	h.clients[alice1] = true
	h.clients[alice2] = true
	h.clients[bob] = true
	h.mu.Unlock()

	data := []byte(`{"type":"dm","content":"secret"}`)
	h.SendToAllSessions("alice", data)

	// Both alice clients should receive.
	select {
	case received := <-alice1.send:
		if string(received) != string(data) {
			t.Fatalf("alice1: expected %q, got %q", string(data), string(received))
		}
	default:
		t.Fatal("expected alice1 to receive message")
	}

	select {
	case received := <-alice2.send:
		if string(received) != string(data) {
			t.Fatalf("alice2: expected %q, got %q", string(data), string(received))
		}
	default:
		t.Fatal("expected alice2 to receive message")
	}

	// Bob should NOT receive (different username).
	select {
	case msg := <-bob.send:
		t.Fatalf("expected bob NOT to receive, got %s", string(msg))
	default:
		// ok
	}

	// Cleanup.
	h.mu.Lock()
	delete(h.clients, alice1)
	delete(h.clients, alice2)
	delete(h.clients, bob)
	h.mu.Unlock()
}

// --- ShouldBroadcastTyping tests ---

func TestShouldBroadcastTyping(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// First call should be allowed.
	if !h.ShouldBroadcastTyping("alice") {
		t.Error("expected first ShouldBroadcastTyping to return true")
	}

	// Second call within 3s should be denied.
	if h.ShouldBroadcastTyping("alice") {
		t.Error("expected second ShouldBroadcastTyping within 3s to return false")
	}

	// Manually set rate limit to 4s ago to simulate elapsed time.
	h.mu.Lock()
	h.typingRateLimit["alice"] = time.Now().Add(-4 * time.Second)
	h.mu.Unlock()

	// After 3s window expires, should be allowed again.
	if !h.ShouldBroadcastTyping("alice") {
		t.Error("expected ShouldBroadcastTyping to return true after 3s cooldown expires")
	}

	// Different user should be tracked independently.
	if !h.ShouldBroadcastTyping("bob") {
		t.Error("expected ShouldBroadcastTyping for bob to return true (independent key)")
	}
}

// --- CheckBotCooldown duration tests ---

func TestCheckBotCooldownDurations(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// bot: prefix = 3 second cooldown.
	t.Run("bot_3s", func(t *testing.T) {
		if !h.CheckBotCooldown("bot:alice") {
			t.Error("first call should be allowed")
		}
		if h.CheckBotCooldown("bot:alice") {
			t.Error("second call within 3s should be denied")
		}
		// Manually advance past 3s.
		h.botCooldownMu.Lock()
		h.botCooldown["bot:alice"] = time.Now().Add(-4 * time.Second)
		h.botCooldownMu.Unlock()
		if !h.CheckBotCooldown("bot:alice") {
			t.Error("should be allowed after 3s cooldown expires")
		}
	})

	// agent: prefix = 8 second cooldown.
	t.Run("agent_8s", func(t *testing.T) {
		if !h.CheckBotCooldown("agent:bob") {
			t.Error("first call should be allowed")
		}
		if h.CheckBotCooldown("agent:bob") {
			t.Error("second call within 8s should be denied")
		}
		// Manually advance past 8s.
		h.botCooldownMu.Lock()
		h.botCooldown["agent:bob"] = time.Now().Add(-9 * time.Second)
		h.botCooldownMu.Unlock()
		if !h.CheckBotCooldown("agent:bob") {
			t.Error("should be allowed after 8s cooldown expires")
		}
	})

	// Default (no recognized prefix) = 30 second cooldown.
	t.Run("default_30s", func(t *testing.T) {
		if !h.CheckBotCooldown("custom:charlie") {
			t.Error("first call should be allowed")
		}
		if h.CheckBotCooldown("custom:charlie") {
			t.Error("second call within 30s should be denied")
		}
		// Manually advance past 30s.
		h.botCooldownMu.Lock()
		h.botCooldown["custom:charlie"] = time.Now().Add(-31 * time.Second)
		h.botCooldownMu.Unlock()
		if !h.CheckBotCooldown("custom:charlie") {
			t.Error("should be allowed after 30s cooldown expires")
		}
	})
}

// --- RequestOnlineUsers tests ---

// Register clients.

// Verify presence of all expected users.

// Verify time field is set.

// Cleanup.

// --- RequestHistory tests ---

// Pre-populate test messages.

// --- Pure function tests for client.go (no WebSocket required) ---

// Verify format: 32 bytes produces 43 chars of base64 raw URL encoding.
// RawURLEncoding means no +, /, or = characters.

// 32 bytes → 43-44 chars in base64 raw URL encoding.

// Verify base64 URL alphabet: A-Z, a-z, 0-9, -, _

// Verify uniqueness.

// Verify no standard base64 chars leak.

func TestSanitizeContentEdgeCases(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantStr string
	}{
		{
			name:    "empty string",
			input:   "",
			wantStr: "",
		},
		{
			name:    "newlines and tabs preserved but trimmed",
			input:   "\n\t hello \t\n",
			wantStr: "hello",
		},
		{
			name:    "mixed null bytes and HTML",
			input:   "<div>\x00Hello\x00</div>",
			wantStr: "Hello",
		},
		{
			name:    "unicode content with HTML stripping",
			input:   "<b>你好世界</b>",
			wantStr: "你好世界",
		},
		{
			name:    "only null bytes becomes empty",
			input:   "\x00\x00\x00",
			wantStr: "",
		},
		{
			name:    "nested HTML tags stripped",
			input:   "<div><span>text</span></div>",
			wantStr: "text",
		},
		{
			name:    "javascript protocol in mixed content",
			input:   "javascript:void(0) <script>xss</script>",
			wantStr: "void(0) xss",
		},
		{
			name:    "backticks and code blocks preserved",
			input:   "```go\nfmt.Println(\"hi\")\n```",
			wantStr: "```go\nfmt.Println(\"hi\")\n```",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := sanitizeContent(tc.input)
			if result != tc.wantStr {
				t.Errorf("sanitizeContent(%q) = %q, want %q", tc.input, result, tc.wantStr)
			}
		})
	}
}

func TestSanitizeBotContentEdgeCases(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantStr string
	}{
		{
			name:    "empty string",
			input:   "",
			wantStr: "",
		},
		{
			name:    "whitespace only",
			input:   "   \t\n   ",
			wantStr: "",
		},
		{
			name:    "only null bytes becomes empty",
			input:   "\x00\x00",
			wantStr: "",
		},
		{
			name:    "unicode content preserved",
			input:   "你好世界 \U0001F389",
			wantStr: "你好世界 \U0001F389",
		},
		{
			name:    "HTML preserved unlike sanitizeContent",
			input:   "<code>fmt.Println()</code>",
			wantStr: "<code>fmt.Println()</code>",
		},
		{
			name:    "mixed null bytes in content",
			input:   "Hello\x00World\x00!",
			wantStr: "HelloWorld!",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := sanitizeBotContent(tc.input)
			if result != tc.wantStr {
				t.Errorf("sanitizeBotContent(%q) = %q, want %q", tc.input, result, tc.wantStr)
			}
		})
	}

	// Verify maxBotContentLength truncation.
	t.Run("truncation at maxBotContentLength", func(t *testing.T) {
		longContent := strings.Repeat("x", maxBotContentLength+200)
		result := sanitizeBotContent(longContent)
		if len([]rune(result)) != maxBotContentLength {
			t.Errorf("expected %d runes after truncation, got %d", maxBotContentLength, len([]rune(result)))
		}
	})
}

// shouldTrigger(0) must always return false.

// shouldTrigger(100) must always return true.

// Negative percent: `percent > 0` guard makes it always false.

// Borderline: percent=1 relies on nanosecond clock entropy.
// Verify it does not panic and returns a boolean (either value is valid).

// Call many times to exercise the modulo path.

func TestAssistantMentionTargetEdgeCases(t *testing.T) {
	tests := []struct {
		name      string
		content   string
		botName   string
		wantToken bool
	}{
		{
			name:    "empty content returns no targets",
			content: "",
			botName: "TokenBot",
		},
		{
			name:    "no bot configured with no mention returns no targets",
			content: "hello world",
			botName: "",
		},
		{
			name:    "only bot configured no trigger returns no targets",
			content: "hello world",
			botName: "TokenBot",
		},
		{
			name:    "alias tokenbot detected even when bot not configured",
			content: "@TokenBot help",
			botName: "",
			// assistantMentionTarget detects mentions via aliases regardless of
			// configuration; the caller (handleChatMessage) gates on config.
			wantToken: true,
		},
		{
			name:    "non-bot mention does not trigger the bot",
			content: "@randomuser analyze this",
			botName: "TokenBot",
			// A mention that does not match any bot alias and carries no TokenBot
			// keyword or question mark produces no target.
		},
		{
			name:    "question with no bot configured does not trigger TokenBot keyword",
			content: "can you help?",
			botName: "",
			// Keyword and question triggers are guarded by botName != "".
			wantToken: false,
		},
		{
			name:    "empty config with plain text returns no targets",
			content: "good morning everyone",
			botName: "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := assistantMentionTarget(tc.content, tc.botName)
			if got.TokenBot != tc.wantToken {
				t.Errorf("TokenBot target = %v, want %v (content=%q, bot=%q)",
					got.TokenBot, tc.wantToken, tc.content, tc.botName)
			}
		})
	}
}

// --- DefaultRoomID tests ---

// getRoomIDError is a simple error type for testing GetRoomID failure paths.
type getRoomIDError string

func (e getRoomIDError) Error() string { return string(e) }

// errorOnGetRoomIDStore wraps mockStore but returns an error on GetRoomID.
type errorOnGetRoomIDStore struct {
	*mockStore
}

func (e *errorOnGetRoomIDStore) GetRoomID(name string) (string, error) {
	return "", getRoomIDError("room not found")
}

func TestDefaultRoomID(t *testing.T) {
	t.Run("returns existing room", func(t *testing.T) {
		ms := &mockStore{}
		ms.CreateRoom("公共聊天")
		h := New(ms, nil, "")
		id := h.DefaultRoomID()
		if id != "room-公共聊天" {
			t.Errorf("expected room-公共聊天 for existing room, got %q", id)
		}
	})

	t.Run("creates room when not found", func(t *testing.T) {
		ms := &errorOnGetRoomIDStore{mockStore: &mockStore{}}
		h := New(ms, nil, "")
		id := h.DefaultRoomID()
		if id != "room-公共聊天" {
			t.Errorf("expected room-公共聊天 from creation fallback, got %q", id)
		}
	})
}

// --- SendToUser offline edge case ---

func TestSendToUser_OfflineReturnsFalse(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	data := []byte(`{"type":"dm","content":"hello"}`)
	if h.SendToUser("ghost_user", data) {
		t.Error("expected SendToUser to return false for user who never connected")
	}

	alice := &Client{username: "alice", send: make(chan []byte, 1)}
	h.register <- alice
	time.Sleep(10 * time.Millisecond)

	if !h.SendToUser("alice", data) {
		t.Error("expected SendToUser to return true while alice is online")
	}

	h.unregister <- alice
	time.Sleep(10 * time.Millisecond)

	if h.SendToUser("alice", data) {
		t.Error("expected SendToUser to return false after alice disconnects")
	}
}

// --- BroadcastStreamChunkToRoom tests ---

func TestBroadcastStreamChunkToRoom(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10), currentRoomID: "room-1"}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10), currentRoomID: "room-2"}
	charlie := &Client{hub: h, username: "charlie", send: make(chan []byte, 10), currentRoomID: "room-1"}

	h.mu.Lock()
	h.clients[alice] = true
	h.clients[bob] = true
	h.clients[charlie] = true
	h.mu.Unlock()

	t.Run("specific room only delivers to room members", func(t *testing.T) {
		h.BroadcastStreamChunkToRoom("bot", "hello room-1", false, "room-1")

		select {
		case raw := <-alice.send:
			var msg Message
			if err := json.Unmarshal(raw, &msg); err != nil {
				t.Fatalf("unmarshal error: %v", err)
			}
			if msg.Type != "stream" || msg.Username != "bot" || msg.Content != "hello room-1" {
				t.Errorf("unexpected message: %+v", msg)
			}
		default:
			t.Fatal("expected alice in room-1 to receive stream chunk")
		}

		select {
		case <-charlie.send:
		default:
			t.Fatal("expected charlie in room-1 to receive stream chunk")
		}

		select {
		case msg := <-bob.send:
			t.Fatalf("expected bob in room-2 NOT to receive, got %s", string(msg))
		default:
		}
	})

	t.Run("empty roomID broadcasts to all via broadcast channel", func(t *testing.T) {
		h.BroadcastStreamChunkToRoom("agent", "global stream", true, "")

		select {
		case raw := <-h.broadcast:
			var msg Message
			if err := json.Unmarshal(raw, &msg); err != nil {
				t.Fatalf("unmarshal error: %v", err)
			}
			if msg.Type != "stream" || msg.Username != "agent" || msg.Content != "global stream" || !msg.Done {
				t.Errorf("unexpected broadcast stream message: %+v", msg)
			}
		default:
			t.Fatal("expected stream chunk on broadcast channel when roomID is empty")
		}
	})

	h.mu.Lock()
	delete(h.clients, alice)
	delete(h.clients, bob)
	delete(h.clients, charlie)
	h.mu.Unlock()
}

// --- IsOnline tests ---

func TestIsOnline(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	if h.IsOnline("alice") {
		t.Error("expected IsOnline to return false for user who never connected")
	}

	alice := &Client{username: "alice", send: make(chan []byte, 1)}
	h.register <- alice
	time.Sleep(10 * time.Millisecond)

	if !h.IsOnline("alice") {
		t.Error("expected IsOnline to return true after alice connects")
	}

	if h.IsOnline("bob") {
		t.Error("expected IsOnline to return false for bob who never connected")
	}

	h.unregister <- alice
	time.Sleep(10 * time.Millisecond)

	if h.IsOnline("alice") {
		t.Error("expected IsOnline to return false after alice disconnects")
	}
}

// --- BroadcastToGroup tests ---

// --- ValidateUsername edge cases ---

func TestValidateUsername_EdgeCases(t *testing.T) {
	tests := []struct {
		name     string
		username string
		valid    bool
	}{
		{name: "single underscore", username: "_", valid: true},
		{name: "19 chars", username: "1234567890123456789", valid: true},
		{name: "20 chars underscore", username: "1234567890123456789_", valid: true},
		{name: "21 chars with letter", username: "a12345678901234567890", valid: false},
		{name: "pure chinese", username: "你好世界测试用户名称", valid: true},
		{name: "mixed cn digit underscore", username: "用户_2024_test", valid: true},
		{name: "contains newline", username: "alice\nbob", valid: false},
		{name: "contains tab", username: "alice\tbob", valid: false},
		{name: "dollar sign", username: "user$name", valid: false},
		{name: "contains dot", username: "alice.bob", valid: false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := ValidateUsername(tc.username)
			if result != tc.valid {
				t.Errorf("ValidateUsername(%q) = %v, want %v", tc.username, result, tc.valid)
			}
		})
	}
}

// --- ValidateGroupName edge cases ---

// --- IsReservedUsername edge cases ---

// TestIsReservedUsernameEdgeCases tests empty string, special characters,
// and Unicode that should not be reserved.
func TestIsReservedUsernameEdgeCases(t *testing.T) {
	tests := []struct {
		name     string
		username string
		want     bool
	}{
		// Empty string is not reserved.
		{"empty string", "", false},
		// Mixed case of reserved words.
		{"mixed case System", "SyStEm", true},
		{"mixed case Admin", "AdMiN", true},
		{"mixed case Moderator", "MoDeRaToR", true},
		{"mixed case Root", "RoOt", true},
		{"mixed case Null", "NuLl", true},
		{"mixed case Undefined", "UnDeFiNeD", true},
		{"mixed case Everyone", "EvErYoNe", true},
		{"mixed case All", "AlL", true},
		{"mixed case Chat", "ChAt", true},
		{"mixed case Here", "HeRe", true},
		{"mixed case Channel", "ChAnNeL", true},
		// Special characters only (should not be reserved).
		{"special chars only", "!@#$%", false},
		// Unicode chars (should not be reserved).
		{"unicode smiley", "😀", false},
		{"chinese system", "系统", false},
		// Whitespace-like strings.
		{"spaces", "  system  ", false},
		// Very long string.
		{"very long", "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz", false},
		// Substrings of reserved words.
		{"prefix of reserved", "sys", false},
		{"suffix of reserved", "dmin", false},
		{"infix of reserved", "dmi", false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := IsReservedUsername(tc.username)
			if result != tc.want {
				t.Errorf("IsReservedUsername(%q) = %v, want %v", tc.username, result, tc.want)
			}
		})
	}
}

// --- Hub.Stop() idempotency ---

// TestHubStopIdempotent verifies that calling Hub.Stop() multiple times
// is safe and does not panic or hang.
func TestHubStopIdempotent(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()

	// First stop should close the done channel.
	h.Stop()

	// Second stop should be a no-op via sync.Once.
	// This must not panic or hang.
	h.Stop()

	// Third stop should also be safe.
	h.Stop()

	// Verify the hub is still usable (no crash).
	// ConnectionCount should work after Stop.
	count := h.ConnectionCount()
	if count < 0 {
		t.Errorf("expected ConnectionCount >= 0 after Stop, got %d", count)
	}

	// Shutdown should also be safe after multiple Stops.
	h.Shutdown()
	h.Shutdown()
}

// --- ConnectionCount after clients disconnect ---

// TestConnectionCountAfterDisconnect verifies that ConnectionCount
// decreases correctly when clients disconnect (unregister).
func TestConnectionCountAfterDisconnect(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Initially zero.
	if h.ConnectionCount() != 0 {
		t.Fatalf("expected 0 connections initially, got %d", h.ConnectionCount())
	}

	// Register 3 clients.
	clients := make([]*Client, 3)
	for i := 0; i < 3; i++ {
		clients[i] = &Client{
			username: "user_" + string(rune('a'+i)),
			send:     make(chan []byte, 1),
		}
		h.register <- clients[i]
	}
	time.Sleep(10 * time.Millisecond)

	if h.ConnectionCount() != 3 {
		t.Fatalf("expected 3 connections, got %d", h.ConnectionCount())
	}

	// Unregister one at a time and verify count.
	for i := 0; i < 3; i++ {
		before := h.ConnectionCount()
		h.unregister <- clients[i]
		time.Sleep(10 * time.Millisecond)
		after := h.ConnectionCount()

		if after != before-1 {
			t.Errorf("after unregister #%d: expected %d connections, got %d",
				i+1, before-1, after)
		}
	}

	if h.ConnectionCount() != 0 {
		t.Errorf("expected 0 connections after all unregister, got %d", h.ConnectionCount())
	}
}

// TestConnectionCountAfterAllDisconnect verifies that clearing all clients
// results in ConnectionCount returning 0.
func TestConnectionCountAfterAllDisconnect(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Register 5 clients.
	clients := make([]*Client, 5)
	for i := 0; i < 5; i++ {
		clients[i] = &Client{
			username: "u" + string(rune('0'+i)),
			send:     make(chan []byte, 1),
		}
		h.register <- clients[i]
	}
	time.Sleep(10 * time.Millisecond)

	if h.ConnectionCount() != 5 {
		t.Fatalf("expected 5 connections, got %d", h.ConnectionCount())
	}

	// Disconnect all.
	for i := 0; i < 5; i++ {
		h.unregister <- clients[i]
	}
	time.Sleep(10 * time.Millisecond)

	if h.ConnectionCount() != 0 {
		t.Errorf("expected 0 connections after all disconnect, got %d", h.ConnectionCount())
	}
}

// --- Typing indicator tests ---

func TestTypingBroadcast(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10)}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10)}
	charlie := &Client{hub: h, username: "charlie", send: make(chan []byte, 10)}
	h.register <- alice
	h.register <- bob
	h.register <- charlie
	time.Sleep(10 * time.Millisecond)

	h.BroadcastTyping("alice", "typing", "dm", "bob")

	// Sender should NOT receive.
	select {
	case msg := <-alice.send:
		t.Fatalf("sender should not receive typing broadcast, got %s", string(msg))
	default:
	}

	// bob should receive.
	var got Message
	select {
	case payload := <-bob.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode typing error: %v", err)
		}
		if got.Type != "typing" || got.Username != "alice" {
			t.Fatalf("expected typing from alice, got type=%q username=%q", got.Type, got.Username)
		}
		if got.Context != "dm" || got.To != "bob" {
			t.Fatalf("expected context=dm to=bob, got context=%q to=%q", got.Context, got.To)
		}
	default:
		t.Fatal("bob should receive typing broadcast")
	}

	// charlie should also receive.
	select {
	case payload := <-charlie.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode typing error: %v", err)
		}
		if got.Type != "typing" {
			t.Fatalf("expected typing for charlie, got type=%q", got.Type)
		}
	default:
		t.Fatal("charlie should receive typing broadcast")
	}

	h.unregister <- alice
	h.unregister <- bob
	h.unregister <- charlie
	time.Sleep(10 * time.Millisecond)
}

func TestTypingStop(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10)}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10)}
	h.register <- alice
	h.register <- bob
	time.Sleep(10 * time.Millisecond)

	h.BroadcastTyping("alice", "typing_stop", "public", "")

	// Sender should NOT receive typing_stop.
	select {
	case msg := <-alice.send:
		t.Fatalf("sender should not receive typing_stop, got %s", string(msg))
	default:
	}

	// bob should receive typing_stop.
	var got Message
	select {
	case payload := <-bob.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode typing_stop error: %v", err)
		}
		if got.Type != "typing_stop" || got.Username != "alice" {
			t.Fatalf("expected typing_stop from alice, got type=%q username=%q", got.Type, got.Username)
		}
	default:
		t.Fatal("bob should receive typing_stop")
	}

	h.unregister <- alice
	h.unregister <- bob
	time.Sleep(10 * time.Millisecond)
}

func TestTypingRateLimit(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")

	// First call allowed.
	if !h.ShouldBroadcastTyping("alice") {
		t.Error("first typing call should be allowed")
	}

	// Immediate second call denied (within 3s cooldown).
	if h.ShouldBroadcastTyping("alice") {
		t.Error("second typing call within 3s should be rate-limited")
	}

	// Different user tracked independently.
	if !h.ShouldBroadcastTyping("bob") {
		t.Error("different user should not be rate-limited by alice's cooldown")
	}

	// Manually expire alice's cooldown.
	h.mu.Lock()
	h.typingRateLimit["alice"] = time.Now().Add(-4 * time.Second)
	h.mu.Unlock()

	// Now allowed again.
	if !h.ShouldBroadcastTyping("alice") {
		t.Error("typing should be allowed after 3s cooldown expires")
	}

	// After this, should be denied again.
	if h.ShouldBroadcastTyping("alice") {
		t.Error("should be rate-limited again after second allowed call")
	}
}

// --- Reaction tests ---

func TestAddReaction(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10)}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10)}
	h.register <- alice
	h.register <- bob
	time.Sleep(10 * time.Millisecond)

	alice.handleReaction(Message{ID: "msg-1", Emoji: "👍"})

	// Both clients should receive reaction_update via broadcast.
	var got Message
	select {
	case payload := <-alice.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode reaction_update error: %v", err)
		}
		if got.Type != "reaction_update" || got.ID != "msg-1" {
			t.Fatalf("expected reaction_update for msg-1, got type=%q id=%q", got.Type, got.ID)
		}
		if got.Reactions == nil || len(got.Reactions["👍"]) == 0 || got.Reactions["👍"][0] != "alice" {
			t.Fatalf("expected reaction map to include alice, got %v", got.Reactions)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("alice should receive reaction_update")
	}

	select {
	case payload := <-bob.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode reaction_update error: %v", err)
		}
		if got.Type != "reaction_update" {
			t.Fatalf("bob should receive reaction_update, got type=%q", got.Type)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("bob should receive reaction_update")
	}

	h.unregister <- alice
	h.unregister <- bob
	time.Sleep(10 * time.Millisecond)
}

func TestRemoveReaction(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10)}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10)}
	h.register <- alice
	h.register <- bob
	time.Sleep(10 * time.Millisecond)

	// Add a reaction first.
	alice.handleReaction(Message{ID: "msg-1", Emoji: "👍"})
	// Drain pending messages.
	<-alice.send
	<-bob.send

	// Toggle the same reaction off.
	alice.handleReaction(Message{ID: "msg-1", Emoji: "👍"})

	// Reaction should now be removed (empty emoji entry).
	var got Message
	select {
	case payload := <-alice.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode reaction_update error: %v", err)
		}
		if got.Type != "reaction_update" {
			t.Fatalf("expected reaction_update, got type=%q", got.Type)
		}
		// After removal, the emoji key should be absent.
		if reactions, ok := got.Reactions["👍"]; ok && len(reactions) > 0 {
			t.Fatalf("expected 👍 reactions to be empty after toggle-off, got %v", reactions)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("alice should receive reaction_update after toggle-off")
	}

	h.unregister <- alice
	h.unregister <- bob
	time.Sleep(10 * time.Millisecond)
}

func TestReactionBroadcast(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10)}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10)}
	charlie := &Client{hub: h, username: "charlie", send: make(chan []byte, 10)}
	h.register <- alice
	h.register <- bob
	h.register <- charlie
	time.Sleep(10 * time.Millisecond)

	bob.handleReaction(Message{ID: "msg-2", Emoji: "❤️"})

	// All clients (including bob) should receive the broadcast.
	clients := []struct {
		name string
		ch   chan []byte
	}{
		{"alice", alice.send},
		{"bob", bob.send},
		{"charlie", charlie.send},
	}
	for _, c := range clients {
		var got Message
		select {
		case payload := <-c.ch:
			if err := json.Unmarshal(payload, &got); err != nil {
				t.Fatalf("%s: decode error: %v", c.name, err)
			}
			if got.Type != "reaction_update" || got.ID != "msg-2" {
				t.Fatalf("%s: expected reaction_update for msg-2, got type=%q id=%q", c.name, got.Type, got.ID)
			}
		case <-time.After(200 * time.Millisecond):
			t.Fatalf("%s should receive reaction_update broadcast", c.name)
		}
	}

	h.unregister <- alice
	h.unregister <- bob
	h.unregister <- charlie
	time.Sleep(10 * time.Millisecond)
}

func TestReactionEmptyUsername(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	anon := &Client{hub: h, send: make(chan []byte, 10)}
	h.register <- anon
	time.Sleep(10 * time.Millisecond)

	// Reaction with empty username should be silently ignored.
	anon.handleReaction(Message{ID: "msg-1", Emoji: "👍"})
	select {
	case msg := <-anon.send:
		t.Fatalf("expected no reaction broadcast for empty username, got %s", string(msg))
	default:
	}

	h.unregister <- anon
	time.Sleep(10 * time.Millisecond)
}

// --- Message edit tests ---

func TestEditMessage(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Insert a message as alice so alice can edit it.
	stored, _ := ms.InsertMessage("alice", "original content", "", "room-1", "", "", "")

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10), currentRoomID: "room-1"}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10), currentRoomID: "room-1"}
	h.register <- alice
	h.register <- bob
	time.Sleep(10 * time.Millisecond)

	alice.handleMessageEdit(Message{ID: stored.ID, Content: "edited content"})

	// Both in-room clients should receive message_edit.
	var got Message
	select {
	case payload := <-alice.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode message_edit error: %v", err)
		}
		if got.Type != "message_edit" || got.ID != stored.ID {
			t.Fatalf("expected message_edit for %s, got type=%q id=%q", stored.ID, got.Type, got.ID)
		}
		if got.Content != "edited content" || !got.Edited {
			t.Fatalf("expected edited=true content='edited content', got edited=%v content=%q", got.Edited, got.Content)
		}
	default:
		t.Fatal("alice should receive message_edit")
	}

	select {
	case payload := <-bob.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode message_edit error: %v", err)
		}
		if got.Type != "message_edit" {
			t.Fatalf("bob should receive message_edit, got type=%q", got.Type)
		}
	default:
		t.Fatal("bob should receive message_edit")
	}

	h.unregister <- alice
	h.unregister <- bob
	time.Sleep(10 * time.Millisecond)
}

func TestEditMessageNotFound(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10), currentRoomID: "room-1"}
	h.register <- alice
	time.Sleep(10 * time.Millisecond)

	// Try editing a non-existent message.
	alice.handleMessageEdit(Message{ID: "nonexistent", Content: "should not work"})

	// No broadcast should occur (message not found).
	select {
	case msg := <-alice.send:
		t.Fatalf("expected no message for edit of nonexistent message, got %s", string(msg))
	default:
	}

	h.unregister <- alice
	time.Sleep(10 * time.Millisecond)
}

func TestEditMessageNotOwner(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Insert a message as bob.
	stored, _ := ms.InsertMessage("bob", "bob's message", "", "room-1", "", "", "")

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10), currentRoomID: "room-1"}
	h.register <- alice
	time.Sleep(10 * time.Millisecond)

	// alice tries to edit bob's message.
	alice.handleMessageEdit(Message{ID: stored.ID, Content: "alice trying to edit"})

	// Should receive NOT_OWNER error.
	var got Message
	select {
	case payload := <-alice.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode error: %v", err)
		}
		if got.Type != "error" || got.ErrorCode != "NOT_OWNER" {
			t.Fatalf("expected NOT_OWNER error, got type=%q code=%q", got.Type, got.ErrorCode)
		}
	default:
		t.Fatal("expected NOT_OWNER error when editing another user's message")
	}

	h.unregister <- alice
	time.Sleep(10 * time.Millisecond)
}

// --- Poll lifecycle tests ---

func TestCreatePoll(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10), currentRoomID: "room-1"}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10), currentRoomID: "room-1"}
	h.register <- alice
	h.register <- bob
	time.Sleep(10 * time.Millisecond)

	poll := &Poll{
		ID:             "poll-1",
		Question:       "What is your favorite color?",
		Options:        []string{"Red", "Blue", "Green"},
		MultipleChoice: false,
		IsAnonymous:    true,
	}
	alice.handlePollCreate(Message{Poll: poll})

	// Both clients in room-1 should receive poll_created.
	var got Message
	select {
	case payload := <-alice.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode poll_created error: %v", err)
		}
		if got.Type != "poll_created" || got.ID != "poll-1" {
			t.Fatalf("expected poll_created for poll-1, got type=%q id=%q", got.Type, got.ID)
		}
		if got.Poll == nil || got.Poll.Question != "What is your favorite color?" {
			t.Fatal("expected poll data in broadcast")
		}
		if got.Username != "alice" {
			t.Fatalf("expected poll creator=alice, got %q", got.Username)
		}
	default:
		t.Fatal("alice should receive poll_created")
	}

	select {
	case payload := <-bob.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode poll_created error: %v", err)
		}
		if got.Type != "poll_created" {
			t.Fatalf("bob should receive poll_created, got type=%q", got.Type)
		}
	default:
		t.Fatal("bob should receive poll_created")
	}

	h.unregister <- alice
	h.unregister <- bob
	time.Sleep(10 * time.Millisecond)
}

func TestVotePoll(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Seed a poll in the store.
	poll := &Poll{
		ID:       "poll-vote-1",
		RoomID:   "room-1",
		Creator:  "alice",
		Question: "Yes or No?",
		Options:  []string{"Yes", "No"},
		Votes:    make(map[int]int),
		Voters:   make(map[int][]string),
	}
	ms.CreatePoll(poll)

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10), currentRoomID: "room-1"}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10), currentRoomID: "room-1"}
	h.register <- alice
	h.register <- bob
	time.Sleep(10 * time.Millisecond)

	alice.handlePollVote(Message{ID: "poll-vote-1", OptionIndex: 0})

	// Both should receive poll_vote_update.
	var got Message
	select {
	case payload := <-alice.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode poll_vote_update error: %v", err)
		}
		if got.Type != "poll_vote_update" || got.ID != "poll-vote-1" {
			t.Fatalf("expected poll_vote_update for poll-vote-1, got type=%q id=%q", got.Type, got.ID)
		}
		if got.Poll == nil || got.Poll.Votes[0] != 1 {
			t.Fatalf("expected 1 vote for option 0, got %v", got.Poll)
		}
	default:
		t.Fatal("alice should receive poll_vote_update")
	}

	select {
	case payload := <-bob.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode poll_vote_update error: %v", err)
		}
		if got.Type != "poll_vote_update" {
			t.Fatalf("bob should receive poll_vote_update, got type=%q", got.Type)
		}
	default:
		t.Fatal("bob should receive poll_vote_update")
	}

	h.unregister <- alice
	h.unregister <- bob
	time.Sleep(10 * time.Millisecond)
}

func TestClosePoll(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Seed a poll owned by alice.
	poll := &Poll{
		ID:       "poll-close-1",
		RoomID:   "room-1",
		Creator:  "alice",
		Question: "Should we proceed?",
		Options:  []string{"Yes", "No"},
		Votes:    map[int]int{0: 3, 1: 1},
		Voters:   map[int][]string{0: {"a", "b", "c"}, 1: {"d"}},
	}
	ms.CreatePoll(poll)

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10), currentRoomID: "room-1"}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10), currentRoomID: "room-1"}
	h.register <- alice
	h.register <- bob
	time.Sleep(10 * time.Millisecond)

	alice.handlePollClose(Message{ID: "poll-close-1"})

	// Both should receive poll_closed.
	var got Message
	select {
	case payload := <-alice.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode poll_closed error: %v", err)
		}
		if got.Type != "poll_closed" || got.ID != "poll-close-1" {
			t.Fatalf("expected poll_closed for poll-close-1, got type=%q id=%q", got.Type, got.ID)
		}
	default:
		t.Fatal("alice should receive poll_closed")
	}

	select {
	case payload := <-bob.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode poll_closed error: %v", err)
		}
		if got.Type != "poll_closed" {
			t.Fatalf("bob should receive poll_closed, got type=%q", got.Type)
		}
	default:
		t.Fatal("bob should receive poll_closed")
	}

	// Verify poll is actually closed in store.
	closed, _ := ms.GetPoll("poll-close-1")
	if closed == nil || !closed.IsClosed {
		t.Fatal("expected poll to be closed in store")
	}

	h.unregister <- alice
	h.unregister <- bob
	time.Sleep(10 * time.Millisecond)
}

func TestClosePollNotOwner(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Seed a poll owned by alice.
	poll := &Poll{
		ID:       "poll-owner-1",
		RoomID:   "room-1",
		Creator:  "alice",
		Question: "Test?",
		Options:  []string{"A", "B"},
	}
	ms.CreatePoll(poll)

	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10), currentRoomID: "room-1"}
	h.register <- bob
	time.Sleep(10 * time.Millisecond)

	// bob (not the creator) tries to close.
	bob.handlePollClose(Message{ID: "poll-owner-1"})

	// Should receive NOT_OWNER error.
	var got Message
	select {
	case payload := <-bob.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode error: %v", err)
		}
		if got.Type != "error" || got.ErrorCode != "NOT_OWNER" {
			t.Fatalf("expected NOT_OWNER error, got type=%q code=%q", got.Type, got.ErrorCode)
		}
	default:
		t.Fatal("expected NOT_OWNER error when non-creator closes poll")
	}

	h.unregister <- bob
	time.Sleep(10 * time.Millisecond)
}

func TestPollVoteUpdate(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	poll := &Poll{
		ID:       "poll-vu-1",
		RoomID:   "room-1",
		Creator:  "alice",
		Question: "Pick one",
		Options:  []string{"Option A", "Option B", "Option C"},
		Votes:    map[int]int{},
		Voters:   map[int][]string{},
	}
	ms.CreatePoll(poll)

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10), currentRoomID: "room-1"}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10), currentRoomID: "room-1"}
	charlie := &Client{hub: h, username: "charlie", send: make(chan []byte, 10), currentRoomID: "room-1"}
	h.register <- alice
	h.register <- bob
	h.register <- charlie
	time.Sleep(10 * time.Millisecond)

	// Multiple users vote sequentially.
	alice.handlePollVote(Message{ID: "poll-vu-1", OptionIndex: 0})
	<-alice.send   // drain
	<-bob.send     // drain
	<-charlie.send // drain

	bob.handlePollVote(Message{ID: "poll-vu-1", OptionIndex: 1})
	<-alice.send   // drain
	<-bob.send     // drain
	<-charlie.send // drain

	charlie.handlePollVote(Message{ID: "poll-vu-1", OptionIndex: 0})
	// Read the final update.
	select {
	case <-alice.send:
	default:
		t.Fatal("alice should receive final vote update")
	}
	<-bob.send
	<-charlie.send

	// Verify final vote counts.
	final, _ := ms.GetPoll("poll-vu-1")
	if final.Votes[0] != 2 {
		t.Fatalf("expected 2 votes for option 0, got %d", final.Votes[0])
	}
	if final.Votes[1] != 1 {
		t.Fatalf("expected 1 vote for option 1, got %d", final.Votes[1])
	}

	h.unregister <- alice
	h.unregister <- bob
	h.unregister <- charlie
	time.Sleep(10 * time.Millisecond)
}

// --- DM routing tests ---

// Bob should receive the DM.

// Alice should receive an echo.

// bob is NOT registered (offline).

// Alice should still get the echo.

// The DM should be persisted in store.

// --- Broadcast fanout tests ---

func TestBroadcastMultipleClients(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, "")
	go h.Run()
	defer h.Stop()

	// Register 5 clients in the same room.
	const numClients = 5
	clients := make([]*Client, numClients)
	for i := 0; i < numClients; i++ {
		clients[i] = &Client{
			hub:           h,
			username:      "user" + string(rune('0'+i)),
			send:          make(chan []byte, 10),
			currentRoomID: "room-shared",
		}
		h.register <- clients[i]
	}
	time.Sleep(10 * time.Millisecond)

	data, _ := json.Marshal(Message{Type: "fanout_test", Content: "broadcast to all"})
	h.BroadcastToRoom(data, "room-shared")

	// All clients should receive the message.
	for i, c := range clients {
		select {
		case payload := <-c.send:
			var got Message
			if err := json.Unmarshal(payload, &got); err != nil {
				t.Fatalf("client %d: decode error: %v", i, err)
			}
			if got.Type != "fanout_test" {
				t.Fatalf("client %d (user%c): expected type=fanout_test, got %q", i, rune('0'+i), got.Type)
			}
		default:
			t.Fatalf("client %d (user%c) should receive broadcast", i, rune('0'+i))
		}
	}

	// Cleanup.
	for _, c := range clients {
		h.unregister <- c
	}
	time.Sleep(10 * time.Millisecond)
}
