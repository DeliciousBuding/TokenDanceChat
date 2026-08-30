package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func init() {
	os.Setenv("CHAT_SKIP_SEED", "true")
}

func TestNew(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	if s.db == nil {
		t.Fatal("expected non-nil db after New()")
	}

	var name string
	err = s.db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'").Scan(&name)
	if err != nil {
		t.Fatalf("messages table not found in sqlite_master: %v", err)
	}
	if name != "messages" {
		t.Fatalf("expected table name 'messages', got '%s'", name)
	}

	// Verify the index exists.
	var idxName string
	err = s.db.QueryRow("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_messages_timestamp'").Scan(&idxName)
	if err != nil {
		t.Fatalf("timestamp index not found: %v", err)
	}
}

func TestInsertMessage(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	msg, err := s.InsertMessage("alice", "hello world", "", "", "", "", "")
	if err != nil {
		t.Fatalf("InsertMessage returned error: %v", err)
	}

	if msg.ID == "" {
		t.Error("expected non-empty UUID ID")
	}
	// UUID v4 is 36 characters.
	if len(msg.ID) != 36 {
		t.Errorf("expected UUID length 36, got %d (%s)", len(msg.ID), msg.ID)
	}
	if msg.Username != "alice" {
		t.Errorf("expected username 'alice', got '%s'", msg.Username)
	}
	if msg.Content != "hello world" {
		t.Errorf("expected content 'hello world', got '%s'", msg.Content)
	}
	if msg.Timestamp == 0 {
		t.Error("expected non-zero timestamp")
	}
}

func TestGetMessagesChronological(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.InsertMessage("alice", "first", "", "", "", "", "")
	time.Sleep(time.Millisecond)
	s.InsertMessage("bob", "second", "", "", "", "", "")
	time.Sleep(time.Millisecond)
	s.InsertMessage("alice", "third", "", "", "", "", "")

	msgs := s.GetMessages(100, 0)
	if len(msgs) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(msgs))
	}

	if msgs[0].Content != "first" {
		t.Errorf("expected first message 'first', got '%s'", msgs[0].Content)
	}
	if msgs[1].Content != "second" {
		t.Errorf("expected second message 'second', got '%s'", msgs[1].Content)
	}
	if msgs[2].Content != "third" {
		t.Errorf("expected third message 'third', got '%s'", msgs[2].Content)
	}

	// Verify timestamps are chronological (ascending).
	if msgs[0].Timestamp > msgs[1].Timestamp || msgs[1].Timestamp > msgs[2].Timestamp {
		t.Error("messages are not in chronological (ascending) order")
	}
}

func TestGetMessagesLimit(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	for i := 0; i < 10; i++ {
		s.InsertMessage("user", fmt.Sprintf("msg%d", i), "", "", "", "", "")
		time.Sleep(time.Millisecond)
	}

	msgs := s.GetMessages(3, 0)
	if len(msgs) != 3 {
		t.Fatalf("expected 3 messages with limit, got %d", len(msgs))
	}

	// With DESC then reverse, the last 3 inserted should be returned chronologically.
	if msgs[0].Content != "msg7" {
		t.Errorf("expected first message 'msg7', got '%s'", msgs[0].Content)
	}
	if msgs[1].Content != "msg8" {
		t.Errorf("expected second message 'msg8', got '%s'", msgs[1].Content)
	}
	if msgs[2].Content != "msg9" {
		t.Errorf("expected third message 'msg9', got '%s'", msgs[2].Content)
	}
}

func TestGetMessagesBefore(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	msg1, _ := s.InsertMessage("alice", "first", "", "", "", "", "")
	time.Sleep(time.Millisecond)
	msg2, _ := s.InsertMessage("bob", "second", "", "", "", "", "")
	time.Sleep(time.Millisecond)
	msg3, _ := s.InsertMessage("alice", "third", "", "", "", "", "")

	// Get messages before msg3's timestamp (should exclude msg3).
	msgs := s.GetMessages(100, msg3.Timestamp)
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages before msg3, got %d", len(msgs))
	}
	if msgs[0].ID != msg1.ID {
		t.Errorf("expected first message to be msg1, got '%s'", msgs[0].Content)
	}
	if msgs[1].ID != msg2.ID {
		t.Errorf("expected second message to be msg2, got '%s'", msgs[1].Content)
	}

	// Get messages before msg2's timestamp (should only return msg1).
	msgs = s.GetMessages(100, msg2.Timestamp)
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message before msg2, got %d", len(msgs))
	}
	if msgs[0].ID != msg1.ID {
		t.Errorf("expected msg1, got '%s'", msgs[0].Content)
	}
}

func TestGetMessagesEmpty(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	msgs := s.GetMessages(100, 0)
	if msgs == nil {
		t.Fatal("expected non-nil empty slice from GetMessages on empty DB")
	}
	if len(msgs) != 0 {
		t.Fatalf("expected 0 messages, got %d", len(msgs))
	}
}

func TestPing(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	if err := s.Ping(); err != nil {
		t.Errorf("expected Ping to succeed on healthy DB, got error: %v", err)
	}
}

func TestPingClosedDB(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	s.Close()

	if err := s.Ping(); err == nil {
		t.Error("expected Ping to return error on closed database")
	}
}

func TestIsBlocked(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Initially, no user is blocked.
	if s.IsBlocked("alice", "bob") {
		t.Error("expected IsBlocked to return false for unblocked users")
	}

	// Block bob from alice's perspective.
	if err := s.BlockUser("alice", "bob"); err != nil {
		t.Fatalf("BlockUser returned error: %v", err)
	}

	// Now alice has blocked bob.
	if !s.IsBlocked("alice", "bob") {
		t.Error("expected IsBlocked to return true after blocking")
	}

	// bob has not blocked alice.
	if s.IsBlocked("bob", "alice") {
		t.Error("expected IsBlocked(bob, alice) to return false")
	}

	// Unblock and verify.
	if err := s.UnblockUser("alice", "bob"); err != nil {
		t.Fatalf("UnblockUser returned error: %v", err)
	}
	if s.IsBlocked("alice", "bob") {
		t.Error("expected IsBlocked to return false after unblocking")
	}
}

func TestIsBlockedErrorPath(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}

	// Close the database to trigger an error in IsBlocked.
	s.Close()

	// Should return false on error (graceful degradation).
	if s.IsBlocked("alice", "bob") {
		t.Error("expected IsBlocked to return false on database error")
	}
}

func TestSearchMessages(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Insert some messages to search.
	s.InsertMessage("alice", "Hello world, this is a unicorn message", "", "", "", "", "")
	s.InsertMessage("bob", "Another message about rainbow stuff", "", "", "", "", "")
	s.InsertMessage("charlie", "Hello everyone, welcome to the chat", "", "", "", "", "")

	// Search for "Hello" — should find 2 messages.
	results, err := s.SearchMessages("Hello", "", 10)
	if err != nil {
		t.Fatalf("SearchMessages returned error: %v", err)
	}
	if len(results) != 2 {
		t.Errorf("expected 2 results for 'Hello', got %d", len(results))
	}

	// Search for "unicorn" — exact token match, should find 1.
	results, err = s.SearchMessages("unicorn", "", 10)
	if err != nil {
		t.Fatalf("SearchMessages returned error: %v", err)
	}
	if len(results) != 1 {
		t.Errorf("expected 1 result for 'unicorn', got %d", len(results))
	}

	// Search for "rainbow" — exact token match, should find 1.
	results, err = s.SearchMessages("rainbow", "", 10)
	if err != nil {
		t.Fatalf("SearchMessages returned error: %v", err)
	}
	if len(results) != 1 {
		t.Errorf("expected 1 result for 'rainbow', got %d", len(results))
	}

	// Search for "message" — appears in the first two messages.
	results, err = s.SearchMessages("message", "", 10)
	if err != nil {
		t.Fatalf("SearchMessages returned error: %v", err)
	}
	if len(results) != 2 {
		t.Errorf("expected 2 results for 'message', got %d", len(results))
	}

	// Search for non-existent term.
	results, err = s.SearchMessages("nonexistent", "", 10)
	if err != nil {
		t.Fatalf("SearchMessages returned error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for nonexistent term, got %d", len(results))
	}
}

func TestSearchMessagesSpecialCharacters(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.InsertMessage("alice", "SELECT * FROM users; DROP TABLE messages;", "", "", "", "", "")
	s.InsertMessage("bob", "normal message", "", "", "", "", "")

	// FTS5 treats special characters in queries specially.
	// A simple word search should work even alongside special-content messages.
	results, err := s.SearchMessages("normal", "", 10)
	if err != nil {
		t.Fatalf("SearchMessages returned error: %v", err)
	}
	if len(results) != 1 {
		t.Errorf("expected 1 result for 'normal', got %d", len(results))
	}

	// Searching for SQL-like content: FTS5 may tokenize it.
	// The key test: this should not panic or error.
	results, err = s.SearchMessages("SELECT", "", 10)
	// FTS5 may or may not find results depending on tokenizer behavior;
	// the important thing is that the call does not error.
	if err != nil {
		t.Errorf("SearchMessages with SQL keyword should not error: %v", err)
	}
	_ = results
}

func TestConcurrentInsert(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	var wg sync.WaitGroup
	numGoroutines := 20
	errCh := make(chan error, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, err := s.InsertMessage("user", fmt.Sprintf("concurrent-%d", idx), "", "", "", "", "")
			if err != nil {
				errCh <- err
			}
		}(i)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		t.Errorf("concurrent insert error: %v", err)
	}

	msgs := s.GetMessages(1000, 0)
	if len(msgs) != numGoroutines {
		t.Errorf("expected %d messages after concurrent inserts got %d", numGoroutines, len(msgs))
	}
}

// ── Password hashing (bcrypt) ──

func TestHashPasswordUsesBcrypt(t *testing.T) {
	h := hashPassword("my-secret-password")
	if !strings.HasPrefix(h, "$2a$") {
		t.Errorf("expected bcrypt hash (starts with $2a$), got: %s", h[:20]+"...")
	}
	// Bcrypt hashes are exactly 60 chars
	if len(h) != 60 {
		t.Errorf("expected 60-char bcrypt hash, got %d chars", len(h))
	}
}

func TestCheckPasswordBcrypt(t *testing.T) {
	h := hashPassword("test-password-123")
	ok, upgrade := checkPassword(h, "test-password-123")
	if !ok {
		t.Error("bcrypt checkPassword should return true for correct password")
	}
	if upgrade != "" {
		t.Error("bcrypt checkPassword should not return upgrade hash for bcrypt input")
	}
}

func TestCheckPasswordBcryptWrongPassword(t *testing.T) {
	h := hashPassword("correct-password")
	ok, _ := checkPassword(h, "wrong-password")
	if ok {
		t.Error("checkPassword should return false for wrong password")
	}
}

