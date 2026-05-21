package store

import (
	"database/sql"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// StoredMessage is the message model returned by the store.
type StoredMessage struct {
	ID        string              `json:"id"`
	Username  string              `json:"username"`
	Content   string              `json:"content"`
	Timestamp int64               `json:"timestamp"`
	ReplyToID string              `json:"reply_to_id,omitempty"`
	RoomID    string              `json:"room_id,omitempty"`
	Deleted   bool                `json:"deleted"`
	Edited    bool                `json:"edited"`
	ToUser    string              `json:"to,omitempty"`
	GroupName string              `json:"group,omitempty"`
	Reactions map[string][]string `json:"reactions,omitempty"`
}

// StoredRoom is the room model returned by the store.
type StoredRoom struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Store handles SQLite message persistence.
type Store struct {
	db            *sql.DB
	mu            sync.RWMutex
	totalMessages atomic.Int64
}

// New creates a new Store and initializes the database.
func New(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, err
	}
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

func (s *Store) migrate() error {
	query := `
	CREATE TABLE IF NOT EXISTS rooms (
		id TEXT PRIMARY KEY,
		name TEXT UNIQUE NOT NULL
	);
	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		username TEXT NOT NULL,
		content TEXT NOT NULL,
		timestamp INTEGER NOT NULL,
		reply_to_id TEXT DEFAULT '',
		room_id TEXT DEFAULT '',
		deleted INTEGER NOT NULL DEFAULT 0,
		edited INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, timestamp DESC);
	CREATE TABLE IF NOT EXISTS reactions (
		message_id TEXT NOT NULL,
		emoji TEXT NOT NULL,
		username TEXT NOT NULL,
		PRIMARY KEY (message_id, emoji, username),
		FOREIGN KEY (message_id) REFERENCES messages(id)
	);
	CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);

	CREATE TABLE IF NOT EXISTS friends (
		username TEXT NOT NULL,
		friend TEXT NOT NULL,
		PRIMARY KEY (username, friend)
	);

	CREATE TABLE IF NOT EXISTS group_members (
		group_name TEXT NOT NULL,
		username TEXT NOT NULL,
		PRIMARY KEY (group_name, username)
	);
	`
	_, err := s.db.Exec(query)
	if err != nil {
		return err
	}

	// Add columns if they don't exist (migration for existing DBs).
	if _, err := s.db.Exec("ALTER TABLE messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0"); err != nil {
		log.Printf("store: migrate add column deleted: %v", err)
	}
	if _, err := s.db.Exec("ALTER TABLE messages ADD COLUMN reply_to_id TEXT DEFAULT ''"); err != nil {
		log.Printf("store: migrate add column reply_to_id: %v", err)
	}
	if _, err := s.db.Exec("ALTER TABLE messages ADD COLUMN room_id TEXT DEFAULT ''"); err != nil {
		log.Printf("store: migrate add column room_id: %v", err)
	}
	if _, err := s.db.Exec("ALTER TABLE messages ADD COLUMN edited INTEGER NOT NULL DEFAULT 0"); err != nil {
		log.Printf("store: migrate add column edited: %v", err)
	}
	if _, err := s.db.Exec("ALTER TABLE messages ADD COLUMN to_user TEXT DEFAULT ''"); err != nil {
		log.Printf("store: migrate add column to_user: %v", err)
	}
	if _, err := s.db.Exec("ALTER TABLE messages ADD COLUMN group_name TEXT DEFAULT ''"); err != nil {
		log.Printf("store: migrate add column group_name: %v", err)
	}
	if _, err := s.db.Exec("ALTER TABLE messages ADD COLUMN delivered INTEGER NOT NULL DEFAULT 0"); err != nil {
		log.Printf("store: migrate add column delivered: %v", err)
	}

	// Seed default room if not present.
	s.ensureDefaultRoom()

	// FTS5 full-text search
	if err := s.createFTS5(); err != nil {
		return err
	}

	return nil
}

func (s *Store) ensureDefaultRoom() {
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM rooms WHERE name = ?", "公共聊天").Scan(&count)
	if err != nil || count == 0 {
		s.db.Exec("INSERT OR IGNORE INTO rooms (id, name) VALUES (?, ?)", uuid.New().String(), "公共聊天")
	}
}

func (s *Store) InsertMessage(username, content, replyToID, roomID, toUser, groupName string) (StoredMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := uuid.New().String()
	ts := time.Now().UnixMilli()

	_, err := s.db.Exec(
		"INSERT INTO messages (id, username, content, timestamp, reply_to_id, room_id, to_user, group_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		id, username, content, ts, replyToID, roomID, toUser, groupName,
	)
	if err != nil {
		return StoredMessage{}, err
	}

	s.totalMessages.Add(1)

	return StoredMessage{
		ID:        id,
		Username:  username,
		Content:   content,
		Timestamp: ts,
		ReplyToID: replyToID,
		RoomID:    roomID,
	}, nil
}

func (s *Store) GetMessages(limit int, before int64) []StoredMessage {
	return s.GetRoomMessages("", limit, before)
}

func (s *Store) GetRoomMessages(roomID string, limit int, before int64) []StoredMessage {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 100
	}

	var rows *sql.Rows
	var err error

	if before > 0 {
		if roomID != "" {
			rows, err = s.db.Query(
				"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name FROM messages WHERE room_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?",
				roomID, before, limit,
			)
		} else {
			rows, err = s.db.Query(
				"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name FROM messages WHERE to_user = '' AND group_name = '' AND timestamp < ? ORDER BY timestamp DESC LIMIT ?",
				before, limit,
			)
		}
	} else {
		if roomID != "" {
			rows, err = s.db.Query(
				"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name FROM messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT ?",
				roomID, limit,
			)
		} else {
			rows, err = s.db.Query(
				"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name FROM messages WHERE to_user = '' AND group_name = '' ORDER BY timestamp DESC LIMIT ?",
				limit,
			)
		}
	}

	if err != nil {
		log.Printf("store: query error: %v", err)
		return nil
	}
	defer rows.Close()

	messages := make([]StoredMessage, 0, limit)
	for rows.Next() {
		var m StoredMessage
		if err := rows.Scan(&m.ID, &m.Username, &m.Content, &m.Timestamp, &m.ReplyToID, &m.RoomID, &m.Deleted, &m.Edited, &m.ToUser, &m.GroupName); err != nil {
			log.Printf("store: scan error: %v", err)
			continue
		}
		if m.Deleted {
			m.Content = ""
		}
		messages = append(messages, m)
	}

	// Sort: since we query DESC (newest first) and then reverse.
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

		// Enrich with reactions.
		if len(messages) > 0 {
			messageIDs := make([]string, len(messages))
			for i, m := range messages {
				messageIDs[i] = m.ID
			}
			reactions := s.GetReactionsForMessages(messageIDs)
			for i := range messages {
				messages[i].Reactions = reactions[messages[i].ID]
			}
		}

		return messages
}

