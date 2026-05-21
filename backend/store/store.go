package store

import (
	"database/sql"
	"log"
	"sync"
	"time"

	"tokendancechat/backend/hub"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// Store handles SQLite message persistence.
type Store struct {
	db *sql.DB
	mu sync.RWMutex
}

// New creates a new Store and initializes the database.
func New(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	// Enable WAL mode for better concurrent read performance.
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, err
	}

	// Enable foreign keys.
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		db.Close()
		return nil, err
	}

	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}

	log.Println("store: database initialized")
	return s, nil
}

// migrate creates the tables if they don't exist.
func (s *Store) migrate() error {
	query := `
	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		username TEXT NOT NULL,
		content TEXT NOT NULL,
		timestamp INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
	`
	_, err := s.db.Exec(query)
	return err
}

// InsertMessage inserts a new message and returns the stored message.
func (s *Store) InsertMessage(username, content string) (hub.StoredMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := uuid.New().String()
	ts := time.Now().UnixMilli()

	_, err := s.db.Exec(
		"INSERT INTO messages (id, username, content, timestamp) VALUES (?, ?, ?, ?)",
		id, username, content, ts,
	)
	if err != nil {
		return hub.StoredMessage{}, err
	}

	return hub.StoredMessage{
		ID:        id,
		Username:  username,
		Content:   content,
		Timestamp: ts,
	}, nil
}

// GetMessages retrieves the most recent messages.
// If before is non-zero, returns messages with timestamp < before.
func (s *Store) GetMessages(limit int, before int64) []hub.StoredMessage {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 100
	}

	var rows *sql.Rows
	var err error

	if before > 0 {
		rows, err = s.db.Query(
			"SELECT id, username, content, timestamp FROM messages WHERE timestamp < ? ORDER BY timestamp DESC LIMIT ?",
			before, limit,
		)
	} else {
		rows, err = s.db.Query(
			"SELECT id, username, content, timestamp FROM messages ORDER BY timestamp DESC LIMIT ?",
			limit,
		)
	}

	if err != nil {
		log.Printf("store: query error: %v", err)
		return nil
	}
	defer rows.Close()

	messages := make([]hub.StoredMessage, 0, limit)
	for rows.Next() {
		var m hub.StoredMessage
		if err := rows.Scan(&m.ID, &m.Username, &m.Content, &m.Timestamp); err != nil {
			log.Printf("store: scan error: %v", err)
			continue
		}
		messages = append(messages, m)
	}

	// Reverse to return in chronological order.
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages
}

// Close closes the database connection.
func (s *Store) Close() error {
	return s.db.Close()
}