func TestCheckPasswordLegacySHA256Upgrade(t *testing.T) {
	// Simulate the old SHA-256 format: "hexSalt:hexHash"
	salt := make([]byte, 16)
	for i := range salt {
		salt[i] = byte(i)
	}
	password := "legacy-password"
	h := sha256.Sum256(append(salt, []byte(password)...))
	legacy := hex.EncodeToString(salt) + ":" + hex.EncodeToString(h[:])

	ok, upgrade := checkPassword(legacy, password)
	if !ok {
		t.Error("checkPassword should verify legacy SHA-256 hash")
	}
	if upgrade == "" {
		t.Error("checkPassword should return upgrade hash for legacy SHA-256")
	}
	if !strings.HasPrefix(upgrade, "$2a$") {
		t.Errorf("upgrade hash should be bcrypt, got: %s", upgrade[:20]+"...")
	}

	// Verify the upgrade hash works
	ok2, _ := checkPassword(upgrade, password)
	if !ok2 {
		t.Error("checkPassword should verify upgraded bcrypt hash")
	}
}

func TestCheckPasswordLegacyWrongPassword(t *testing.T) {
	salt := make([]byte, 16)
	password := "real-password"
	h := sha256.Sum256(append(salt, []byte(password)...))
	legacy := hex.EncodeToString(salt) + ":" + hex.EncodeToString(h[:])

	ok, upgrade := checkPassword(legacy, "wrong-password")
	if ok {
		t.Error("checkPassword should return false for wrong password on legacy hash")
	}
	if upgrade != "" {
		t.Error("checkPassword should not return upgrade for wrong password")
	}
}

// ── User registration ──

func TestRegisterUser(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Create an invite code for testing.
	code, err := s.GenerateInviteCode("admin", 2)
	if err != nil {
		t.Fatalf("GenerateInviteCode returned error: %v", err)
	}
	if code == "" {
		t.Fatal("expected non-empty invite code")
	}
	if len(code) != 8 {
		t.Errorf("expected 8-char invite code, got %d", len(code))
	}

	// Register a user with the valid invite code.
	err = s.RegisterUser("newuser", "secure-password-123", code)
	if err != nil {
		t.Fatalf("RegisterUser with valid code returned error: %v", err)
	}

	// Verify the user was created in the DB.
	var pwdHash string
	err = s.db.QueryRow("SELECT password_hash FROM users WHERE username = ?", "newuser").Scan(&pwdHash)
	if err != nil {
		t.Fatalf("user not found after registration: %v", err)
	}
	if !strings.HasPrefix(pwdHash, "$2a$") {
		t.Errorf("expected bcrypt hash, got: %s", pwdHash[:20]+"...")
	}

	// Duplicate username should fail.
	err = s.RegisterUser("newuser", "another-password", code)
	if err == nil {
		t.Error("expected error for duplicate username registration")
	}

	// Register a second user to exhaust the code (maxUses=2).
	err = s.RegisterUser("newuser2", "password456", code)
	if err != nil {
		t.Fatalf("RegisterUser second time returned error: %v", err)
	}

	// Third registration with exhausted code should fail.
	err = s.RegisterUser("newuser3", "password789", code)
	if err == nil {
		t.Error("expected error for exhausted invite code")
	}

	// Empty invite code should fail.
	err = s.RegisterUser("newuser4", "password", "")
	if err == nil {
		t.Error("expected error for empty invite code")
	}

	// Invalid invite code should fail.
	err = s.RegisterUser("newuser5", "password", "ZZZZZZZZ")
	if err == nil {
		t.Error("expected error for invalid invite code")
	}

	// Check TotalUsers.
	if s.TotalUsers() != 2 {
		t.Errorf("expected TotalUsers=2, got %d", s.TotalUsers())
	}
}

func TestUserExists(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	exists, err := s.UserExists("alice")
	if err != nil {
		t.Fatalf("UserExists before registration returned error: %v", err)
	}
	if exists {
		t.Fatal("UserExists should return false before registration")
	}

	code, err := s.GenerateInviteCode("admin", 1)
	if err != nil {
		t.Fatalf("GenerateInviteCode returned error: %v", err)
	}
	if err := s.RegisterUser("alice", "secure-password-123", code); err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}

	exists, err = s.UserExists("alice")
	if err != nil {
		t.Fatalf("UserExists after registration returned error: %v", err)
	}
	if !exists {
		t.Fatal("UserExists should return true after registration")
	}

	exists, err = s.UserExists("bob")
	if err != nil {
		t.Fatalf("UserExists for missing user returned error: %v", err)
	}
	if exists {
		t.Fatal("UserExists should return false for a missing user")
	}
}

func TestVerifyUserBcryptUpgradeFlow(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Step 1: Manually insert a user with a legacy SHA-256 password hash.
	salt := make([]byte, 16)
	for i := range salt {
		salt[i] = byte(i)
	}
	password := "upgrade-me-password"
	h := sha256.Sum256(append(salt, []byte(password)...))
	legacyHash := hex.EncodeToString(salt) + ":" + hex.EncodeToString(h[:])

	now := time.Now().UnixMilli()
	_, err = s.db.Exec(
		"INSERT INTO users (username, password_hash, invited_by, created_at) VALUES (?, ?, ?, ?)",
		"legacyuser", legacyHash, "admin", now,
	)
	if err != nil {
		t.Fatalf("failed to insert legacy user: %v", err)
	}

	// Step 2: VerifyUser should succeed and auto-upgrade the hash.
	ok, err := s.VerifyUser("legacyuser", password)
	if err != nil {
		t.Fatalf("VerifyUser returned error: %v", err)
	}
	if !ok {
		t.Fatal("VerifyUser should return true for correct password")
	}

	// Step 3: Confirm the stored hash was upgraded to bcrypt.
	var storedHash string
	err = s.db.QueryRow("SELECT password_hash FROM users WHERE username = ?", "legacyuser").Scan(&storedHash)
	if err != nil {
		t.Fatalf("failed to read upgraded hash: %v", err)
	}
	if !strings.HasPrefix(storedHash, "$2a$") {
		t.Errorf("expected bcrypt hash after upgrade, got: %s", storedHash[:20]+"...")
	}

	// Step 4: VerifyUser again — should use bcrypt path now.
	ok, err = s.VerifyUser("legacyuser", password)
	if err != nil {
		t.Fatalf("VerifyUser after upgrade returned error: %v", err)
	}
	if !ok {
		t.Error("VerifyUser should return true after upgrade")
	}

	// Step 5: Wrong password should still fail.
	ok, err = s.VerifyUser("legacyuser", "wrong-password")
	if err != nil {
		t.Fatalf("VerifyUser with wrong password returned error: %v", err)
	}
	if ok {
		t.Error("VerifyUser should return false for wrong password")
	}

	// Step 6: Non-existent user should return false without error.
	ok, err = s.VerifyUser("nonexistent", "password")
	if err != nil {
		t.Fatalf("VerifyUser for nonexistent user returned error: %v", err)
	}
	if ok {
		t.Error("VerifyUser should return false for non-existent user")
	}
}

func TestGetUserProfile(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Upsert a profile.
	err = s.UpsertUserProfile("alice", "Alice Wang", "https://example.com/avatar.png", "Hello world", "online", time.Now().UnixMilli())
	if err != nil {
		t.Fatalf("UpsertUserProfile returned error: %v", err)
	}

	// Retrieve the profile.
	profile, err := s.GetUserProfile("alice")
	if err != nil {
		t.Fatalf("GetUserProfile returned error: %v", err)
	}
	if profile.Username != "alice" {
		t.Errorf("expected username 'alice', got '%s'", profile.Username)
	}
	if profile.DisplayName != "Alice Wang" {
		t.Errorf("expected display_name 'Alice Wang', got '%s'", profile.DisplayName)
	}
	if profile.AvatarURL != "https://example.com/avatar.png" {
		t.Errorf("expected avatar_url, got '%s'", profile.AvatarURL)
	}
	if profile.Bio != "Hello world" {
		t.Errorf("expected bio 'Hello world', got '%s'", profile.Bio)
	}
	if profile.Status != "online" {
		t.Errorf("expected status 'online', got '%s'", profile.Status)
	}

	// Non-existent profile should return error.
	_, err = s.GetUserProfile("nonexistent")
	if err == nil {
		t.Error("expected error for non-existent user profile")
	}

	// Update last seen.
	err = s.UpdateUserLastSeen("bob")
	if err != nil {
		t.Fatalf("UpdateUserLastSeen returned error: %v", err)
	}
	profile, err = s.GetUserProfile("bob")
	if err != nil {
		t.Fatalf("GetUserProfile for last-seen-only user returned error: %v", err)
	}
	if profile.LastSeen == 0 {
		t.Error("expected non-zero last_seen after UpdateUserLastSeen")
	}

	// GetAllUserProfiles.
	profiles, err := s.GetAllUserProfiles()
	if err != nil {
		t.Fatalf("GetAllUserProfiles returned error: %v", err)
	}
	if len(profiles) != 2 {
		t.Errorf("expected 2 profiles, got %d", len(profiles))
	}
}

// ── Room-scoped messages ──

func TestGetRoomMessages(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Create a room.
	roomID, err := s.CreateRoom("test-room")
	if err != nil {
		t.Fatalf("CreateRoom returned error: %v", err)
	}
	if roomID == "" {
		t.Fatal("expected non-empty room ID")
	}

	// Insert messages into the room.
	s.InsertMessage("alice", "room msg 1", "", roomID, "", "", "")
	time.Sleep(time.Millisecond)
	s.InsertMessage("bob", "room msg 2", "", roomID, "", "", "")
	time.Sleep(time.Millisecond)
	s.InsertMessage("alice", "room msg 3", "", roomID, "", "", "")

	// Also insert a public message (no room) — should not appear in room queries.
	s.InsertMessage("charlie", "public msg", "", "", "", "", "")

	// Get room messages.
	msgs := s.GetRoomMessages(roomID, 100, 0)
	if len(msgs) != 3 {
		t.Fatalf("expected 3 room messages, got %d", len(msgs))
	}
	if msgs[0].Content != "room msg 1" {
		t.Errorf("expected first message 'room msg 1', got '%s'", msgs[0].Content)
	}
	if msgs[2].Content != "room msg 3" {
		t.Errorf("expected third message 'room msg 3', got '%s'", msgs[2].Content)
	}
	// Verify room_id is set on returned messages.
	for _, m := range msgs {
		if m.RoomID != roomID {
			t.Errorf("expected room_id '%s', got '%s'", roomID, m.RoomID)
		}
	}

	// Pagination with before.
	thirdMsg := msgs[2]
	msgs = s.GetRoomMessages(roomID, 100, thirdMsg.Timestamp)
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages before third, got %d", len(msgs))
	}
	if msgs[0].Content != "room msg 1" || msgs[1].Content != "room msg 2" {
		t.Error("unexpected pagination results for room messages")
	}

	// Limit.
	msgs = s.GetRoomMessages(roomID, 2, 0)
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages with limit, got %d", len(msgs))
	}

	// Verify room exists in list.
	rooms := s.ListRooms()
	found := false
	for _, r := range rooms {
		if r.ID == roomID && r.Name == "test-room" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected 'test-room' in room list")
	}
}

// ── Threaded replies ──