func (s *Store) TotalMessages() int64 {
	return s.totalMessages.Load()
}

func (s *Store) MarkDeleted(messageID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("UPDATE messages SET deleted = 1 WHERE id = ?", messageID)
	return err
}

// --- Room management ---

func (s *Store) GetRoomID(name string) (string, error) {
	var id string
	err := s.db.QueryRow("SELECT id FROM rooms WHERE name = ?", name).Scan(&id)
	if err != nil {
		return "", err
	}
	return id, nil
}

func (s *Store) CreateRoom(name string) (string, error) {
	id := uuid.New().String()
	_, err := s.db.Exec("INSERT INTO rooms (id, name) VALUES (?, ?)", id, name)
	if err != nil {
		return "", err
	}
	return id, nil
}

func (s *Store) ListRooms() []StoredRoom {
	rows, err := s.db.Query("SELECT id, name FROM rooms ORDER BY name")
	if err != nil {
		log.Printf("store: list rooms error: %v", err)
		return nil
	}
	defer rows.Close()

	var rooms []StoredRoom
	for rows.Next() {
		var r StoredRoom
		if err := rows.Scan(&r.ID, &r.Name); err != nil {
			continue
		}
		rooms = append(rooms, r)
	}
	return rooms
}

func (s *Store) DeleteRoom(roomID string) error {
	_, err := s.db.Exec("DELETE FROM rooms WHERE id = ?", roomID)
	return err
}

func (s *Store) Close() error {
	return s.db.Close()
}

