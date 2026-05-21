package store

import (
	"fmt"
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

	msg, err := s.InsertMessage("alice", "hello world", "")
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

	s.InsertMessage("alice", "first", "")
	time.Sleep(time.Millisecond)
	s.InsertMessage("bob", "second", "")
	time.Sleep(time.Millisecond)
	s.InsertMessage("alice", "third", "")

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
		s.InsertMessage("user", fmt.Sprintf("msg%d", i))
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

	msg1, _ := s.InsertMessage("alice", "first", "")
	time.Sleep(time.Millisecond)
	msg2, _ := s.InsertMessage("bob", "second", "")
	time.Sleep(time.Millisecond)
	msg3, _ := s.InsertMessage("alice", "third", "")

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
			_, err := s.InsertMessage("user", fmt.Sprintf("concurrent-%d", idx))
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