func TestGetThreadMessages(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Insert a parent message.
	parent, err := s.InsertMessage("alice", "parent message", "", "", "", "", "")
	if err != nil {
		t.Fatalf("InsertMessage returned error: %v", err)
	}

	// Insert thread replies.
	time.Sleep(time.Millisecond)
	s.InsertMessage("bob", "reply 1", parent.ID, "", "", "", parent.ID)
	time.Sleep(time.Millisecond)
	s.InsertMessage("charlie", "reply 2", parent.ID, "", "", "", parent.ID)

	// GetThreadMessages should return replies in chronological order.
	replies := s.GetThreadMessages(parent.ID)
	if len(replies) != 2 {
		t.Fatalf("expected 2 thread replies, got %d", len(replies))
	}
	if replies[0].Content != "reply 1" {
		t.Errorf("expected first reply 'reply 1', got '%s'", replies[0].Content)
	}
	if replies[1].Content != "reply 2" {
		t.Errorf("expected second reply 'reply 2', got '%s'", replies[1].Content)
	}
	if replies[0].ThreadID != parent.ID {
		t.Errorf("expected thread_id '%s', got '%s'", parent.ID, replies[0].ThreadID)
	}
	if replies[0].ReplyToID != parent.ID {
		t.Errorf("expected reply_to_id '%s', got '%s'", parent.ID, replies[0].ReplyToID)
	}

	// GetThreadReplyCount.
	count := s.GetThreadReplyCount(parent.ID)
	if count != 2 {
		t.Errorf("expected 2 thread replies, got %d", count)
	}

	// Empty thread should return 0 replies.
	replies = s.GetThreadMessages("nonexistent-id")
	if len(replies) != 0 {
		t.Errorf("expected 0 replies for unknown thread, got %d", len(replies))
	}
	count = s.GetThreadReplyCount("nonexistent-id")
	if count != 0 {
		t.Errorf("expected 0 count for unknown thread, got %d", count)
	}
}

// ── Group management ──

// Create a group.

// Get group info.

// Get group owner.

// Get members with roles.

// Add members.

// Get member role.

// Set member role to admin.

// Get simple member list.

// Verify member count updated.

// Get all groups.

// Remove a member.

// ── Invite codes ──

func TestGenerateInviteCode(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Generate code with specific max uses.
	code, err := s.GenerateInviteCode("admin", 3)
	if err != nil {
		t.Fatalf("GenerateInviteCode returned error: %v", err)
	}
	if len(code) != 8 {
		t.Errorf("expected 8-character code, got %d", len(code))
	}
	for _, c := range code {
		if !strings.ContainsRune("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", c) {
			t.Errorf("invite code contains invalid character: %c", c)
		}
	}

	// Validate the code.
	valid, err := s.ValidateInviteCode(code)
	if err != nil {
		t.Fatalf("ValidateInviteCode returned error: %v", err)
	}
	if !valid {
		t.Error("expected code to be valid")
	}

	// Validate with lowercase should work (normalized to uppercase).
	valid, err = s.ValidateInviteCode(strings.ToLower(code))
	if err != nil {
		t.Fatalf("ValidateInviteCode (lowercase) returned error: %v", err)
	}
	if !valid {
		t.Error("expected lowercase code to be valid (normalized)")
	}

	// Validate empty code.
	valid, err = s.ValidateInviteCode("")
	if err != nil {
		t.Fatalf("ValidateInviteCode (empty) returned error: %v", err)
	}
	if valid {
		t.Error("expected empty code to be invalid")
	}

	// Validate non-existent code.
	valid, err = s.ValidateInviteCode("ZZZZZZZZ")
	if err != nil {
		t.Fatalf("ValidateInviteCode (nonexistent) returned error: %v", err)
	}
	if valid {
		t.Error("expected non-existent code to be invalid")
	}

	// Generate another code.
	code2, err := s.GenerateInviteCode("admin", 1)
	if err != nil {
		t.Fatalf("GenerateInviteCode second returned error: %v", err)
	}
	if code == code2 {
		t.Error("expected unique invite codes")
	}

	// List invite codes for the creator.
	codes, err := s.ListInviteCodes("admin")
	if err != nil {
		t.Fatalf("ListInviteCodes returned error: %v", err)
	}
	if len(codes) != 2 {
		t.Errorf("expected 2 invite codes, got %d", len(codes))
	}

	// List for a different creator should be empty.
	codes, err = s.ListInviteCodes("other")
	if err != nil {
		t.Fatalf("ListInviteCodes for other creator returned error: %v", err)
	}
	if len(codes) != 0 {
		t.Errorf("expected 0 codes for other creator, got %d", len(codes))
	}
}

// ── Chat folders ──

// Create folders.

// Create folder for another user.

// List folders for alice.

// List folders for bob.

// List folders for user with no folders.

// Duplicate name for same user should fail (UNIQUE constraint).

// Same name for different user should succeed.

// Rename succeeds.

// Rename with wrong username should silently affect 0 rows (no error, just no-op).

// Rename non-existent folder.

// Add items to the folder.

// Verify items exist.

// Delete the folder.

// Folder should be gone.

// Items should be cascaded/deleted.

// Delete with wrong username should not delete.

// Add item.

// Adding same item again should be a no-op (INSERT OR IGNORE).

// Verify item count.

// Remove item.

// Removing non-existent item should not error.

// GetFolderItems for non-existent folder returns empty.

// ── Notification preferences ──

func TestNotificationPrefsSetAndGet(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Set notification prefs.
	err = s.SetNotificationPrefs("alice", "dm:bob", time.Now().UnixMilli()+3600000, false)
	if err != nil {
		t.Fatalf("SetNotificationPrefs returned error: %v", err)
	}

	mutedUntil, showPreview, err := s.GetNotificationPrefs("alice", "dm:bob")
	if err != nil {
		t.Fatalf("GetNotificationPrefs returned error: %v", err)
	}
	if mutedUntil == 0 {
		t.Error("expected non-zero muted_until")
	}
	if showPreview {
		t.Error("expected show_preview=false")
	}

	// GetNotificationPrefs for non-existent key should return defaults (0, true).
	mutedUntil, showPreview, err = s.GetNotificationPrefs("alice", "room:nonexistent")
	if err != nil {
		t.Fatalf("GetNotificationPrefs for missing key returned error: %v", err)
	}
	if mutedUntil != 0 {
		t.Errorf("expected muted_until=0 for missing key, got %d", mutedUntil)
	}
	if !showPreview {
		t.Error("expected show_preview=true for missing key (default)")
	}
}

func TestNotificationPrefsUpsert(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	key := "dm:eve"
	err = s.SetNotificationPrefs("alice", key, 1000, true)
	if err != nil {
		t.Fatalf("SetNotificationPrefs returned error: %v", err)
	}

	// Upsert: change show_preview and muted_until.
	err = s.SetNotificationPrefs("alice", key, 2000, false)
	if err != nil {
		t.Fatalf("SetNotificationPrefs upsert returned error: %v", err)
	}

	mutedUntil, showPreview, err := s.GetNotificationPrefs("alice", key)
	if err != nil {
		t.Fatalf("GetNotificationPrefs after upsert returned error: %v", err)
	}
	if mutedUntil != 2000 {
		t.Errorf("expected muted_until=2000 after upsert, got %d", mutedUntil)
	}
	if showPreview {
		t.Error("expected show_preview=false after upsert")
	}
}

func TestListNotificationPrefs(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Set multiple prefs for alice.
	s.SetNotificationPrefs("alice", "dm:bob", 5000, false)
	s.SetNotificationPrefs("alice", "room:general", 0, true)
	s.SetNotificationPrefs("bob", "dm:alice", 3000, true)

	// List for alice.
	prefs := s.ListNotificationPrefs("alice")
	if len(prefs) != 2 {
		t.Fatalf("expected 2 prefs for alice, got %d", len(prefs))
	}

	keys := map[string]bool{}
	for _, p := range prefs {
		keys[p.Key] = true
	}
	if !keys["dm:bob"] || !keys["room:general"] {
		t.Errorf("unexpected keys in prefs: %+v", prefs)
	}

	// List for user with no prefs.
	prefs = s.ListNotificationPrefs("nonexistent")
	if len(prefs) != 0 {
		t.Errorf("expected 0 prefs for empty user, got %d", len(prefs))
	}
}

// ── Custom emoji ──

func TestCustomEmojiAddAndList(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Add custom emojis.
	err = s.AddCustomEmoji("party_parrot", "https://example.com/parrot.gif", "alice", "room1")
	if err != nil {
		t.Fatalf("AddCustomEmoji returned error: %v", err)
	}
	err = s.AddCustomEmoji("cat_jam", "https://example.com/cat.gif", "bob", "")
	if err != nil {
		t.Fatalf("AddCustomEmoji second returned error: %v", err)
	}
	err = s.AddCustomEmoji("dance", "https://example.com/dance.gif", "alice", "room2")
	if err != nil {
		t.Fatalf("AddCustomEmoji third returned error: %v", err)
	}

	// List all emojis (no room filter).
	all, err := s.ListCustomEmojis("")
	if err != nil {
		t.Fatalf("ListCustomEmojis returned error: %v", err)
	}
	if len(all) != 3 {
		t.Fatalf("expected 3 emojis, got %d", len(all))
	}

	// List with room filter: should return room1 + global emojis.
	room1Emojis, err := s.ListCustomEmojis("room1")
	if err != nil {
		t.Fatalf("ListCustomEmojis for room1 returned error: %v", err)
	}
	// room1 gets: party_parrot (room1) + cat_jam (global) = 2
	if len(room1Emojis) != 2 {
		t.Fatalf("expected 2 emojis for room1, got %d", len(room1Emojis))
	}
	foundCatJam := false
	for _, e := range room1Emojis {
		if e.Name == "cat_jam" {
			foundCatJam = true
		}
	}
	if !foundCatJam {
		t.Error("expected global emoji 'cat_jam' in room1 results")
	}
}

func TestCustomEmojiDelete(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	err = s.AddCustomEmoji("cool_emoji", "https://example.com/cool.gif", "alice", "")
	if err != nil {
		t.Fatalf("AddCustomEmoji returned error: %v", err)
	}

	// Delete by uploader succeeds.
	err = s.DeleteCustomEmoji("cool_emoji", "alice")
	if err != nil {
		t.Fatalf("DeleteCustomEmoji returned error: %v", err)
	}

	// Verify deleted.
	all, err := s.ListCustomEmojis("")
	if err != nil {
		t.Fatalf("ListCustomEmojis after delete returned error: %v", err)
	}
	if len(all) != 0 {
		t.Errorf("expected 0 emojis after delete, got %d", len(all))
	}

	// Delete by non-uploader should silently affect 0 rows.
	err = s.AddCustomEmoji("bob_emoji", "https://example.com/bob.gif", "bob", "")
	if err != nil {
		t.Fatalf("AddCustomEmoji returned error: %v", err)
	}
	err = s.DeleteCustomEmoji("bob_emoji", "alice")
	if err != nil {
		t.Fatalf("DeleteCustomEmoji wrong user returned error: %v", err)
	}
	all, err = s.ListCustomEmojis("")
	if err != nil {
		t.Fatalf("ListCustomEmojis returned error: %v", err)
	}
	if len(all) != 1 {
		t.Errorf("expected emoji still present after wrong-user delete, got %d", len(all))
	}
}

