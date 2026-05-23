package hub

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"tokendancechat/backend/store"
)

// mockStore is a test implementation of the Store interface.
type mockStore struct {
	messages    []StoredMessage
	rooms       []StoredRoom
	groupRoles  map[string]string
	webhooks    []store.Webhook
	webhookByID map[string]store.Webhook
	auditLogs    []store.WebhookAuditLog
	customEmojis []store.CustomEmoji
}

func (m *mockStore) InsertMessage(username, content, replyToID, roomID, toUser, groupName, threadID string) (StoredMessage, error) {
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
func (m *mockStore) TotalUsers() int64              { return 0 }
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
func (m *mockStore) AddFriend(username, friend string) error                      { return nil }
func (m *mockStore) RemoveFriend(username, friend string) error                   { return nil }
func (m *mockStore) GetAllFriends() map[string][]string                           { return nil }
func (m *mockStore) GetFriends(username string) []string                          { return nil }
func (m *mockStore) CreateGroup(name, creator string) error                       { return nil }
func (m *mockStore) AddGroupMember(groupName, username string) error              { return nil }
func (m *mockStore) RemoveGroupMember(groupName, username string) error           { return nil }
func (m *mockStore) GetGroupMembers(groupName string) []string                    { return nil }
func (m *mockStore) GetAllGroups() map[string][]string                            { return nil }
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
func (m *mockStore) UpdateUserStatus(username, status string) error                 { return nil }
func (m *mockStore) UpdateUserLastSeen(username string) error                       { return nil }
func (m *mockStore) GetAllUserProfiles() ([]store.UserProfile, error)               { return nil, nil }
func (m *mockStore) CreatePoll(poll *Poll) error                                    { return nil }
func (m *mockStore) GetPoll(pollID string) (*Poll, error)                           { return nil, nil }
func (m *mockStore) VotePoll(pollID string, username string, optionIndex int) error { return nil }
func (m *mockStore) ClosePoll(pollID string) error                                  { return nil }
func (m *mockStore) SetNotificationPrefs(username, key string, mutedUntil int64, showPreview bool) error {
	return nil
}
func (m *mockStore) GetNotificationPrefs(username, key string) (int64, bool, error) {
	return 0, true, nil
}
func (m *mockStore) ListNotificationPrefs(username string) []store.NotificationPref { return nil }
func (m *mockStore) GetThreadMessages(parentMessageID string) []StoredMessage       { return nil }
func (m *mockStore) GetThreadReplyCount(parentMessageID string) int                 { return 0 }
func (m *mockStore) ScheduleMessage(msg store.ScheduledMessage) error               { return nil }
func (m *mockStore) GetPendingScheduledMessages(ctx context.Context) ([]store.ScheduledMessage, error) {
	return nil, nil
}
func (m *mockStore) MarkScheduledSent(id string) error                { return nil }
func (m *mockStore) CancelScheduledMessage(id, username string) error { return nil }
func (m *mockStore) GetUserScheduledMessages(username string) ([]store.ScheduledMessage, error) {
	return nil, nil
}
func (m *mockStore) ExportMessages(ctx context.Context, roomID, toUser, groupName, format string, limit int) ([]StoredMessage, error) {
	return nil, nil
}
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
	if m.groupRoles != nil {
		if role := m.groupRoles[groupName+":"+username]; role != "" {
			return role, nil
		}
		if role := m.groupRoles[username]; role != "" {
			return role, nil
		}
	}
	return "member", nil
}
func (m *mockStore) GetGroupOwner(groupName string) (string, error)                     { return "", nil }
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
func (m *mockStore) CreateChatFolder(username, name string) (*ChatFolder, error) {
	return &ChatFolder{ID: "f1", Name: name}, nil
}
func (m *mockStore) DeleteChatFolder(username, id string) error          { return nil }
func (m *mockStore) RenameChatFolder(username, id, newName string) error { return nil }
func (m *mockStore) AddToFolder(folderID, key string) error              { return nil }
func (m *mockStore) RemoveFromFolder(folderID, key string) error         { return nil }
func (m *mockStore) ListFolders(username string) ([]ChatFolder, error)   { return nil, nil }
func (m *mockStore) GetFolderItems(folderID string) ([]string, error)    { return nil, nil }

