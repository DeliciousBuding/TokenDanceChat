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

func TestAddFriendSelf(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Adding self as friend: store does not have a constraint against this.
	err = s.AddFriend("alice", "alice")
	if err != nil {
		t.Fatalf("AddFriend with self returned error: %v", err)
	}

	// Verify self appears in friends list.
	friends := s.GetFriends("alice")
	found := false
	for _, f := range friends {
		if f == "alice" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected self to appear in friends list after AddFriend(self)")
	}
}

// ── Edge case: RemoveFriend with non-existent friendship ──

func TestRemoveFriendNonExistent(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// RemoveFriend on non-existent friendship should not error.
	err = s.RemoveFriend("alice", "ghost")
	if err != nil {
		t.Errorf("RemoveFriend with non-existent friendship returned error: %v", err)
	}

	// Friends list should remain empty.
	friends := s.GetFriends("alice")
	if len(friends) != 0 {
		t.Errorf("expected 0 friends after removing non-existent, got %d", len(friends))
	}
}


// ── GetUndeliveredDMs focused test ──

func TestGetUndeliveredDMs(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Insert a DM (delivered defaults to 0).
	dm, err := s.InsertMessage("alice", "hello bob", "", "", "bob", "", "")
	if err != nil {
		t.Fatalf("InsertMessage returned error: %v", err)
	}

	// Insert a non-DM message — should not appear as undelivered.
	s.InsertMessage("alice", "public msg", "", "", "", "", "")

	// Bob should see 1 undelivered DM.
	undelivered := s.GetUndeliveredDMs("bob", 10)
	if len(undelivered) != 1 {
		t.Fatalf("expected 1 undelivered DM for bob, got %d", len(undelivered))
	}
	if undelivered[0].ID != dm.ID {
		t.Errorf("expected DM id '%s', got '%s'", dm.ID, undelivered[0].ID)
	}
	if undelivered[0].ToUser != "bob" {
		t.Errorf("expected ToUser 'bob', got '%s'", undelivered[0].ToUser)
	}
	if undelivered[0].Username != "alice" {
		t.Errorf("expected sender 'alice', got '%s'", undelivered[0].Username)
	}

	// Alice should see 0 undelivered — the DM was sent TO bob, not alice.
	undelivered = s.GetUndeliveredDMs("alice", 10)
	if len(undelivered) != 0 {
		t.Errorf("expected 0 undelivered DMs for alice, got %d", len(undelivered))
	}

	// Mark as delivered.
	err = s.MarkMessagesDelivered([]string{dm.ID})
	if err != nil {
		t.Fatalf("MarkMessagesDelivered returned error: %v", err)
	}

	// Bob should now see 0 undelivered.
	undelivered = s.GetUndeliveredDMs("bob", 10)
	if len(undelivered) != 0 {
		t.Errorf("expected 0 undelivered after marking delivered, got %d", len(undelivered))
	}

	// GetUndeliveredDMs for user with no DMs returns empty slice.
	undelivered = s.GetUndeliveredDMs("nonexistent", 10)
	if len(undelivered) != 0 {
		t.Errorf("expected 0 undelivered for unknown user, got %d", len(undelivered))
	}
}

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

func TestPinConversationRoundTrip(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Initially no pinned conversations.
	keys := s.ListPinnedConversations("alice")
	if len(keys) != 0 {
		t.Errorf("expected 0 pinned initially, got %d", len(keys))
	}

	// Pin two conversations.
	err = s.PinConversation("alice", "dm:bob")
	if err != nil {
		t.Fatalf("PinConversation returned error: %v", err)
	}
	err = s.PinConversation("alice", "room:general")
	if err != nil {
		t.Fatalf("PinConversation second returned error: %v", err)
	}

	// Pin for a different user — should not appear in alice's list.
	s.PinConversation("bob", "dm:charlie")

	// List pinned for alice.
	keys = s.ListPinnedConversations("alice")
	if len(keys) != 2 {
		t.Fatalf("expected 2 pinned conversations, got %d", len(keys))
	}
	if keys[0] != "dm:bob" || keys[1] != "room:general" {
		t.Errorf("unexpected pinned keys: %v", keys)
	}

	// Unpin one.
	err = s.UnpinConversation("alice", "dm:bob")
	if err != nil {
		t.Fatalf("UnpinConversation returned error: %v", err)
	}
	keys = s.ListPinnedConversations("alice")
	if len(keys) != 1 {
		t.Fatalf("expected 1 pinned after unpin, got %d", len(keys))
	}
	if keys[0] != "room:general" {
		t.Errorf("expected 'room:general' remaining, got '%s'", keys[0])
	}

	// Unpin the other.
	err = s.UnpinConversation("alice", "room:general")
	if err != nil {
		t.Fatalf("UnpinConversation second returned error: %v", err)
	}
	keys = s.ListPinnedConversations("alice")
	if len(keys) != 0 {
		t.Errorf("expected 0 pinned after both unpinned, got %d", len(keys))
	}

	// Bob's list should be unaffected by alice's operations.
	keys = s.ListPinnedConversations("bob")
	if len(keys) != 1 || keys[0] != "dm:charlie" {
		t.Errorf("expected bob's pinned list ['dm:charlie'], got %v", keys)
	}
}