func TestCustomEmojiSearch(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Add emojis with known prefixes.
	s.AddCustomEmoji("party_parrot", "https://example.com/parrot.gif", "alice", "")
	s.AddCustomEmoji("party_blob", "https://example.com/blob.gif", "alice", "")
	s.AddCustomEmoji("cat_jam", "https://example.com/cat.gif", "bob", "")
	s.AddCustomEmoji("cat_wave", "https://example.com/wave.gif", "bob", "")

	// Search by prefix "party".
	results, err := s.SearchCustomEmojis("party")
	if err != nil {
		t.Fatalf("SearchCustomEmojis returned error: %v", err)
	}
	if len(results) != 2 {
		t.Errorf("expected 2 results for 'party', got %d", len(results))
	}

	// Search by prefix "cat".
	results, err = s.SearchCustomEmojis("cat")
	if err != nil {
		t.Fatalf("SearchCustomEmojis for 'cat' returned error: %v", err)
	}
	if len(results) != 2 {
		t.Errorf("expected 2 results for 'cat', got %d", len(results))
	}

	// Search with no matches.
	results, err = s.SearchCustomEmojis("zzz_nonexistent")
	if err != nil {
		t.Fatalf("SearchCustomEmojis for non-existent returned error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for non-existent, got %d", len(results))
	}
}

func TestCustomEmojiDuplicateName(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	err = s.AddCustomEmoji("unique_emoji", "https://example.com/1.gif", "alice", "")
	if err != nil {
		t.Fatalf("AddCustomEmoji returned error: %v", err)
	}

	// UNIQUE constraint on name should reject duplicate.
	err = s.AddCustomEmoji("unique_emoji", "https://example.com/2.gif", "bob", "")
	if err == nil {
		t.Error("expected error for duplicate emoji name")
	}
}

// ── Export messages ──

func TestExportMessagesRoom(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	roomID, _ := s.CreateRoom("export-room")
	s.InsertMessage("alice", "room msg 1", "", roomID, "", "", "")
	time.Sleep(time.Millisecond)
	s.InsertMessage("bob", "room msg 2", "", roomID, "", "", "")
	time.Sleep(time.Millisecond)
	s.InsertMessage("alice", "room msg 3", "", roomID, "", "", "")

	// Also insert a deleted message (should be excluded).
	deleted, _ := s.InsertMessage("bob", "deleted msg", "", roomID, "", "", "")
	s.MarkDeleted(deleted.ID)

	ctx := context.Background()
	msgs, err := s.ExportMessages(ctx, roomID, "", "", "", 0)
	if err != nil {
		t.Fatalf("ExportMessages returned error: %v", err)
	}
	if len(msgs) != 3 {
		t.Fatalf("expected 3 messages (deleted excluded), got %d", len(msgs))
	}
	if msgs[0].Content != "room msg 1" {
		t.Errorf("expected first 'room msg 1', got '%s'", msgs[0].Content)
	}
	if msgs[2].Content != "room msg 3" {
		t.Errorf("expected third 'room msg 3', got '%s'", msgs[2].Content)
	}
}

// Messages should be in chronological order.

func TestExportMessagesPublic(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.InsertMessage("alice", "public msg 1", "", "", "", "", "")
	time.Sleep(time.Millisecond)
	s.InsertMessage("bob", "public msg 2", "", "", "", "", "")

	// Also insert a DM — it should not appear in public export.
	s.InsertMessage("alice", "dm msg", "", "", "bob", "", "")

	ctx := context.Background()
	msgs, err := s.ExportMessages(ctx, "", "", "", "", 0)
	if err != nil {
		t.Fatalf("ExportMessages public returned error: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 public messages, got %d", len(msgs))
	}
}

func TestExportMessagesLimit(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	for i := 0; i < 5; i++ {
		s.InsertMessage("alice", fmt.Sprintf("msg%d", i), "", "", "", "", "")
		time.Sleep(time.Millisecond)
	}

	ctx := context.Background()
	msgs, err := s.ExportMessages(ctx, "", "", "", "", 2)
	if err != nil {
		t.Fatalf("ExportMessages with limit returned error: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages with limit, got %d", len(msgs))
	}
}

func TestExportMessagesEmpty(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	ctx := context.Background()
	msgs, err := s.ExportMessages(ctx, "nonexistent-room", "", "", "", 0)
	if err != nil {
		t.Fatalf("ExportMessages on empty DB returned error: %v", err)
	}
	if len(msgs) != 0 {
		t.Errorf("expected 0 messages on empty DB, got %d", len(msgs))
	}
}

// ── Call history ──

// GetCallHistory for caller.

// GetCallHistory for callee.

// Update the call record.

// Empty history.

// Log multiple calls.

// Limit returns only the requested number.

// ── Scheduled messages ──

// Schedule a message in the past (should be picked up as pending).

// 10 seconds in the past

// Schedule a message in the future (should NOT be picked up as pending).

// 1 hour in the future

// GetPendingScheduledMessages should only return the past message.

// Mark as sent.

// Pending should now be empty.

// GetUserScheduledMessages for alice should return only the unsent future message.

// Cancel the future message.

// Bob tries to cancel alice's message — should silently affect 0 rows.

// Verify the message is still there for alice.

// GetUserScheduledMessages for user with no scheduled messages.

// GetPendingScheduledMessages on empty DB.

// Schedule a group message.

// Schedule a DM.

// Verify all fields are returned.

// ── MarkDeleted edge cases ──

func TestMarkDeletedNonExistent(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// MarkDeleted on non-existent message should not error.
	err = s.MarkDeleted("nonexistent-id")
	if err != nil {
		t.Errorf("MarkDeleted on non-existent returned error: %v", err)
	}
}

func TestUpdateMessageNonExistent(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	_, err = s.UpdateMessage("nonexistent-id", "new content")
	if err == nil {
		t.Error("expected error for UpdateMessage on non-existent message")
	}
}

// ── Reaction toggle edge cases ──

func TestToggleReactionToggleTwice(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	msg, _ := s.InsertMessage("alice", "reaction test", "", "", "", "", "")

	// Add reaction.
	reactions, err := s.ToggleReaction(msg.ID, "👍", "bob")
	if err != nil {
		t.Fatalf("ToggleReaction (add) returned error: %v", err)
	}
	if reactions["👍"] == nil || len(reactions["👍"]) != 1 {
		t.Error("expected 1 👍 reaction from bob")
	}

	// Toggle same reaction (remove).
	reactions, err = s.ToggleReaction(msg.ID, "👍", "bob")
	if err != nil {
		t.Fatalf("ToggleReaction (remove) returned error: %v", err)
	}
	if len(reactions["👍"]) != 0 {
		t.Error("expected empty 👍 reactions after toggle-remove")
	}
}

func TestGetReactionsForMessagesEmpty(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Empty input should return empty map.
	reactions := s.GetReactionsForMessages([]string{})
	if len(reactions) != 0 {
		t.Errorf("expected empty map for empty input, got %d entries", len(reactions))
	}
}

// ── Pinned conversations edge cases ──

// Pinning again should be no-op (INSERT OR IGNORE).

// ── Mute/Archive edge cases ──

// Initially not muted.

// Mute.

// Unmute.

// Initially not archived.

// Archive.

// Unarchive.

// ── Friends edge cases ──

// Empty friends list.

// Add friends.

// Remove friend.

// ── Room management edge cases ──

func TestDeleteRoom(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	roomID, _ := s.CreateRoom("temp-room")
	rooms := s.ListRooms()
	originalCount := len(rooms)

	err = s.DeleteRoom(roomID)
	if err != nil {
		t.Fatalf("DeleteRoom returned error: %v", err)
	}

	rooms = s.ListRooms()
	if len(rooms) != originalCount-1 {
		t.Errorf("expected %d rooms after delete, got %d", originalCount-1, len(rooms))
	}

	// Verify room is gone.
	_, err = s.GetRoomID("temp-room")
	if err == nil {
		t.Error("expected error when getting deleted room")
	}
}

func TestDuplicateRoom(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	_, err = s.CreateRoom("unique-room")
	if err != nil {
		t.Fatalf("CreateRoom returned error: %v", err)
	}

	// Duplicate room name should fail.
	_, err = s.CreateRoom("unique-room")
	if err == nil {
		t.Error("expected error for duplicate room name")
	}
}

// ── GetAllFriends and GetAllGroups coverage ──

// ── MarkMessagesDelivered edge cases ──

// Insert a DM.

// Initially undelivered.

// Mark as delivered.

// Should now be empty.

// MarkMessagesDelivered with empty slice should be no-op.

// ── Polls basic flow ──

func TestPollLifecycle(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	now := time.Now().UnixMilli()
	poll := &Poll{
		ID:             "poll-1",
		RoomID:         "public",
		Creator:        "alice",
		Question:       "What is your favorite color?",
		Options:        []string{"Red", "Blue", "Green"},
		MultipleChoice: false,
		IsAnonymous:    true,
		Votes:          make(map[int]int),
		Voters:         make(map[int][]string),
		CreatedAt:      now,
	}

	err = s.CreatePoll(poll)
	if err != nil {
		t.Fatalf("CreatePoll returned error: %v", err)
	}

	// Get the poll.
	retrieved, err := s.GetPoll("poll-1")
	if err != nil {
		t.Fatalf("GetPoll returned error: %v", err)
	}
	if retrieved.Question != poll.Question {
		t.Errorf("expected question '%s', got '%s'", poll.Question, retrieved.Question)
	}
	if len(retrieved.Options) != 3 {
		t.Errorf("expected 3 options, got %d", len(retrieved.Options))
	}
	if !retrieved.IsAnonymous {
		t.Error("expected IsAnonymous=true")
	}
	if retrieved.IsClosed {
		t.Error("expected IsClosed=false initially")
	}

	// Vote on option 1.
	err = s.VotePoll("poll-1", "bob", 1)
	if err != nil {
		t.Fatalf("VotePoll returned error: %v", err)
	}

	// Vote again (duplicate) should be no-op.
	err = s.VotePoll("poll-1", "bob", 1)
	if err != nil {
		t.Fatalf("VotePoll duplicate returned error: %v", err)
	}

	retrieved, err = s.GetPoll("poll-1")
	if err != nil {
		t.Fatalf("GetPoll after vote returned error: %v", err)
	}
	if retrieved.Votes[1] != 1 {
		t.Errorf("expected 1 vote for option 1, got %d", retrieved.Votes[1])
	}
	if len(retrieved.Voters[1]) != 1 || retrieved.Voters[1][0] != "bob" {
		t.Errorf("expected voter 'bob', got %v", retrieved.Voters[1])
	}

	// Close the poll.
	err = s.ClosePoll("poll-1")
	if err != nil {
		t.Fatalf("ClosePoll returned error: %v", err)
	}
	retrieved, err = s.GetPoll("poll-1")
	if err != nil {
		t.Fatalf("GetPoll after close returned error: %v", err)
	}
	if !retrieved.IsClosed {
		t.Error("expected IsClosed=true after close")
	}

	// GetPoll for non-existent poll.
	_, err = s.GetPoll("nonexistent")
	if err == nil {
		t.Error("expected error for non-existent poll")
	}
}