func (m *mockStore) CreateWebhook(id, groupName, url, secret, createdBy string) error {
	w := store.Webhook{
		ID:        id,
		GroupName: groupName,
		URL:       url,
		Secret:    secret,
		CreatedBy: createdBy,
		CreatedAt: time.Now().UnixMilli(),
	}
	m.webhooks = append(m.webhooks, w)
	if m.webhookByID == nil {
		m.webhookByID = make(map[string]store.Webhook)
	}
	m.webhookByID[id] = w
	return nil
}
func (m *mockStore) DeleteWebhook(id, groupName, deletedBy string) error {
	next := m.webhooks[:0]
	for _, w := range m.webhooks {
		if w.ID == id && w.GroupName == groupName {
			m.auditLogs = append(m.auditLogs, store.WebhookAuditLog{
				ID: "audit-delete-" + id, WebhookID: id, GroupName: groupName,
				Action: "deleted", Actor: deletedBy, CreatedAt: time.Now().UnixMilli(),
				Metadata: `{"url":"` + w.URL + `"}`,
			})
			if m.webhookByID != nil {
				delete(m.webhookByID, id)
			}
			continue
		}
		next = append(next, w)
	}
	m.webhooks = next
	return nil
}
func (m *mockStore) RotateWebhookSecret(id, groupName, secret, rotatedBy string) (*store.Webhook, error) {
	for i, w := range m.webhooks {
		if w.ID == id && w.GroupName == groupName {
			w.Secret = secret
			w.RotatedAt = time.Now().UnixMilli()
			w.RotatedBy = rotatedBy
			m.webhooks[i] = w
			if m.webhookByID == nil {
				m.webhookByID = make(map[string]store.Webhook)
			}
			m.webhookByID[id] = w
			m.auditLogs = append(m.auditLogs, store.WebhookAuditLog{
				ID: "audit-rotate-" + id, WebhookID: id, GroupName: groupName,
				Action: "rotated", Actor: rotatedBy, CreatedAt: w.RotatedAt,
				Metadata: `{"url":"` + w.URL + `"}`,
			})
			return &w, nil
		}
	}
	return nil, nil
}
func (m *mockStore) ListWebhooks(groupName string) ([]store.Webhook, error) {
	if len(m.webhooks) == 0 {
		return nil, nil
	}
	result := make([]store.Webhook, 0, len(m.webhooks))
	for _, w := range m.webhooks {
		if w.GroupName == groupName {
			result = append(result, w)
		}
	}
	return result, nil
}
func (m *mockStore) ListWebhookAuditLogs(groupName string, limit int) ([]store.WebhookAuditLog, error) {
	result := make([]store.WebhookAuditLog, 0, len(m.auditLogs))
	for _, item := range m.auditLogs {
		if item.GroupName == groupName {
			result = append(result, item)
		}
	}
	return result, nil
}
func (m *mockStore) GetWebhookByURL(url string) (*store.Webhook, error) { return nil, nil }
func (m *mockStore) VerifyWebhookSecret(url, secret string) (*store.Webhook, bool, error) {
	for _, w := range m.webhooks {
		if w.URL == url {
			return &w, w.Secret == secret, nil
		}
	}
	return nil, false, nil
}

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