// ToggleReaction adds or removes a reaction. Returns the updated reactions map.
func (s *Store) ToggleReaction(messageID, emoji, username string) (map[string][]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var count int
	err := s.db.QueryRow(
		"SELECT COUNT(*) FROM reactions WHERE message_id = ? AND emoji = ? AND username = ?",
		messageID, emoji, username,
	).Scan(&count)
	if err != nil {
		return nil, err
	}

	if count > 0 {
		_, err = s.db.Exec(
			"DELETE FROM reactions WHERE message_id = ? AND emoji = ? AND username = ?",
			messageID, emoji, username,
		)
	} else {
		_, err = s.db.Exec(
			"INSERT INTO reactions (message_id, emoji, username) VALUES (?, ?, ?)",
			messageID, emoji, username,
		)
	}
	if err != nil {
		return nil, err
	}

	return s.getReactionsForMessageLocked(messageID), nil
}

func (s *Store) getReactionsForMessageLocked(messageID string) map[string][]string {
	rows, err := s.db.Query(
		"SELECT emoji, username FROM reactions WHERE message_id = ? ORDER BY rowid",
		messageID,
	)
	if err != nil {
		log.Printf("store: reaction query error: %v", err)
		return nil
	}
	defer rows.Close()

	result := make(map[string][]string)
	for rows.Next() {
		var emoji, username string
		if err := rows.Scan(&emoji, &username); err != nil {
			log.Printf("store: reaction scan error: %v", err)
			continue
		}
		result[emoji] = append(result[emoji], username)
	}
	return result
}

func (s *Store) GetReactionsForMessages(messageIDs []string) map[string]map[string][]string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]map[string][]string)
	for _, mid := range messageIDs {
		result[mid] = s.getReactionsForMessageLocked(mid)
	}
	return result
}

func (s *Store) UpdateMessage(messageID, content string) (StoredMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(
		"UPDATE messages SET content = ?, edited = 1 WHERE id = ?",
		content, messageID,
	)
	if err != nil {
		return StoredMessage{}, err
	}

	return s.getMessageByIDLocked(messageID)
}

func (s *Store) GetMessageByID(messageID string) (StoredMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getMessageByIDLocked(messageID)
}

func (s *Store) getMessageByIDLocked(messageID string) (StoredMessage, error) {
	var m StoredMessage
	err := s.db.QueryRow(
		"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name FROM messages WHERE id = ?",
		messageID,
	).Scan(&m.ID, &m.Username, &m.Content, &m.Timestamp, &m.ReplyToID, &m.RoomID, &m.Deleted, &m.Edited, &m.ToUser, &m.GroupName)
	if err != nil {
		return StoredMessage{}, err
	}
	if m.Deleted {
		m.Content = ""
	}
	return m, nil
}

// --- FTS5 full-text search ---

func (s *Store) createFTS5() error {
	query := `
	CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
		content, username, room_id UNINDEXED,
		content='messages', content_rowid='rowid',
		tokenize='unicode61'
	);

	CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
		INSERT INTO messages_fts(rowid, content, username, room_id)
		VALUES (new.rowid, new.content, new.username, new.room_id);
	END;

	CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
		INSERT INTO messages_fts(messages_fts, rowid, content, username, room_id)
		VALUES ('delete', old.rowid, old.content, old.username, old.room_id);
	END;

	CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE ON messages BEGIN
		INSERT INTO messages_fts(messages_fts, rowid, content, username, room_id)
		VALUES ('delete', old.rowid, old.content, old.username, old.room_id);
		INSERT INTO messages_fts(rowid, content, username, room_id)
		VALUES (new.rowid, new.content, new.username, new.room_id);
	END;
	`
	_, err := s.db.Exec(query)
	return err
}

// SearchResult holds a single full-text search result with snippet and rank.
type SearchResult struct {
	ID        string  `json:"id"`
	Username  string  `json:"username"`
	Content   string  `json:"content"`
	Timestamp int64   `json:"timestamp"`
	Snippet   string  `json:"snippet"`
	Rank      float64 `json:"rank"`
}