// ── Group management extended ──

// Rename group.

// Verify group_info updated.

// Verify members migrated.

// Verify messages migrated.

// Transfer ownership.

// ── LeaveGroup basic ──

// Non-owner leaves.

// ── GetGroupMemberRole and GetGroupOwner missing cases ──

// Non-member should get an error.

// Non-existent group.

// ── Pin/Unpin message ──

func TestPinAndUnpinMessage(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	msg, _ := s.InsertMessage("alice", "important message", "", "room-1", "", "", "")

	// Pin the message.
	err = s.PinMessage("room-1", msg.ID, "bob")
	if err != nil {
		t.Fatalf("PinMessage returned error: %v", err)
	}

	pinned := s.GetPinnedMessages("room-1")
	if len(pinned) != 1 {
		t.Fatalf("expected 1 pinned message, got %d", len(pinned))
	}
	if pinned[0].ID != msg.ID {
		t.Errorf("expected pinned msg ID '%s', got '%s'", msg.ID, pinned[0].ID)
	}

	// Unpin.
	err = s.UnpinMessage("room-1", msg.ID)
	if err != nil {
		t.Fatalf("UnpinMessage returned error: %v", err)
	}

	pinned = s.GetPinnedMessages("room-1")
	if len(pinned) != 0 {
		t.Errorf("expected 0 pinned after unpin, got %d", len(pinned))
	}
}

// ── GetMessageByID ──

func TestGetMessageByIDNonExistent(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	_, err = s.GetMessageByID("nonexistent-id")
	if err == nil {
		t.Error("expected error for non-existent message")
	}
}

// ── GetGroupInfo missing ──

// ── GroupMembersWithRoles empty ──

// ── Edge case: RegisterUser with empty username ──

func TestRegisterUserEmptyUsername(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	code, err := s.GenerateInviteCode("admin", 5)
	if err != nil {
		t.Fatalf("GenerateInviteCode returned error: %v", err)
	}

	// Empty username should either succeed (empty string is a valid username)
	// or return an error — but must not panic.
	err = s.RegisterUser("", "password123", code)
	// We don't assert success/failure; we only assert no panic.
	// If it succeeded, verify the user exists.
	if err == nil {
		var count int
		if err := s.db.QueryRow("SELECT COUNT(*) FROM users WHERE username = ?", "").Scan(&count); err != nil {
			t.Fatalf("failed to query empty-username user: %v", err)
		}
		if count != 1 {
			t.Errorf("expected 1 user with empty username, got %d", count)
		}
	}
}

// ── Edge case: RegisterUser with empty password ──

func TestRegisterUserEmptyPassword(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	code, err := s.GenerateInviteCode("admin", 5)
	if err != nil {
		t.Fatalf("GenerateInviteCode returned error: %v", err)
	}

	// Empty password: bcrypt should handle it.
	err = s.RegisterUser("emptypass", "", code)
	if err != nil {
		t.Fatalf("RegisterUser with empty password returned error: %v", err)
	}

	// Verify the user can authenticate with empty password.
	ok, err := s.VerifyUser("emptypass", "")
	if err != nil {
		t.Fatalf("VerifyUser returned error: %v", err)
	}
	if !ok {
		t.Error("expected VerifyUser to succeed with empty password")
	}
}

// ── Edge case: VerifyUser edge cases (non-existent, wrong password) ──

func TestVerifyUserEdgeCases(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	code, _ := s.GenerateInviteCode("admin", 5)
	s.RegisterUser("realuser", "realpassword", code)

	tests := []struct {
		name     string
		username string
		password string
		wantOK   bool
	}{
		{
			name:     "non-existent username",
			username: "ghost",
			password: "anything",
			wantOK:   false,
		},
		{
			name:     "wrong password",
			username: "realuser",
			password: "wrongpassword",
			wantOK:   false,
		},
		{
			name:     "correct credentials",
			username: "realuser",
			password: "realpassword",
			wantOK:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ok, err := s.VerifyUser(tt.username, tt.password)
			if err != nil {
				t.Fatalf("VerifyUser returned error: %v", err)
			}
			if ok != tt.wantOK {
				t.Errorf("expected ok=%v, got %v", tt.wantOK, ok)
			}
		})
	}
}

// ── Edge case: InsertMessage with empty content ──

func TestInsertMessageEmptyContent(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	msg, err := s.InsertMessage("alice", "", "", "", "", "", "")
	if err != nil {
		t.Fatalf("InsertMessage with empty content returned error: %v", err)
	}
	if msg.Content != "" {
		t.Errorf("expected empty content, got '%s'", msg.Content)
	}
	if msg.ID == "" {
		t.Error("expected non-empty ID for empty-content message")
	}

	// Verify it can be retrieved.
	retrieved, err := s.GetMessageByID(msg.ID)
	if err != nil {
		t.Fatalf("GetMessageByID returned error: %v", err)
	}
	if retrieved.Content != "" {
		t.Errorf("expected empty content on retrieval, got '%s'", retrieved.Content)
	}
}

// ── Edge case: InsertMessage with very long content ──

func TestInsertMessageVeryLongContent(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Build a 15000-character message.
	longContent := strings.Repeat("abcdefghij", 1500) // 10 chars * 1500 = 15000
	if len(longContent) != 15000 {
		t.Fatalf("test setup: expected 15000 chars, got %d", len(longContent))
	}

	msg, err := s.InsertMessage("alice", longContent, "", "", "", "", "")
	if err != nil {
		t.Fatalf("InsertMessage with long content returned error: %v", err)
	}
	if len(msg.Content) != 15000 {
		t.Errorf("expected content length 15000, got %d", len(msg.Content))
	}

	// Verify full content is preserved on retrieval.
	retrieved, err := s.GetMessageByID(msg.ID)
	if err != nil {
		t.Fatalf("GetMessageByID returned error: %v", err)
	}
	if len(retrieved.Content) != 15000 {
		t.Errorf("expected retrieved content length 15000, got %d", len(retrieved.Content))
	}
	if retrieved.Content != longContent {
		t.Error("retrieved content does not match original long content")
	}

	// Verify it appears in message list.
	msgs := s.GetMessages(10, 0)
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message in list, got %d", len(msgs))
	}
	if len(msgs[0].Content) != 15000 {
		t.Errorf("expected content length 15000 in list, got %d", len(msgs[0].Content))
	}
}

// ── Edge case: GetMessageByID with empty ID ──

func TestGetMessageByIDEmptyID(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	_, err = s.GetMessageByID("")
	if err == nil {
		t.Error("expected error for GetMessageByID with empty ID")
	}
}

// ── Edge case: MarkDeleted with empty ID ──

func TestMarkDeletedEmptyID(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// MarkDeleted on empty ID should not error (UPDATE with no match).
	err = s.MarkDeleted("")
	if err != nil {
		t.Errorf("MarkDeleted with empty ID returned error: %v", err)
	}
}

// ── Edge case: ToggleReaction with empty message ID ──

func TestToggleReactionEmptyMessageID(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// ToggleReaction with empty message ID should fail because of
	// FOREIGN KEY constraint — no message has an empty ID.
	_, err = s.ToggleReaction("", "👍", "alice")
	if err == nil {
		t.Error("expected error for ToggleReaction with empty message ID (FK constraint)")
	}
}

// ── Edge case: ToggleReaction with empty emoji ──

func TestToggleReactionEmptyEmoji(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	msg, _ := s.InsertMessage("alice", "test", "", "", "", "", "")

	// ToggleReaction with empty emoji: store may allow this (emoji is just TEXT).
	reactions, err := s.ToggleReaction(msg.ID, "", "bob")
	if err != nil {
		t.Fatalf("ToggleReaction with empty emoji returned error: %v", err)
	}

	// Verify the empty-emoji reaction is tracked.
	if reactions[""] == nil || len(reactions[""]) != 1 {
		t.Error("expected 1 empty-emoji reaction from bob")
	}
	if reactions[""][0] != "bob" {
		t.Errorf("expected 'bob' as reactor, got '%s'", reactions[""][0])
	}

	// Toggle again to remove.
	reactions, err = s.ToggleReaction(msg.ID, "", "bob")
	if err != nil {
		t.Fatalf("ToggleReaction (remove empty emoji) returned error: %v", err)
	}
	if len(reactions[""]) != 0 {
		t.Error("expected empty-emoji reaction removed after second toggle")
	}
}

// ── Edge case: GetReactionsForMessages with non-existent IDs ──

func TestGetReactionsForMessagesNonExistentIDs(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Query reactions for IDs that don't exist.
	reactions := s.GetReactionsForMessages([]string{"ghost-1", "ghost-2", "ghost-3"})
	if len(reactions) != 3 {
		t.Errorf("expected 3 entries in map, got %d", len(reactions))
	}
	for _, id := range []string{"ghost-1", "ghost-2", "ghost-3"} {
		entry, ok := reactions[id]
		if !ok {
			t.Errorf("expected map entry for '%s'", id)
			continue
		}
		if len(entry) != 0 {
			t.Errorf("expected empty reactions for '%s', got %d", id, len(entry))
		}
	}
}

// ── Edge case: SearchMessages with empty query ──

func TestSearchMessagesEmptyQuery(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.InsertMessage("alice", "some message", "", "", "", "", "")

	results, err := s.SearchMessages("", "", 10)
	if err != nil {
		t.Fatalf("SearchMessages with empty query returned error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for empty query, got %d", len(results))
	}
	if results == nil {
		t.Error("expected non-nil empty slice, got nil")
	}
}

// ── Edge case: SearchMessages with special characters (SQL injection) ──

func TestSearchMessagesSQLInjection(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.InsertMessage("alice", "benign message here", "", "", "", "", "")

	tests := []struct {
		name  string
		query string
	}{
		{name: "SQL comment", query: "'; DROP TABLE messages; --"},
		{name: "UNION SELECT", query: "' UNION SELECT * FROM users --"},
		{name: "OR 1=1", query: "' OR '1'='1"},
		{name: "quotes and semicolons", query: "\"; DELETE FROM messages; \""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// SearchMessages may return an error (e.g. FTS5 syntax error on
			// sanitized operator tokens like OR*) — that is acceptable since
			// the query was blocked. The key invariant is that the database
			// must remain intact.
			results, err := s.SearchMessages(tt.query, "", 10)
			if err != nil {
				t.Logf("SearchMessages returned error (acceptable): %v", err)
			}
			_ = results

			// Verify the messages table still exists and is intact.
			var count int
			if err := s.db.QueryRow("SELECT COUNT(*) FROM messages").Scan(&count); err != nil {
				t.Fatalf("messages table query failed after search: %v", err)
			}
			if count != 1 {
				t.Errorf("expected 1 message in table, got %d — possible injection", count)
			}
		})
	}
}

// ── Edge case: SearchMessages with non-existent room ──

