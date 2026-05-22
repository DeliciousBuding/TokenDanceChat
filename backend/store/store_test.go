package store

import (
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

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
		t.Errorf("expected %d messages after concurrent inserts, got %d", numGoroutines, len(msgs))
	}
}