// ── GetWebhookByURL ──

func TestGetWebhookByURL(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	err = s.CreateWebhook("wh-url-1", "team-a", "https://example.com/hooks/alpha", "secret-alpha", "alice")
	if err != nil {
		t.Fatalf("CreateWebhook returned error: %v", err)
	}
	err = s.CreateWebhook("wh-url-2", "team-b", "https://example.com/hooks/beta", "secret-beta", "bob")
	if err != nil {
		t.Fatalf("CreateWebhook second returned error: %v", err)
	}

	// Look up by URL.
	w, err := s.GetWebhookByURL("https://example.com/hooks/alpha")
	if err != nil {
		t.Fatalf("GetWebhookByURL returned error: %v", err)
	}
	if w.ID != "wh-url-1" {
		t.Errorf("expected webhook id 'wh-url-1', got '%s'", w.ID)
	}
	if w.GroupName != "team-a" {
		t.Errorf("expected group 'team-a', got '%s'", w.GroupName)
	}
	if w.CreatedBy != "alice" {
		t.Errorf("expected created_by 'alice', got '%s'", w.CreatedBy)
	}
	if w.Secret == "" {
		t.Error("expected non-empty secret hash")
	}
	if strings.Contains(w.Secret, "secret-alpha") {
		t.Error("secret hash should not contain plaintext secret")
	}

	// Look up the second webhook.
	w, err = s.GetWebhookByURL("https://example.com/hooks/beta")
	if err != nil {
		t.Fatalf("GetWebhookByURL second returned error: %v", err)
	}
	if w.ID != "wh-url-2" {
		t.Errorf("expected webhook id 'wh-url-2', got '%s'", w.ID)
	}
}

// ── GetWebhookByURL with non-existent URL ──

func TestGetWebhookByURLNonExistent(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Lookup with no webhooks in DB should return error.
	_, err = s.GetWebhookByURL("https://example.com/nonexistent")
	if err == nil {
		t.Error("expected error for non-existent webhook URL")
	}

	// Insert a webhook, then look up a different URL.
	s.CreateWebhook("wh-1", "team", "https://example.com/real", "secret", "alice")
	_, err = s.GetWebhookByURL("https://example.com/wrong")
	if err == nil {
		t.Error("expected error for wrong webhook URL")
	}

	// Empty URL should also return error.
	_, err = s.GetWebhookByURL("")
	if err == nil {
		t.Error("expected error for empty webhook URL")
	}
}

// ── CreateWebhook with empty secret ──

