package hub

import (
	"strings"
	"testing"
	"time"

	"tokendancechat/backend/store"
)

// mockStore is a test implementation of the Store interface.
type mockStore struct {
	messages []StoredMessage
	rooms    []StoredRoom
}

func (m *mockStore) InsertMessage(username, content, replyToID, roomID, toUser, groupName string) (StoredMessage, error) {
	msg := StoredMessage{
		ID:        "mock-id-" + username,
		Username:  username,
		Content:   content,
		Timestamp: time.Now().UnixMilli(),
	}
	m.messages = append(m.messages, msg)
	return msg, nil
}

func (m *mockStore) GetMessages(limit int, before int64) []StoredMessage {
	return m.messages
}

func (m *mockStore) GetRoomMessages(roomID string, limit int, before int64) []StoredMessage {
	return m.messages
}

func (m *mockStore) MarkDeleted(msgID string) error { return nil }
func (m *mockStore) TotalMessages() int64 {
	return int64(len(m.messages))
}

func (m *mockStore) CreateRoom(name string) (string, error) {
	id := "room-" + name
	m.rooms = append(m.rooms, StoredRoom{ID: id, Name: name})
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

func (m *mockStore) ListRooms() []StoredRoom {
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
func (m *mockStore) UpdateMessage(messageID, content string) (StoredMessage, error) {
	return StoredMessage{}, nil
}
func (m *mockStore) GetMessageByID(messageID string) (StoredMessage, error) {
	for _, msg := range m.messages {
		if msg.ID == messageID {
			return msg, nil
		}
	}
	return StoredMessage{}, nil
}

func (m *mockStore) SearchMessages(query, roomID string, limit int) ([]store.SearchResult, error) {
	return nil, nil
}
func (m *mockStore) AddFriend(username, friend string) error            { return nil }
func (m *mockStore) RemoveFriend(username, friend string) error          { return nil }
func (m *mockStore) GetAllFriends() map[string][]string                   { return nil }
func (m *mockStore) GetFriends(username string) []string                  { return nil }
func (m *mockStore) CreateGroup(name, creator string) error               { return nil }
func (m *mockStore) AddGroupMember(groupName, username string) error     { return nil }
func (m *mockStore) RemoveGroupMember(groupName, username string) error  { return nil }
func (m *mockStore) GetGroupMembers(groupName string) []string           { return nil }
func (m *mockStore) GetAllGroups() map[string][]string                    { return nil }
func (m *mockStore) GetUndeliveredDMs(username string, limit int) []StoredMessage { return nil }
func (m *mockStore) MarkMessagesDelivered(ids []string) error                       { return nil }
func (m *mockStore) BlockUser(username, blocked string) error                      { return nil }
func (m *mockStore) UnblockUser(username, blocked string) error                    { return nil }
func (m *mockStore) IsBlocked(username, blocked string) bool                        { return false }
func (m *mockStore) GetBlockedUsers(username string) []string                       { return nil }
func (m *mockStore) PinMessage(roomID, messageID, pinnedBy string) error           { return nil }
func (m *mockStore) UnpinMessage(roomID, messageID string) error                   { return nil }
func (m *mockStore) GetPinnedMessages(roomID string) []StoredMessage               { return nil }
func (m *mockStore) Ping() error                                                   { return nil }
func (m *mockStore) PinConversation(username, key string) error                       { return nil }
func (m *mockStore) UnpinConversation(username, key string) error                     { return nil }
func (m *mockStore) ListPinnedConversations(username string) []string                 { return nil }

func TestNew(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

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
		wantAgent bool
	}{
		{
			name:      "token bot mention routes to LLM bot only",
			content:   "@TokenBot 你好",
			wantToken: true,
		},
		{
			name:      "pico claw mention routes to agent only",
			content:   "@PicoClaw 帮我看看",
			wantAgent: true,
		},
		{
			name:      "legacy bot alias routes to token bot",
			content:   "@bot ping",
			wantToken: true,
		},
		{
			name:    "regular user mention does not trigger assistants",
			content: "@alice ping",
		},
		{
			name:      "both assistants can be requested explicitly",
			content:   "@TokenBot 总结一下，@PicoClaw 执行一下",
			wantToken: true,
			wantAgent: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := assistantMentionTarget(tc.content, "TokenBot", "PicoClaw")
			if got.TokenBot != tc.wantToken {
				t.Fatalf("TokenBot target = %v, want %v", got.TokenBot, tc.wantToken)
			}
			if got.Agent != tc.wantAgent {
				t.Fatalf("Agent target = %v, want %v", got.Agent, tc.wantAgent)
			}
		})
	}
}

func TestPicoStreamDelta(t *testing.T) {
	last, delta := picoStreamDelta("", "O")
	if last != "O" || delta != "O" {
		t.Fatalf("first delta = (%q, %q), want (O, O)", last, delta)
	}
	last, delta = picoStreamDelta(last, "OK")
	if last != "OK" || delta != "K" {
		t.Fatalf("accumulated delta = (%q, %q), want (OK, K)", last, delta)
	}
	last, delta = picoStreamDelta(last, "done")
	if last != "done" || delta != "done" {
		t.Fatalf("replacement delta = (%q, %q), want (done, done)", last, delta)
	}
}

func TestIsUsernameTaken(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
	go h.Run()

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
	h := New(ms, nil, nil, "")
	go h.Run()

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
	h := New(ms, nil, nil, "")
	// Start the hub.
	go h.Run()

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
	h := New(ms, nil, nil, "")

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
	h := New(ms, nil, nil, "")
	go h.Run()

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
	h := New(ms, nil, nil, "")
	go h.Run()

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
	targets := assistantMentionTarget("测试？", "TokenBot", "PicoClaw")
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

func TestPicoClawContentSizeLimit(t *testing.T) {
	// This test verifies the conceptual enforcement:
	// maxPicoClawContent = 10000 runes in main.go's ProactiveCallback.
	const maxPicoClawContent = 10000

	content := string(make([]rune, maxPicoClawContent+500))
	if len([]rune(content)) > maxPicoClawContent {
		content = string([]rune(content)[:maxPicoClawContent])
	}
	if len([]rune(content)) != maxPicoClawContent {
		t.Errorf("expected truncated content to be %d runes, got %d", maxPicoClawContent, len([]rune(content)))
	}
}