func TestSearchMessagesNonExistentRoom(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.InsertMessage("alice", "hello world", "", "room-real", "", "", "")

	results, err := s.SearchMessages("hello", "room-ghost", 10)
	if err != nil {
		t.Fatalf("SearchMessages with non-existent room returned error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for non-existent room, got %d", len(results))
	}
}

// ── Edge case: AddFriend with self ──

// Adding self as friend: store does not have a constraint against this.

// Verify self appears in friends list.

// ── Edge case: RemoveFriend with non-existent friendship ──

// RemoveFriend on non-existent friendship should not error.

// Friends list should remain empty.

// ── GetUndeliveredDMs focused test ──

// Insert a DM (delivered defaults to 0).

// Insert a non-DM message — should not appear as undelivered.

// Bob should see 1 undelivered DM.

// Alice should see 0 undelivered — the DM was sent TO bob, not alice.

// Mark as delivered.

// Bob should now see 0 undelivered.

// GetUndeliveredDMs for user with no DMs returns empty slice.

// ── GetRoomID with non-existent room ──

func TestGetRoomIDNonExistent(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// GetRoomID for a room that was never created should return an error.
	_, err = s.GetRoomID("phantom-room")
	if err == nil {
		t.Error("expected error for non-existent room")
	}

	// GetRoomID for empty room name should also return an error.
	_, err = s.GetRoomID("")
	if err == nil {
		t.Error("expected error for empty room name")
	}
}

// ── DeleteRoom with non-existent room ──

func TestDeleteRoomNonExistent(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// DeleteRoom on a non-existent room should not error (silent no-op).
	err = s.DeleteRoom("nonexistent-id")
	if err != nil {
		t.Errorf("DeleteRoom on non-existent room returned unexpected error: %v", err)
	}

	// DeleteRoom with empty ID should not error.
	err = s.DeleteRoom("")
	if err != nil {
		t.Errorf("DeleteRoom with empty ID returned unexpected error: %v", err)
	}

	// Verify room list is unaffected.
	rooms := s.ListRooms()
	beforeCount := len(rooms)
	s.DeleteRoom("another-nonexistent-id")
	rooms = s.ListRooms()
	if len(rooms) != beforeCount {
		t.Errorf("room count changed after deleting non-existent room: %d -> %d", beforeCount, len(rooms))
	}
}

// ── PinConversation full round trip ──

// Initially no pinned conversations.

// Pin two conversations.

// Pin for a different user — should not appear in alice's list.

// List pinned for alice.

// Unpin one.

// Unpin the other.

// Bob's list should be unaffected by alice's operations.

// ── GetWebhookByURL ──

// Look up by URL.

// Look up the second webhook.

// ── GetWebhookByURL with non-existent URL ──

// Lookup with no webhooks in DB should return error.

// Insert a webhook, then look up a different URL.

// Empty URL should also return error.

// ── CreateWebhook with empty secret ──

// hashWebhookSecret rejects empty secrets.

// Verify no webhook was created.

// ── Blocked users: GetBlockedUsers list verification ──

func TestBlockUserAndGetBlockedUsers(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Initially no blocked users.
	blocked := s.GetBlockedUsers("alice")
	if len(blocked) != 0 {
		t.Errorf("expected empty blocked list, got %d entries", len(blocked))
	}
	if blocked == nil {
		t.Error("expected non-nil empty slice, got nil")
	}

	// Block bob.
	err = s.BlockUser("alice", "bob")
	if err != nil {
		t.Fatalf("BlockUser returned error: %v", err)
	}

	// Verify bob appears in blocked list.
	blocked = s.GetBlockedUsers("alice")
	if len(blocked) != 1 {
		t.Fatalf("expected 1 blocked user, got %d", len(blocked))
	}
	if blocked[0] != "bob" {
		t.Errorf("expected blocked user 'bob', got '%s'", blocked[0])
	}

	// Block another.
	s.BlockUser("alice", "charlie")
	blocked = s.GetBlockedUsers("alice")
	if len(blocked) != 2 {
		t.Fatalf("expected 2 blocked users, got %d", len(blocked))
	}

	// Unblock bob.
	err = s.UnblockUser("alice", "bob")
	if err != nil {
		t.Fatalf("UnblockUser returned error: %v", err)
	}

	// Verify bob is removed from list, charlie remains.
	blocked = s.GetBlockedUsers("alice")
	if len(blocked) != 1 {
		t.Fatalf("expected 1 blocked after unblock, got %d", len(blocked))
	}
	if blocked[0] != "charlie" {
		t.Errorf("expected 'charlie' remaining, got '%s'", blocked[0])
	}

	// Unblock charlie.
	s.UnblockUser("alice", "charlie")
	blocked = s.GetBlockedUsers("alice")
	if len(blocked) != 0 {
		t.Errorf("expected empty blocked list after all unblocked, got %d", len(blocked))
	}
}

// ── Blocked users: self-block edge case ──

func TestIsBlockedSelf(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Initially, user has not blocked themselves.
	if s.IsBlocked("alice", "alice") {
		t.Error("expected IsBlocked(alice, alice) to return false initially")
	}

	// Block yourself.
	err = s.BlockUser("alice", "alice")
	if err != nil {
		t.Fatalf("BlockUser(self) returned error: %v", err)
	}

	// Now blocked.
	if !s.IsBlocked("alice", "alice") {
		t.Error("expected IsBlocked(alice, alice) to return true after blocking self")
	}

	// Verify blocked list includes self.
	blocked := s.GetBlockedUsers("alice")
	if len(blocked) != 1 || blocked[0] != "alice" {
		t.Errorf("expected ['alice'], got %v", blocked)
	}

	// Unblock self.
	err = s.UnblockUser("alice", "alice")
	if err != nil {
		t.Fatalf("UnblockUser(self) returned error: %v", err)
	}
	if s.IsBlocked("alice", "alice") {
		t.Error("expected IsBlocked(alice, alice) to return false after unblocking self")
	}

	// Verify blocked list is empty after unblock.
	blocked = s.GetBlockedUsers("alice")
	if len(blocked) != 0 {
		t.Errorf("expected 0 blocked after unblocking self, got %d", len(blocked))
	}
}

// ── Blocked users: empty/multiple/isolation ──

func TestGetBlockedUsersEdgeCases(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Empty list for user who has never blocked anyone.
	blocked := s.GetBlockedUsers("alice")
	if len(blocked) != 0 {
		t.Errorf("expected 0 blocked for new user, got %d", len(blocked))
	}
	if blocked == nil {
		t.Error("expected non-nil empty slice, got nil")
	}

	// Block multiple users.
	s.BlockUser("alice", "bob")
	s.BlockUser("alice", "charlie")
	s.BlockUser("alice", "dave")

	blocked = s.GetBlockedUsers("alice")
	if len(blocked) != 3 {
		t.Fatalf("expected 3 blocked users, got %d", len(blocked))
	}

	// Verify isolation: bob's blocked list is independent.
	bobBlocked := s.GetBlockedUsers("bob")
	if len(bobBlocked) != 0 {
		t.Errorf("expected bob to have 0 blocked, got %d", len(bobBlocked))
	}

	// Block some from bob's side.
	s.BlockUser("bob", "alice")
	s.BlockUser("bob", "eve")
	bobBlocked = s.GetBlockedUsers("bob")
	if len(bobBlocked) != 2 {
		t.Fatalf("expected bob's blocked list length 2, got %d", len(bobBlocked))
	}

	// Alice's list should be unchanged.
	blocked = s.GetBlockedUsers("alice")
	if len(blocked) != 3 {
		t.Errorf("alice's blocked list changed unexpectedly, got %d entries", len(blocked))
	}

	// Block duplicate (INSERT OR IGNORE) -- should not increase count.
	err = s.BlockUser("alice", "bob")
	if err != nil {
		t.Fatalf("BlockUser duplicate returned error: %v", err)
	}
	blocked = s.GetBlockedUsers("alice")
	if len(blocked) != 3 {
		t.Errorf("expected still 3 after duplicate block, got %d", len(blocked))
	}

	// Unblock non-existent user should not error and not change list.
	err = s.UnblockUser("alice", "ghost")
	if err != nil {
		t.Fatalf("UnblockUser non-existent returned error: %v", err)
	}
	blocked = s.GetBlockedUsers("alice")
	if len(blocked) != 3 {
		t.Errorf("expected still 3 after unblock non-existent, got %d", len(blocked))
	}
}

// ── Custom emoji: search with empty query ──

func TestSearchCustomEmojisEmptyQuery(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Empty search on empty DB should return empty results.
	results, err := s.SearchCustomEmojis("")
	if err != nil {
		t.Fatalf("SearchCustomEmojis with empty query returned error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for empty search on empty DB, got %d", len(results))
	}

	// Add some emojis.
	s.AddCustomEmoji("party_parrot", "https://example.com/parrot.gif", "alice", "")
	s.AddCustomEmoji("cat_jam", "https://example.com/cat.gif", "bob", "")
	s.AddCustomEmoji("dance", "https://example.com/dance.gif", "alice", "")

	// Empty query matches all (LIKE '%').
	results, err = s.SearchCustomEmojis("")
	if err != nil {
		t.Fatalf("SearchCustomEmojis with empty query returned error: %v", err)
	}
	if len(results) != 3 {
		t.Errorf("expected 3 results for empty query (match all), got %d", len(results))
	}

	// Search with no matches.
	results, err = s.SearchCustomEmojis("zzz_nonexistent")
	if err != nil {
		t.Fatalf("SearchCustomEmojis non-existent returned error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for non-existent, got %d", len(results))
	}
}

// ── User status: update for user without profile ──

// UpdateStatus for a user who has no profile row: UPDATE with 0 rows,
// should not error.

// The user still has no profile (plain UPDATE does not insert).

// Now create a profile and update status.

// Update to empty status.

// ── User last seen: multiple updates and initial creation ──

func TestUpdateUserLastSeenMultiple(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Update last seen for a user who has no profile row:
	// UpdateUserLastSeen uses ON CONFLICT UPSERT, so it creates the row.
	err = s.UpdateUserLastSeen("alice")
	if err != nil {
		t.Fatalf("UpdateUserLastSeen returned error: %v", err)
	}

	// Verify profile was created with a last_seen timestamp.
	profile, err := s.GetUserProfile("alice")
	if err != nil {
		t.Fatalf("GetUserProfile after UpdateUserLastSeen returned error: %v", err)
	}
	ts1 := profile.LastSeen
	if ts1 == 0 {
		t.Fatal("expected non-zero last_seen after UpdateUserLastSeen")
	}

	// Other fields should be at defaults.
	if profile.Username != "alice" {
		t.Errorf("expected username 'alice', got '%s'", profile.Username)
	}

	time.Sleep(time.Millisecond * 10)

	// Update again for the same user.
	err = s.UpdateUserLastSeen("alice")
	if err != nil {
		t.Fatalf("UpdateUserLastSeen second call returned error: %v", err)
	}

	profile, err = s.GetUserProfile("alice")
	if err != nil {
		t.Fatalf("GetUserProfile after second UpdateUserLastSeen returned error: %v", err)
	}
	ts2 := profile.LastSeen
	if ts2 <= ts1 {
		t.Errorf("expected last_seen to increase (%d -> %d)", ts1, ts2)
	}

	// Update a different user.
	time.Sleep(time.Millisecond * 10)
	err = s.UpdateUserLastSeen("bob")
	if err != nil {
		t.Fatalf("UpdateUserLastSeen for bob returned error: %v", err)
	}

	bobProfile, err := s.GetUserProfile("bob")
	if err != nil {
		t.Fatalf("GetUserProfile for bob returned error: %v", err)
	}
	if bobProfile.LastSeen == 0 {
		t.Fatal("expected non-zero last_seen for bob")
	}

	// Alice's timestamp should not have changed from the bob update.
	profile, err = s.GetUserProfile("alice")
	if err != nil {
		t.Fatalf("GetUserProfile for alice after bob update returned error: %v", err)
	}
	if profile.LastSeen != ts2 {
		t.Errorf("alice's last_seen changed unexpectedly: %d -> %d", ts2, profile.LastSeen)
	}
}

