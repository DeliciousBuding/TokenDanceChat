package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"sync"
	"sync/atomic"
	"strings"
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
	ThreadID  string              `json:"thread_id,omitempty"`
	Reactions map[string][]string `json:"reactions,omitempty"`
}

// StoredRoom is the room model returned by the store.
type StoredRoom struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// NotificationPref is the per-conversation notification preference record.
type NotificationPref struct {
	Key         string `json:"key"`
	MutedUntil  int64  `json:"muted_until"`
	ShowPreview bool   `json:"show_preview"`
}

// UserProfile stores user profile data.
type UserProfile struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url"`
	Bio         string `json:"bio"`
	Status      string `json:"status"`
	LastSeen    int64  `json:"last_seen"`
}

// Poll represents a poll.
type Poll struct {
	ID             string            `json:"id"`
	RoomID         string            `json:"room_id"`
	Creator        string            `json:"creator"`
	Question       string            `json:"question"`
	Options        []string          `json:"options"`
	MultipleChoice bool              `json:"multiple_choice"`
	IsAnonymous    bool              `json:"is_anonymous"`
	IsClosed       bool              `json:"is_closed"`
	Votes          map[int]int       `json:"votes"`
	Voters         map[int][]string  `json:"voters"`
	CreatedAt      int64             `json:"created_at"`
}

// CustomEmoji represents a custom emoji uploaded by a user.
type CustomEmoji struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	Uploader  string `json:"uploader"`
	RoomID    string `json:"room_id"`
	CreatedAt int64  `json:"created_at"`
}

// ScheduledMessage represents a message scheduled for future delivery.
type ScheduledMessage struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Content   string `json:"content"`
	RoomID    string `json:"room_id"`
	ToUser    string `json:"to_user"`
	GroupName string `json:"group_name"`
	ReplyToID string `json:"reply_to_id"`
	ThreadID  string `json:"thread_id"`
	SendAt    int64  `json:"send_at"`
	CreatedAt int64  `json:"created_at"`
	Sent      int    `json:"sent"`
}

// GroupInfo holds metadata about a group.
type GroupInfo struct {
	Name        string `json:"name"`
	Owner       string `json:"owner"`
	MemberCount int    `json:"member_count"`
	CreatedAt   int64  `json:"created_at"`
	Description string `json:"description"`
	AvatarURL   string `json:"avatar_url"`
}

// Webhook represents an incoming webhook integration for a group.
type Webhook struct {
	ID        string 
	GroupName string 
	URL       string 
	Secret    string 
	CreatedBy string 
	CreatedAt int64  
}

// GroupMemberInfo represents a member with their role in a group.
type GroupMemberInfo struct {
	Username string `json:"username"`
	Role     string `json:"role"`
}

// CallRecord represents a completed call history entry.
type CallRecord struct {
	ID        string `json:"id"`
	Caller    string `json:"caller"`
	Callee    string `json:"callee"`
	CallType  string `json:"call_type"`
	Status    string `json:"status"`
	StartedAt int64  `json:"started_at"`
	EndedAt   int64  `json:"ended_at"`
	CreatedAt int64  `json:"created_at"`
}

// User represents a registered user account.
type User struct {
	Username     string `json:"username"`
	PasswordHash string `json:"-"`
	InvitedBy    string `json:"invited_by"`
	CreatedAt    int64  `json:"created_at"`
}

// InviteCodeRecord represents an invitation code for new user registration.
type InviteCodeRecord struct {
	Code      string `json:"code"`
	Creator   string `json:"creator"`
	MaxUses   int    `json:"max_uses"`
	UseCount  int    `json:"use_count"`
	CreatedAt int64  `json:"created_at"`
}

// ChatFolder represents a user-created conversation folder.
type ChatFolder struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Name      string `json:"name"`
	SortOrder int    `json:"sort_order"`
	CreatedAt int64  `json:"created_at"`
	ItemCount int    `json:"item_count"`
}