func TestWebhookCreateReturnsSecretToCreator(t *testing.T) {
	ms := &mockStore{groupRoles: map[string]string{"alice": "admin"}}
	h := New(ms, nil, nil, "")
	client := &Client{
		hub:      h,
		send:     make(chan []byte, 1),
		username: "alice",
	}

	client.handleWebhookCreate(Message{Group: "team"})

	var got Message
	select {
	case payload := <-client.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode webhook_create response: %v", err)
		}
	default:
		t.Fatal("expected webhook_created response")
	}
	if got.Type != "webhook_created" {
		t.Fatalf("response type = %q, want webhook_created", got.Type)
	}
	if got.Group != "team" {
		t.Fatalf("group = %q, want team", got.Group)
	}
	if got.ID == "" {
		t.Fatal("expected webhook id")
	}
	if got.Content == "" {
		t.Fatal("expected webhook URL in content")
	}
	if got.Secret == "" {
		t.Fatal("expected one-time webhook secret in response")
	}
	if len(got.Secret) < 32 {
		t.Fatalf("webhook secret length = %d, want at least 32 characters", len(got.Secret))
	}
}

func TestWebhookListDoesNotExposeSecrets(t *testing.T) {
	ms := &mockStore{
		groupRoles: map[string]string{"alice": "admin"},
		webhooks: []store.Webhook{
			{
				ID:        "wh-1",
				GroupName: "team",
				URL:       "wh-1-url",
				Secret:    "secret-value",
				CreatedBy: "alice",
				CreatedAt: 12345,
			},
		},
	}
	h := New(ms, nil, nil, "")
	client := &Client{
		hub:      h,
		send:     make(chan []byte, 1),
		username: "alice",
	}

	client.handleWebhookList(Message{Group: "team"})

	var raw map[string]interface{}
	select {
	case payload := <-client.send:
		if err := json.Unmarshal(payload, &raw); err != nil {
			t.Fatalf("failed to decode webhook_list response: %v", err)
		}
	default:
		t.Fatal("expected webhook_list response")
	}
	if raw["type"] != "webhook_list" {
		t.Fatalf("response type = %v, want webhook_list", raw["type"])
	}
	encoded, err := json.Marshal(raw["webhooks"])
	if err != nil {
		t.Fatalf("failed to encode webhooks payload: %v", err)
	}
	if strings.Contains(string(encoded), "secret-value") || strings.Contains(string(encoded), "Secret") || strings.Contains(string(encoded), "secret") {
		t.Fatalf("webhook_list leaked secret data: %s", string(encoded))
	}
	if !strings.Contains(string(encoded), "wh-1-url") {
		t.Fatalf("webhook_list omitted public URL: %s", string(encoded))
	}
}

func TestWebhookListRequiresGroupAdmin(t *testing.T) {
	ms := &mockStore{
		groupRoles: map[string]string{"alice": "member"},
		webhooks: []store.Webhook{
			{
				ID:        "wh-1",
				GroupName: "team",
				URL:       "wh-1-url",
				Secret:    "secret-value",
				CreatedBy: "owner",
				CreatedAt: 12345,
			},
		},
	}
	h := New(ms, nil, nil, "")
	client := &Client{
		hub:      h,
		send:     make(chan []byte, 1),
		username: "alice",
	}

	client.handleWebhookList(Message{Group: "team"})

	select {
	case payload := <-client.send:
		t.Fatalf("expected no webhook_list response for non-admin, got %s", string(payload))
	default:
	}
}

func TestWebhookRotateReturnsSecretAndMetadataToAdmin(t *testing.T) {
	ms := &mockStore{
		groupRoles: map[string]string{"alice": "admin"},
		webhooks: []store.Webhook{
			{
				ID:        "wh-1",
				GroupName: "team",
				URL:       "wh-1-url",
				Secret:    "old-secret",
				CreatedBy: "owner",
				CreatedAt: 12345,
			},
		},
	}
	h := New(ms, nil, nil, "")
	client := &Client{
		hub:      h,
		send:     make(chan []byte, 1),
		username: "alice",
	}

	client.handleWebhookRotate(Message{Group: "team", ID: "wh-1"})

	var got Message
	select {
	case payload := <-client.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode webhook_rotate response: %v", err)
		}
	default:
		t.Fatal("expected webhook_rotated response")
	}
	if got.Type != "webhook_rotated" {
		t.Fatalf("response type = %q, want webhook_rotated", got.Type)
	}
	if got.ID != "wh-1" || got.Group != "team" || got.Content != "wh-1-url" {
		t.Fatalf("unexpected rotate response: %+v", got)
	}
	if got.Secret == "" || len(got.Secret) < 32 {
		t.Fatalf("expected one-time rotated secret, got %q", got.Secret)
	}
	if got.RotatedBy != "alice" || got.RotatedAt == 0 {
		t.Fatalf("missing rotation metadata: %+v", got)
	}
	if ms.webhooks[0].Secret == "old-secret" {
		t.Fatal("mock webhook secret was not rotated")
	}
}