func TestCreateWebhookEmptySecret(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// hashWebhookSecret rejects empty secrets.
	err = s.CreateWebhook("wh-1", "team", "wh-url", "", "alice")
	if err == nil {
		t.Error("expected error for empty webhook secret")
	}

	// Verify no webhook was created.
	webhooks, err := s.ListWebhooks("team")
	if err != nil {
		t.Fatalf("ListWebhooks returned error: %v", err)
	}
	if len(webhooks) != 0 {
		t.Errorf("expected 0 webhooks after failed create, got %d", len(webhooks))
	}
}

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

	func TestUpdateUserStatusNonExistent(t *testing.T) {
		s, err := New(":memory:")
		if err != nil {
			t.Fatalf("New(:memory:) returned error: %v", err)
		}
		defer s.Close()

		// UpdateStatus for a user who has no profile row: UPDATE with 0 rows,
		// should not error.
		err = s.UpdateUserStatus("no-profile-user", "away")
		if err != nil {
			t.Fatalf("UpdateUserStatus on non-existent profile returned error: %v", err)
		}

		// The user still has no profile (plain UPDATE does not insert).
		_, err = s.GetUserProfile("no-profile-user")
		if err == nil {
			t.Error("expected error getting profile that was never inserted")
		}

		// Now create a profile and update status.
		err = s.UpsertUserProfile("real-user", "Real Name", "", "", "online", 0)
		if err != nil {
			t.Fatalf("UpsertUserProfile returned error: %v", err)
		}

		err = s.UpdateUserStatus("real-user", "busy")
		if err != nil {
			t.Fatalf("UpdateUserStatus on existing profile returned error: %v", err)
		}

		profile, err := s.GetUserProfile("real-user")
		if err != nil {
			t.Fatalf("GetUserProfile returned error: %v", err)
		}
		if profile.Status != "busy" {
			t.Errorf("expected status 'busy', got '%s'", profile.Status)
		}

		// Update to empty status.
		err = s.UpdateUserStatus("real-user", "")
		if err != nil {
			t.Fatalf("UpdateUserStatus to empty returned error: %v", err)
		}
		profile, err = s.GetUserProfile("real-user")
		if err != nil {
			t.Fatalf("GetUserProfile after empty status returned error: %v", err)
		}
		if profile.Status != "" {
			t.Errorf("expected empty status, got '%s'", profile.Status)
		}
	}

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

func TestLeaveGroupOwnerAlone(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.CreateGroup("solo", "alice")

	// Verify group exists.
	info, err := s.GetGroupInfo("solo")
	if err != nil {
		t.Fatalf("GetGroupInfo returned error: %v", err)
	}
	if info.MemberCount != 1 {
		t.Fatalf("expected 1 member, got %d", info.MemberCount)
	}

	// Owner leaves (only member).
	err = s.LeaveGroup("solo", "alice")
	if err != nil {
		t.Fatalf("LeaveGroup returned error: %v", err)
	}

	// Group should be deleted.
	_, err = s.GetGroupInfo("solo")
	if err == nil {
		t.Error("expected error for deleted group info")
	}

	// Members should be empty.
	members := s.GetGroupMembers("solo")
	if len(members) != 0 {
		t.Errorf("expected 0 members after group deleted, got %d", len(members))
	}

	// GetAllGroups should not include it.
	allGroups := s.GetAllGroups()
	if _, ok := allGroups["solo"]; ok {
		t.Error("deleted group should not appear in GetAllGroups")
	}
}

// ── LeaveGroup: owner leaves with another member (ownership transferred) ──

func TestLeaveGroupOwnerWithMember(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.CreateGroup("devs", "alice")
	s.AddGroupMember("devs", "bob")

	// Owner leaves (another member exists).
	err = s.LeaveGroup("devs", "alice")
	if err != nil {
		t.Fatalf("LeaveGroup returned error: %v", err)
	}

	// Group should persist.
	info, err := s.GetGroupInfo("devs")
	if err != nil {
		t.Fatalf("GetGroupInfo returned error: %v", err)
	}
	if info.Owner != "bob" {
		t.Errorf("expected owner 'bob' after transfer, got '%s'", info.Owner)
	}
	if info.MemberCount != 1 {
		t.Errorf("expected 1 member after owner left, got %d", info.MemberCount)
	}

	// bob should now have the "owner" role.
	role, err := s.GetGroupMemberRole("devs", "bob")
	if err != nil {
		t.Fatalf("GetGroupMemberRole returned error: %v", err)
	}
	if role != "owner" {
		t.Errorf("expected role 'owner' for bob after transfer, got '%s'", role)
	}

	// alice should no longer be a member.
	_, err = s.GetGroupMemberRole("devs", "alice")
	if err == nil {
		t.Error("expected error for alice (no longer a member)")
	}
}

// ── LeaveGroup: owner leaves with an admin present (transferred to admin) ──

