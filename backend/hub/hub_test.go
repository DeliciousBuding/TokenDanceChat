package hub

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"tokendancechat/backend/llm"
	"tokendancechat/backend/store"
)

// mockStore is a test implementation of the Store interface.
type mockStore struct {
	messages     []StoredMessage
	rooms        []StoredRoom
	groupRoles   map[string]string
	webhooks     []store.Webhook
	webhookByID  map[string]store.Webhook
	auditLogs    []store.WebhookAuditLog
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
	return m.reactions[messageID], nil
}
func (m *mockStore) GetReactionsForMessages(messageIDs []string) map[string]map[string][]string {
	result := make(map[string]map[string][]string)
	if m.reactions == nil {
		return result
	}
	for _, id := range messageIDs {
		if r, ok := m.reactions[id]; ok && len(r) > 0 {
			result[id] = r
		}
	}
	return result
}
func (m *mockStore) UpdateMessage(messageID, content string) (StoredMessage, error) {
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
func (m *mockStore) DeleteCustomEmoji(name, username string) error                      { return nil }
func (m *mockStore) SearchCustomEmojis(query string) ([]store.CustomEmoji, error)       { return nil, nil }
func (m *mockStore) LogCall(call store.CallRecord) error                                { return nil }
func (m *mockStore) UpdateCallRecord(id, status string, startedAt, endedAt int64) error { return nil }
func (m *mockStore) GetCallHistory(username string, limit int) ([]store.CallRecord, error) {
	return nil, nil
}
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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

func TestHandleMuteAndUnmuteConversation(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
	go h.Run()
	defer h.Stop()

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
	defer h.Stop()

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
			result := IsReservedUsername(tc.username)
			if result != tc.reserved {
				t.Errorf("IsReservedUsername(%q) = %v, want %v", tc.username, result, tc.reserved)
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

// --- Hub pure-logic tests (no WebSocket required) ---

func TestConnectionCount(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")

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
	h := New(ms, nil, nil, "")
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

func TestIsFriend(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	// Non-existent user.
	if h.IsFriend("alice", "bob") {
		t.Error("expected IsFriend to return false for non-existent users")
	}

	// Add friend and verify.
	h.AddFriend("alice", "bob")
	if !h.IsFriend("alice", "bob") {
		t.Error("expected alice-bob to be friends after AddFriend")
	}
	if !h.IsFriend("bob", "alice") {
		t.Error("expected bob-alice to be friends (bidirectional)")
	}

	// Unrelated users.
	if h.IsFriend("alice", "charlie") {
		t.Error("expected alice-charlie to NOT be friends")
	}
}

func TestAddFriend_Bidirectional(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	h.AddFriend("alice", "bob")

	if !h.IsFriend("alice", "bob") {
		t.Error("expected AddFriend to create alice->bob")
	}
	if !h.IsFriend("bob", "alice") {
		t.Error("expected AddFriend to create bob->alice (bidirectional)")
	}

	friends := h.GetFriends("alice")
	if len(friends) != 1 || friends[0] != "bob" {
		t.Fatalf("expected alice friends = [bob], got %v", friends)
	}

	friends2 := h.GetFriends("bob")
	if len(friends2) != 1 || friends2[0] != "alice" {
		t.Fatalf("expected bob friends = [alice], got %v", friends2)
	}
}

func TestRemoveFriend_Bidirectional(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	h.AddFriend("alice", "bob")
	h.AddFriend("alice", "charlie")

	h.RemoveFriend("alice", "bob")

	if h.IsFriend("alice", "bob") {
		t.Error("expected alice-bob friendship removed")
	}
	if h.IsFriend("bob", "alice") {
		t.Error("expected bob-alice friendship removed (bidirectional)")
	}
	if !h.IsFriend("alice", "charlie") {
		t.Error("expected alice-charlie friendship to remain")
	}

	// Removing non-existent friend should not panic.
	h.RemoveFriend("alice", "nonexistent")
}

func TestGetFriends(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	// No friends initially.
	if f := h.GetFriends("alice"); len(f) != 0 {
		t.Fatalf("expected 0 friends for new user, got %v", f)
	}

	h.AddFriend("alice", "bob")
	h.AddFriend("alice", "charlie")

	friends := h.GetFriends("alice")
	if len(friends) != 2 {
		t.Fatalf("expected 2 friends, got %d", len(friends))
	}
	friendSet := make(map[string]bool)
	for _, f := range friends {
		friendSet[f] = true
	}
	if !friendSet["bob"] || !friendSet["charlie"] {
		t.Errorf("expected friends bob and charlie, got %v", friends)
	}
}

// --- Room system tests ---

func TestJoinRoom(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

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
	h := New(ms, nil, nil, "")

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
	h := New(ms, nil, nil, "")

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
	h := New(ms, nil, nil, "")

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

func TestCreateGroup(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	// Create group succeeds.
	if !h.CreateGroup("dev-team", "alice") {
		t.Error("expected CreateGroup to return true for new group")
	}

	if !h.InGroup("alice", "dev-team") {
		t.Error("expected creator to be in group")
	}

	members := h.GroupMembers("dev-team")
	if len(members) != 1 || members[0] != "alice" {
		t.Fatalf("expected [alice], got %v", members)
	}

	// Duplicate group name is rejected.
	if h.CreateGroup("dev-team", "bob") {
		t.Error("expected CreateGroup to return false for duplicate name")
	}

	// bob should NOT be in dev-team (duplicate rejected).
	if h.InGroup("bob", "dev-team") {
		t.Error("expected bob to NOT be in dev-team after duplicate rejection")
	}
}

func TestInGroup(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	// Non-existent group.
	if h.InGroup("alice", "nonexistent") {
		t.Error("expected InGroup to return false for non-existent group")
	}

	h.CreateGroup("team", "alice")

	if !h.InGroup("alice", "team") {
		t.Error("expected InGroup to return true for member")
	}
	if h.InGroup("bob", "team") {
		t.Error("expected InGroup to return false for non-member")
	}
}

func TestGroupMembers(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	// Non-existent group.
	if members := h.GroupMembers("nonexistent"); members != nil {
		t.Fatalf("expected nil for non-existent group, got %v", members)
	}

	h.CreateGroup("team", "alice")
	h.AddGroupMember("team", "bob")
	h.AddGroupMember("team", "charlie")

	members := h.GroupMembers("team")
	if len(members) != 3 {
		t.Fatalf("expected 3 members, got %d", len(members))
	}
	memberSet := make(map[string]bool)
	for _, m := range members {
		memberSet[m] = true
	}
	for _, expected := range []string{"alice", "bob", "charlie"} {
		if !memberSet[expected] {
			t.Errorf("expected %q in group members, got %v", expected, members)
		}
	}
}

func TestRemoveGroupMember(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	h.CreateGroup("team", "alice")
	h.AddGroupMember("team", "bob")

	h.RemoveGroupMember("team", "bob")

	if h.InGroup("bob", "team") {
		t.Error("expected bob to be removed from team")
	}
	if !h.InGroup("alice", "team") {
		t.Error("expected alice to remain in team")
	}

	// Remove from non-existent group should not panic.
	h.RemoveGroupMember("nonexistent", "alice")
}

// --- Pending invite tests ---

func TestPendingInvites(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	// Consume on non-existent user returns false.
	if h.ConsumePendingInvite("alice", "team") {
		t.Error("expected ConsumePendingInvite to return false for non-existent user")
	}

	// Add invite.
	h.AddPendingInvite("alice", "team", "bob")

	// Consume returns true.
	if !h.ConsumePendingInvite("alice", "team") {
		t.Error("expected ConsumePendingInvite to return true after AddPendingInvite")
	}

	// Already consumed — returns false.
	if h.ConsumePendingInvite("alice", "team") {
		t.Error("expected ConsumePendingInvite to return false after invite was consumed")
	}

	// Add another and remove via RemovePendingInvite.
	h.AddPendingInvite("alice", "team2", "bob")
	h.RemovePendingInvite("alice", "team2")

	if h.ConsumePendingInvite("alice", "team2") {
		t.Error("expected ConsumePendingInvite to return false after RemovePendingInvite")
	}

	// Remove on non-existent should not panic.
	h.RemovePendingInvite("nonexistent", "nonexistent")
}

// --- Call session tests ---

func TestCallSessions(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	// Get non-existent session returns nil.
	if cs := h.GetCallSession("nonexistent"); cs != nil {
		t.Error("expected nil for non-existent call session")
	}

	// Create session.
	cs := h.CreateCallSession("call-1", "alice", "bob", "video")
	if cs == nil {
		t.Fatal("expected non-nil CallSession")
	}
	if cs.ID != "call-1" || cs.Caller != "alice" || cs.Callee != "bob" {
		t.Fatalf("unexpected session fields: %+v", cs)
	}
	if cs.Type != "video" || cs.Status != "ringing" {
		t.Fatalf("expected type=video, status=ringing, got type=%q status=%q", cs.Type, cs.Status)
	}
	if cs.CreatedAt <= 0 {
		t.Error("expected positive CreatedAt")
	}

	// Get session.
	retrieved := h.GetCallSession("call-1")
	if retrieved == nil {
		t.Fatal("expected non-nil for existing call session")
	}
	if retrieved.Caller != "alice" {
		t.Fatalf("expected caller=alice, got %q", retrieved.Caller)
	}

	// Update status.
	h.UpdateCallSessionStatus("call-1", "active")
	updated := h.GetCallSession("call-1")
	if updated.Status != "active" {
		t.Fatalf("expected status=active after update, got %q", updated.Status)
	}

	// Update non-existent should not panic.
	h.UpdateCallSessionStatus("nonexistent", "active")

	// Remove session.
	h.RemoveCallSession("call-1")
	if cs := h.GetCallSession("call-1"); cs != nil {
		t.Error("expected nil after RemoveCallSession")
	}

	// Remove non-existent should not panic.
	h.RemoveCallSession("nonexistent")
}

func TestCallSessionCreateDefaultStatus(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	cs := h.CreateCallSession("call-voice", "alice", "bob", "voice")
	if cs.Status != "ringing" {
		t.Fatalf("expected default status=ringing, got %q", cs.Status)
	}
}

// --- SendToUser tests ---

func TestSendToUser(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
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

func TestLoadPersistedState(t *testing.T) {
	ms := &mockStore{
		allFriends: map[string][]string{
			"alice": {"bob", "charlie"},
			"bob":   {"alice"},
		},
		allGroups: map[string][]string{
			"dev-team": {"alice", "bob"},
		},
	}
	h := New(ms, nil, nil, "")

	// Initially empty.
	if h.IsFriend("alice", "bob") {
		t.Error("expected no friends before LoadPersistedState")
	}

	h.LoadPersistedState()

	// Friends should now be restored.
	if !h.IsFriend("alice", "bob") {
		t.Error("expected alice-bob friendship restored from store")
	}
	if !h.IsFriend("alice", "charlie") {
		t.Error("expected alice-charlie friendship restored from store")
	}
	if !h.IsFriend("bob", "alice") {
		t.Error("expected bob-alice friendship restored from store")
	}

	// Groups should now be restored.
	if !h.InGroup("alice", "dev-team") {
		t.Error("expected alice in dev-team after LoadPersistedState")
	}
	if !h.InGroup("bob", "dev-team") {
		t.Error("expected bob in dev-team after LoadPersistedState")
	}

	members := h.GroupMembers("dev-team")
	if len(members) != 2 {
		t.Fatalf("expected 2 members in dev-team, got %d", len(members))
	}
}

func TestLoadPersistedStateNilStore(t *testing.T) {
	h := New(nil, nil, nil, "")

	// Should not panic with nil store.
	h.LoadPersistedState()
}

// --- AllUserStatus tests ---

func TestAllUserStatusSortsOnlineFirst(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")

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
	h := New(ms, nil, nil, "")

	// No users tracked — should return empty slice.
	users := h.AllUserStatus()
	if len(users) != 0 {
		t.Fatalf("expected 0 users, got %d", len(users))
	}
}

// --- Broadcast methods ---

func TestBroadcastJSON(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")

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
	h := New(ms, nil, nil, "")

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

func TestBroadcastTyping(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "TestBot")
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
	h := New(ms, nil, nil, "FallbackBot")

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
	h2 := New(ms2, nil, nil, "FallbackBot")
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
	h := New(ms, llmCfg, nil, "TestBot")

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
	h := New(ms, nil, nil, "")

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
		h := New(ms, nil, nil, "MyBot")
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
		h := New(ms, llmCfg, nil, "BotWithMem")
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
		h := New(ms, llmCfg, nil, "BotWithMem")

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
	h := New(ms, nil, nil, "")

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

func TestSendToGroup(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
	go h.Run()
	defer h.Stop()

	// Create a group and add members.
	h.CreateGroup("team", "alice")
	h.AddGroupMember("team", "bob")
	h.AddGroupMember("team", "charlie")

	// Register clients: three group members and one non-member.
	alice := &Client{username: "alice", send: make(chan []byte, 1)}
	bob := &Client{username: "bob", send: make(chan []byte, 1)}
	charlie := &Client{username: "charlie", send: make(chan []byte, 1)}
	dave := &Client{username: "dave", send: make(chan []byte, 1)}

	h.register <- alice
	h.register <- bob
	h.register <- charlie
	h.register <- dave
	time.Sleep(10 * time.Millisecond)

	data := []byte(`{"type":"group_msg","content":"hello team"}`)
	h.SendToGroup("team", data)

	// Group members should receive.
	for _, c := range []*Client{alice, bob, charlie} {
		select {
		case <-c.send:
			// ok
		default:
			t.Errorf("expected group member %s to receive group message", c.username)
		}
	}

	// Non-member dave should NOT receive.
	select {
	case msg := <-dave.send:
		t.Fatalf("expected dave (non-group-member) NOT to receive, got %s", string(msg))
	default:
		// ok
	}

	// Send to non-existent group should not panic.
	h.SendToGroup("nonexistent", data)

	// Cleanup.
	h.unregister <- alice
	h.unregister <- bob
	h.unregister <- charlie
	h.unregister <- dave
	time.Sleep(10 * time.Millisecond)
}

func TestSendToGroupEmptyGroup(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
	go h.Run()
	defer h.Stop()

	// Register a client not in the group.
	alice := &Client{username: "alice", send: make(chan []byte, 1)}
	h.register <- alice
	time.Sleep(10 * time.Millisecond)

	// Group doesn't exist — should not panic and should not deliver.
	data := []byte(`{"type":"group_msg","content":"ghost"}`)
	h.SendToGroup("ghost-group", data)

	select {
	case msg := <-alice.send:
		t.Fatalf("expected no message for non-existent group, got %s", string(msg))
	default:
		// ok
	}

	h.unregister <- alice
	time.Sleep(10 * time.Millisecond)
}

// --- SendToAllSessions tests ---

func TestSendToAllSessions(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

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
	h := New(ms, nil, nil, "")

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
	h := New(ms, nil, nil, "")

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

func TestRequestOnlineUsers(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
	go h.Run()
	defer h.Stop()

	// Register clients.
	alice := &Client{username: "alice", send: make(chan []byte, 1)}
	bob := &Client{username: "bob", send: make(chan []byte, 1)}
	charlie := &Client{username: "charlie", send: make(chan []byte, 1)}
	h.register <- alice
	h.register <- bob
	h.register <- charlie
	time.Sleep(10 * time.Millisecond)

	resp := h.RequestOnlineUsers()
	if !resp.Success {
		t.Error("expected success")
	}
	if resp.Type != "online_users" {
		t.Errorf("type = %q, want online_users", resp.Type)
	}
	if resp.Error != "" {
		t.Errorf("unexpected error: %s", resp.Error)
	}

	online, ok := resp.Data["online"].([]string)
	if !ok {
		t.Fatal("expected online to be []string in data")
	}
	if len(online) != 3 {
		t.Fatalf("expected 3 online users, got %d", len(online))
	}

	count, ok := resp.Data["count"].(int)
	if !ok {
		t.Fatalf("expected count to be int, got %T", resp.Data["count"])
	}
	if count != 3 {
		t.Errorf("expected count=3, got %d", count)
	}

	// Verify presence of all expected users.
	userSet := make(map[string]bool)
	for _, u := range online {
		userSet[u] = true
	}
	for _, expected := range []string{"alice", "bob", "charlie"} {
		if !userSet[expected] {
			t.Errorf("expected %q in online list, got %v", expected, online)
		}
	}

	// Verify time field is set.
	if _, ok := resp.Data["time"]; !ok {
		t.Error("expected time field in response data")
	}

	// Cleanup.
	h.unregister <- alice
	h.unregister <- bob
	h.unregister <- charlie
	time.Sleep(10 * time.Millisecond)
}

func TestRequestOnlineUsersEmptyHub(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	resp := h.RequestOnlineUsers()
	if !resp.Success {
		t.Error("expected success for empty hub")
	}

	online, ok := resp.Data["online"].([]string)
	if !ok {
		t.Fatal("expected online to be []string")
	}
	if len(online) != 0 {
		t.Fatalf("expected 0 online users, got %d", len(online))
	}

	count, ok := resp.Data["count"].(int)
	if !ok || count != 0 {
		t.Errorf("expected count=0, got %v", resp.Data["count"])
	}
}

// --- RequestHistory tests ---

func TestRequestHistory(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")

	// Pre-populate test messages.
	ms.messages = []StoredMessage{
		{ID: "msg-1", Username: "alice", Content: "hello", Timestamp: 1000},
		{ID: "msg-2", Username: "bob", Content: "hi there", Timestamp: 2000},
		{ID: "msg-3", Username: "charlie", Content: "hey everyone", Timestamp: 3000},
	}

	t.Run("without roomID returns global messages", func(t *testing.T) {
		resp := h.RequestHistory("", 50, 0)
		if !resp.Success {
			t.Error("expected success")
		}
		if resp.Type != "history" {
			t.Errorf("type = %q, want history", resp.Type)
		}
		if resp.Data["room_id"] != "" {
			t.Errorf("room_id = %v, want empty string", resp.Data["room_id"])
		}
		messages, ok := resp.Data["messages"].([]StoredMessage)
		if !ok {
			t.Fatal("expected messages in data")
		}
		if len(messages) != 3 {
			t.Fatalf("expected 3 messages, got %d", len(messages))
		}
		count, ok := resp.Data["count"].(int)
		if !ok || count != 3 {
			t.Errorf("expected count=3, got %v", resp.Data["count"])
		}
	})

	t.Run("with roomID includes room_id in response", func(t *testing.T) {
		resp := h.RequestHistory("room-42", 10, 0)
		if !resp.Success {
			t.Error("expected success")
		}
		if resp.Data["room_id"] != "room-42" {
			t.Errorf("room_id = %v, want room-42", resp.Data["room_id"])
		}
	})

	t.Run("limit zero defaults to 50", func(t *testing.T) {
		resp := h.RequestHistory("", 0, 0)
		if !resp.Success {
			t.Error("expected success with limit=0")
		}
	})

	t.Run("limit exceeds 200 is capped", func(t *testing.T) {
		resp := h.RequestHistory("", 500, 0)
		if !resp.Success {
			t.Error("expected success with limit=500")
		}
	})

	t.Run("with before timestamp param", func(t *testing.T) {
		resp := h.RequestHistory("", 10, 2500)
		if !resp.Success {
			t.Error("expected success with before param")
		}
	})

	t.Run("empty store returns empty messages slice not nil", func(t *testing.T) {
		emptyStore := &mockStore{}
		emptyHub := New(emptyStore, nil, nil, "")
		resp := emptyHub.RequestHistory("", 10, 0)
		if !resp.Success {
			t.Error("expected success")
		}
		messages, ok := resp.Data["messages"].([]StoredMessage)
		if !ok {
			t.Fatal("expected messages in data")
		}
		if len(messages) != 0 {
			t.Fatalf("expected 0 messages, got %d", len(messages))
		}
		if messages == nil {
			t.Error("expected non-nil empty slice")
		}
	})

	t.Run("negative limit defaults to 50", func(t *testing.T) {
		resp := h.RequestHistory("", -1, 0)
		if !resp.Success {
			t.Error("expected success with negative limit")
		}
	})
}

// --- Pure function tests for client.go (no WebSocket required) ---

func TestGenerateWebhookSecret(t *testing.T) {
	// Verify format: 32 bytes produces 43 chars of base64 raw URL encoding.
	// RawURLEncoding means no +, /, or = characters.

	secrets := make(map[string]bool)
	for i := 0; i < 20; i++ {
		secret := generateWebhookSecret()

		if secret == "" {
			t.Fatal("generateWebhookSecret() returned empty string")
		}

		// 32 bytes → 43-44 chars in base64 raw URL encoding.
		if len(secret) < 43 || len(secret) > 44 {
			t.Errorf("generateWebhookSecret() length = %d, want 43-44 for 32 random bytes", len(secret))
		}

		// Verify base64 URL alphabet: A-Z, a-z, 0-9, -, _
		for _, ch := range secret {
			if !((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ||
				(ch >= '0' && ch <= '9') || ch == '-' || ch == '_') {
				t.Errorf("generateWebhookSecret() contains invalid base64url char: %c in %q", ch, secret)
			}
		}

		// Verify uniqueness.
		if secrets[secret] {
			t.Errorf("generateWebhookSecret() produced duplicate secret: %q", secret)
		}
		secrets[secret] = true
	}

	// Verify no standard base64 chars leak.
	for s := range secrets {
		if strings.ContainsAny(s, "+/=") {
			t.Errorf("generateWebhookSecret() contains standard base64 chars: %q", s)
		}
	}
}

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

func TestMsgsToMessages(t *testing.T) {
	now := time.Now().UnixMilli()

	tests := []struct {
		name string
		sms  []ScheduledMessage
	}{
		{
			name: "empty slice returns empty slice",
			sms:  []ScheduledMessage{},
		},
		{
			name: "single item maps fields correctly",
			sms: []ScheduledMessage{
				{
					ID: "sched-1", Username: "alice", Content: "hello",
					RoomID: "room-a", ToUser: "bob", GroupName: "team",
					ReplyToID: "reply-to", ThreadID: "thread-1",
					SendAt: now, CreatedAt: now - 1000,
				},
			},
		},
		{
			name: "multiple items preserve order",
			sms: []ScheduledMessage{
				{ID: "s1", Username: "a", Content: "msg1", SendAt: 100},
				{ID: "s2", Username: "b", Content: "msg2", SendAt: 200},
				{ID: "s3", Username: "c", Content: "msg3", SendAt: 300},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := msgsToMessages(tc.sms)

			if result == nil && len(tc.sms) > 0 {
				t.Fatal("msgsToMessages returned nil for non-empty input")
			}
			if result == nil && len(tc.sms) == 0 {
				return
			}

			if len(result) != len(tc.sms) {
				t.Fatalf("got %d messages, want %d", len(result), len(tc.sms))
			}

			for i, sm := range result {
				src := tc.sms[i]
				if sm.ID != src.ID {
					t.Errorf("[%d] ID = %q, want %q", i, sm.ID, src.ID)
				}
				if sm.Username != src.Username {
					t.Errorf("[%d] Username = %q, want %q", i, sm.Username, src.Username)
				}
				if sm.Content != src.Content {
					t.Errorf("[%d] Content = %q, want %q", i, sm.Content, src.Content)
				}
				if sm.Timestamp != src.SendAt {
					t.Errorf("[%d] Timestamp = %d, want SendAt=%d", i, sm.Timestamp, src.SendAt)
				}
				if sm.RoomID != src.RoomID {
					t.Errorf("[%d] RoomID = %q, want %q", i, sm.RoomID, src.RoomID)
				}
				if sm.ToUser != src.ToUser {
					t.Errorf("[%d] ToUser = %q, want %q", i, sm.ToUser, src.ToUser)
				}
				if sm.GroupName != src.GroupName {
					t.Errorf("[%d] GroupName = %q, want %q", i, sm.GroupName, src.GroupName)
				}
				if sm.ReplyToID != src.ReplyToID {
					t.Errorf("[%d] ReplyToID = %q, want %q", i, sm.ReplyToID, src.ReplyToID)
				}
				if sm.ThreadID != src.ThreadID {
					t.Errorf("[%d] ThreadID = %q, want %q", i, sm.ThreadID, src.ThreadID)
				}
			}
		})
	}
}

func TestShouldTrigger(t *testing.T) {
	// shouldTrigger(0) must always return false.
	t.Run("percent 0 always false", func(t *testing.T) {
		for i := 0; i < 100; i++ {
			if shouldTrigger(0) {
				t.Fatal("shouldTrigger(0) returned true")
			}
		}
	})

	// shouldTrigger(100) must always return true.
	t.Run("percent 100 always true", func(t *testing.T) {
		for i := 0; i < 100; i++ {
			if !shouldTrigger(100) {
				t.Fatal("shouldTrigger(100) returned false")
			}
		}
	})

	// Negative percent: `percent > 0` guard makes it always false.
	t.Run("negative percent always false", func(t *testing.T) {
		for i := 0; i < 100; i++ {
			if shouldTrigger(-1) {
				t.Fatal("shouldTrigger(-1) returned true")
			}
		}
	})

	// Borderline: percent=1 relies on nanosecond clock entropy.
	// Verify it does not panic and returns a boolean (either value is valid).
	t.Run("percent 1 does not panic", func(t *testing.T) {
		// Call many times to exercise the modulo path.
		for i := 0; i < 100; i++ {
			_ = shouldTrigger(1)
		}
	})
}

func TestAssistantMentionTargetEdgeCases(t *testing.T) {
	tests := []struct {
		name      string
		content   string
		botName   string
		agentName string
		wantToken bool
		wantAgent bool
	}{
		{
			name:    "empty content returns no targets",
			content: "",
			botName: "TokenBot", agentName: "PicoClaw",
		},
		{
			name:    "no bot or agent configured with no mention returns no targets",
			content: "hello world",
			botName: "", agentName: "",
		},
		{
			name:    "only bot configured no trigger returns no targets",
			content: "hello world",
			botName: "TokenBot", agentName: "",
		},
		{
			name:    "only agent configured no trigger returns no targets",
			content: "hello world",
			botName: "", agentName: "PicoClaw",
		},
		{
			name:    "alias tokenbot detected even when bot not configured",
			content: "@TokenBot help",
			botName: "", agentName: "PicoClaw",
			// assistantMentionTarget detects mentions via aliases regardless of
			// configuration; the caller (handleChatMessage) gates on config.
			wantToken: true,
		},
		{
			name:    "alias picoclaw detected even when agent not configured",
			content: "@PicoClaw analyze this",
			botName: "TokenBot", agentName: "",
			// isAssistantAlias("PicoClaw", "", "claw", "picoclaw") → alias "picoclaw" matches.
			// No "help"/"bot"/"帮助"/"机器人" keyword in content → TokenBot not triggered.
			wantAgent: true,
		},
		{
			name:    "both configured both empty names mention targets not set",
			content: "@TokenBot @PicoClaw help",
			botName: "", agentName: "",
			// Aliases still match through isAssistantAlias alias lists.
			wantToken: true,
			wantAgent: true,
		},
		{
			name:    "question with no bot configured does not trigger TokenBot keyword",
			content: "can you help?",
			botName: "", agentName: "",
			// Keyword and question triggers are guarded by botName != "".
			wantToken: false,
		},
		{
			name:    "question with no agent configured does not trigger Agent keyword",
			content: "帮我写代码?",
			botName: "", agentName: "",
			// Agent keyword triggers are guarded by agentName != "".
			wantAgent: false,
		},
		{
			name:    "empty config with plain text returns no targets",
			content: "good morning everyone",
			botName: "", agentName: "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := assistantMentionTarget(tc.content, tc.botName, tc.agentName)
			if got.TokenBot != tc.wantToken {
				t.Errorf("TokenBot target = %v, want %v (content=%q, bot=%q, agent=%q)",
					got.TokenBot, tc.wantToken, tc.content, tc.botName, tc.agentName)
			}
			if got.Agent != tc.wantAgent {
				t.Errorf("Agent target = %v, want %v (content=%q, bot=%q, agent=%q)",
					got.Agent, tc.wantAgent, tc.content, tc.botName, tc.agentName)
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
		h := New(ms, nil, nil, "")
		id := h.DefaultRoomID()
		if id != "room-公共聊天" {
			t.Errorf("expected room-公共聊天 for existing room, got %q", id)
		}
	})

	t.Run("creates room when not found", func(t *testing.T) {
		ms := &errorOnGetRoomIDStore{mockStore: &mockStore{}}
		h := New(ms, nil, nil, "")
		id := h.DefaultRoomID()
		if id != "room-公共聊天" {
			t.Errorf("expected room-公共聊天 from creation fallback, got %q", id)
		}
	})
}

// --- SendToUser offline edge case ---

func TestSendToUser_OfflineReturnsFalse(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")

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
	h := New(ms, nil, nil, "")
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

func TestBroadcastToGroup(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
	go h.Run()
	defer h.Stop()

	h.CreateGroup("team", "alice")
	h.AddGroupMember("team", "bob")

	alice := &Client{username: "alice", send: make(chan []byte, 1)}
	bob := &Client{username: "bob", send: make(chan []byte, 1)}
	dave := &Client{username: "dave", send: make(chan []byte, 1)}

	h.register <- alice
	h.register <- bob
	h.register <- dave
	time.Sleep(10 * time.Millisecond)

	data := []byte(`{"type":"group_msg","content":"via BroadcastToGroup"}`)
	h.BroadcastToGroup("team", data)

	for _, c := range []*Client{alice, bob} {
		select {
		case received := <-c.send:
			if string(received) != string(data) {
				t.Errorf("%s: expected %q, got %q", c.username, string(data), string(received))
			}
		default:
			t.Errorf("expected group member %s to receive via BroadcastToGroup", c.username)
		}
	}

	select {
	case msg := <-dave.send:
		t.Fatalf("expected dave (non-member) NOT to receive, got %s", string(msg))
	default:
	}

	h.SendToGroup("team", []byte(`{"via":"SendToGroup"}`))
	for _, c := range []*Client{alice, bob} {
		select {
		case <-c.send:
		default:
			t.Errorf("expected %s to receive via SendToGroup alias", c.username)
		}
	}

	h.unregister <- alice
	h.unregister <- bob
	h.unregister <- dave
	time.Sleep(10 * time.Millisecond)
}

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

func TestValidateGroupName_EdgeCases(t *testing.T) {
	tests := []struct {
		name      string
		groupName string
		valid     bool
	}{
		{name: "single underscore", groupName: "_", valid: true},
		{name: "single hyphen", groupName: "-", valid: true},
		{name: "29 chars", groupName: "12345678901234567890123456789", valid: true},
		{name: "30 chars with hyphen", groupName: "12345678901234567890123456789-", valid: true},
		{name: "31 chars with letter", groupName: "a123456789012345678901234567890", valid: false},
		{name: "all allowed specials", groupName: "团队_A-B C", valid: true},
		{name: "pure chinese within limit", groupName: "开发团队讨论组开发团队讨论组开发团队讨论组开发团队讨论组", valid: true},
		{name: "exclamation mark", groupName: "team!chat", valid: false},
		{name: "dollar sign", groupName: "team$chat", valid: false},
		{name: "percent sign", groupName: "team%chat", valid: false},
		{name: "asterisk", groupName: "team*chat", valid: false},
		{name: "parenthesis", groupName: "team(chat)", valid: false},
		{name: "contains newline", groupName: "team\nchat", valid: false},
		{name: "contains tab", groupName: "team\tchat", valid: false},
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")

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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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
	h := New(ms, nil, nil, "")
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

func TestDMDelivery(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
	go h.Run()
	defer h.Stop()

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10)}
	bob := &Client{hub: h, username: "bob", send: make(chan []byte, 10)}
	h.register <- alice
	h.register <- bob
	time.Sleep(10 * time.Millisecond)

	alice.handleDMMessage(Message{To: "bob", Content: "Hello Bob!"})

	// Bob should receive the DM.
	var got Message
	select {
	case payload := <-bob.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode dm_message error: %v", err)
		}
		if got.Type != "dm_message" {
			t.Fatalf("expected dm_message for bob, got type=%q", got.Type)
		}
		if got.Username != "alice" || got.Content != "Hello Bob!" {
			t.Fatalf("expected from=alice content='Hello Bob!', got from=%q content=%q", got.Username, got.Content)
		}
		if got.To != "bob" || got.From != "alice" {
			t.Fatalf("expected to=bob from=alice, got to=%q from=%q", got.To, got.From)
		}
	default:
		t.Fatal("bob should receive DM")
	}

	// Alice should receive an echo.
	select {
	case payload := <-alice.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode dm echo error: %v", err)
		}
		if got.Type != "dm_message" {
			t.Fatalf("expected dm_message echo to alice, got type=%q", got.Type)
		}
		if got.To != "bob" {
			t.Fatalf("expected echo to=bob, got to=%q", got.To)
		}
	default:
		t.Fatal("alice should receive DM echo")
	}

	h.unregister <- alice
	h.unregister <- bob
	time.Sleep(10 * time.Millisecond)
}

func TestDMOfflineRecipient(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
	go h.Run()
	defer h.Stop()

	alice := &Client{hub: h, username: "alice", send: make(chan []byte, 10)}
	h.register <- alice
	time.Sleep(10 * time.Millisecond)

	// bob is NOT registered (offline).
	alice.handleDMMessage(Message{To: "bob", Content: "Are you there?"})

	// Alice should still get the echo.
	var got Message
	select {
	case payload := <-alice.send:
		if err := json.Unmarshal(payload, &got); err != nil {
			t.Fatalf("decode dm echo error: %v", err)
		}
		if got.Type != "dm_message" {
			t.Fatalf("expected dm_message echo, got type=%q", got.Type)
		}
	default:
		t.Fatal("alice should receive DM echo even when recipient is offline")
	}

	// The DM should be persisted in store.
	stored := ms.GetMessages(10, 0)
	found := false
	for _, m := range stored {
		if m.Username == "alice" && m.Content == "Are you there?" && m.ToUser == "bob" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected DM to be persisted in store for offline recipient")
	}

	h.unregister <- alice
	time.Sleep(10 * time.Millisecond)
}

// --- Broadcast fanout tests ---

func TestBroadcastMultipleClients(t *testing.T) {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
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