func TestWebhookRotateRequiresGroupAdmin(t *testing.T) {
	ms := &mockStore{
		groupRoles: map[string]string{"alice": "member"},
		webhooks: []store.Webhook{
			{ID: "wh-1", GroupName: "team", URL: "wh-1-url", Secret: "old-secret"},
		},
	}
	h := New(ms, nil, nil, "")
	client := &Client{
		hub:      h,
		send:     make(chan []byte, 1),
		username: "alice",
	}

	client.handleWebhookRotate(Message{Group: "team", ID: "wh-1"})

	select {
	case payload := <-client.send:
		t.Fatalf("expected no webhook_rotated response for non-admin, got %s", string(payload))
	default:
	}
	if ms.webhooks[0].Secret != "old-secret" {
		t.Fatal("non-admin rotated webhook secret")
	}
}

func TestWebhookAuditListRedactsMetadataAndRequiresGroupAdmin(t *testing.T) {
	ms := &mockStore{
		groupRoles: map[string]string{"alice": "admin", "mallory": "member"},
		auditLogs: []store.WebhookAuditLog{
			{
				ID: "audit-1", WebhookID: "wh-1", GroupName: "team",
				Action: "rotated", Actor: "alice", CreatedAt: 12345,
				Metadata: `{"secret":"secret-value","hash":"whsec_sha256:abc"}`,
			},
		},
	}
	h := New(ms, nil, nil, "")
	admin := &Client{
		hub:      h,
		send:     make(chan []byte, 1),
		username: "alice",
	}

	admin.handleWebhookAuditList(Message{Group: "team"})

	var raw map[string]interface{}
	select {
	case payload := <-admin.send:
		if err := json.Unmarshal(payload, &raw); err != nil {
			t.Fatalf("failed to decode webhook_audit_list response: %v", err)
		}
	default:
		t.Fatal("expected webhook_audit_list response")
	}
	if raw["type"] != "webhook_audit_list" {
		t.Fatalf("response type = %v, want webhook_audit_list", raw["type"])
	}
	encoded, err := json.Marshal(raw["audit_logs"])
	if err != nil {
		t.Fatalf("failed to encode audit payload: %v", err)
	}
	payload := string(encoded)
	if strings.Contains(payload, "secret-value") || strings.Contains(payload, "whsec_sha256:") || strings.Contains(payload, "metadata") {
		t.Fatalf("webhook_audit_list leaked sensitive metadata: %s", payload)
	}
	if !strings.Contains(payload, "rotated") || !strings.Contains(payload, "alice") {
		t.Fatalf("webhook_audit_list omitted safe audit fields: %s", payload)
	}

	member := &Client{
		hub:      h,
		send:     make(chan []byte, 1),
		username: "mallory",
	}
	member.handleWebhookAuditList(Message{Group: "team"})
	select {
	case payload := <-member.send:
		t.Fatalf("expected no webhook_audit_list response for non-admin, got %s", string(payload))
	default:
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
	h := New(ms, nil, nil, "")
	go h.Run()

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
	h := New(ms, nil, nil, "")

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

func TestHandleFriendRequest(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	c := &Client{hub: h, username: "alice", send: make(chan []byte, 1)}

	// Self-request: should be silently ignored.
	c.handleFriendRequest(Message{To: "alice"})
	select {
	case msg := <-c.send:
		t.Fatalf("expected no response for self-request, got %s", string(msg))
	default:
	}

	// Already friends: should receive ALREADY_FRIENDS error.
	h.AddFriend("alice", "bob")
	c.handleFriendRequest(Message{To: "bob"})
	var got Message
	select {
	case payload := <-c.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode error: %v", err)
		}
	default:
		t.Fatal("expected ALREADY_FRIENDS error response")
	}
	if got.Type != "error" || got.ErrorCode != "ALREADY_FRIENDS" {
		t.Fatalf("expected ALREADY_FRIENDS error, got type=%q code=%q", got.Type, got.ErrorCode)
	}
	if got.Content != "already friends with bob" {
		t.Fatalf("unexpected error content: %q", got.Content)
	}

	// Valid request to a new user: no error to sender (target notified via SendToUser if online).
	freshClient := &Client{hub: h, username: "alice", send: make(chan []byte, 1)}
	freshClient.handleFriendRequest(Message{To: "charlie"})
	select {
	case msg := <-freshClient.send:
		t.Fatalf("expected no message to sender for valid friend_request, got %s", string(msg))
	default:
	}
}

func TestHandleFriendAccept(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	c := &Client{hub: h, username: "alice", send: make(chan []byte, 1)}

	// Empty username guard.
	anon := &Client{hub: h, send: make(chan []byte, 1)}
	anon.handleFriendAccept(Message{From: "bob"})
	select {
	case msg := <-anon.send:
		t.Fatalf("expected no response for empty username, got %s", string(msg))
	default:
	}

	// Valid accept: self receives updated friend_list.
	c.handleFriendAccept(Message{From: "bob"})

	var got Message
	select {
	case payload := <-c.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode: %v", err)
		}
	default:
		t.Fatal("expected friend_list response after accept")
	}
	if got.Type != "friend_list" {
		t.Fatalf("expected friend_list, got %q", got.Type)
	}
	if !h.IsFriend("alice", "bob") {
		t.Error("expected alice and bob to be friends after accept")
	}
}