func TestLeaveGroupOwnerWithAdmin(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.CreateGroup("devs", "alice")
	s.AddGroupMember("devs", "bob")
	s.AddGroupMember("devs", "charlie")
	s.SetGroupMemberRole("devs", "bob", "admin")

	// Owner leaves (admin exists).
	err = s.LeaveGroup("devs", "alice")
	if err != nil {
		t.Fatalf("LeaveGroup returned error: %v", err)
	}

	// Group should persist.
	info, err := s.GetGroupInfo("devs")
	if err != nil {
		t.Fatalf("GetGroupInfo returned error: %v", err)
	}
	// Ownership should transfer to the admin (bob), not a random member.
	if info.Owner != "bob" {
		t.Errorf("expected owner 'bob' (admin) after transfer, got '%s'", info.Owner)
	}
	if info.MemberCount != 2 {
		t.Errorf("expected 2 members after owner left, got %d", info.MemberCount)
	}

	// bob should now be owner.
	role, err := s.GetGroupMemberRole("devs", "bob")
	if err != nil {
		t.Fatalf("GetGroupMemberRole for bob returned error: %v", err)
	}
	if role != "owner" {
		t.Errorf("expected role 'owner' for bob, got '%s'", role)
	}

	// charlie should still be member.
	role, err = s.GetGroupMemberRole("devs", "charlie")
	if err != nil {
		t.Fatalf("GetGroupMemberRole for charlie returned error: %v", err)
	}
	if role != "member" {
		t.Errorf("expected role 'member' for charlie, got '%s'", role)
	}
}

// ── KickGroupMember: kicking the owner ──

func TestKickGroupOwner(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.CreateGroup("devs", "alice")
	s.AddGroupMember("devs", "bob")

	// Kick the owner (allowed at store level; caller must enforce permission).
	err = s.KickGroupMember("devs", "alice")
	if err != nil {
		t.Fatalf("KickGroupMember returned error: %v", err)
	}

	// Owner is removed from group_members.
	members := s.GetGroupMembers("devs")
	if len(members) != 1 {
		t.Errorf("expected 1 member after kicking owner, got %d", len(members))
	}
	if members[0] != "bob" {
		t.Errorf("expected 'bob' remaining, got '%s'", members[0])
	}

	// groups_info still references the old owner (caller must fix).
	info, err := s.GetGroupInfo("devs")
	if err != nil {
		t.Fatalf("GetGroupInfo returned error: %v", err)
	}
	if info.Owner != "alice" {
		t.Errorf("expected groups_info owner still 'alice', got '%s'", info.Owner)
	}
}

// ── TransferGroupOwnership: transfer to a non-member ──

func TestTransferGroupOwnershipToNonMember(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.CreateGroup("devs", "alice")
	s.AddGroupMember("devs", "bob")

	// Transfer ownership to someone not in the group.
	err = s.TransferGroupOwnership("devs", "charlie")
	if err != nil {
		t.Fatalf("TransferGroupOwnership returned error: %v", err)
	}

	// groups_info owner is updated to charlie.
	info, err := s.GetGroupInfo("devs")
	if err != nil {
		t.Fatalf("GetGroupInfo returned error: %v", err)
	}
	if info.Owner != "charlie" {
		t.Errorf("expected owner 'charlie', got '%s'", info.Owner)
	}

	// Old owner alice is demoted to admin.
	role, err := s.GetGroupMemberRole("devs", "alice")
	if err != nil {
		t.Fatalf("GetGroupMemberRole for alice returned error: %v", err)
	}
	if role != "admin" {
		t.Errorf("expected role 'admin' for old owner alice, got '%s'", role)
	}

	// charlie is not a member and does not get owner role (caller must add first).
	_, err = s.GetGroupMemberRole("devs", "charlie")
	if err == nil {
		t.Error("expected error: charlie is not a member")
	}
}

// ── UpdateGroupName: duplicate name rejection ──

func TestUpdateGroupNameDuplicate(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.CreateGroup("devs", "alice")
	s.CreateGroup("ops", "bob")

	// Try to rename "devs" to "ops" (already exists) — should fail.
	err = s.UpdateGroupName("devs", "ops")
	if err == nil {
		t.Error("expected error renaming to duplicate group name")
	}

	// "devs" should still have its original name.
	info, err := s.GetGroupInfo("devs")
	if err != nil {
		t.Fatalf("GetGroupInfo for devs returned error: %v", err)
	}
	if info.Name != "devs" {
		t.Errorf("expected name 'devs' unchanged, got '%s'", info.Name)
	}

	// "ops" should still exist with its original owner.
	owner, err := s.GetGroupOwner("ops")
	if err != nil {
		t.Fatalf("GetGroupOwner for ops returned error: %v", err)
	}
	if owner != "bob" {
		t.Errorf("expected ops owner 'bob', got '%s'", owner)
	}
}

// ── DeleteGroup: non-existent group is a no-op ──

