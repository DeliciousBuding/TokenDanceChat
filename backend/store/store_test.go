package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
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

func TestCreateWebhookDoesNotPersistPlaintextSecret(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	const plaintextSecret = "plain-webhook-secret"
	if err := s.CreateWebhook("wh-1", "team", "wh-url", plaintextSecret, "alice"); err != nil {
		t.Fatalf("CreateWebhook returned error: %v", err)
	}

	var storedSecret string
	if err := s.db.QueryRow("SELECT secret FROM webhooks WHERE id = ?", "wh-1").Scan(&storedSecret); err != nil {
		t.Fatalf("failed to read stored webhook secret: %v", err)
	}
	if storedSecret == plaintextSecret {
		t.Fatal("webhook secret was persisted in plaintext")
	}
	if !strings.HasPrefix(storedSecret, "whsec_sha256:") {
		t.Fatalf("expected versioned webhook secret hash, got %q", storedSecret)
	}
	webhook, ok, err := s.VerifyWebhookSecret("wh-url", plaintextSecret)
	if err != nil {
		t.Fatalf("VerifyWebhookSecret returned error for correct secret: %v", err)
	}
	if !ok {
		t.Fatal("VerifyWebhookSecret rejected the original plaintext secret")
	}
	if webhook.GroupName != "team" {
		t.Fatalf("verified webhook group = %q, want team", webhook.GroupName)
	}
	if _, ok, err := s.VerifyWebhookSecret("wh-url", "wrong-secret"); err != nil {
		t.Fatalf("VerifyWebhookSecret returned error for wrong secret: %v", err)
	} else if ok {
		t.Fatal("VerifyWebhookSecret accepted the wrong secret")
	}
}

func TestWebhookPlaintextSecretMigrationHashesExistingRows(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "chat.db")
	s, err := New(dbPath)
	if err != nil {
		t.Fatalf("New(temp db) returned error: %v", err)
	}
	const legacySecret = "legacy-webhook-secret"
	if _, err := s.db.Exec(
		"INSERT INTO webhooks (id, group_name, url, secret, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		"legacy-wh", "team", "legacy-url", legacySecret, "alice", time.Now().UnixMilli(),
	); err != nil {
		t.Fatalf("failed to insert legacy webhook row: %v", err)
	}
	s.Close()

	reopened, err := New(dbPath)
	if err != nil {
		t.Fatalf("New(existing db) returned error: %v", err)
	}
	defer reopened.Close()

	var storedSecret string
	if err := reopened.db.QueryRow("SELECT secret FROM webhooks WHERE id = ?", "legacy-wh").Scan(&storedSecret); err != nil {
		t.Fatalf("failed to read migrated webhook secret: %v", err)
	}
	if storedSecret == legacySecret {
		t.Fatal("legacy webhook secret remained plaintext after migration")
	}
	if !strings.HasPrefix(storedSecret, "whsec_sha256:") {
		t.Fatalf("expected migrated versioned webhook secret hash, got %q", storedSecret)
	}
	webhook, ok, err := reopened.VerifyWebhookSecret("legacy-url", legacySecret)
	if err != nil {
		t.Fatalf("VerifyWebhookSecret returned error for migrated secret: %v", err)
	}
	if !ok {
		t.Fatal("VerifyWebhookSecret rejected migrated legacy secret")
	}
	if webhook.ID != "legacy-wh" {
		t.Fatalf("verified migrated webhook id = %q, want legacy-wh", webhook.ID)
	}
}