// SearchMessages performs a full-text search over messages using FTS5.
func (s *Store) SearchMessages(query string, roomID string, limit int) ([]SearchResult, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 20
	}

	var rows *sql.Rows
	var err error

	if roomID != "" {
		rows, err = s.db.Query(`
			SELECT m.id, m.username, m.content, m.timestamp,
				snippet(messages_fts, 1, '<mark>', '</mark>', '...', 40) AS snippet,
				bm25(messages_fts) AS rank
			FROM messages_fts
			JOIN messages m ON m.rowid = messages_fts.rowid
			WHERE m.deleted = 0 AND messages_fts MATCH ? AND messages_fts.room_id = ?
			ORDER BY rank LIMIT ?`, query, roomID, limit)
	} else {
		rows, err = s.db.Query(`
			SELECT m.id, m.username, m.content, m.timestamp,
				snippet(messages_fts, 1, '<mark>', '</mark>', '...', 40) AS snippet,
				bm25(messages_fts) AS rank
			FROM messages_fts
			JOIN messages m ON m.rowid = messages_fts.rowid
			WHERE messages_fts MATCH ?
			ORDER BY rank LIMIT ?`, query, limit)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]SearchResult, 0, limit)
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.ID, &r.Username, &r.Content, &r.Timestamp, &r.Snippet, &r.Rank); err != nil {
			log.Printf("store: search scan error: %v", err)
			continue
		}
		results = append(results, r)
	}
	if results == nil {
		results = []SearchResult{}
	}
	return results, nil
}

// --- Friends persistence ---

func (s *Store) AddFriend(username, friend string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("INSERT OR IGNORE INTO friends (username, friend) VALUES (?, ?)", username, friend)
	return err
}

func (s *Store) RemoveFriend(username, friend string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("DELETE FROM friends WHERE username = ? AND friend = ?", username, friend)
	return err
}

func (s *Store) GetFriends(username string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows, err := s.db.Query("SELECT friend FROM friends WHERE username = ?", username)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var friends []string
	for rows.Next() {
		var f string
		if err := rows.Scan(&f); err == nil {
			friends = append(friends, f)
		}
	}
	if friends == nil {
		friends = []string{}
	}
	return friends
}

// --- Group persistence ---

func (s *Store) CreateGroup(name, creator string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("INSERT OR IGNORE INTO group_members (group_name, username) VALUES (?, ?)", name, creator)
	return err
}

func (s *Store) AddGroupMember(groupName, username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("INSERT OR IGNORE INTO group_members (group_name, username) VALUES (?, ?)", groupName, username)
	return err
}

func (s *Store) RemoveGroupMember(groupName, username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("DELETE FROM group_members WHERE group_name = ? AND username = ?", groupName, username)
	return err
}

func (s *Store) GetGroupMembers(groupName string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows, err := s.db.Query("SELECT username FROM group_members WHERE group_name = ?", groupName)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var members []string
	for rows.Next() {
		var m string
		if err := rows.Scan(&m); err == nil {
			members = append(members, m)
		}
	}
	if members == nil {
		members = []string{}
	}
	return members
}

func (s *Store) GetAllGroups() map[string][]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows, err := s.db.Query("SELECT group_name, username FROM group_members ORDER BY group_name")
	if err != nil {
		return nil
	}
	defer rows.Close()
	groups := make(map[string][]string)
	for rows.Next() {
		var g, u string
		if err := rows.Scan(&g, &u); err == nil {
			groups[g] = append(groups[g], u)
		}
	}
	return groups
}

// GetAllFriends returns all friend relationships as (username, friend) pairs.
func (s *Store) GetAllFriends() map[string][]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows, err := s.db.Query("SELECT username, friend FROM friends")
	if err != nil {
		return nil
	}
	defer rows.Close()
	result := make(map[string][]string)
	for rows.Next() {
		var u, f string
		if err := rows.Scan(&u, &f); err == nil {
			result[u] = append(result[u], f)
		}
	}
	return result
}

// GetUndeliveredDMs returns recent DMs addressed to a user that haven't been delivered yet.
func (s *Store) GetUndeliveredDMs(username string, limit int) []StoredMessage {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.Query(
		"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name FROM messages WHERE to_user = ? AND deleted = 0 AND delivered = 0 ORDER BY timestamp ASC LIMIT ?",
		username, limit,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var msgs []StoredMessage
	for rows.Next() {
		var m StoredMessage
		if err := rows.Scan(&m.ID, &m.Username, &m.Content, &m.Timestamp, &m.ReplyToID, &m.RoomID, &m.Deleted, &m.Edited, &m.ToUser, &m.GroupName); err != nil {
			continue
		}
		msgs = append(msgs, m)
	}
	if msgs == nil {
		msgs = []StoredMessage{}
	}
	return msgs
}

// MarkMessagesDelivered marks a set of message IDs as delivered.
func (s *Store) MarkMessagesDelivered(ids []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, id := range ids {
		s.db.Exec("UPDATE messages SET delivered = 1 WHERE id = ?", id)
	}
	return nil
}