func TestDeleteGroupNonExistent(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Deleting a non-existent group should not error.
	err = s.DeleteGroup("nonexistent-group")
	if err != nil {
		t.Errorf("DeleteGroup on non-existent group should not error, got: %v", err)
	}

	// Should not affect existing groups.
	s.CreateGroup("devs", "alice")
	groups := s.GetAllGroups()
	if len(groups) != 1 {
		t.Errorf("expected 1 group, got %d", len(groups))
	}
}

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
	if retrieved.GroupName != "group-x" {
		t.Errorf("expected GroupName 'group-x', got '%s'", retrieved.GroupName)
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

func TestUpdateUserStatus(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Upsert profile first.
	err = s.UpsertUserProfile("alice", "Alice", "", "", "online", 0)
	if err != nil {
		t.Fatalf("UpsertUserProfile returned error: %v", err)
	}

	tests := []struct {
		name      string
		status    string
		wantEmpty bool
	}{
		{name: "away", status: "away", wantEmpty: false},
		{name: "busy", status: "busy", wantEmpty: false},
		{name: "empty", status: "", wantEmpty: true},
		{name: "emoji", status: "\U0001f4a1", wantEmpty: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err = s.UpdateUserStatus("alice", tt.status)
			if err != nil {
				t.Fatalf("UpdateUserStatus returned error: %v", err)
			}
			profile, err := s.GetUserProfile("alice")
			if err != nil {
				t.Fatalf("GetUserProfile returned error: %v", err)
			}
			if profile.Status != tt.status {
				t.Errorf("expected status '%s', got '%s'", tt.status, profile.Status)
			}
			if tt.wantEmpty && profile.Status != "" {
				t.Errorf("expected empty status, got '%s'", profile.Status)
			}
		})
	}
}

// ── Friend operations: standalone coverage ──

func TestAddFriend(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	err = s.AddFriend("alice", "bob")
	if err != nil {
		t.Fatalf("AddFriend returned error: %v", err)
	}

	friends := s.GetFriends("alice")
	if len(friends) != 1 {
		t.Fatalf("expected 1 friend, got %d", len(friends))
	}
	if friends[0] != "bob" {
		t.Errorf("expected friend 'bob', got '%s'", friends[0])
	}

	// Verify bob does not automatically have alice as friend.
	bobFriends := s.GetFriends("bob")
	if len(bobFriends) != 0 {
		t.Errorf("expected 0 friends for bob, got %d", len(bobFriends))
	}

	// Double-add should be idempotent (INSERT OR IGNORE).
	err = s.AddFriend("alice", "bob")
	if err != nil {
		t.Fatalf("AddFriend duplicate returned error: %v", err)
	}
	friends = s.GetFriends("alice")
	if len(friends) != 1 {
		t.Errorf("expected still 1 friend after duplicate add, got %d", len(friends))
	}
}

func TestRemoveFriend(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.AddFriend("alice", "bob")
	s.AddFriend("alice", "charlie")

	err = s.RemoveFriend("alice", "bob")
	if err != nil {
		t.Fatalf("RemoveFriend returned error: %v", err)
	}

	friends := s.GetFriends("alice")
	if len(friends) != 1 {
		t.Fatalf("expected 1 friend after remove, got %d", len(friends))
	}
	if friends[0] != "charlie" {
		t.Errorf("expected remaining friend 'charlie', got '%s'", friends[0])
	}

	// Remove the last friend.
	err = s.RemoveFriend("alice", "charlie")
	if err != nil {
		t.Fatalf("RemoveFriend returned error: %v", err)
	}
	friends = s.GetFriends("alice")
	if len(friends) != 0 {
		t.Errorf("expected 0 friends after removing all, got %d", len(friends))
	}
}

func TestGetFriends(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Empty friends list should return empty slice, not nil.
	friends := s.GetFriends("alice")
	if friends == nil {
		t.Error("expected non-nil empty slice, got nil")
	}
	if len(friends) != 0 {
		t.Errorf("expected 0 friends for empty state, got %d", len(friends))
	}

	// Add multiple friends and verify they are all returned.
	s.AddFriend("alice", "bob")
	s.AddFriend("alice", "charlie")
	s.AddFriend("alice", "dave")

	friends = s.GetFriends("alice")
	if len(friends) != 3 {
		t.Fatalf("expected 3 friends, got %d", len(friends))
	}

	// Verify all expected friends are present (order matches insertion order).
	expected := []string{"bob", "charlie", "dave"}
	for i, f := range friends {
		if f != expected[i] {
			t.Errorf("friends[%d]: expected '%s', got '%s'", i, expected[i], f)
		}
	}

	// GetAllFriends should include alice's relationships.
	allFriends := s.GetAllFriends()
	if len(allFriends["alice"]) != 3 {
		t.Errorf("GetAllFriends: expected 3 friends for alice, got %d", len(allFriends["alice"]))
	}
}