func TestRotateWebhookSecretInvalidatesOldSecretAndAudits(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	const (
		oldSecret = "old-webhook-secret"
		newSecret = "new-webhook-secret"
	)
	if err := s.CreateWebhook("wh-1", "team", "wh-url", oldSecret, "alice"); err != nil {
		t.Fatalf("CreateWebhook returned error: %v", err)
	}

	rotated, err := s.RotateWebhookSecret("wh-1", "team", newSecret, "bob")
	if err != nil {
		t.Fatalf("RotateWebhookSecret returned error: %v", err)
	}
	if rotated.RotatedBy != "bob" {
		t.Fatalf("RotatedBy = %q, want bob", rotated.RotatedBy)
	}
	if rotated.RotatedAt == 0 {
		t.Fatal("expected non-zero RotatedAt")
	}

	if _, ok, err := s.VerifyWebhookSecret("wh-url", oldSecret); err != nil {
		t.Fatalf("VerifyWebhookSecret returned error for old secret: %v", err)
	} else if ok {
		t.Fatal("old webhook secret still verifies after rotation")
	}
	if _, ok, err := s.VerifyWebhookSecret("wh-url", newSecret); err != nil {
		t.Fatalf("VerifyWebhookSecret returned error for new secret: %v", err)
	} else if !ok {
		t.Fatal("new webhook secret did not verify after rotation")
	}

	webhooks, err := s.ListWebhooks("team")
	if err != nil {
		t.Fatalf("ListWebhooks returned error: %v", err)
	}
	if len(webhooks) != 1 {
		t.Fatalf("expected 1 webhook, got %d", len(webhooks))
	}
	if webhooks[0].RotatedBy != "bob" || webhooks[0].RotatedAt == 0 {
		t.Fatalf("webhook rotation metadata not listed: %+v", webhooks[0])
	}

	if err := s.DeleteWebhook("wh-1", "team", "carol"); err != nil {
		t.Fatalf("DeleteWebhook returned error: %v", err)
	}

	logs, err := s.ListWebhookAuditLogs("team", 10)
	if err != nil {
		t.Fatalf("ListWebhookAuditLogs returned error: %v", err)
	}
	seen := map[string]string{}
	for _, item := range logs {
		seen[item.Action] = item.Actor
	}
	for action, actor := range map[string]string{"created": "alice", "rotated": "bob", "deleted": "carol"} {
		if seen[action] != actor {
			t.Fatalf("audit action %q actor = %q, want %q; logs=%+v", action, seen[action], actor, logs)
		}
	}

	encoded, err := json.Marshal(logs)
	if err != nil {
		t.Fatalf("failed to marshal audit logs: %v", err)
	}
	raw := string(encoded)
	if strings.Contains(raw, oldSecret) || strings.Contains(raw, newSecret) || strings.Contains(raw, "whsec_sha256:") {
		t.Fatalf("audit logs leaked secret material: %s", raw)
	}
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

	// Update status.
	err = s.UpdateUserStatus("alice", "away")
	if err != nil {
		t.Fatalf("UpdateUserStatus returned error: %v", err)
	}
	profile, err = s.GetUserProfile("alice")
	if err != nil {
		t.Fatalf("GetUserProfile after status update returned error: %v", err)
	}
	if profile.Status != "away" {
		t.Errorf("expected status 'away' after update, got '%s'", profile.Status)
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

func TestCreateGroupAndMembers(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Create a group.
	err = s.CreateGroup("devs", "alice")
	if err != nil {
		t.Fatalf("CreateGroup returned error: %v", err)
	}

	// Get group info.
	info, err := s.GetGroupInfo("devs")
	if err != nil {
		t.Fatalf("GetGroupInfo returned error: %v", err)
	}
	if info.Name != "devs" {
		t.Errorf("expected group name 'devs', got '%s'", info.Name)
	}
	if info.Owner != "alice" {
		t.Errorf("expected owner 'alice', got '%s'", info.Owner)
	}
	if info.MemberCount != 1 {
		t.Errorf("expected 1 member after creation, got %d", info.MemberCount)
	}

	// Get group owner.
	owner, err := s.GetGroupOwner("devs")
	if err != nil {
		t.Fatalf("GetGroupOwner returned error: %v", err)
	}
	if owner != "alice" {
		t.Errorf("expected owner 'alice', got '%s'", owner)
	}

	// Get members with roles.
	members := s.GetGroupMembersWithRoles("devs")
	if len(members) != 1 {
		t.Fatalf("expected 1 member, got %d", len(members))
	}
	if members[0].Username != "alice" || members[0].Role != "owner" {
		t.Errorf("expected alice as owner, got %s/%s", members[0].Username, members[0].Role)
	}

	// Add members.
	err = s.AddGroupMember("devs", "bob")
	if err != nil {
		t.Fatalf("AddGroupMember returned error: %v", err)
	}
	err = s.AddGroupMember("devs", "charlie")
	if err != nil {
		t.Fatalf("AddGroupMember returned error: %v", err)
	}

	// Get member role.
	role, err := s.GetGroupMemberRole("devs", "bob")
	if err != nil {
		t.Fatalf("GetGroupMemberRole returned error: %v", err)
	}
	if role != "member" {
		t.Errorf("expected role 'member', got '%s'", role)
	}

	// Set member role to admin.
	err = s.SetGroupMemberRole("devs", "bob", "admin")
	if err != nil {
		t.Fatalf("SetGroupMemberRole returned error: %v", err)
	}
	role, err = s.GetGroupMemberRole("devs", "bob")
	if err != nil {
		t.Fatalf("GetGroupMemberRole after promotion returned error: %v", err)
	}
	if role != "admin" {
		t.Errorf("expected role 'admin' after promotion, got '%s'", role)
	}

	// Get simple member list.
	names := s.GetGroupMembers("devs")
	if len(names) != 3 {
		t.Errorf("expected 3 members, got %d", len(names))
	}

	// Verify member count updated.
	info, err = s.GetGroupInfo("devs")
	if err != nil {
		t.Fatalf("GetGroupInfo after adding members returned error: %v", err)
	}
	if info.MemberCount != 3 {
		t.Errorf("expected 3 members in info, got %d", info.MemberCount)
	}

	// Get all groups.
	allGroups := s.GetAllGroups()
	if len(allGroups) != 1 {
		t.Errorf("expected 1 group in GetAllGroups, got %d", len(allGroups))
	}
	if len(allGroups["devs"]) != 3 {
		t.Errorf("expected 3 members in devs group, got %d", len(allGroups["devs"]))
	}

	// Remove a member.
	err = s.RemoveGroupMember("devs", "charlie")
	if err != nil {
		t.Fatalf("RemoveGroupMember returned error: %v", err)
	}
	names = s.GetGroupMembers("devs")
	if len(names) != 2 {
		t.Errorf("expected 2 members after removal, got %d", len(names))
	}
}

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

func TestChatFolderCreateAndList(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Create folders.
	f1, err := s.CreateChatFolder("alice", "Work")
	if err != nil {
		t.Fatalf("CreateChatFolder returned error: %v", err)
	}
	if f1.ID == "" {
		t.Error("expected non-empty folder ID")
	}
	if f1.Name != "Work" {
		t.Errorf("expected folder name 'Work', got '%s'", f1.Name)
	}
	if f1.Username != "alice" {
		t.Errorf("expected username 'alice', got '%s'", f1.Username)
	}
	if f1.CreatedAt == 0 {
		t.Error("expected non-zero CreatedAt")
	}

	_, err = s.CreateChatFolder("alice", "Personal")
	if err != nil {
		t.Fatalf("CreateChatFolder second returned error: %v", err)
	}

	// Create folder for another user.
	_, err = s.CreateChatFolder("bob", "Bob's Stuff")
	if err != nil {
		t.Fatalf("CreateChatFolder for bob returned error: %v", err)
	}

	// List folders for alice.
	folders, err := s.ListFolders("alice")
	if err != nil {
		t.Fatalf("ListFolders returned error: %v", err)
	}
	if len(folders) != 2 {
		t.Fatalf("expected 2 folders for alice, got %d", len(folders))
	}
	if folders[0].ItemCount != 0 || folders[1].ItemCount != 0 {
		t.Error("expected 0 item counts for empty folders")
	}

	// List folders for bob.
	folders, err = s.ListFolders("bob")
	if err != nil {
		t.Fatalf("ListFolders for bob returned error: %v", err)
	}
	if len(folders) != 1 {
		t.Fatalf("expected 1 folder for bob, got %d", len(folders))
	}

	// List folders for user with no folders.
	folders, err = s.ListFolders("nonexistent")
	if err != nil {
		t.Fatalf("ListFolders for nonexistent returned error: %v", err)
	}
	if len(folders) != 0 {
		t.Errorf("expected 0 folders for nonexistent user, got %d", len(folders))
	}

	// Duplicate name for same user should fail (UNIQUE constraint).
	_, err = s.CreateChatFolder("alice", "Work")
	if err == nil {
		t.Error("expected error for duplicate folder name")
	}

	// Same name for different user should succeed.
	_, err = s.CreateChatFolder("charlie", "Work")
	if err != nil {
		t.Fatalf("CreateChatFolder same name different user returned error: %v", err)
	}
}

func TestChatFolderRename(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	f, err := s.CreateChatFolder("alice", "Old Name")
	if err != nil {
		t.Fatalf("CreateChatFolder returned error: %v", err)
	}

	// Rename succeeds.
	err = s.RenameChatFolder("alice", f.ID, "New Name")
	if err != nil {
		t.Fatalf("RenameChatFolder returned error: %v", err)
	}

	folders, err := s.ListFolders("alice")
	if err != nil {
		t.Fatalf("ListFolders returned error: %v", err)
	}
	if len(folders) != 1 {
		t.Fatalf("expected 1 folder, got %d", len(folders))
	}
	if folders[0].Name != "New Name" {
		t.Errorf("expected renamed folder 'New Name', got '%s'", folders[0].Name)
	}

	// Rename with wrong username should silently affect 0 rows (no error, just no-op).
	err = s.RenameChatFolder("bob", f.ID, "Evil Name")
	if err != nil {
		t.Fatalf("RenameChatFolder with wrong user returned error: %v", err)
	}
	folders, err = s.ListFolders("alice")
	if err != nil {
		t.Fatalf("ListFolders returned error: %v", err)
	}
	if folders[0].Name != "New Name" {
		t.Errorf("expected name unchanged after wrong-user rename, got '%s'", folders[0].Name)
	}

	// Rename non-existent folder.
	err = s.RenameChatFolder("alice", "nonexistent-id", "Whatever")
	if err != nil {
		t.Fatalf("RenameChatFolder non-existent returned error: %v", err)
	}
}

func TestChatFolderDelete(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	f, err := s.CreateChatFolder("alice", "Ephemeral")
	if err != nil {
		t.Fatalf("CreateChatFolder returned error: %v", err)
	}

	// Add items to the folder.
	err = s.AddToFolder(f.ID, "dm:bob")
	if err != nil {
		t.Fatalf("AddToFolder returned error: %v", err)
	}
	err = s.AddToFolder(f.ID, "room:general")
	if err != nil {
		t.Fatalf("AddToFolder second returned error: %v", err)
	}

	// Verify items exist.
	items, err := s.GetFolderItems(f.ID)
	if err != nil {
		t.Fatalf("GetFolderItems returned error: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}

	// Delete the folder.
	err = s.DeleteChatFolder("alice", f.ID)
	if err != nil {
		t.Fatalf("DeleteChatFolder returned error: %v", err)
	}

	// Folder should be gone.
	folders, err := s.ListFolders("alice")
	if err != nil {
		t.Fatalf("ListFolders after delete returned error: %v", err)
	}
	if len(folders) != 0 {
		t.Errorf("expected 0 folders after delete, got %d", len(folders))
	}

	// Items should be cascaded/deleted.
	items, err = s.GetFolderItems(f.ID)
	if err != nil {
		t.Fatalf("GetFolderItems after delete returned error: %v", err)
	}
	if len(items) != 0 {
		t.Errorf("expected 0 items after folder delete, got %d", len(items))
	}

	// Delete with wrong username should not delete.
	f2, _ := s.CreateChatFolder("alice", "Keep")
	err = s.DeleteChatFolder("bob", f2.ID)
	if err != nil {
		t.Fatalf("DeleteChatFolder wrong user returned error: %v", err)
	}
	folders, err = s.ListFolders("alice")
	if err != nil {
		t.Fatalf("ListFolders returned error: %v", err)
	}
	if len(folders) != 1 {
		t.Errorf("expected folder not deleted by wrong user, got %d folders", len(folders))
	}
}

func TestChatFolderAddRemoveItems(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	f, err := s.CreateChatFolder("alice", "Test")
	if err != nil {
		t.Fatalf("CreateChatFolder returned error: %v", err)
	}

	// Add item.
	err = s.AddToFolder(f.ID, "dm:charlie")
	if err != nil {
		t.Fatalf("AddToFolder returned error: %v", err)
	}

	// Adding same item again should be a no-op (INSERT OR IGNORE).
	err = s.AddToFolder(f.ID, "dm:charlie")
	if err != nil {
		t.Fatalf("AddToFolder duplicate returned error: %v", err)
	}

	// Verify item count.
	items, err := s.GetFolderItems(f.ID)
	if err != nil {
		t.Fatalf("GetFolderItems returned error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item after duplicate add, got %d", len(items))
	}
	if items[0] != "dm:charlie" {
		t.Errorf("expected item 'dm:charlie', got '%s'", items[0])
	}

	// Remove item.
	err = s.RemoveFromFolder(f.ID, "dm:charlie")
	if err != nil {
		t.Fatalf("RemoveFromFolder returned error: %v", err)
	}
	items, err = s.GetFolderItems(f.ID)
	if err != nil {
		t.Fatalf("GetFolderItems after remove returned error: %v", err)
	}
	if len(items) != 0 {
		t.Errorf("expected 0 items after remove, got %d", len(items))
	}

	// Removing non-existent item should not error.
	err = s.RemoveFromFolder(f.ID, "nonexistent")
	if err != nil {
		t.Fatalf("RemoveFromFolder non-existent returned error: %v", err)
	}

	// GetFolderItems for non-existent folder returns empty.
	items, err = s.GetFolderItems("nonexistent-id")
	if err != nil {
		t.Fatalf("GetFolderItems non-existent returned error: %v", err)
	}
	if len(items) != 0 {
		t.Errorf("expected 0 items for non-existent folder, got %d", len(items))
	}
}

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

func TestExportMessagesDM(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.InsertMessage("alice", "hi bob", "", "", "bob", "", "")
	time.Sleep(time.Millisecond)
	s.InsertMessage("bob", "hey alice", "", "", "alice", "", "")
	time.Sleep(time.Millisecond)
	s.InsertMessage("alice", "how are you", "", "", "bob", "", "")

	ctx := context.Background()
	msgs, err := s.ExportMessages(ctx, "", "bob", "", "alice", 0)
	if err != nil {
		t.Fatalf("ExportMessages DM returned error: %v", err)
	}
	if len(msgs) != 3 {
		t.Fatalf("expected 3 DM messages, got %d", len(msgs))
	}
	// Messages should be in chronological order.
	if msgs[0].Content != "hi bob" {
		t.Errorf("expected first 'hi bob', got '%s'", msgs[0].Content)
	}
	if msgs[1].Content != "hey alice" {
		t.Errorf("expected second 'hey alice', got '%s'", msgs[1].Content)
	}
}

func TestExportMessagesGroup(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.InsertMessage("alice", "group msg 1", "", "", "", "devs", "")
	time.Sleep(time.Millisecond)
	s.InsertMessage("bob", "group msg 2", "", "", "", "devs", "")

	ctx := context.Background()
	msgs, err := s.ExportMessages(ctx, "", "", "devs", "", 0)
	if err != nil {
		t.Fatalf("ExportMessages group returned error: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 group messages, got %d", len(msgs))
	}
	if msgs[0].GroupName != "devs" {
		t.Errorf("expected group_name 'devs', got '%s'", msgs[0].GroupName)
	}
}

func TestExportMessagesPublic(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.InsertMessage("alice", "public msg 1", "", "", "", "", "")
	time.Sleep(time.Millisecond)
	s.InsertMessage("bob", "public msg 2", "", "", "", "", "")

	// Also insert a DM and group message — should not appear in public export.
	s.InsertMessage("alice", "dm msg", "", "", "bob", "", "")
	s.InsertMessage("charlie", "group msg", "", "", "", "team", "")

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

func TestCallHistoryLogAndGet(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	now := time.Now().UnixMilli()
	call := CallRecord{
		ID:        "call-1",
		Caller:    "alice",
		Callee:    "bob",
		CallType:  "video",
		Status:    "missed",
		StartedAt: now,
		EndedAt:   0,
		CreatedAt: now,
	}
	err = s.LogCall(call)
	if err != nil {
		t.Fatalf("LogCall returned error: %v", err)
	}

	// GetCallHistory for caller.
	history, err := s.GetCallHistory("alice", 50)
	if err != nil {
		t.Fatalf("GetCallHistory for caller returned error: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("expected 1 call, got %d", len(history))
	}
	if history[0].Caller != "alice" {
		t.Errorf("expected caller 'alice', got '%s'", history[0].Caller)
	}
	if history[0].Status != "missed" {
		t.Errorf("expected status 'missed', got '%s'", history[0].Status)
	}

	// GetCallHistory for callee.
	history, err = s.GetCallHistory("bob", 50)
	if err != nil {
		t.Fatalf("GetCallHistory for callee returned error: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("expected 1 call for callee, got %d", len(history))
	}
}

func TestCallHistoryUpdate(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	now := time.Now().UnixMilli()
	call := CallRecord{
		ID:        "call-1",
		Caller:    "alice",
		Callee:    "bob",
		CallType:  "audio",
		Status:    "ringing",
		StartedAt: now,
		CreatedAt: now,
	}
	s.LogCall(call)

	// Update the call record.
	endedAt := now + 60000
	err = s.UpdateCallRecord("call-1", "completed", now, endedAt)
	if err != nil {
		t.Fatalf("UpdateCallRecord returned error: %v", err)
	}

	history, err := s.GetCallHistory("alice", 50)
	if err != nil {
		t.Fatalf("GetCallHistory after update returned error: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("expected 1 call after update, got %d", len(history))
	}
	if history[0].Status != "completed" {
		t.Errorf("expected status 'completed', got '%s'", history[0].Status)
	}
	if history[0].StartedAt != now {
		t.Errorf("expected StartedAt=%d, got %d", now, history[0].StartedAt)
	}
	if history[0].EndedAt != endedAt {
		t.Errorf("expected EndedAt=%d, got %d", endedAt, history[0].EndedAt)
	}
}

func TestCallHistoryEmptyAndLimit(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Empty history.
	history, err := s.GetCallHistory("alice", 50)
	if err != nil {
		t.Fatalf("GetCallHistory empty returned error: %v", err)
	}
	if len(history) != 0 {
		t.Errorf("expected 0 calls for empty history, got %d", len(history))
	}

	// Log multiple calls.
	now := time.Now().UnixMilli()
	for i := 0; i < 5; i++ {
		s.LogCall(CallRecord{
			ID:        fmt.Sprintf("call-%d", i),
			Caller:    "alice",
			Callee:    fmt.Sprintf("user%d", i),
			CallType:  "video",
			Status:    "completed",
			StartedAt: now - int64(i*1000),
			EndedAt:   now - int64(i*500),
			CreatedAt: now - int64(i*1000),
		})
	}

	// Limit returns only the requested number.
	history, err = s.GetCallHistory("alice", 2)
	if err != nil {
		t.Fatalf("GetCallHistory with limit returned error: %v", err)
	}
	if len(history) != 2 {
		t.Fatalf("expected 2 calls with limit, got %d", len(history))
	}
}

// ── Scheduled messages ──

func TestScheduledMessageLifecycle(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	now := time.Now().UnixMilli()
	// Schedule a message in the past (should be picked up as pending).
	pastMsg := ScheduledMessage{
		ID:        "sched-1",
		Username:  "alice",
		Content:   "past message",
		RoomID:    "public",
		SendAt:    now - 10000, // 10 seconds in the past
		CreatedAt: now - 20000,
	}
	err = s.ScheduleMessage(pastMsg)
	if err != nil {
		t.Fatalf("ScheduleMessage returned error: %v", err)
	}

	// Schedule a message in the future (should NOT be picked up as pending).
	futureMsg := ScheduledMessage{
		ID:        "sched-2",
		Username:  "alice",
		Content:   "future message",
		RoomID:    "public",
		SendAt:    now + 3600000, // 1 hour in the future
		CreatedAt: now,
	}
	err = s.ScheduleMessage(futureMsg)
	if err != nil {
		t.Fatalf("ScheduleMessage future returned error: %v", err)
	}

	// GetPendingScheduledMessages should only return the past message.
	ctx := context.Background()
	pending, err := s.GetPendingScheduledMessages(ctx)
	if err != nil {
		t.Fatalf("GetPendingScheduledMessages returned error: %v", err)
	}
	if len(pending) != 1 {
		t.Fatalf("expected 1 pending message, got %d", len(pending))
	}
	if pending[0].ID != "sched-1" {
		t.Errorf("expected pending msg 'sched-1', got '%s'", pending[0].ID)
	}

	// Mark as sent.
	err = s.MarkScheduledSent("sched-1")
	if err != nil {
		t.Fatalf("MarkScheduledSent returned error: %v", err)
	}

	// Pending should now be empty.
	pending, err = s.GetPendingScheduledMessages(ctx)
	if err != nil {
		t.Fatalf("GetPendingScheduledMessages after mark returned error: %v", err)
	}
	if len(pending) != 0 {
		t.Errorf("expected 0 pending after marking sent, got %d", len(pending))
	}

	// GetUserScheduledMessages for alice should return only the unsent future message.
	userMsgs, err := s.GetUserScheduledMessages("alice")
	if err != nil {
		t.Fatalf("GetUserScheduledMessages returned error: %v", err)
	}
	if len(userMsgs) != 1 {
		t.Fatalf("expected 1 user scheduled message, got %d", len(userMsgs))
	}
	if userMsgs[0].ID != "sched-2" {
		t.Errorf("expected 'sched-2', got '%s'", userMsgs[0].ID)
	}

	// Cancel the future message.
	err = s.CancelScheduledMessage("sched-2", "alice")
	if err != nil {
		t.Fatalf("CancelScheduledMessage returned error: %v", err)
	}

	userMsgs, err = s.GetUserScheduledMessages("alice")
	if err != nil {
		t.Fatalf("GetUserScheduledMessages after cancel returned error: %v", err)
	}
	if len(userMsgs) != 0 {
		t.Errorf("expected 0 user messages after cancel, got %d", len(userMsgs))
	}
}

func TestScheduledMessageCancelWrongUser(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	now := time.Now().UnixMilli()
	msg := ScheduledMessage{
		ID:        "sched-1",
		Username:  "alice",
		Content:   "alice's message",
		RoomID:    "public",
		SendAt:    now + 3600000,
		CreatedAt: now,
	}
	s.ScheduleMessage(msg)

	// Bob tries to cancel alice's message — should silently affect 0 rows.
	err = s.CancelScheduledMessage("sched-1", "bob")
	if err != nil {
		t.Fatalf("CancelScheduledMessage wrong user returned error: %v", err)
	}

	// Verify the message is still there for alice.
	userMsgs, err := s.GetUserScheduledMessages("alice")
	if err != nil {
		t.Fatalf("GetUserScheduledMessages returned error: %v", err)
	}
	if len(userMsgs) != 1 {
		t.Errorf("expected message still present after wrong-user cancel, got %d", len(userMsgs))
	}
}

func TestScheduledMessageEmptyUser(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// GetUserScheduledMessages for user with no scheduled messages.
	msgs, err := s.GetUserScheduledMessages("nonexistent")
	if err != nil {
		t.Fatalf("GetUserScheduledMessages returned error: %v", err)
	}
	if len(msgs) != 0 {
		t.Errorf("expected 0 messages for empty user, got %d", len(msgs))
	}

	// GetPendingScheduledMessages on empty DB.
	ctx := context.Background()
	pending, err := s.GetPendingScheduledMessages(ctx)
	if err != nil {
		t.Fatalf("GetPendingScheduledMessages returned error: %v", err)
	}
	if len(pending) != 0 {
		t.Errorf("expected 0 pending on empty DB, got %d", len(pending))
	}
}

func TestScheduledMessageWithGroupAndDM(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	now := time.Now().UnixMilli()
	// Schedule a group message.
	groupMsg := ScheduledMessage{
		ID:        "sched-group",
		Username:  "alice",
		Content:   "group scheduled",
		GroupName: "devs",
		SendAt:    now - 1000,
		CreatedAt: now - 2000,
	}
	s.ScheduleMessage(groupMsg)

	// Schedule a DM.
	dmMsg := ScheduledMessage{
		ID:        "sched-dm",
		Username:  "bob",
		Content:   "dm scheduled",
		ToUser:    "alice",
		SendAt:    now - 1000,
		CreatedAt: now - 2000,
	}
	s.ScheduleMessage(dmMsg)

	ctx := context.Background()
	pending, err := s.GetPendingScheduledMessages(ctx)
	if err != nil {
		t.Fatalf("GetPendingScheduledMessages returned error: %v", err)
	}
	if len(pending) != 2 {
		t.Fatalf("expected 2 pending messages, got %d", len(pending))
	}

	// Verify all fields are returned.
	for _, m := range pending {
		if m.Username == "alice" && m.GroupName != "devs" {
			t.Errorf("expected group_name 'devs', got '%s'", m.GroupName)
		}
		if m.Username == "bob" && m.ToUser != "alice" {
			t.Errorf("expected to_user 'alice', got '%s'", m.ToUser)
		}
	}
}

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

func TestPinConversationDuplicate(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	err = s.PinConversation("alice", "dm:bob")
	if err != nil {
		t.Fatalf("PinConversation returned error: %v", err)
	}

	// Pinning again should be no-op (INSERT OR IGNORE).
	err = s.PinConversation("alice", "dm:bob")
	if err != nil {
		t.Fatalf("PinConversation duplicate returned error: %v", err)
	}

	keys := s.ListPinnedConversations("alice")
	if len(keys) != 1 {
		t.Errorf("expected 1 pinned conversation after duplicate pin, got %d", len(keys))
	}
}

// ── Mute/Archive edge cases ──

func TestMuteUnmuteCycle(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	key := "room:general"

	// Initially not muted.
	if s.IsConversationMuted("alice", key) {
		t.Error("expected not muted initially")
	}

	// Mute.
	s.MuteConversation("alice", key)
	if !s.IsConversationMuted("alice", key) {
		t.Error("expected muted after MuteConversation")
	}

	// Unmute.
	s.UnmuteConversation("alice", key)
	if s.IsConversationMuted("alice", key) {
		t.Error("expected not muted after UnmuteConversation")
	}
}

func TestArchiveUnarchiveCycle(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	key := "dm:eve"

	// Initially not archived.
	if s.IsConversationArchived("alice", key) {
		t.Error("expected not archived initially")
	}

	// Archive.
	s.ArchiveConversation("alice", key)
	if !s.IsConversationArchived("alice", key) {
		t.Error("expected archived after ArchiveConversation")
	}

	// Unarchive.
	s.UnarchiveConversation("alice", key)
	if s.IsConversationArchived("alice", key) {
		t.Error("expected not archived after UnarchiveConversation")
	}
}

// ── Friends edge cases ──

func TestFriendsRoundTrip(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Empty friends list.
	friends := s.GetFriends("alice")
	if len(friends) != 0 {
		t.Errorf("expected 0 friends for new user, got %d", len(friends))
	}

	// Add friends.
	s.AddFriend("alice", "bob")
	s.AddFriend("alice", "charlie")
	s.AddFriend("bob", "alice")

	friends = s.GetFriends("alice")
	if len(friends) != 2 {
		t.Errorf("expected 2 friends, got %d", len(friends))
	}

	// Remove friend.
	s.RemoveFriend("alice", "bob")
	friends = s.GetFriends("alice")
	if len(friends) != 1 {
		t.Errorf("expected 1 friend after remove, got %d", len(friends))
	}
}

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

func TestGetAllFriendsEmpty(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	result := s.GetAllFriends()
	if len(result) != 0 {
		t.Errorf("expected empty map, got %d entries", len(result))
	}
}

func TestGetAllGroupsEmpty(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	result := s.GetAllGroups()
	if len(result) != 0 {
		t.Errorf("expected empty map, got %d entries", len(result))
	}
}

// ── MarkMessagesDelivered edge cases ──

func TestMarkMessagesDelivered(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Insert a DM.
	dm, _ := s.InsertMessage("alice", "hello bob", "", "", "bob", "", "")

	// Initially undelivered.
	undelivered := s.GetUndeliveredDMs("bob", 10)
	if len(undelivered) != 1 {
		t.Fatalf("expected 1 undelivered DM, got %d", len(undelivered))
	}

	// Mark as delivered.
	err = s.MarkMessagesDelivered([]string{dm.ID})
	if err != nil {
		t.Fatalf("MarkMessagesDelivered returned error: %v", err)
	}

	// Should now be empty.
	undelivered = s.GetUndeliveredDMs("bob", 10)
	if len(undelivered) != 0 {
		t.Errorf("expected 0 undelivered after mark, got %d", len(undelivered))
	}

	// MarkMessagesDelivered with empty slice should be no-op.
	err = s.MarkMessagesDelivered([]string{})
	if err != nil {
		t.Fatalf("MarkMessagesDelivered empty returned error: %v", err)
	}
}

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

func TestGroupUpdateNameAndTransferOwnership(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.CreateGroup("old-devs", "alice")
	s.AddGroupMember("old-devs", "bob")
	s.InsertMessage("alice", "group msg", "", "", "", "old-devs", "")

	// Rename group.
	err = s.UpdateGroupName("old-devs", "new-devs")
	if err != nil {
		t.Fatalf("UpdateGroupName returned error: %v", err)
	}

	// Verify group_info updated.
	info, err := s.GetGroupInfo("new-devs")
	if err != nil {
		t.Fatalf("GetGroupInfo after rename returned error: %v", err)
	}
	if info.Name != "new-devs" {
		t.Errorf("expected 'new-devs', got '%s'", info.Name)
	}

	// Verify members migrated.
	members := s.GetGroupMembers("new-devs")
	if len(members) != 2 {
		t.Errorf("expected 2 members after rename, got %d", len(members))
	}

	// Verify messages migrated.
	ctx := context.Background()
	msgs, err := s.ExportMessages(ctx, "", "", "new-devs", "", 0)
	if err != nil {
		t.Fatalf("ExportMessages after rename returned error: %v", err)
	}
	if len(msgs) != 1 {
		t.Errorf("expected 1 message for renamed group, got %d", len(msgs))
	}

	// Transfer ownership.
	err = s.TransferGroupOwnership("new-devs", "bob")
	if err != nil {
		t.Fatalf("TransferGroupOwnership returned error: %v", err)
	}
	info, err = s.GetGroupInfo("new-devs")
	if err != nil {
		t.Fatalf("GetGroupInfo after transfer returned error: %v", err)
	}
	if info.Owner != "bob" {
		t.Errorf("expected owner 'bob', got '%s'", info.Owner)
	}
}

func TestKickGroupMember(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.CreateGroup("devs", "alice")
	s.AddGroupMember("devs", "bob")

	members := s.GetGroupMembers("devs")
	if len(members) != 2 {
		t.Fatalf("expected 2 members, got %d", len(members))
	}

	err = s.KickGroupMember("devs", "bob")
	if err != nil {
		t.Fatalf("KickGroupMember returned error: %v", err)
	}

	members = s.GetGroupMembers("devs")
	if len(members) != 1 {
		t.Errorf("expected 1 member after kick, got %d", len(members))
	}
	if members[0] != "alice" {
		t.Errorf("expected 'alice' remaining, got '%s'", members[0])
	}
}

func TestDeleteGroup(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.CreateGroup("temp-group", "alice")
	s.AddGroupMember("temp-group", "bob")

	groups := s.GetAllGroups()
	if len(groups) != 1 {
		t.Fatalf("expected 1 group, got %d", len(groups))
	}

	err = s.DeleteGroup("temp-group")
	if err != nil {
		t.Fatalf("DeleteGroup returned error: %v", err)
	}

	groups = s.GetAllGroups()
	if len(groups) != 0 {
		t.Errorf("expected 0 groups after delete, got %d", len(groups))
	}
}

// ── LeaveGroup basic ──

func TestLeaveGroupNonOwner(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.CreateGroup("devs", "alice")
	s.AddGroupMember("devs", "bob")

	// Non-owner leaves.
	err = s.LeaveGroup("devs", "bob")
	if err != nil {
		t.Fatalf("LeaveGroup non-owner returned error: %v", err)
	}

	members := s.GetGroupMembers("devs")
	if len(members) != 1 {
		t.Errorf("expected 1 member after leave, got %d", len(members))
	}
}

// ── GetGroupMemberRole and GetGroupOwner missing cases ──

func TestGetGroupMemberRoleMissing(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.CreateGroup("devs", "alice")

	// Non-member should get an error.
	_, err = s.GetGroupMemberRole("devs", "bob")
	if err == nil {
		t.Error("expected error for non-member role query")
	}

	// Non-existent group.
	_, err = s.GetGroupOwner("nonexistent-group")
	if err == nil {
		t.Error("expected error for non-existent group owner")
	}
}

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

func TestGetGroupInfoNonExistent(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	_, err = s.GetGroupInfo("nonexistent-group")
	if err == nil {
		t.Error("expected error for non-existent group info")
	}
}

// ── GroupMembersWithRoles empty ──

func TestGetGroupMembersWithRolesEmpty(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	members := s.GetGroupMembersWithRoles("nonexistent-group")
	if len(members) != 0 {
		t.Errorf("expected 0 members for non-existent group, got %d", len(members))
	}
}