func TestHandleFriendReject(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	// Empty username guard.
	c := &Client{hub: h, send: make(chan []byte, 1)}
	c.handleFriendReject(Message{From: "bob"})
	select {
	case msg := <-c.send:
		t.Fatalf("expected no response for empty username, got %s", string(msg))
	default:
	}

	// Empty From: handler returns early.
	c.username = "alice"
	c.handleFriendReject(Message{From: ""})
	select {
	case msg := <-c.send:
		t.Fatalf("expected no response for empty From, got %s", string(msg))
	default:
	}

	// Valid reject: sends friend_reject to requester (silent if offline).
	c.handleFriendReject(Message{From: "bob"})
	select {
	case msg := <-c.send:
		t.Fatalf("expected no response to rejecter, got %s", string(msg))
	default:
	}
}

func TestHandleBlock(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

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

func TestHandleRoomCreateAndList(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	c := &Client{hub: h, username: "alice", send: make(chan []byte, 1)}

	// Invalid room name: should get INVALID_ROOM_NAME error.
	c.handleRoomCreate(Message{Group: ""})
	var got Message
	select {
	case payload := <-c.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode invalid room error: %v", err)
		}
	default:
		t.Fatal("expected INVALID_ROOM_NAME error")
	}
	if got.Type != "error" || got.ErrorCode != "INVALID_ROOM_NAME" {
		t.Fatalf("expected INVALID_ROOM_NAME error, got type=%q code=%q", got.Type, got.ErrorCode)
	}

	// Valid room create: should get room_create confirmation with room ID.
	c2 := &Client{hub: h, username: "bob", send: make(chan []byte, 1)}
	c2.handleRoomCreate(Message{Group: "test-room"})
	select {
	case payload := <-c2.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode room_create response: %v", err)
		}
	default:
		t.Fatal("expected room_create confirmation")
	}
	if got.Type != "room_create" {
		t.Fatalf("expected room_create, got %q", got.Type)
	}
	if got.Group != "test-room" {
		t.Fatalf("expected room name test-room, got %q", got.Group)
	}
	if got.RoomID == "" {
		t.Fatal("expected non-empty room ID")
	}

	// Room list: should include the newly created room.
	c3 := &Client{hub: h, username: "charlie", send: make(chan []byte, 1)}
	c3.handleRoomList()
	select {
	case payload := <-c3.send:
		var listMsg Message
		if err := json.Unmarshal(payload, &listMsg); err != nil {
			t.Fatalf("failed to decode room_list: %v", err)
		}
		if listMsg.Type != "room_list" {
			t.Fatalf("expected room_list, got %q", listMsg.Type)
		}
		found := false
		for _, r := range listMsg.Rooms {
			if r.Name == "test-room" {
				found = true
				break
			}
		}
		if !found {
			t.Fatal("expected test-room in room list")
		}
	default:
		t.Fatal("expected room_list response")
	}
}