func TestIsFriend(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Helper: check friendship by scanning GetFriends result.
	isFriend := func(username, friend string) bool {
		for _, f := range s.GetFriends(username) {
			if f == friend {
				return true
			}
		}
		return false
	}

	// Initially not friends.
	if isFriend("alice", "bob") {
		t.Error("expected alice and bob not to be friends initially")
	}

	s.AddFriend("alice", "bob")

	if !isFriend("alice", "bob") {
		t.Error("expected alice and bob to be friends after AddFriend")
	}
	if isFriend("bob", "alice") {
		t.Error("expected bob not to have alice as friend (one-way)")
	}
	if isFriend("alice", "charlie") {
		t.Error("expected alice and charlie not to be friends")
	}

	s.RemoveFriend("alice", "bob")
	if isFriend("alice", "bob") {
		t.Error("expected alice and bob not to be friends after RemoveFriend")
	}
}

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

func TestGetMessageByIDDeletedDM(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	// Insert a DM.
	dm, err := s.InsertMessage("alice", "secret dm", "", "", "bob", "", "")
	if err != nil {
		t.Fatalf("InsertMessage returned error: %v", err)
	}

	// Verify retrievable.
	retrieved, err := s.GetMessageByID(dm.ID)
	if err != nil {
		t.Fatalf("GetMessageByID returned error: %v", err)
	}
	if retrieved.ToUser != "bob" {
		t.Errorf("expected ToUser 'bob', got '%s'", retrieved.ToUser)
	}

	// Delete and verify content cleared.
	s.MarkDeleted(dm.ID)
	retrieved, err = s.GetMessageByID(dm.ID)
	if err != nil {
		t.Fatalf("GetMessageByID after delete returned error: %v", err)
	}
	if retrieved.Content != "" {
		t.Errorf("expected empty content for deleted DM, got '%s'", retrieved.Content)
	}
	if !retrieved.Deleted {
		t.Error("expected Deleted flag true for deleted DM")
	}
}

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

func TestCreateWebhookEmptyGroupName(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	err = s.CreateWebhook("wh-1", "", "wh-url", "secret-123", "alice")
	if err != nil {
		t.Fatalf("CreateWebhook with empty group name returned error: %v", err)
	}

	webhooks, err := s.ListWebhooks("")
	if err != nil {
		t.Fatalf("ListWebhooks with empty group returned error: %v", err)
	}
	if len(webhooks) != 1 {
		t.Fatalf("expected 1 webhook for empty group, got %d", len(webhooks))
	}
	if webhooks[0].GroupName != "" {
		t.Errorf("expected empty group name, got '%s'", webhooks[0].GroupName)
	}
	if webhooks[0].URL != "wh-url" {
		t.Errorf("expected url 'wh-url', got '%s'", webhooks[0].URL)
	}

	// Clean up.
	if err := s.DeleteWebhook("wh-1", "", "alice"); err != nil {
		t.Fatalf("DeleteWebhook returned error: %v", err)
	}
}

// ── Webhook edge case: rotate with invalid ID ──

func TestRotateWebhookInvalidID(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	_, err = s.RotateWebhookSecret("wh-nonexistent", "team", "new-secret", "bob")
	if err == nil {
		t.Error("expected error when rotating non-existent webhook")
	}
}

// ── Webhook edge case: delete non-existent ──

func TestDeleteWebhookNonExistent(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	err = s.DeleteWebhook("wh-ghost", "team", "alice")
	if err == nil {
		t.Error("expected error when deleting non-existent webhook")
	}

	// Deleting a valid ID but wrong group should also fail.
	s.CreateWebhook("wh-1", "devs", "wh-url", "secret-123", "alice")
	err = s.DeleteWebhook("wh-1", "ops", "alice")
	if err == nil {
		t.Error("expected error when deleting webhook with wrong group name")
	}

	// Verify webhook was not deleted through the wrong-group call.
	webhooks, err := s.ListWebhooks("devs")
	if err != nil {
		t.Fatalf("ListWebhooks returned error: %v", err)
	}
	if len(webhooks) != 1 {
		t.Errorf("expected 1 webhook after failed delete, got %d", len(webhooks))
	}
}