// ChatFolderItem represents a conversation key within a folder.
type ChatFolderItem struct {
	FolderID  string `json:"folder_id"`
	Key       string `json:"key"`
	SortOrder int    `json:"sort_order"`
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
	if _, err := db.Exec("PRAGMA busy_timeout=5000"); err != nil {
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
				role TEXT DEFAULT 'member',
				PRIMARY KEY (group_name, username)
			);

			CREATE TABLE IF NOT EXISTS groups_info (
				name TEXT PRIMARY KEY,
				owner TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				description TEXT DEFAULT '',
				avatar_url TEXT DEFAULT ''
			);

				CREATE TABLE IF NOT EXISTS blocked_users (
					username TEXT NOT NULL,
					blocked TEXT NOT NULL,
					PRIMARY KEY (username, blocked)
				);

				CREATE TABLE IF NOT EXISTS pinned_messages (
					room_id TEXT NOT NULL DEFAULT "",
					message_id TEXT NOT NULL,
					pinned_by TEXT NOT NULL,
					pinned_at INTEGER NOT NULL,
					PRIMARY KEY (room_id, message_id)
				);

				CREATE TABLE IF NOT EXISTS pinned_conversations (
					username TEXT NOT NULL,
					key TEXT NOT NULL,
					PRIMARY KEY (username, key)
				);

				CREATE TABLE IF NOT EXISTS muted_conversations (
					username TEXT NOT NULL,
					key TEXT NOT NULL,
					PRIMARY KEY (username, key)
				);

				CREATE TABLE IF NOT EXISTS archived_conversations (
					username TEXT NOT NULL,
					key TEXT NOT NULL,
					PRIMARY KEY (username, key)
				);

				CREATE TABLE IF NOT EXISTS notification_prefs (
					username TEXT NOT NULL,
					key TEXT NOT NULL,
					muted_until INTEGER DEFAULT 0,
					show_preview INTEGER DEFAULT 1,
					PRIMARY KEY (username, key)
				);

				CREATE TABLE IF NOT EXISTS user_profiles (
					username TEXT PRIMARY KEY,
					display_name TEXT DEFAULT '',
					avatar_url TEXT DEFAULT '',
					bio TEXT DEFAULT '',
					status TEXT DEFAULT '',
					last_seen INTEGER DEFAULT 0
				);

				CREATE TABLE IF NOT EXISTS polls (
					id TEXT PRIMARY KEY,
					room_id TEXT NOT NULL DEFAULT 'public',
					creator TEXT NOT NULL,
					question TEXT NOT NULL,
					options TEXT NOT NULL,
					multiple_choice INTEGER DEFAULT 0,
					is_anonymous INTEGER DEFAULT 0,
					is_closed INTEGER DEFAULT 0,
					votes TEXT DEFAULT '{}',
					voters TEXT DEFAULT '{}',
					created_at INTEGER NOT NULL
				);

				CREATE TABLE IF NOT EXISTS scheduled_messages (
					id TEXT PRIMARY KEY,
					username TEXT NOT NULL,
					content TEXT NOT NULL,
					room_id TEXT DEFAULT '',
					to_user TEXT DEFAULT '',
					group_name TEXT DEFAULT '',
					reply_to_id TEXT DEFAULT '',
					thread_id TEXT DEFAULT '',
					send_at INTEGER NOT NULL,
					created_at INTEGER NOT NULL,
					sent INTEGER DEFAULT 0
				);
				CREATE INDEX IF NOT EXISTS idx_scheduled_send_at ON scheduled_messages(send_at, sent);

				CREATE TABLE IF NOT EXISTS call_history (
					id TEXT PRIMARY KEY,
					caller TEXT NOT NULL,
					callee TEXT NOT NULL,
					call_type TEXT DEFAULT 'video',
					status TEXT DEFAULT 'missed',
					started_at INTEGER,
					ended_at INTEGER,
					created_at INTEGER NOT NULL
				);
				CREATE INDEX IF NOT EXISTS idx_call_history_caller ON call_history(caller, created_at DESC);
				CREATE INDEX IF NOT EXISTS idx_call_history_callee ON call_history(callee, created_at DESC);

				CREATE TABLE IF NOT EXISTS custom_emojis (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL UNIQUE,
					url TEXT NOT NULL,
					uploader TEXT NOT NULL,
					room_id TEXT DEFAULT '',
					created_at INTEGER NOT NULL
				);
				CREATE INDEX IF NOT EXISTS idx_custom_emojis_name ON custom_emojis(name);

				CREATE TABLE IF NOT EXISTS users (
					username TEXT PRIMARY KEY,
					password_hash TEXT NOT NULL,
					invited_by TEXT DEFAULT '',
					created_at INTEGER NOT NULL
				);

				CREATE TABLE IF NOT EXISTS invite_codes (
					code TEXT PRIMARY KEY,
					creator TEXT NOT NULL,
					max_uses INTEGER DEFAULT 5,
					use_count INTEGER DEFAULT 0,
					created_at INTEGER NOT NULL
				);

				CREATE TABLE IF NOT EXISTS chat_folders (
					id TEXT PRIMARY KEY,
					username TEXT NOT NULL,
					name TEXT NOT NULL,
					sort_order INTEGER DEFAULT 0,
					created_at INTEGER NOT NULL,
					UNIQUE(username, name)
				);

				CREATE TABLE IF NOT EXISTS chat_folder_items (
					folder_id TEXT NOT NULL,
					key TEXT NOT NULL,
					sort_order INTEGER DEFAULT 0,
					PRIMARY KEY (folder_id, key),
					FOREIGN KEY (folder_id) REFERENCES chat_folders(id)
				);

			CREATE TABLE IF NOT EXISTS webhooks (
				id TEXT PRIMARY KEY,
				group_name TEXT NOT NULL,
				url TEXT NOT NULL,
				secret TEXT NOT NULL,
				created_by TEXT NOT NULL,
				created_at INTEGER NOT NULL
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
	if _, err := s.db.Exec("ALTER TABLE messages ADD COLUMN thread_id TEXT DEFAULT ''"); err != nil {
		log.Printf("store: migrate add column thread_id: %v", err)
	}

	// Migration: add role column to group_members for existing DBs.
	if _, err := s.db.Exec("ALTER TABLE group_members ADD COLUMN role TEXT DEFAULT 'member'"); err != nil {
		log.Printf("store: migrate add column role to group_members: %v", err)
	}

	// Migration: create groups_info table for existing DBs.
	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS groups_info (
		name TEXT PRIMARY KEY,
		owner TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		description TEXT DEFAULT '',
		avatar_url TEXT DEFAULT ''
	)`); err != nil {
		log.Printf("store: migrate create groups_info: %v", err)
	}

	// Add indexes for DM/group/delivery queries.
	// These must be after all ALTER TABLE statements because the columns may
	// have been added via ALTER TABLE (not present in original CREATE TABLE).
	if _, err := s.db.Exec("CREATE INDEX IF NOT EXISTS idx_messages_to_user ON messages(to_user, timestamp DESC)"); err != nil {
		log.Printf("store: idx_messages_to_user: %v", err)
	}
	if _, err := s.db.Exec("CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_name, timestamp DESC)"); err != nil {
		log.Printf("store: idx_messages_group: %v", err)
	}
	if _, err := s.db.Exec("CREATE INDEX IF NOT EXISTS idx_messages_delivered ON messages(delivered, to_user)"); err != nil {
		log.Printf("store: idx_messages_delivered: %v", err)
	}
	if _, err := s.db.Exec("CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, timestamp)"); err != nil {
		log.Printf("store: idx_messages_thread: %v", err)
	}

	// Seed default room if not present.
	s.ensureDefaultRoom()

	// FTS5 full-text search
	if err := s.createFTS5(); err != nil {
		return err
	}

	// Populate FTS5 index for pre-existing messages not yet indexed.
	s.populateFTS5()

	return nil
}

func (s *Store) ensureDefaultRoom() {
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM rooms WHERE name = ?", "公共聊天").Scan(&count)
	if err != nil || count == 0 {
		s.db.Exec("INSERT OR IGNORE INTO rooms (id, name) VALUES (?, ?)", uuid.New().String(), "公共聊天")
	}
}

func (s *Store) InsertMessage(username, content, replyToID, roomID, toUser, groupName, threadID string) (StoredMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := uuid.New().String()
	ts := time.Now().UnixMilli()

	_, err := s.db.Exec(
		"INSERT INTO messages (id, username, content, timestamp, reply_to_id, room_id, to_user, group_name, thread_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		id, username, content, ts, replyToID, roomID, toUser, groupName, threadID,
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
		ThreadID:  threadID,
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
				"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name, thread_id FROM messages WHERE room_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?",
				roomID, before, limit,
			)
		} else {
			rows, err = s.db.Query(
				"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name, thread_id FROM messages WHERE to_user = '' AND group_name = '' AND timestamp < ? ORDER BY timestamp DESC LIMIT ?",
				before, limit,
			)
		}
	} else {
		if roomID != "" {
			rows, err = s.db.Query(
				"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name, thread_id FROM messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT ?",
				roomID, limit,
			)
		} else {
			rows, err = s.db.Query(
				"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name, thread_id FROM messages WHERE to_user = '' AND group_name = '' ORDER BY timestamp DESC LIMIT ?",
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
		if err := rows.Scan(&m.ID, &m.Username, &m.Content, &m.Timestamp, &m.ReplyToID, &m.RoomID, &m.Deleted, &m.Edited, &m.ToUser, &m.GroupName, &m.ThreadID); err != nil {
			log.Printf("store: scan error: %v", err)
			continue
		}
		if m.Deleted {
			m.Content = ""
		}
		messages = append(messages, m)
	}
	if err := rows.Err(); err != nil {
		log.Printf("store: rows iteration error: %v", err)
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

func (s *Store) TotalUsers() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var count int64
	s.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	return count
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
	if err := rows.Err(); err != nil {
		log.Printf("store: rows iteration error: %v", err)
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

// Ping verifies the database connection is alive.
func (s *Store) Ping() error {
	return s.db.Ping()
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
	if err := rows.Err(); err != nil {
		log.Printf("store: rows iteration error: %v", err)
	}
	return result
}

func (s *Store) GetReactionsForMessages(messageIDs []string) map[string]map[string][]string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]map[string][]string)
	if len(messageIDs) == 0 {
		return result
	}

	// Build IN clause with one placeholder per ID.
	placeholders := make([]string, len(messageIDs))
	args := make([]interface{}, len(messageIDs))
	for i, mid := range messageIDs {
		placeholders[i] = "?"
		args[i] = mid
		result[mid] = make(map[string][]string)
	}

	query := "SELECT message_id, emoji, username FROM reactions WHERE message_id IN (" + strings.Join(placeholders, ",") + ") ORDER BY rowid"
	rows, err := s.db.Query(query, args...)
	if err != nil {
		log.Printf("store: batch reaction query error: %v", err)
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var messageID, emoji, username string
		if err := rows.Scan(&messageID, &emoji, &username); err != nil {
			continue
		}
		result[messageID][emoji] = append(result[messageID][emoji], username)
	}
	if err := rows.Err(); err != nil {
		log.Printf("store: rows iteration error: %v", err)
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
		"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name, thread_id FROM messages WHERE id = ?",
		messageID,
	).Scan(&m.ID, &m.Username, &m.Content, &m.Timestamp, &m.ReplyToID, &m.RoomID, &m.Deleted, &m.Edited, &m.ToUser, &m.GroupName, &m.ThreadID)
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

// populateFTS5 backfills the FTS5 index for any messages not yet indexed.
func (s *Store) populateFTS5() {
	result, err := s.db.Exec(
		"INSERT OR IGNORE INTO messages_fts(rowid, content, username, room_id) SELECT rowid, content, username, room_id FROM messages",
	)
	if err != nil {
		log.Printf("store: FTS5 population warning: %v", err)
		return
	}
	if n, _ := result.RowsAffected(); n > 0 {
		log.Printf("store: FTS5 backfilled %d pre-existing messages", n)
	}
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

// sanitizeFTS5Query strips FTS5 expression operators from user input
// to prevent syntax errors and expression injection.
func sanitizeFTS5Query(q string) string {
	var b strings.Builder
	for _, r := range q {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == ' ' || r >= 0x4e00 {
			b.WriteRune(r)
		}
	}
	cleaned := strings.TrimSpace(b.String())
	if cleaned == "" {
		return ""
	}
	fields := strings.Fields(cleaned)
	b.Reset()
	for i, f := range fields {
		if i > 0 {
			b.WriteByte(' ')
		}
		b.WriteString(f)
		b.WriteByte('*')
	}
	return b.String()
}

// SearchMessages performs a full-text search over messages using FTS5.
func (s *Store) SearchMessages(query string, roomID string, limit int) ([]SearchResult, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 20
	}

	query = sanitizeFTS5Query(query)
	if query == "" {
		return []SearchResult{}, nil
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
	if err := rows.Err(); err != nil {
		log.Printf("store: rows iteration error: %v", err)
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
	if err := rows.Err(); err != nil {
		log.Printf("store: rows iteration error: %v", err)
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
	_, err := s.db.Exec("INSERT OR IGNORE INTO group_members (group_name, username, role) VALUES (?, ?, 'owner')", name, creator)
	if err != nil {
		return err
	}
	_, err = s.db.Exec("INSERT OR IGNORE INTO groups_info (name, owner, created_at) VALUES (?, ?, ?)", name, creator, time.Now().UnixMilli())
	return err
}

func (s *Store) AddGroupMember(groupName, username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("INSERT OR IGNORE INTO group_members (group_name, username, role) VALUES (?, ?, 'member')", groupName, username)
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
	if err := rows.Err(); err != nil {
		log.Printf("store: rows iteration error: %v", err)
	}
	if members == nil {
		members = []string{}
	}
	return members
}

// GetGroupMembersWithRoles returns all members of a group with their roles.
func (s *Store) GetGroupMembersWithRoles(groupName string) []GroupMemberInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows, err := s.db.Query("SELECT username, role FROM group_members WHERE group_name = ?", groupName)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var members []GroupMemberInfo
	for rows.Next() {
		var m GroupMemberInfo
		if err := rows.Scan(&m.Username, &m.Role); err == nil {
			members = append(members, m)
		}
	}
	if err := rows.Err(); err != nil {
		log.Printf("store: rows iteration error: %v", err)
	}
	if members == nil {
		members = []GroupMemberInfo{}
	}
	return members
}

// SetGroupMemberRole updates a member's role in a group.
func (s *Store) SetGroupMemberRole(groupName, username, role string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("UPDATE group_members SET role = ? WHERE group_name = ? AND username = ?", role, groupName, username)
	return err
}

// GetGroupMemberRole returns the role of a member in a group.
func (s *Store) GetGroupMemberRole(groupName, username string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var role string
	err := s.db.QueryRow("SELECT role FROM group_members WHERE group_name = ? AND username = ?", groupName, username).Scan(&role)
	if err != nil {
		return "", err
	}
	return role, nil
}

// KickGroupMember removes a member from a group (permission check should be done by caller).
func (s *Store) KickGroupMember(groupName, username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("DELETE FROM group_members WHERE group_name = ? AND username = ?", groupName, username)
	return err
}

// UpdateGroupName renames a group in all tables.
func (s *Store) UpdateGroupName(oldName, newName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("UPDATE groups_info SET name = ? WHERE name = ?", newName, oldName); err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE group_members SET group_name = ? WHERE group_name = ?", newName, oldName); err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE messages SET group_name = ? WHERE group_name = ?", newName, oldName); err != nil {
		return err
	}
	return tx.Commit()
}

// TransferGroupOwnership changes the owner of a group.
func (s *Store) TransferGroupOwnership(groupName, newOwner string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("UPDATE groups_info SET owner = ? WHERE name = ?", newOwner, groupName); err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE group_members SET role = 'admin' WHERE group_name = ? AND role = 'owner'", groupName); err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE group_members SET role = 'owner' WHERE group_name = ? AND username = ?", groupName, newOwner); err != nil {
		return err
	}
	return tx.Commit()
}

// LeaveGroup removes a user from a group. If the user is the owner, transfers
// ownership to the oldest admin or deletes the group if no admin exists.
func (s *Store) LeaveGroup(groupName, username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var owner string
	err := s.db.QueryRow("SELECT owner FROM groups_info WHERE name = ?", groupName).Scan(&owner)
	if err != nil {
		return err
	}

	if username == owner {
		var oldestAdmin string
		err := s.db.QueryRow("SELECT username FROM group_members WHERE group_name = ? AND role = 'admin' AND username != ? ORDER BY rowid LIMIT 1", groupName, username).Scan(&oldestAdmin)
		if err == nil && oldestAdmin != "" {
			if _, err := s.db.Exec("UPDATE groups_info SET owner = ? WHERE name = ?", oldestAdmin, groupName); err != nil {
				return err
			}
			if _, err := s.db.Exec("UPDATE group_members SET role = 'owner' WHERE group_name = ? AND username = ?", groupName, oldestAdmin); err != nil {
				return err
			}
			if _, err := s.db.Exec("DELETE FROM group_members WHERE group_name = ? AND username = ?", groupName, username); err != nil {
				return err
			}
			return nil
		}

		var anyMember string
		err = s.db.QueryRow("SELECT username FROM group_members WHERE group_name = ? AND username != ? ORDER BY rowid LIMIT 1", groupName, username).Scan(&anyMember)
		if err == nil && anyMember != "" {
			if _, err := s.db.Exec("UPDATE groups_info SET owner = ? WHERE name = ?", anyMember, groupName); err != nil {
				return err
			}
			if _, err := s.db.Exec("UPDATE group_members SET role = 'owner' WHERE group_name = ? AND username = ?", groupName, anyMember); err != nil {
				return err
			}
			if _, err := s.db.Exec("DELETE FROM group_members WHERE group_name = ? AND username = ?", groupName, username); err != nil {
				return err
			}
			return nil
		}

		if _, err := s.db.Exec("DELETE FROM group_members WHERE group_name = ?", groupName); err != nil {
			return err
		}
		if _, err := s.db.Exec("DELETE FROM groups_info WHERE name = ?", groupName); err != nil {
			return err
		}
		return nil
	}

	_, err = s.db.Exec("DELETE FROM group_members WHERE group_name = ? AND username = ?", groupName, username)
	return err
}

// GetGroupInfo returns metadata for a group.
func (s *Store) GetGroupInfo(groupName string) (*GroupInfo, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var info GroupInfo
	err := s.db.QueryRow("SELECT name, owner, created_at, description, avatar_url FROM groups_info WHERE name = ?", groupName).Scan(&info.Name, &info.Owner, &info.CreatedAt, &info.Description, &info.AvatarURL)
	if err != nil {
		return nil, err
	}

	var count int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM group_members WHERE group_name = ?", groupName).Scan(&count); err != nil {
		log.Printf("store: GetGroupInfo count error: %v", err)
	}
	info.MemberCount = count
	return &info, nil
}

// GetGroupOwner returns the owner of a group.
func (s *Store) GetGroupOwner(groupName string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var owner string
	err := s.db.QueryRow("SELECT owner FROM groups_info WHERE name = ?", groupName).Scan(&owner)
	return owner, err
}

// DeleteGroup completely removes a group and all its members.
func (s *Store) DeleteGroup(groupName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.db.Exec("DELETE FROM group_members WHERE group_name = ?", groupName); err != nil {
		return err
	}
	_, err := s.db.Exec("DELETE FROM groups_info WHERE name = ?", groupName)
	return err
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
	if err := rows.Err(); err != nil {
		log.Printf("store: rows iteration error: %v", err)
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
	if err := rows.Err(); err != nil {
		log.Printf("store: rows iteration error: %v", err)
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
		"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name, thread_id FROM messages WHERE to_user = ? AND deleted = 0 AND delivered = 0 ORDER BY timestamp ASC LIMIT ?",
		username, limit,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var msgs []StoredMessage
	for rows.Next() {
		var m StoredMessage
		if err := rows.Scan(&m.ID, &m.Username, &m.Content, &m.Timestamp, &m.ReplyToID, &m.RoomID, &m.Deleted, &m.Edited, &m.ToUser, &m.GroupName, &m.ThreadID); err != nil {
			continue
		}
		msgs = append(msgs, m)
	}
	if err := rows.Err(); err != nil {
		log.Printf("store: rows iteration error: %v", err)
	}
	if msgs == nil {
		msgs = []StoredMessage{}
	}
	return msgs
}

// MarkMessagesDelivered marks a set of message IDs as delivered.
func (s *Store) MarkMessagesDelivered(ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	// Build a single batch UPDATE with IN clause.
	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	query := "UPDATE messages SET delivered = 1 WHERE id IN (" + strings.Join(placeholders, ",") + ")"
	_, err := s.db.Exec(query, args...)
	return err
}


// --- User blocking ---

func (s *Store) BlockUser(username, blocked string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("INSERT OR IGNORE INTO blocked_users (username, blocked) VALUES (?, ?)", username, blocked)
	return err
}

func (s *Store) UnblockUser(username, blocked string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("DELETE FROM blocked_users WHERE username = ? AND blocked = ?", username, blocked)
	return err
}

func (s *Store) IsBlocked(username, blocked string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var count int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM blocked_users WHERE username = ? AND blocked = ?", username, blocked).Scan(&count); err != nil {
		log.Printf("store: IsBlocked error: %v", err)
		return false
	}
	return count > 0
}

func (s *Store) GetBlockedUsers(username string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows, err := s.db.Query("SELECT blocked FROM blocked_users WHERE username = ?", username)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var blocked []string
	for rows.Next() {
		var b string
		if err := rows.Scan(&b); err == nil {
			blocked = append(blocked, b)
		}
	}
	if err := rows.Err(); err != nil {
		log.Printf("store: rows iteration error: %v", err)
	}
	if blocked == nil {
		blocked = []string{}
	}
	return blocked
}


// --- Message pinning ---

func (s *Store) PinMessage(roomID, messageID, pinnedBy string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(
		"INSERT OR IGNORE INTO pinned_messages (room_id, message_id, pinned_by, pinned_at) VALUES (?, ?, ?, ?)",
		roomID, messageID, pinnedBy, time.Now().UnixMilli(),
	)
	return err
}

func (s *Store) UnpinMessage(roomID, messageID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("DELETE FROM pinned_messages WHERE room_id = ? AND message_id = ?", roomID, messageID)
	return err
}

func (s *Store) GetPinnedMessages(roomID string) []StoredMessage {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows, err := s.db.Query(
		"SELECT m.id, m.username, m.content, m.timestamp, m.reply_to_id, m.room_id, m.deleted, m.edited, m.to_user, m.group_name FROM pinned_messages p JOIN messages m ON p.message_id = m.id WHERE p.room_id = ? ORDER BY p.pinned_at DESC",
		roomID,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var msgs []StoredMessage
	for rows.Next() {
		var m StoredMessage
		if err := rows.Scan(&m.ID, &m.Username, &m.Content, &m.Timestamp, &m.ReplyToID, &m.RoomID, &m.Deleted, &m.Edited, &m.ToUser, &m.GroupName, &m.ThreadID); err != nil {
			continue
		}
		if m.Deleted {
			m.Content = ""
		}
		msgs = append(msgs, m)
	}
	if err := rows.Err(); err != nil {
		log.Printf("store: rows iteration error: %v", err)
	}
	if msgs == nil {
		msgs = []StoredMessage{}
	}
	return msgs
}

	// --- Conversation pinning ---

	func (s *Store) PinConversation(username, key string) error {
		s.mu.Lock()
		defer s.mu.Unlock()
		_, err := s.db.Exec("INSERT OR IGNORE INTO pinned_conversations (username, key) VALUES (?, ?)", username, key)
		return err
	}

	func (s *Store) UnpinConversation(username, key string) error {
		s.mu.Lock()
		defer s.mu.Unlock()
		_, err := s.db.Exec("DELETE FROM pinned_conversations WHERE username = ? AND key = ?", username, key)
		return err
	}

	func (s *Store) ListPinnedConversations(username string) []string {
		s.mu.RLock()
		defer s.mu.RUnlock()
		rows, err := s.db.Query("SELECT key FROM pinned_conversations WHERE username = ? ORDER BY rowid", username)
		if err != nil {
			return nil
		}
		defer rows.Close()
		var keys []string
		for rows.Next() {
			var k string
			if err := rows.Scan(&k); err == nil {
				keys = append(keys, k)
			}
		}
		if err := rows.Err(); err != nil {
			log.Printf("store: rows iteration error: %v", err)
		}
		if keys == nil {
			keys = []string{}
		}
		return keys
	}

	// --- Conversation muting ---

	func (s *Store) MuteConversation(username, key string) error {
		s.mu.Lock()
		defer s.mu.Unlock()
		_, err := s.db.Exec("INSERT OR IGNORE INTO muted_conversations (username, key) VALUES (?, ?)", username, key)
		return err
	}

	func (s *Store) UnmuteConversation(username, key string) error {
		s.mu.Lock()
		defer s.mu.Unlock()
		_, err := s.db.Exec("DELETE FROM muted_conversations WHERE username = ? AND key = ?", username, key)
		return err
	}

	func (s *Store) ListMutedConversations(username string) []string {
		s.mu.RLock()
		defer s.mu.RUnlock()
		rows, err := s.db.Query("SELECT key FROM muted_conversations WHERE username = ? ORDER BY rowid", username)
		if err != nil {
			return nil
		}
		defer rows.Close()
		var keys []string
		for rows.Next() {
			var k string
			if err := rows.Scan(&k); err == nil {
				keys = append(keys, k)
			}
		}
		if err := rows.Err(); err != nil {
			log.Printf("store: rows iteration error: %v", err)
		}
		if keys == nil {
			keys = []string{}
		}
		return keys
	}

	func (s *Store) IsConversationMuted(username, key string) bool {
		s.mu.RLock()
		defer s.mu.RUnlock()
		var count int
		if err := s.db.QueryRow("SELECT COUNT(*) FROM muted_conversations WHERE username = ? AND key = ?", username, key).Scan(&count); err != nil {
			log.Printf("store: IsConversationMuted error: %v", err)
			return false
		}
		return count > 0
	}

	// --- Conversation archiving ---

	func (s *Store) ArchiveConversation(username, key string) error {
		s.mu.Lock()
		defer s.mu.Unlock()
		_, err := s.db.Exec("INSERT OR IGNORE INTO archived_conversations (username, key) VALUES (?, ?)", username, key)
		return err
	}

	func (s *Store) UnarchiveConversation(username, key string) error {
		s.mu.Lock()
		defer s.mu.Unlock()
		_, err := s.db.Exec("DELETE FROM archived_conversations WHERE username = ? AND key = ?", username, key)
		return err
	}

	func (s *Store) ListArchivedConversations(username string) []string {
		s.mu.RLock()
		defer s.mu.RUnlock()
		rows, err := s.db.Query("SELECT key FROM archived_conversations WHERE username = ? ORDER BY rowid", username)
		if err != nil {
			return nil
		}
		defer rows.Close()
		var keys []string
		for rows.Next() {
			var k string
			if err := rows.Scan(&k); err == nil {
				keys = append(keys, k)
			}
		}
		if err := rows.Err(); err != nil {
			log.Printf("store: rows iteration error: %v", err)
		}
		if keys == nil {
			keys = []string{}
		}
		return keys
	}

	func (s *Store) IsConversationArchived(username, key string) bool {
		s.mu.RLock()
		defer s.mu.RUnlock()
		var count int
		if err := s.db.QueryRow("SELECT COUNT(*) FROM archived_conversations WHERE username = ? AND key = ?", username, key).Scan(&count); err != nil {
			log.Printf("store: IsConversationArchived error: %v", err)
			return false
		}
		return count > 0
	}

	// --- Threaded replies ---

	// GetThreadMessages returns messages in a thread, ordered by creation time ascending.
	func (s *Store) GetThreadMessages(parentMessageID string) []StoredMessage {
		s.mu.RLock()
		defer s.mu.RUnlock()

		rows, err := s.db.Query(
			"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name, thread_id FROM messages WHERE thread_id = ? AND deleted = 0 ORDER BY timestamp ASC",
			parentMessageID,
		)
		if err != nil {
			log.Printf("store: GetThreadMessages query error: %v", err)
			return nil
		}
		defer rows.Close()

		messages := make([]StoredMessage, 0)
		for rows.Next() {
			var m StoredMessage
			if err := rows.Scan(&m.ID, &m.Username, &m.Content, &m.Timestamp, &m.ReplyToID, &m.RoomID, &m.Deleted, &m.Edited, &m.ToUser, &m.GroupName, &m.ThreadID); err != nil {
				log.Printf("store: GetThreadMessages scan error: %v", err)
				continue
			}
			messages = append(messages, m)
		}
		if err := rows.Err(); err != nil {
			log.Printf("store: GetThreadMessages iteration error: %v", err)
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

	// GetThreadReplyCount returns the number of replies in a thread.
	func (s *Store) GetThreadReplyCount(parentMessageID string) int {
		s.mu.RLock()
		defer s.mu.RUnlock()
		var count int
		if err := s.db.QueryRow(
			"SELECT COUNT(*) FROM messages WHERE thread_id = ? AND deleted = 0",
			parentMessageID,
		).Scan(&count); err != nil {
			log.Printf("store: GetThreadReplyCount error: %v", err)
			return 0
		}
		return count
	}

	// --- Notification preferences ---

	// SetNotificationPrefs upserts notification preferences for a (username, key) pair.
	func (s *Store) SetNotificationPrefs(username, key string, mutedUntil int64, showPreview bool) error {
		s.mu.Lock()
		defer s.mu.Unlock()

		showPreviewInt := 0
		if showPreview {
			showPreviewInt = 1
		}
		_, err := s.db.Exec(
			"INSERT INTO notification_prefs (username, key, muted_until, show_preview) VALUES (?, ?, ?, ?) ON CONFLICT(username, key) DO UPDATE SET muted_until = excluded.muted_until, show_preview = excluded.show_preview",
			username, key, mutedUntil, showPreviewInt,
		)
		return err
	}

	// GetNotificationPrefs returns the notification preferences for a (username, key) pair.
	func (s *Store) GetNotificationPrefs(username, key string) (mutedUntil int64, showPreview bool, err error) {
		s.mu.RLock()
		defer s.mu.RUnlock()

		var showPreviewInt int
		err = s.db.QueryRow(
			"SELECT muted_until, show_preview FROM notification_prefs WHERE username = ? AND key = ?",
			username, key,
		).Scan(&mutedUntil, &showPreviewInt)
		if err != nil {
			if err.Error() == "sql: no rows in result set" {
				return 0, true, nil
			}
			return 0, true, err
		}
		return mutedUntil, showPreviewInt != 0, nil
	}

	// ListNotificationPrefs returns all notification preference records for a user.
	func (s *Store) ListNotificationPrefs(username string) []NotificationPref {
		s.mu.RLock()
		defer s.mu.RUnlock()

		rows, err := s.db.Query(
			"SELECT key, muted_until, show_preview FROM notification_prefs WHERE username = ? ORDER BY rowid",
			username,
		)
		if err != nil {
			return nil
		}
		defer rows.Close()

		var prefs []NotificationPref
		for rows.Next() {
			var p NotificationPref
			var showPreviewInt int
			if err := rows.Scan(&p.Key, &p.MutedUntil, &showPreviewInt); err != nil {
				continue
			}
			p.ShowPreview = showPreviewInt != 0
			prefs = append(prefs, p)
		}
		if err := rows.Err(); err != nil {
			log.Printf("store: ListNotificationPrefs iteration error: %v", err)
		}
		if prefs == nil {
			prefs = []NotificationPref{}
		}
		return prefs
	}


// --- User profiles ---

// UpsertUserProfile inserts or updates a user profile.
func (s *Store) UpsertUserProfile(username, displayName, avatarURL, bio, status string, lastSeen int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(
		"INSERT INTO user_profiles (username, display_name, avatar_url, bio, status, last_seen) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET display_name = excluded.display_name, avatar_url = excluded.avatar_url, bio = excluded.bio, status = excluded.status, last_seen = excluded.last_seen",
		username, displayName, avatarURL, bio, status, lastSeen,
	)
	return err
}

// GetUserProfile returns a user profile by username.
func (s *Store) GetUserProfile(username string) (*UserProfile, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var p UserProfile
	err := s.db.QueryRow(
		"SELECT username, display_name, avatar_url, bio, status, last_seen FROM user_profiles WHERE username = ?",
		username,
	).Scan(&p.Username, &p.DisplayName, &p.AvatarURL, &p.Bio, &p.Status, &p.LastSeen)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// UpdateUserStatus updates the custom status for a user.
func (s *Store) UpdateUserStatus(username, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("UPDATE user_profiles SET status = ? WHERE username = ?", status, username)
	return err
}

// UpdateUserLastSeen updates the last seen timestamp for a user.
func (s *Store) UpdateUserLastSeen(username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	ts := time.Now().UnixMilli()
	_, err := s.db.Exec(
		"INSERT INTO user_profiles (username, last_seen) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET last_seen = excluded.last_seen",
		username, ts,
	)
	return err
}

// GetAllUserProfiles returns all user profiles.
func (s *Store) GetAllUserProfiles() ([]UserProfile, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows, err := s.db.Query("SELECT username, display_name, avatar_url, bio, status, last_seen FROM user_profiles ORDER BY username")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var profiles []UserProfile
	for rows.Next() {
		var p UserProfile
		if err := rows.Scan(&p.Username, &p.DisplayName, &p.AvatarURL, &p.Bio, &p.Status, &p.LastSeen); err != nil {
			continue
		}
		profiles = append(profiles, p)
	}
	if profiles == nil {
		profiles = []UserProfile{}
	}
	return profiles, rows.Err()
}

// --- Polls ---

// CreatePoll inserts a new poll.
func (s *Store) CreatePoll(poll *Poll) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	optsJSON, _ := json.Marshal(poll.Options)
	votesJSON, _ := json.Marshal(poll.Votes)
	votersJSON, _ := json.Marshal(poll.Voters)
	_, err := s.db.Exec(
		"INSERT INTO polls (id, room_id, creator, question, options, multiple_choice, is_anonymous, is_closed, votes, voters, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		poll.ID, poll.RoomID, poll.Creator, poll.Question, string(optsJSON),
		boolToInt(poll.MultipleChoice), boolToInt(poll.IsAnonymous), 0,
		string(votesJSON), string(votersJSON), poll.CreatedAt,
	)
	return err
}

// GetPoll returns a poll by ID.
func (s *Store) GetPoll(pollID string) (*Poll, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var p Poll
	var optsJSON, votesJSON, votersJSON string
	var mc, anon, closed int
	err := s.db.QueryRow(
		"SELECT id, room_id, creator, question, options, multiple_choice, is_anonymous, is_closed, votes, voters, created_at FROM polls WHERE id = ?",
		pollID,
	).Scan(&p.ID, &p.RoomID, &p.Creator, &p.Question, &optsJSON, &mc, &anon, &closed, &votesJSON, &votersJSON, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	p.MultipleChoice = mc != 0
	p.IsAnonymous = anon != 0
	p.IsClosed = closed != 0
	json.Unmarshal([]byte(optsJSON), &p.Options)
	json.Unmarshal([]byte(votesJSON), &p.Votes)
	json.Unmarshal([]byte(votersJSON), &p.Voters)
	if p.Options == nil {
		p.Options = []string{}
	}
	if p.Votes == nil {
		p.Votes = make(map[int]int)
	}
	if p.Voters == nil {
		p.Voters = make(map[int][]string)
	}
	return &p, nil
}

// VotePoll records a vote for a poll option.
func (s *Store) VotePoll(pollID string, username string, optionIndex int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var optsJSON, votesJSON, votersJSON string
	err := s.db.QueryRow("SELECT options, votes, voters FROM polls WHERE id = ?", pollID).Scan(&optsJSON, &votesJSON, &votersJSON)
	if err != nil {
		return err
	}

	var options []string
	var votes map[int]int
	var voters map[int][]string
	json.Unmarshal([]byte(optsJSON), &options)
	json.Unmarshal([]byte(votesJSON), &votes)
	json.Unmarshal([]byte(votersJSON), &voters)
	if votes == nil {
		votes = make(map[int]int)
	}
	if voters == nil {
		voters = make(map[int][]string)
	}

	for _, v := range voters[optionIndex] {
		if v == username {
			return nil
		}
	}

	votes[optionIndex]++
	voters[optionIndex] = append(voters[optionIndex], username)

	newVotesJSON, _ := json.Marshal(votes)
	newVotersJSON, _ := json.Marshal(voters)
	_, err = s.db.Exec("UPDATE polls SET votes = ?, voters = ? WHERE id = ?", string(newVotesJSON), string(newVotersJSON), pollID)
	return err
}

// ClosePoll marks a poll as closed.
func (s *Store) ClosePoll(pollID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("UPDATE polls SET is_closed = 1 WHERE id = ?", pollID)
	return err
}

// --- Scheduled messages ---

// ScheduleMessage inserts a new scheduled message.
func (s *Store) ScheduleMessage(msg ScheduledMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(
		"INSERT INTO scheduled_messages (id, username, content, room_id, to_user, group_name, reply_to_id, thread_id, send_at, created_at, sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
		msg.ID, msg.Username, msg.Content, msg.RoomID, msg.ToUser, msg.GroupName, msg.ReplyToID, msg.ThreadID, msg.SendAt, msg.CreatedAt,
	)
	return err
}

// GetPendingScheduledMessages returns unsent messages where send_at <= now.
func (s *Store) GetPendingScheduledMessages(ctx context.Context) ([]ScheduledMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	now := time.Now().UnixMilli()
	rows, err := s.db.Query(
		"SELECT id, username, content, room_id, to_user, group_name, reply_to_id, thread_id, send_at, created_at, sent FROM scheduled_messages WHERE sent = 0 AND send_at <= ? ORDER BY send_at ASC",
		now,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var msgs []ScheduledMessage
	for rows.Next() {
		var m ScheduledMessage
		if err := rows.Scan(&m.ID, &m.Username, &m.Content, &m.RoomID, &m.ToUser, &m.GroupName, &m.ReplyToID, &m.ThreadID, &m.SendAt, &m.CreatedAt, &m.Sent); err != nil {
			log.Printf("store: scheduled message scan error: %v", err)
			continue
		}
		msgs = append(msgs, m)
	}
	if err := rows.Err(); err != nil {
		log.Printf("store: scheduled messages iteration error: %v", err)
	}
	if msgs == nil {
		msgs = []ScheduledMessage{}
	}
	return msgs, nil
}

// MarkScheduledSent marks a scheduled message as sent.
func (s *Store) MarkScheduledSent(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("UPDATE scheduled_messages SET sent = 1 WHERE id = ?", id)
	return err
}

// CancelScheduledMessage deletes a scheduled message. Only the owner can cancel.
func (s *Store) CancelScheduledMessage(id, username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("DELETE FROM scheduled_messages WHERE id = ? AND username = ?", id, username)
	return err
}

// GetUserScheduledMessages returns all scheduled messages for a user.
func (s *Store) GetUserScheduledMessages(username string) ([]ScheduledMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows, err := s.db.Query(
		"SELECT id, username, content, room_id, to_user, group_name, reply_to_id, thread_id, send_at, created_at, sent FROM scheduled_messages WHERE username = ? AND sent = 0 ORDER BY send_at ASC",
		username,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var msgs []ScheduledMessage
	for rows.Next() {
		var m ScheduledMessage
		if err := rows.Scan(&m.ID, &m.Username, &m.Content, &m.RoomID, &m.ToUser, &m.GroupName, &m.ReplyToID, &m.ThreadID, &m.SendAt, &m.CreatedAt, &m.Sent); err != nil {
			log.Printf("store: user scheduled message scan error: %v", err)
			continue
		}
		msgs = append(msgs, m)
	}
	if err := rows.Err(); err != nil {
		log.Printf("store: user scheduled messages iteration error: %v", err)
	}
	if msgs == nil {
		msgs = []ScheduledMessage{}
	}
	return msgs, nil
}

// ExportMessages returns messages for a specific conversation, ordered by timestamp ascending.
// For room export: pass roomID; for group export: pass groupName;
// for DM export: pass toUser (peer) and username (current user).
// limit caps the result count; 0 or negative means no limit (max 10000).
func (s *Store) ExportMessages(ctx context.Context, roomID string, toUser string, groupName string, username string, limit int) ([]StoredMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 10000
	}

	var rows *sql.Rows
	var err error

	switch {
	case groupName != "":
		rows, err = s.db.Query(
			"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name, thread_id FROM messages WHERE group_name = ? AND deleted = 0 ORDER BY timestamp ASC LIMIT ?",
			groupName, limit,
		)
	case toUser != "" && username != "":
		rows, err = s.db.Query(
			"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name, thread_id FROM messages WHERE deleted = 0 AND ((username = ? AND to_user = ?) OR (username = ? AND to_user = ?)) ORDER BY timestamp ASC LIMIT ?",
			username, toUser, toUser, username, limit,
		)
	case roomID != "":
		rows, err = s.db.Query(
			"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name, thread_id FROM messages WHERE room_id = ? AND deleted = 0 ORDER BY timestamp ASC LIMIT ?",
			roomID, limit,
		)
	default:
		// Public chat (no to_user, no group_name, no specific room_id).
		rows, err = s.db.Query(
			"SELECT id, username, content, timestamp, reply_to_id, room_id, deleted, edited, to_user, group_name, thread_id FROM messages WHERE to_user = '' AND group_name = '' AND deleted = 0 ORDER BY timestamp ASC LIMIT ?",
			limit,
		)
	}

	if err != nil {
		return nil, fmt.Errorf("store: ExportMessages query error: %w", err)
	}
	defer rows.Close()

	messages := make([]StoredMessage, 0, limit)
	for rows.Next() {
		var m StoredMessage
		if err := rows.Scan(&m.ID, &m.Username, &m.Content, &m.Timestamp, &m.ReplyToID, &m.RoomID, &m.Deleted, &m.Edited, &m.ToUser, &m.GroupName, &m.ThreadID); err != nil {
			log.Printf("store: ExportMessages scan error: %v", err)
			continue
		}
		if m.Deleted {
			m.Content = ""
		}
		messages = append(messages, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store: ExportMessages iteration error: %w", err)
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

	if messages == nil {
		messages = []StoredMessage{}
	}
	return messages, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// --- Custom Emoji ---

// AddCustomEmoji adds a new custom emoji.
func (s *Store) AddCustomEmoji(name, url, uploader, roomID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := uuid.New().String()
	now := time.Now().UnixMilli()
	_, err := s.db.Exec(
		"INSERT INTO custom_emojis (id, name, url, uploader, room_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		id, name, url, uploader, roomID, now,
	)
	return err
}

// ListCustomEmojis returns all custom emojis, optionally filtered by room.
func (s *Store) ListCustomEmojis(roomID string) ([]CustomEmoji, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var rows *sql.Rows
	var err error
	if roomID != "" {
		rows, err = s.db.Query(
			"SELECT id, name, url, uploader, room_id, created_at FROM custom_emojis WHERE room_id = ? OR room_id = '' ORDER BY created_at DESC",
			roomID,
		)
	} else {
		rows, err = s.db.Query(
			"SELECT id, name, url, uploader, room_id, created_at FROM custom_emojis ORDER BY created_at DESC",
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []CustomEmoji
	for rows.Next() {
		var e CustomEmoji
		if err := rows.Scan(&e.ID, &e.Name, &e.URL, &e.Uploader, &e.RoomID, &e.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, rows.Err()
}

// DeleteCustomEmoji removes a custom emoji by name (only the uploader can delete).
func (s *Store) DeleteCustomEmoji(name, username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(
		"DELETE FROM custom_emojis WHERE name = ? AND uploader = ?",
		name, username,
	)
	return err
}

// SearchCustomEmojis searches custom emojis by name prefix.
func (s *Store) SearchCustomEmojis(query string) ([]CustomEmoji, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(
		"SELECT id, name, url, uploader, room_id, created_at FROM custom_emojis WHERE name LIKE ? ORDER BY created_at DESC LIMIT 20",
		query+"%",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []CustomEmoji
	for rows.Next() {
		var e CustomEmoji
		if err := rows.Scan(&e.ID, &e.Name, &e.URL, &e.Uploader, &e.RoomID, &e.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, rows.Err()
}

// LogCall inserts a new call history record.
func (s *Store) LogCall(call CallRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(
		"INSERT INTO call_history (id, caller, callee, call_type, status, started_at, ended_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		call.ID, call.Caller, call.Callee, call.CallType, call.Status, call.StartedAt, call.EndedAt, call.CreatedAt,
	)
	return err
}

// UpdateCallRecord updates the status and timestamps of an existing call record.
func (s *Store) UpdateCallRecord(id, status string, startedAt, endedAt int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(
		"UPDATE call_history SET status = ?, started_at = ?, ended_at = ? WHERE id = ?",
		status, startedAt, endedAt, id,
	)
	return err
}

// GetCallHistory returns recent call history for a user (as caller or callee).
func (s *Store) GetCallHistory(username string, limit int) ([]CallRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.Query(
		"SELECT id, caller, callee, call_type, status, started_at, ended_at, created_at FROM call_history WHERE caller = ? OR callee = ? ORDER BY created_at DESC LIMIT ?",
		username, username, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var calls []CallRecord
	for rows.Next() {
		var c CallRecord
		var startedAt, endedAt sql.NullInt64
		if err := rows.Scan(&c.ID, &c.Caller, &c.Callee, &c.CallType, &c.Status, &startedAt, &endedAt, &c.CreatedAt); err != nil {
			continue
		}
		if startedAt.Valid {
			c.StartedAt = startedAt.Int64
		}
		if endedAt.Valid {
			c.EndedAt = endedAt.Int64
		}
		calls = append(calls, c)
	}
	if calls == nil {
		calls = []CallRecord{}
	}
	return calls, rows.Err()
}


// --- Chat Folders ---

// CreateChatFolder creates a new folder for a user.
func (s *Store) CreateChatFolder(username, name string) (*ChatFolder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := uuid.New().String()
	now := time.Now().UnixMilli()
	_, err := s.db.Exec(
		"INSERT INTO chat_folders (id, username, name, created_at) VALUES (?, ?, ?, ?)",
		id, username, name, now,
	)
	if err != nil {
		return nil, err
	}
	return &ChatFolder{ID: id, Username: username, Name: name, CreatedAt: now}, nil
}

// DeleteChatFolder removes a folder and its items.
func (s *Store) DeleteChatFolder(username, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec("DELETE FROM chat_folder_items WHERE folder_id = ?", id)
	if err != nil {
		return err
	}
	_, err = tx.Exec("DELETE FROM chat_folders WHERE id = ? AND username = ?", id, username)
	if err != nil {
		return err
	}
	return tx.Commit()
}

// RenameChatFolder renames a folder owned by the user.
func (s *Store) RenameChatFolder(username, id, newName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(
		"UPDATE chat_folders SET name = ? WHERE id = ? AND username = ?",
		newName, id, username,
	)
	return err
}

// AddToFolder adds a conversation key to a folder.
func (s *Store) AddToFolder(folderID, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(
		"INSERT OR IGNORE INTO chat_folder_items (folder_id, key) VALUES (?, ?)",
		folderID, key,
	)
	return err
}

// RemoveFromFolder removes a conversation key from a folder.
func (s *Store) RemoveFromFolder(folderID, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(
		"DELETE FROM chat_folder_items WHERE folder_id = ? AND key = ?",
		folderID, key,
	)
	return err
}

// ListFolders returns all folders for a user with item counts.
func (s *Store) ListFolders(username string) ([]ChatFolder, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(
		`SELECT f.id, f.username, f.name, f.sort_order, f.created_at,
			(SELECT COUNT(*) FROM chat_folder_items WHERE folder_id = f.id) as item_count
		FROM chat_folders f WHERE f.username = ? ORDER BY f.sort_order, f.created_at`,
		username,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var folders []ChatFolder
	for rows.Next() {
		var f ChatFolder
		if err := rows.Scan(&f.ID, &f.Username, &f.Name, &f.SortOrder, &f.CreatedAt, &f.ItemCount); err != nil {
			return nil, err
		}
		folders = append(folders, f)
	}
	if folders == nil {
		folders = []ChatFolder{}
	}
	return folders, rows.Err()
}

// GetFolderItems returns all conversation keys in a folder.
func (s *Store) GetFolderItems(folderID string) ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(
		"SELECT key FROM chat_folder_items WHERE folder_id = ? ORDER BY sort_order",
		folderID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

// --- Webhooks ---

// CreateWebhook inserts a new webhook for a group.
func (s *Store) CreateWebhook(id, groupName, url, secret, createdBy string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UnixMilli()
	_, err := s.db.Exec(
		"INSERT INTO webhooks (id, group_name, url, secret, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		id, groupName, url, secret, createdBy, now,
	)
	return err
}

// DeleteWebhook removes a webhook by ID and group name.
func (s *Store) DeleteWebhook(id, groupName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("DELETE FROM webhooks WHERE id = ? AND group_name = ?", id, groupName)
	return err
}

// ListWebhooks returns all webhooks for a group.
func (s *Store) ListWebhooks(groupName string) ([]Webhook, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows, err := s.db.Query(
		"SELECT id, group_name, url, secret, created_by, created_at FROM webhooks WHERE group_name = ? ORDER BY created_at",
		groupName,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []Webhook
	for rows.Next() {
		var w Webhook
		if err := rows.Scan(&w.ID, &w.GroupName, &w.URL, &w.Secret, &w.CreatedBy, &w.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, w)
	}
	if result == nil {
		result = []Webhook{}
	}
	return result, rows.Err()
}

// GetWebhookByURL looks up a webhook by its URL path.
func (s *Store) GetWebhookByURL(url string) (*Webhook, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var w Webhook
	err := s.db.QueryRow(
		"SELECT id, group_name, url, secret, created_by, created_at FROM webhooks WHERE url = ?",
		url,
	).Scan(&w.ID, &w.GroupName, &w.URL, &w.Secret, &w.CreatedBy, &w.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

// --- User registration and authentication ---

const inviteCodeChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const inviteCodeLength = 8

// hashPassword hashes a password using SHA-256 with a random salt.
// NOTE: For production deployment with network access, prefer bcrypt
// (golang.org/x/crypto/bcrypt) which provides adaptive cost and built-in salting.
func hashPassword(password string) string {
	salt := make([]byte, 16)
	rand.Read(salt)
	h := sha256.Sum256(append(salt, []byte(password)...))
	return hex.EncodeToString(salt) + ":" + hex.EncodeToString(h[:])
}

// checkPassword verifies a plaintext password against a salted SHA-256 hash.
func checkPassword(hash, password string) bool {
	parts := strings.SplitN(hash, ":", 2)
	if len(parts) != 2 {
		return false
	}
	salt, err := hex.DecodeString(parts[0])
	if err != nil {
		return false
	}
	h := sha256.Sum256(append(salt, []byte(password)...))
	return hex.EncodeToString(h[:]) == parts[1]
}

// RegisterUser validates the invite code, hashes the password, creates the user,
// and increments the invite code use count. All operations are transactional.
func (s *Store) RegisterUser(username, passwordHash, inviteCode string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Normalize invite code: uppercase, trim whitespace.
	code := strings.TrimSpace(strings.ToUpper(inviteCode))
	if code == "" {
		return fmt.Errorf("invite code is required")
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Check that the invite code exists and has remaining uses.
	var creator string
	var maxUses, useCount int
	err = tx.QueryRow(
		"SELECT creator, max_uses, use_count FROM invite_codes WHERE code = ?",
		code,
	).Scan(&creator, &maxUses, &useCount)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			return fmt.Errorf("invalid invite code")
		}
		return err
	}
	if useCount >= maxUses {
		return fmt.Errorf("invite code has no remaining uses")
	}

	// Check that username does not already exist.
	var existing int
	err = tx.QueryRow("SELECT COUNT(*) FROM users WHERE username = ?", username).Scan(&existing)
	if err != nil {
		return err
	}
	if existing > 0 {
		return fmt.Errorf("username already registered")
	}

	// Hash password with salted SHA-256.
	hash := hashPassword(passwordHash)

	now := time.Now().UnixMilli()

	// Insert user.
	_, err = tx.Exec(
		"INSERT INTO users (username, password_hash, invited_by, created_at) VALUES (?, ?, ?, ?)",
		username, hash, creator, now,
	)
	if err != nil {
		return err
	}

	// Increment use count on invite code.
	_, err = tx.Exec("UPDATE invite_codes SET use_count = use_count + 1 WHERE code = ?", code)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// VerifyUser checks the username and password against stored credentials.
func (s *Store) VerifyUser(username, password string) (bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var passwordHash string
	err := s.db.QueryRow(
		"SELECT password_hash FROM users WHERE username = ?",
		username,
	).Scan(&passwordHash)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			return false, nil
		}
		return false, err
	}

	if !checkPassword(passwordHash, password) {
		return false, nil
	}
	return true, nil
}

// GenerateInviteCode creates a new random invite code for the given creator.
func (s *Store) GenerateInviteCode(creator string, maxUses int) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if maxUses <= 0 {
		maxUses = 5
	}

	// Generate unique random code.
	var code string
	for {
		code = randomCode(inviteCodeLength)
		var count int
		err := s.db.QueryRow("SELECT COUNT(*) FROM invite_codes WHERE code = ?", code).Scan(&count)
		if err != nil {
			return "", err
		}
		if count == 0 {
			break
		}
	}

	now := time.Now().UnixMilli()
	_, err := s.db.Exec(
		"INSERT INTO invite_codes (code, creator, max_uses, use_count, created_at) VALUES (?, ?, ?, 0, ?)",
		code, creator, maxUses, now,
	)
	if err != nil {
		return "", err
	}

	return code, nil
}

// ListInviteCodes returns all invite codes created by a given user.
func (s *Store) ListInviteCodes(creator string) ([]InviteCodeRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(
		"SELECT code, creator, max_uses, use_count, created_at FROM invite_codes WHERE creator = ? ORDER BY created_at DESC",
		creator,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var codes []InviteCodeRecord
	for rows.Next() {
		var c InviteCodeRecord
		if err := rows.Scan(&c.Code, &c.Creator, &c.MaxUses, &c.UseCount, &c.CreatedAt); err != nil {
			continue
		}
		codes = append(codes, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if codes == nil {
		codes = []InviteCodeRecord{}
	}
	return codes, nil
}

// ValidateInviteCode checks whether an invite code exists and has remaining uses.
func (s *Store) ValidateInviteCode(code string) (bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	code = strings.TrimSpace(strings.ToUpper(code))
	if code == "" {
		return false, nil
	}

	var maxUses, useCount int
	err := s.db.QueryRow(
		"SELECT max_uses, use_count FROM invite_codes WHERE code = ?",
		code,
	).Scan(&maxUses, &useCount)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			return false, nil
		}
		return false, err
	}

	return useCount < maxUses, nil
}

// randomCode generates a random alphanumeric string of the given length.
func randomCode(length int) string {
	result := make([]byte, length)
	for i := range result {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(inviteCodeChars))))
		if err != nil {
			n = big.NewInt(int64(time.Now().UnixNano() % int64(len(inviteCodeChars))))
		}
		result[i] = inviteCodeChars[n.Int64()]
	}
	return string(result)
}