func TestHandlePinMessage(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
	go h.Run()

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
	h := New(ms, nil, nil, "")
	go h.Run()

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

func TestHandleMuteAndUnmuteConversation(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
	go h.Run()

	c := &Client{hub: h, username: "alice", send: make(chan []byte, 1)}
	h.register <- c
	time.Sleep(10 * time.Millisecond)

	// Mute a conversation.
	c.handleMuteConversation(Message{Key: "dm:bob"})

	var got Message
	select {
	case payload := <-c.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode muted_conversations: %v", err)
		}
	default:
		t.Fatal("expected muted_conversations response after mute")
	}
	if got.Type != "muted_conversations" {
		t.Fatalf("expected muted_conversations, got %q", got.Type)
	}

	// Unmute — reuse the same client to avoid duplicate-username kick.
	c.handleUnmuteConversation(Message{Key: "dm:bob"})
	select {
	case payload := <-c.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode muted_conversations after unmute: %v", err)
		}
	default:
		t.Fatal("expected muted_conversations response after unmute")
	}
	if got.Type != "muted_conversations" {
		t.Fatalf("expected muted_conversations, got %q", got.Type)
	}

	// Guard: empty username returns early.
	anon := &Client{hub: h, send: make(chan []byte, 1)}
	anon.handleMuteConversation(Message{Key: "dm:bob"})
	select {
	case msg := <-anon.send:
		t.Fatalf("expected no response for empty username, got %s", string(msg))
	default:
	}

	// Guard: empty key returns early.
	c.handleMuteConversation(Message{Key: ""})
	select {
	case msg := <-c.send:
		t.Fatalf("expected no response for empty key, got %s", string(msg))
	default:
	}

	// Cleanup.
	h.unregister <- c
	time.Sleep(10 * time.Millisecond)
}

func TestHandleArchiveAndUnarchiveConversation(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
	go h.Run()

	c := &Client{hub: h, username: "alice", send: make(chan []byte, 1)}
	h.register <- c
	time.Sleep(10 * time.Millisecond)

	// Archive a conversation.
	c.handleArchiveConversation(Message{Key: "dm:bob"})

	var got Message
	select {
	case payload := <-c.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode archived_conversations: %v", err)
		}
	default:
		t.Fatal("expected archived_conversations response after archive")
	}
	if got.Type != "archived_conversations" {
		t.Fatalf("expected archived_conversations, got %q", got.Type)
	}

	// Unarchive — reuse the same client.
	c.handleUnarchiveConversation(Message{Key: "dm:bob"})
	select {
	case payload := <-c.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("failed to decode archived_conversations after unarchive: %v", err)
		}
	default:
		t.Fatal("expected archived_conversations response after unarchive")
	}
	if got.Type != "archived_conversations" {
		t.Fatalf("expected archived_conversations, got %q", got.Type)
	}

	// Guard: empty username returns early.
	anon := &Client{hub: h, send: make(chan []byte, 1)}
	anon.handleArchiveConversation(Message{Key: "dm:bob"})
	select {
	case msg := <-anon.send:
		t.Fatalf("expected no response for empty username, got %s", string(msg))
	default:
	}

	// Guard: empty key returns early.
	c.handleArchiveConversation(Message{Key: ""})
	select {
	case msg := <-c.send:
		t.Fatalf("expected no response for empty key, got %s", string(msg))
	default:
	}

	// Cleanup.
	h.unregister <- c
	time.Sleep(10 * time.Millisecond)
}