// ── Thread reply count: deleted replies excluded ──

func TestGetThreadReplyCountDeletedReplies(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Create a thread-parent message.
	parent, err := s.InsertMessage("alice", "parent message", "", "", "", "", "")
	if err != nil {
		t.Fatalf("InsertMessage returned error: %v", err)
	}

	// Thread with no replies: count should be 0.
	count := s.GetThreadReplyCount(parent.ID)
	if count != 0 {
		t.Errorf("expected 0 reply count for empty thread, got %d", count)
	}

	// Add replies.
	reply1, _ := s.InsertMessage("bob", "reply 1", parent.ID, "", "", "", parent.ID)
	time.Sleep(time.Millisecond)
	reply2, _ := s.InsertMessage("charlie", "reply 2", parent.ID, "", "", "", parent.ID)
	time.Sleep(time.Millisecond)
	reply3, _ := s.InsertMessage("dave", "reply 3", parent.ID, "", "", "", parent.ID)

	count = s.GetThreadReplyCount(parent.ID)
	if count != 3 {
		t.Errorf("expected 3 reply count, got %d", count)
	}

	// Delete one reply.
	err = s.MarkDeleted(reply2.ID)
	if err != nil {
		t.Fatalf("MarkDeleted returned error: %v", err)
	}

	// Deleted reply should be excluded from count.
	count = s.GetThreadReplyCount(parent.ID)
	if count != 2 {
		t.Errorf("expected 2 reply count after deleting one, got %d", count)
	}

	// Delete all replies.
	s.MarkDeleted(reply1.ID)
	s.MarkDeleted(reply3.ID)

	count = s.GetThreadReplyCount(parent.ID)
	if count != 0 {
		t.Errorf("expected 0 reply count after deleting all replies, got %d", count)
	}

	// Non-existent thread: count should be 0.
	count = s.GetThreadReplyCount("nonexistent-id")
	if count != 0 {
		t.Errorf("expected 0 for non-existent thread, got %d", count)
	}
}

// ── LeaveGroup: owner leaves alone (group deleted) ──

// Verify group exists.

// Owner leaves (only member).

// Group should be deleted.

// Members should be empty.

// GetAllGroups should not include it.

// ── LeaveGroup: owner leaves with another member (ownership transferred) ──

// Owner leaves (another member exists).

// Group should persist.

// bob should now have the "owner" role.

// alice should no longer be a member.

// ── LeaveGroup: owner leaves with an admin present (transferred to admin) ──

// Owner leaves (admin exists).

// Group should persist.

// Ownership should transfer to the admin (bob), not a random member.

// bob should now be owner.

// charlie should still be member.

// ── KickGroupMember: kicking the owner ──

// Kick the owner (allowed at store level; caller must enforce permission).

// Owner is removed from group_members.

// groups_info still references the old owner (caller must fix).

// ── TransferGroupOwnership: transfer to a non-member ──

// Transfer ownership to someone not in the group.

// groups_info owner is updated to charlie.

// Old owner alice is demoted to admin.

// charlie is not a member and does not get owner role (caller must add first).

// ── UpdateGroupName: duplicate name rejection ──

// Try to rename "devs" to "ops" (already exists) — should fail.

// "devs" should still have its original name.

// "ops" should still exist with its original owner.

// ── DeleteGroup: non-existent group is a no-op ──

// Deleting a non-existent group should not error.

// Should not affect existing groups.

// ── Message operations: happy-path coverage ──

func TestGetMessageByID(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	msg, err := s.InsertMessage("alice", "hello world", "", "room-1", "bob", "group-x", "thread-1")
	if err != nil {
		t.Fatalf("InsertMessage returned error: %v", err)
	}

	retrieved, err := s.GetMessageByID(msg.ID)
	if err != nil {
		t.Fatalf("GetMessageByID returned error: %v", err)
	}
	if retrieved.ID != msg.ID {
		t.Errorf("expected ID '%s', got '%s'", msg.ID, retrieved.ID)
	}
	if retrieved.Username != "alice" {
		t.Errorf("expected username 'alice', got '%s'", retrieved.Username)
	}
	if retrieved.Content != "hello world" {
		t.Errorf("expected content 'hello world', got '%s'", retrieved.Content)
	}
	if retrieved.Timestamp != msg.Timestamp {
		t.Errorf("expected timestamp %d, got %d", msg.Timestamp, retrieved.Timestamp)
	}
	if retrieved.RoomID != "room-1" {
		t.Errorf("expected RoomID 'room-1', got '%s'", retrieved.RoomID)
	}
	if retrieved.ToUser != "bob" {
		t.Errorf("expected ToUser 'bob', got '%s'", retrieved.ToUser)
	}
	if retrieved.ThreadID != "thread-1" {
		t.Errorf("expected ThreadID 'thread-1', got '%s'", retrieved.ThreadID)
	}
	if retrieved.Deleted {
		t.Error("expected Deleted to be false for new message")
	}
	if retrieved.Edited {
		t.Error("expected Edited to be false for new message")
	}
}

func TestEditMessage(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	msg, err := s.InsertMessage("alice", "original content", "", "", "", "", "")
	if err != nil {
		t.Fatalf("InsertMessage returned error: %v", err)
	}

	updated, err := s.UpdateMessage(msg.ID, "edited content")
	if err != nil {
		t.Fatalf("UpdateMessage returned error: %v", err)
	}
	if updated.Content != "edited content" {
		t.Errorf("expected content 'edited content', got '%s'", updated.Content)
	}
	if !updated.Edited {
		t.Error("expected Edited flag to be true after update")
	}
	if updated.ID != msg.ID {
		t.Errorf("expected same ID '%s', got '%s'", msg.ID, updated.ID)
	}
	if updated.Username != "alice" {
		t.Errorf("expected username 'alice', got '%s'", updated.Username)
	}

	// Verify via GetMessageByID.
	retrieved, err := s.GetMessageByID(msg.ID)
	if err != nil {
		t.Fatalf("GetMessageByID returned error: %v", err)
	}
	if retrieved.Content != "edited content" {
		t.Errorf("expected retrieved content 'edited content', got '%s'", retrieved.Content)
	}
	if !retrieved.Edited {
		t.Error("expected retrieved Edited flag to be true")
	}
}

func TestDeleteMessage(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	msg, err := s.InsertMessage("alice", "message to delete", "", "", "", "", "")
	if err != nil {
		t.Fatalf("InsertMessage returned error: %v", err)
	}

	err = s.MarkDeleted(msg.ID)
	if err != nil {
		t.Fatalf("MarkDeleted returned error: %v", err)
	}

	// Retrieved message should have empty content and Deleted flag set.
	retrieved, err := s.GetMessageByID(msg.ID)
	if err != nil {
		t.Fatalf("GetMessageByID returned error: %v", err)
	}
	if retrieved.Content != "" {
		t.Errorf("expected empty content for deleted message, got '%s'", retrieved.Content)
	}
	if !retrieved.Deleted {
		t.Error("expected Deleted flag to be true")
	}

	// In the message list, deleted messages should have empty content.
	msgs := s.GetMessages(10, 0)
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message in list, got %d", len(msgs))
	}
	if msgs[0].Content != "" {
		t.Errorf("expected empty content in list for deleted message, got '%s'", msgs[0].Content)
	}
}

func TestGetMessagesPagination(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Insert 5 messages with sleeps to ensure distinct timestamps.
	for i := 0; i < 5; i++ {
		s.InsertMessage("alice", fmt.Sprintf("msg%d", i), "", "", "", "", "")
		time.Sleep(time.Millisecond)
	}

	// Get first page: limit 2, before=0 (newest).
	msgs := s.GetMessages(2, 0)
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages with limit 2, got %d", len(msgs))
	}
	// Should be msg3 and msg4 (newest, then reversed to chronological).
	if msgs[0].Content != "msg3" {
		t.Errorf("expected 'msg3', got '%s'", msgs[0].Content)
	}
	if msgs[1].Content != "msg4" {
		t.Errorf("expected 'msg4', got '%s'", msgs[1].Content)
	}

	// Get second page: limit 2, before timestamp of msgs[0] (msg3).
	msgs = s.GetMessages(2, msgs[0].Timestamp)
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages for page 2, got %d", len(msgs))
	}
	if msgs[0].Content != "msg1" {
		t.Errorf("expected 'msg1', got '%s'", msgs[0].Content)
	}
	if msgs[1].Content != "msg2" {
		t.Errorf("expected 'msg2', got '%s'", msgs[1].Content)
	}

	// Third page: should have only msg0 left.
	msgs = s.GetMessages(2, msgs[0].Timestamp)
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message on last page, got %d", len(msgs))
	}
	if msgs[0].Content != "msg0" {
		t.Errorf("expected 'msg0', got '%s'", msgs[0].Content)
	}

	// Limit of 0 should default to 100.
	msgs = s.GetMessages(0, 0)
	if len(msgs) != 5 {
		t.Errorf("expected 5 messages with limit 0 (defaults to 100), got %d", len(msgs))
	}
}

// ── User profile: focused status and update tests ──

func TestUpdateUserProfile(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Insert initial profile.
	err = s.UpsertUserProfile("alice", "Alice", "", "", "online", 0)
	if err != nil {
		t.Fatalf("UpsertUserProfile returned error: %v", err)
	}

	// Update all fields via upsert.
	now := time.Now().UnixMilli()
	err = s.UpsertUserProfile("alice", "Alice Updated", "https://new.url/img.png", "New bio", "away", now)
	if err != nil {
		t.Fatalf("UpsertUserProfile update returned error: %v", err)
	}

	profile, err := s.GetUserProfile("alice")
	if err != nil {
		t.Fatalf("GetUserProfile returned error: %v", err)
	}
	if profile.DisplayName != "Alice Updated" {
		t.Errorf("expected DisplayName 'Alice Updated', got '%s'", profile.DisplayName)
	}
	if profile.AvatarURL != "https://new.url/img.png" {
		t.Errorf("expected AvatarURL updated, got '%s'", profile.AvatarURL)
	}
	if profile.Bio != "New bio" {
		t.Errorf("expected Bio 'New bio', got '%s'", profile.Bio)
	}
	if profile.Status != "away" {
		t.Errorf("expected Status 'away', got '%s'", profile.Status)
	}
	if profile.LastSeen != now {
		t.Errorf("expected LastSeen %d, got %d", now, profile.LastSeen)
	}
}

