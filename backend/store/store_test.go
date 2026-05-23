package store

import (
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