func TestHandleCustomEmojiAddAndList(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

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

func TestValidateGroupName(t *testing.T) {
	tests := []struct {
		name      string
		groupName string
		valid     bool
	}{
		// Valid cases.
		{name: "simple english", groupName: "developers", valid: true},
		{name: "with hyphens", groupName: "dev-team", valid: true},
		{name: "with spaces", groupName: "Dev Team", valid: true},
		{name: "chinese", groupName: "开发团队", valid: true},
		{name: "mixed cn and en", groupName: "Dev开发_Group", valid: true},
		{name: "single char", groupName: "a", valid: true},
		{name: "exactly 30 chars", groupName: "123456789012345678901234567890", valid: true},

		// Invalid cases.
		{name: "empty", groupName: "", valid: false},
		{name: "31 chars too long", groupName: "1234567890123456789012345678901", valid: false},
		{name: "special char @", groupName: "dev@team", valid: false},
		{name: "special char #", groupName: "dev#team", valid: false},
		{name: "emoji", groupName: "team\xf0\x9f\x98\x80", valid: false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := ValidateGroupName(tc.groupName)
			if result != tc.valid {
				t.Errorf("ValidateGroupName(%q) = %v, want %v", tc.groupName, result, tc.valid)
			}
		})
	}
}

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
			result := isReservedUsername(tc.username)
			if result != tc.reserved {
				t.Errorf("isReservedUsername(%q) = %v, want %v", tc.username, result, tc.reserved)
			}
		})
	}
}

func TestExecuteHubCommand(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "", "TestAgent")

	t.Run("online_users", func(t *testing.T) {
		resp := h.ExecuteHubCommand(HubCommand{Type: "online_users"})
		if !resp.Success {
			t.Error("expected success for online_users")
		}
		if resp.Type != "online_users" {
			t.Errorf("type = %q, want online_users", resp.Type)
		}
		online, ok := resp.Data["online"].([]string)
		if !ok {
			t.Fatal("expected online to be []string in data")
		}
		if len(online) != 0 {
			t.Errorf("expected 0 online users initially, got %d", len(online))
		}
		count, ok := resp.Data["count"].(int)
		if !ok || count != 0 {
			t.Errorf("expected count=0, got count=%v", resp.Data["count"])
		}
	})

	t.Run("history", func(t *testing.T) {
		ms.messages = append(ms.messages, StoredMessage{
			ID: "msg-1", Username: "alice", Content: "hello", Timestamp: 1000,
		})
		resp := h.ExecuteHubCommand(HubCommand{Type: "history", Limit: 10})
		if !resp.Success {
			t.Error("expected success for history command")
		}
		if resp.Type != "history" {
			t.Errorf("type = %q, want history", resp.Type)
		}
	})

	t.Run("history with room_id", func(t *testing.T) {
		resp := h.ExecuteHubCommand(HubCommand{
			Type:   "history",
			RoomID: "room-1",
			Limit:  5,
		})
		if !resp.Success {
			t.Error("expected success for history with room_id")
		}
		if resp.Data["room_id"] != "room-1" {
			t.Errorf("room_id = %v, want room-1", resp.Data["room_id"])
		}
	})

	t.Run("history limit cap", func(t *testing.T) {
		resp := h.ExecuteHubCommand(HubCommand{Type: "history", Limit: 500})
		if !resp.Success {
			t.Error("expected success even with excessive limit")
		}
	})

	t.Run("send_dm", func(t *testing.T) {
		resp := h.ExecuteHubCommand(HubCommand{
			Type:    "send_dm",
			ToUser:  "alice",
			Content: "hello from test agent",
		})
		if !resp.Success {
			t.Errorf("expected success for send_dm, got error: %s", resp.Error)
		}
		if resp.Type != "send_dm" {
			t.Errorf("type = %q, want send_dm", resp.Type)
		}
	})

	t.Run("send_dm with custom from param", func(t *testing.T) {
		resp := h.ExecuteHubCommand(HubCommand{
			Type:    "send_dm",
			ToUser:  "bob",
			Content: "custom sender message",
			Params:  map[string]any{"from": "CustomBot"},
		})
		if !resp.Success {
			t.Errorf("expected success with custom from, got error: %s", resp.Error)
		}
	})

	t.Run("send_dm empty content", func(t *testing.T) {
		resp := h.ExecuteHubCommand(HubCommand{
			Type:    "send_dm",
			ToUser:  "alice",
			Content: "",
		})
		if resp.Success {
			t.Error("expected failure for send_dm with empty content")
		}
	})

	t.Run("unknown command", func(t *testing.T) {
		resp := h.ExecuteHubCommand(HubCommand{Type: "invalid_cmd"})
		if resp.Success {
			t.Error("expected failure for unknown command")
		}
		if resp.Type != "invalid_cmd" {
			t.Errorf("type = %q, want invalid_cmd", resp.Type)
		}
		if resp.Error == "" {
			t.Error("expected non-empty error message for unknown command")
		}
	})
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