// Upsert profile first.

// ── Friend operations: standalone coverage ──

// Verify bob does not automatically have alice as friend.

// Double-add should be idempotent (INSERT OR IGNORE).

// Remove the last friend.

// Empty friends list should return empty slice, not nil.

// Add multiple friends and verify they are all returned.

// Verify all expected friends are present (order matches insertion order).

// GetAllFriends should include alice's relationships.

// Helper: check friendship by scanning GetFriends result.

// Initially not friends.

// ── Search: empty results coverage ──

func TestSearchMessagesEmptyResults(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.InsertMessage("alice", "hello world", "", "", "", "", "")
	s.InsertMessage("bob", "rainbow unicorn", "", "", "", "", "")

	// Search for a term not present in any message.
	results, err := s.SearchMessages("nonexistentterm", "", 10)
	if err != nil {
		t.Fatalf("SearchMessages returned error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for non-matching query, got %d", len(results))
	}
	if results == nil {
		t.Error("expected non-nil empty slice for empty results, got nil")
	}

	// Search in a room that has no matching messages.
	roomID, _ := s.CreateRoom("empty-room")
	results, err = s.SearchMessages("hello", roomID, 10)
	if err != nil {
		t.Fatalf("SearchMessages in empty room returned error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results in empty room, got %d", len(results))
	}

	// Search with spaces/punctuation-only query.
	results, err = s.SearchMessages("   ", "", 10)
	if err != nil {
		t.Fatalf("SearchMessages with whitespace query returned error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for whitespace query, got %d", len(results))
	}
}

func TestSearchMessagesLimit(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Insert several messages containing "test".
	for i := 0; i < 5; i++ {
		s.InsertMessage("alice", fmt.Sprintf("test message number %d", i), "", "", "", "", "")
	}

	// Limit to 2 results.
	results, err := s.SearchMessages("test", "", 2)
	if err != nil {
		t.Fatalf("SearchMessages returned error: %v", err)
	}
	if len(results) != 2 {
		t.Errorf("expected 2 results with limit 2, got %d", len(results))
	}

	// Limit of 0 should default to 20.
	results, err = s.SearchMessages("test", "", 0)
	if err != nil {
		t.Fatalf("SearchMessages with limit 0 returned error: %v", err)
	}
	if len(results) != 5 {
		t.Errorf("expected 5 results with limit 0 (default 20), got %d", len(results))
	}

	// Negative limit should also default.
	results, err = s.SearchMessages("test", "", -1)
	if err != nil {
		t.Fatalf("SearchMessages with limit -1 returned error: %v", err)
	}
	if len(results) != 5 {
		t.Errorf("expected 5 results with limit -1 (default 20), got %d", len(results))
	}
}

// ── Room operations: standalone coverage ──

func TestCreateRoom(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	roomID, err := s.CreateRoom("my-room")
	if err != nil {
		t.Fatalf("CreateRoom returned error: %v", err)
	}
	if roomID == "" {
		t.Fatal("expected non-empty room ID")
	}
	if len(roomID) != 36 {
		t.Errorf("expected UUID length 36, got %d (%s)", len(roomID), roomID)
	}

	// Verify we can look it up.
	lookupID, err := s.GetRoomID("my-room")
	if err != nil {
		t.Fatalf("GetRoomID returned error: %v", err)
	}
	if lookupID != roomID {
		t.Errorf("expected room ID '%s', got '%s'", roomID, lookupID)
	}
}

func TestCreateRoomEmptyName(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// CreateRoom with empty name — allowed by schema since UNIQUE constraint
	// is on name, and empty string is a valid unique value.
	roomID, err := s.CreateRoom("")
	if err != nil {
		t.Fatalf("CreateRoom with empty name returned error: %v", err)
	}
	if roomID == "" {
		t.Fatal("expected non-empty room ID")
	}

	// Verify it is retrievable.
	lookupID, err := s.GetRoomID("")
	if err != nil {
		t.Fatalf("GetRoomID for empty-name room returned error: %v", err)
	}
	if lookupID != roomID {
		t.Errorf("expected room ID '%s', got '%s'", roomID, lookupID)
	}
}

func TestGetRoom(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	roomID, err := s.CreateRoom("chat-room")
	if err != nil {
		t.Fatalf("CreateRoom returned error: %v", err)
	}

	retrievedID, err := s.GetRoomID("chat-room")
	if err != nil {
		t.Fatalf("GetRoomID returned error: %v", err)
	}
	if retrievedID != roomID {
		t.Errorf("expected ID '%s', got '%s'", roomID, retrievedID)
	}
	if retrievedID == "" {
		t.Error("expected non-empty room ID from GetRoomID")
	}
}

func TestListRooms(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Initially there is one default room ("公共聊天").
	rooms := s.ListRooms()
	initialCount := len(rooms)
	if initialCount < 1 {
		t.Errorf("expected at least 1 default room, got %d", initialCount)
	}

	// Create additional rooms.
	roomID1, _ := s.CreateRoom("room-alpha")
	roomID2, _ := s.CreateRoom("room-beta")
	roomID3, _ := s.CreateRoom("room-gamma")

	rooms = s.ListRooms()
	if len(rooms) != initialCount+3 {
		t.Errorf("expected %d rooms, got %d", initialCount+3, len(rooms))
	}

	// Rooms should be ordered by name alphabetically.
	// Verify all created rooms are present.
	foundAlpha := false
	foundBeta := false
	foundGamma := false
	for _, r := range rooms {
		switch r.Name {
		case "room-alpha":
			foundAlpha = true
			if r.ID != roomID1 {
				t.Errorf("room-alpha: expected ID '%s', got '%s'", roomID1, r.ID)
			}
		case "room-beta":
			foundBeta = true
			if r.ID != roomID2 {
				t.Errorf("room-beta: expected ID '%s', got '%s'", roomID2, r.ID)
			}
		case "room-gamma":
			foundGamma = true
			if r.ID != roomID3 {
				t.Errorf("room-gamma: expected ID '%s', got '%s'", roomID3, r.ID)
			}
		}
	}
	if !foundAlpha || !foundBeta || !foundGamma {
		t.Errorf("missing rooms in list: alpha=%v beta=%v gamma=%v", foundAlpha, foundBeta, foundGamma)
	}
}

// ── GetMessageByID: deleted message via DM/group channels ──

// Insert a DM.

// Verify retrievable.

// Delete and verify content cleared.

func TestGetMessageByIDWithReactions(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	msg, err := s.InsertMessage("alice", "reactable message", "", "", "", "", "")
	if err != nil {
		t.Fatalf("InsertMessage returned error: %v", err)
	}

	// Add a reaction.
	_, err = s.ToggleReaction(msg.ID, "\U0001f44d", "bob")
	if err != nil {
		t.Fatalf("ToggleReaction returned error: %v", err)
	}

	// GetMessageByID does NOT return reactions (reactions are populated
	// only in GetMessages/GetRoomMessages batch queries). Verify basic retrieval.
	retrieved, err := s.GetMessageByID(msg.ID)
	if err != nil {
		t.Fatalf("GetMessageByID returned error: %v", err)
	}
	if retrieved.Content != "reactable message" {
		t.Errorf("expected content 'reactable message', got '%s'", retrieved.Content)
	}
	// Reactions map may or may not be populated in single-message fetch.
	_ = retrieved.Reactions
}

// ── Webhook edge case: create with empty group name ──

// Clean up.

// ── Webhook edge case: rotate with invalid ID ──

// ── Webhook edge case: delete non-existent ──

// Deleting a valid ID but wrong group should also fail.

// Verify webhook was not deleted through the wrong-group call.

// ── Group edge case: add duplicate member ──

// Add bob once.

// Add bob again — should be a no-op (INSERT OR IGNORE).

// Verify role is preserved for the owner.

// ── Group edge case: remove non-member ──

// Remove a user who is not a member — should not error (DELETE WHERE is successful
// even when no rows match).

// Verify group is still intact.

// ── Archive edge case: archive twice (idempotent) ──

// Archive once.

// Archive again — should be no-op.

// Verify only one row exists.

// ── Archive edge case: unarchive non-archived conversation ──

// Unarchive a conversation that was never archived — should not error.

// ── Archive edge case: list empty ──

// Archive one, then check list.

// ── FTS5 search edge case: very long query ──

func TestSearchMessagesVeryLongQuery(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.InsertMessage("alice", "the quick brown fox jumps over the lazy dog", "", "", "", "", "")

	// Construct a very long query (10 KB).
	longWord := strings.Repeat("abcdefghij", 1000) // 10,000 characters
	results, err := s.SearchMessages(longWord, "", 10)
	if err != nil {
		t.Errorf("SearchMessages with very long query should not error: %v", err)
	}
	if len(results) != 0 {
		// It's fine if results are returned; mainly verifying no error.
		t.Logf("very long query returned %d results", len(results))
	}

	// Another edge: very long query with space-separated tokens.
	longQuery := strings.Repeat("hello ", 2000) // 12,000 characters of "hello "
	results, err = s.SearchMessages(longQuery, "", 10)
	if err != nil {
		t.Errorf("SearchMessages with very long multi-word query should not error: %v", err)
	}
	_ = results

	// Verify database is still intact.
	var count int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM messages").Scan(&count); err != nil {
		t.Fatalf("messages table query failed after long query search: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 message in table, got %d", count)
	}
}

// ── FTS5 search edge case: search with CJK and emoji content ──

func TestSearchMessagesCJKAndEmoji(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.InsertMessage("alice", "你好世界 hello world", "", "", "", "", "")
	s.InsertMessage("bob", "emoji test 😀 🚀 💯", "", "", "", "", "")
	s.InsertMessage("charlie", "混合CJKと日本語 and English", "", "", "", "", "")

	// Search for CJK content should work without error.
	results, err := s.SearchMessages("你好", "", 10)
	if err != nil {
		t.Errorf("SearchMessages with CJK query returned error: %v", err)
	}
	if len(results) == 0 {
		t.Log("CJK search returned 0 results (tokenizer-dependent)")
	}

	// Search for English mixed with CJK.
	results, err = s.SearchMessages("hello", "", 10)
	if err != nil {
		t.Errorf("SearchMessages with English query returned error: %v", err)
	}
	if len(results) != 1 {
		t.Errorf("expected 1 result for 'hello', got %d", len(results))
	}

	// Emoji characters should not cause errors.
	results, err = s.SearchMessages("😀", "", 10)
	if err != nil {
		t.Errorf("SearchMessages with emoji query returned error: %v", err)
	}
	_ = results

	// Japanese Kana mixed text.
	results, err = s.SearchMessages("日本語", "", 10)
	if err != nil {
		t.Errorf("SearchMessages with Japanese query returned error: %v", err)
	}
	_ = results
}