// ── Group edge case: add duplicate member ──

func TestAddGroupMemberDuplicate(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.CreateGroup("devs", "alice")

	// Add bob once.
	err = s.AddGroupMember("devs", "bob")
	if err != nil {
		t.Fatalf("AddGroupMember returned error: %v", err)
	}

	// Add bob again — should be a no-op (INSERT OR IGNORE).
	err = s.AddGroupMember("devs", "bob")
	if err != nil {
		t.Fatalf("AddGroupMember duplicate returned error: %v", err)
	}

	members := s.GetGroupMembers("devs")
	if len(members) != 2 {
		t.Errorf("expected 2 members, got %d", len(members))
	}
	if members[0] != "alice" {
		t.Errorf("expected first member 'alice', got '%s'", members[0])
	}
	if members[1] != "bob" {
		t.Errorf("expected second member 'bob', got '%s'", members[1])
	}

	// Verify role is preserved for the owner.
	ownerRole, err := s.GetGroupMemberRole("devs", "alice")
	if err != nil {
		t.Fatalf("GetGroupMemberRole returned error: %v", err)
	}
	if ownerRole != "owner" {
		t.Errorf("expected role 'owner' for alice, got '%s'", ownerRole)
	}
}

// ── Group edge case: remove non-member ──

func TestRemoveGroupMemberNonMember(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	s.CreateGroup("devs", "alice")

	// Remove a user who is not a member — should not error (DELETE WHERE is successful
	// even when no rows match).
	err = s.RemoveGroupMember("devs", "charlie")
	if err != nil {
		t.Errorf("RemoveGroupMember for non-member should not error, got: %v", err)
	}

	// Verify group is still intact.
	members := s.GetGroupMembers("devs")
	if len(members) != 1 {
		t.Errorf("expected 1 member, got %d", len(members))
	}
	if members[0] != "alice" {
		t.Errorf("expected member 'alice', got '%s'", members[0])
	}
}

// ── Archive edge case: archive twice (idempotent) ──

func TestArchiveConversationTwice(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	key := "dm:eve"

	// Archive once.
	err = s.ArchiveConversation("alice", key)
	if err != nil {
		t.Fatalf("ArchiveConversation returned error: %v", err)
	}

	// Archive again — should be no-op.
	err = s.ArchiveConversation("alice", key)
	if err != nil {
		t.Fatalf("ArchiveConversation twice returned error: %v", err)
	}

	if !s.IsConversationArchived("alice", key) {
		t.Error("expected conversation to still be archived after duplicate archive")
	}

	// Verify only one row exists.
	var count int
	if err := s.db.QueryRow(
		"SELECT COUNT(*) FROM archived_conversations WHERE username = ? AND key = ?",
		"alice", key,
	).Scan(&count); err != nil {
		t.Fatalf("failed to count archived rows: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 archived row, got %d", count)
	}
}

// ── Archive edge case: unarchive non-archived conversation ──

func TestUnarchiveConversationNonArchived(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	key := "dm:eve"

	// Unarchive a conversation that was never archived — should not error.
	err = s.UnarchiveConversation("alice", key)
	if err != nil {
		t.Errorf("UnarchiveConversation for non-archived conversation should not error, got: %v", err)
	}

	if s.IsConversationArchived("alice", key) {
		t.Error("expected conversation not to be archived after unarchiving non-archived")
	}
}

// ── Archive edge case: list empty ──

func TestListArchivedConversationsEmpty(t *testing.T) {
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New(:memory:) returned error: %v", err)
	}
	defer s.Close()

	result := s.ListArchivedConversations("alice")
	if result == nil {
		t.Error("expected non-nil empty slice, got nil")
	}
	if len(result) != 0 {
		t.Errorf("expected 0 archived conversations, got %d", len(result))
	}

	// Archive one, then check list.
	s.ArchiveConversation("alice", "dm:bob")
	result = s.ListArchivedConversations("alice")
	if len(result) != 1 {
		t.Errorf("expected 1 archived conversation, got %d", len(result))
	}
	if result[0] != "dm:bob" {
		t.Errorf("expected key 'dm:bob', got '%s'", result[0])
	}
}

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