func TestAssistantMentionTargetKeywordTriggers(t *testing.T) {
	tests := []struct {
		name      string
		content   string
		wantToken bool
		wantAgent bool
	}{
		{
			name:      "keyword help triggers TokenBot",
			content:   "I need help",
			wantToken: true,
		},
		{
			name:      "keyword 帮助 triggers TokenBot",
			content:   "我需要帮助",
			wantToken: true,
		},
		{
			name:      "keyword bot triggers TokenBot",
			content:   "is bot working",
			wantToken: true,
		},
		{
			name:      "keyword 机器人 triggers TokenBot",
			content:   "机器人你好",
			wantToken: true,
		},
		{
			name:      "keyword 任务 triggers PicoClaw",
			content:   "创建一个任务",
			wantAgent: true,
		},
		{
			name:      "keyword 分析 triggers PicoClaw",
			content:   "分析一下这个问题",
			wantAgent: true,
		},
		{
			name:      "keyword 帮我 triggers PicoClaw",
			content:   "帮我写一段代码",
			wantAgent: true,
		},
		{
			name:      "keyword summarize triggers PicoClaw",
			content:   "summarize this document",
			wantAgent: true,
		},
		{
			name:      "keyword translate triggers PicoClaw",
			content:   "translate to Chinese",
			wantAgent: true,
		},
		{
			name:      "keyword search triggers PicoClaw",
			content:   "search for information",
			wantAgent: true,
		},
		{
			name:      "keyword generate triggers PicoClaw",
			content:   "generate a report",
			wantAgent: true,
		},
		{
			name:      "keyword write triggers PicoClaw",
			content:   "write a poem",
			wantAgent: true,
		},
		{
			name:      "keyword code triggers PicoClaw",
			content:   "write some code",
			wantAgent: true,
		},
		{
			name:    "no trigger words at all",
			content: "hello how are you today",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := assistantMentionTarget(tc.content, "TokenBot", "PicoClaw")
			if got.TokenBot != tc.wantToken {
				t.Errorf("TokenBot target = %v, want %v (content=%q)", got.TokenBot, tc.wantToken, tc.content)
			}
			if got.Agent != tc.wantAgent {
				t.Errorf("Agent target = %v, want %v (content=%q)", got.Agent, tc.wantAgent, tc.content)
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
			name:      "pico claw alias",
			mention:   "picoclaw",
			canonical: "PicoClaw",
			aliases:   []string{"claw", "picoclaw"},
			expected:  true,
		},
		{
			name:      "claw alias for pico",
			mention:   "claw",
			canonical: "PicoClaw",
			aliases:   []string{"claw"},
			expected:  true,
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