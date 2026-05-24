package hub

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"tokendancechat/backend/llm"
	"tokendancechat/backend/picoclaw"
	"tokendancechat/backend/store"
)

// MaxConnections is the hard limit on concurrent WebSocket connections.
const MaxConnections = 100

// StoredMessage is an alias for store.StoredMessage.
type StoredMessage = store.StoredMessage

// StoredRoom is an alias for store.StoredRoom.
type StoredRoom = store.StoredRoom

// Poll is an alias for store.Poll.
type Poll = store.Poll

// UserProfile is an alias for store.UserProfile.
type UserProfile = store.UserProfile

// ScheduledMessage is an alias for store.ScheduledMessage.
type ScheduledMessage = store.ScheduledMessage

// CustomEmoji is an alias for store.CustomEmoji.
type CustomEmoji = store.CustomEmoji

// GroupInfo is an alias for store.GroupInfo.
type GroupInfo = store.GroupInfo

// GroupMemberInfo is an alias for store.GroupMemberInfo.
type GroupMemberInfo = store.GroupMemberInfo

// ChatFolder is an alias for store.ChatFolder.
type ChatFolder = store.ChatFolder

// ChatFolderItem is an alias for store.ChatFolderItem.
type ChatFolderItem = store.ChatFolderItem

// Store defines the interface for message persistence.
type Store interface {
	InsertMessage(username, content, replyToID, roomID, toUser, groupName, threadID string) (StoredMessage, error)
	GetMessages(limit int, before int64) []StoredMessage
	TotalUsers() int64
	TotalMessages() int64
	MarkDeleted(messageID string) error
	GetRoomMessages(roomID string, limit int, before int64) []StoredMessage
	CreateRoom(name string) (string, error)
	GetRoomID(name string) (string, error)
	ListRooms() []StoredRoom
	DeleteRoom(roomID string) error
	ToggleReaction(messageID, emoji, username string) (map[string][]string, error)
	GetReactionsForMessages(messageIDs []string) map[string]map[string][]string
	UpdateMessage(messageID, content string) (StoredMessage, error)
	GetMessageByID(messageID string) (StoredMessage, error)
	SearchMessages(query, roomID string, limit int) ([]store.SearchResult, error)
	SearchMessagesForUser(query, roomID, username string, limit int) ([]store.SearchResult, error)

	// Friend persistence
	AddFriend(username, friend string) error
	RemoveFriend(username, friend string) error
	GetFriends(username string) []string
	GetAllFriends() map[string][]string

	// Group persistence
	CreateGroup(name, creator string) error
	AddGroupMember(groupName, username string) error
	RemoveGroupMember(groupName, username string) error
	GetGroupMembers(groupName string) []string
	GetAllGroups() map[string][]string

	// Group admin
	GetGroupMembersWithRoles(groupName string) []store.GroupMemberInfo
	GetGroupMemberRole(groupName, username string) (string, error)
	SetGroupMemberRole(groupName, username, role string) error
	KickGroupMember(groupName, username string) error
	UpdateGroupName(oldName, newName string) error
	TransferGroupOwnership(groupName, newOwner string) error
	LeaveGroup(groupName, username string) error
	GetGroupInfo(groupName string) (*store.GroupInfo, error)
	GetGroupOwner(groupName string) (string, error)
	DeleteGroup(groupName string) error

	// DM delivery tracking
	GetUndeliveredDMs(username string, limit int) []StoredMessage
	MarkMessagesDelivered(ids []string) error

	// Message pinning
	PinMessage(roomID, messageID, pinnedBy string) error

	// Ping verifies the database connection is reachable.
	Ping() error
	UnpinMessage(roomID, messageID string) error
	GetPinnedMessages(roomID string) []StoredMessage

	// User blocking
	BlockUser(username, blocked string) error
	UnblockUser(username, blocked string) error
	IsBlocked(username, blocked string) bool
	GetBlockedUsers(username string) []string

	// Conversation pinning
	PinConversation(username, key string) error
	UnpinConversation(username, key string) error
	ListPinnedConversations(username string) []string

	// Conversation muting
	MuteConversation(username, key string) error
	UnmuteConversation(username, key string) error
	ListMutedConversations(username string) []string
	IsConversationMuted(username, key string) bool

	// Conversation archiving
	ArchiveConversation(username, key string) error
	UnarchiveConversation(username, key string) error
	ListArchivedConversations(username string) []string
	IsConversationArchived(username, key string) bool

	// Threaded replies
	GetThreadMessages(parentMessageID string) []StoredMessage
	GetThreadReplyCount(parentMessageID string) int

	// Notification preferences
	SetNotificationPrefs(username, key string, mutedUntil int64, showPreview bool) error
	GetNotificationPrefs(username, key string) (mutedUntil int64, showPreview bool, err error)
	ListNotificationPrefs(username string) []store.NotificationPref

	// User profiles
	UpsertUserProfile(username, displayName, avatarURL, bio, status string, lastSeen int64) error
	GetUserProfile(username string) (*store.UserProfile, error)
	UpdateUserStatus(username, status string) error
	UpdateUserLastSeen(username string) error
	GetAllUserProfiles() ([]store.UserProfile, error)

	// Polls
	CreatePoll(poll *Poll) error
	GetPoll(pollID string) (*Poll, error)
	VotePoll(pollID string, username string, optionIndex int) error
	ClosePoll(pollID string) error

	// Scheduled messages
	ScheduleMessage(msg ScheduledMessage) error
	GetPendingScheduledMessages(ctx context.Context) ([]ScheduledMessage, error)
	MarkScheduledSent(id string) error
	CancelScheduledMessage(id, username string) error
	GetUserScheduledMessages(username string) ([]ScheduledMessage, error)

	// Custom emojis
	AddCustomEmoji(name, url, uploader, roomID string) error
	ListCustomEmojis(roomID string) ([]store.CustomEmoji, error)
	DeleteCustomEmoji(name, username string) error
	SearchCustomEmojis(query string) ([]store.CustomEmoji, error)

	// Export
	ExportMessages(ctx context.Context, roomID, toUser, groupName, username string, limit int) ([]StoredMessage, error)

	// Call history
	LogCall(call store.CallRecord) error
	UpdateCallRecord(id, status string, startedAt, endedAt int64) error
	GetCallHistory(username string, limit int) ([]store.CallRecord, error)

	// User registration and authentication
	RegisterUser(username, passwordHash, inviteCode string) error
	VerifyUser(username, password string) (bool, error)
	UserExists(username string) (bool, error)
	GenerateInviteCode(creator string, maxUses int) (string, error)
	ListInviteCodes(creator string) ([]store.InviteCodeRecord, error)
	ValidateInviteCode(code string) (bool, error)

	// Chat folders
	CreateChatFolder(username, name string) (*ChatFolder, error)
	DeleteChatFolder(username, id string) error
	RenameChatFolder(username, id, newName string) error
	AddToFolder(folderID, key string) error
	RemoveFromFolder(folderID, key string) error
	ListFolders(username string) ([]ChatFolder, error)
	GetFolderItems(folderID string) ([]string, error)

	// Webhooks
	CreateWebhook(id, groupName, url, secret, createdBy string) error
	DeleteWebhook(id, groupName, deletedBy string) error
	RotateWebhookSecret(id, groupName, secret, rotatedBy string) (*store.Webhook, error)
	ListWebhooks(groupName string) ([]store.Webhook, error)
	ListWebhookAuditLogs(groupName string, limit int) ([]store.WebhookAuditLog, error)
	GetWebhookByURL(url string) (*store.Webhook, error)
	VerifyWebhookSecret(url, secret string) (*store.Webhook, bool, error)

	// OIDC user management.
	UpsertOIDCUser(sub, chatUsername, email, preferredUsername string) error
	GetOIDCUserBySub(sub string) (*store.OIDCUser, error)
	GetOIDCUserByUsername(username string) (*store.OIDCUser, error)
}

// CallSession represents an active call between two users.
type CallSession struct {
	ID        string `json:"id"`
	Caller    string `json:"caller"`
	Callee    string `json:"callee"`
	Type      string `json:"type"`   // video or voice
	Status    string `json:"status"` // ringing, active, ended
	CreatedAt int64  `json:"created_at"`
}

// CallRoom represents a multi-party group call room.
type CallRoom struct {
	ID           string   `json:"id"`
	Participants []string `json:"participants"`
	CreatedAt    int64    `json:"created_at"`
}

// Group represents a chat group.
type Group struct {
	Name    string          `json:"name"`
	Members map[string]bool `json:"members"`
}

// UserStatus represents a user with their online/offline status.
type UserStatus struct {
	Username    string `json:"username"`
	Online      bool   `json:"online"`
	LastSeen    int64  `json:"last_seen"`
	DisplayName string `json:"display_name,omitempty"`
	AvatarURL   string `json:"avatar_url,omitempty"`
	Status      string `json:"status,omitempty"`
}

// Message represents a WebSocket protocol message.
type Message struct {
	Type      string          `json:"type,omitempty"`
	ID        string          `json:"id,omitempty"`
	Username  string          `json:"username,omitempty"`
	Content   string          `json:"content,omitempty"`
	Timestamp int64           `json:"timestamp,omitempty"`
	Online    []string        `json:"online,omitempty"`
	Messages  []StoredMessage `json:"messages,omitempty"`
	ErrorCode string          `json:"code,omitempty"`
	RequestID string          `json:"request_id,omitempty"`
	Done      bool            `json:"done,omitempty"`

	// Friend system
	To      string   `json:"to,omitempty"`
	From    string   `json:"from,omitempty"`
	Friends []string `json:"friends,omitempty"`
	Blocked []string `json:"blocked,omitempty"`
	Context string   `json:"context,omitempty"`
	Preview string   `json:"preview,omitempty"`
	Token   string   `json:"token,omitempty"`

	// Group system
	Group        string                  `json:"group,omitempty"`
	Members      []string                `json:"members,omitempty"`
	GroupMembers []store.GroupMemberInfo `json:"group_members,omitempty"`
	Role         string                  `json:"role,omitempty"`

	// Reply system
	ReplyToID      string `json:"reply_to_id,omitempty"`
	ReplyToContent string `json:"reply_to_content,omitempty"`
	ReplyToUser    string `json:"reply_to_user,omitempty"`

	// Delete system
	Deleted bool `json:"deleted,omitempty"`

	// Last seen
	LastSeen int64 `json:"last_seen,omitempty"`

	// User status list
	Users []UserStatus `json:"users,omitempty"`

	// Room system
	RoomID string       `json:"room_id,omitempty"`
	Rooms  []StoredRoom `json:"rooms,omitempty"`

	// Reaction system
	Reactions map[string][]string `json:"reactions,omitempty"`
	Emoji     string              `json:"emoji,omitempty"`
	MessageID string              `json:"message_id,omitempty"`

	// Edit system
	Edited bool `json:"edited,omitempty"`

	// Thread system
	ThreadID        string          `json:"thread_id,omitempty"`
	ParentMessageID string          `json:"parent_message_id,omitempty"`
	ThreadMessages  []StoredMessage `json:"thread_messages,omitempty"`

	// Pinned
	Pinned   bool   `json:"pinned,omitempty"`
	PinnedBy string `json:"pinned_by,omitempty"`
	PinnedAt int64  `json:"pinned_at,omitempty"`

	// Conversation pinning
	Key  string   `json:"key,omitempty"`
	Keys []string `json:"keys,omitempty"`

	// Notification preferences
	MutedUntil  int64                    `json:"muted_until,omitempty"`
	ShowPreview *bool                    `json:"show_preview,omitempty"`
	NotifPrefs  []store.NotificationPref `json:"notif_prefs,omitempty"`

	// User profile fields
	DisplayName string `json:"display_name,omitempty"`
	AvatarURL   string `json:"avatar_url,omitempty"`
	Bio         string `json:"bio,omitempty"`
	Status      string `json:"status,omitempty"`

	// Poll fields
	Poll        *Poll `json:"poll,omitempty"`
	OptionIndex int   `json:"option_index,omitempty"`

	// Call signaling
	CallID    string             `json:"call_id,omitempty"`
	SDP       string             `json:"sdp,omitempty"`
	CallType  string             `json:"call_type,omitempty"`
	Candidate string             `json:"candidate,omitempty"`
	Calls     []store.CallRecord `json:"calls,omitempty"`

	// Multi-party call room
	CallParticipants []string `json:"call_participants,omitempty"`

	// @all / @everyone mention
	MentionAll bool `json:"mention_all,omitempty"`

	// Chat folders
	Folders   interface{} `json:"folders,omitempty"`
	Webhooks  interface{} `json:"webhooks,omitempty"`
	AuditLogs interface{} `json:"audit_logs,omitempty"`
	Secret    string      `json:"secret,omitempty"`
	RotatedAt int64       `json:"rotated_at,omitempty"`
	RotatedBy string      `json:"rotated_by,omitempty"`

	// Custom emoji fields
	EmojiName string        `json:"emoji_name,omitempty"`
	EmojiURL  string        `json:"emoji_url,omitempty"`
	Emojis    []CustomEmoji `json:"emojis,omitempty"`
}

// HubCommand PicoClaw 可向 Hub 发送的命令类型。
// 用于 PicoClaw 通过 WebSocket 双向通道查询 Hub 状态或执行操作。
type HubCommand struct {
	Type    string         `json:"type"`              // 命令类型：online_users, history, send_dm
	RoomID  string         `json:"room_id,omitempty"` // 房间 ID
	Limit   int            `json:"limit,omitempty"`   // 分页数量
	Before  int64          `json:"before,omitempty"`  // 分页起始时间戳
	ToUser  string         `json:"to_user,omitempty"` // DM 目标用户
	Content string         `json:"content,omitempty"` // DM 内容
	Params  map[string]any `json:"params,omitempty"`  // 扩展参数
}

// HubCommandResponse Hub 命令执行结果。
type HubCommandResponse struct {
	Type    string         `json:"type"`            // 回显命令类型
	Success bool           `json:"success"`         // 是否成功
	Data    map[string]any `json:"data,omitempty"`  // 响应数据
	Error   string         `json:"error,omitempty"` // 错误信息
}

// OIDCTokenVerifier validates an OIDC access token for a chat username.
type OIDCTokenVerifier interface {
	VerifyOIDCJoinToken(username, token string) error
}

// SessionTokenVerifier validates an app session token for a chat username.
type SessionTokenVerifier interface {
	VerifySessionJoinToken(username, token string) error
}

type Hub struct {
	// Registered clients.
	clients map[*Client]bool

	// Inbound messages from the clients.
	broadcast chan []byte

	// Register requests from the clients.
	register chan *Client

	// Unregister requests from clients.
	unregister chan *Client

	// Store for message persistence.
	store Store

	// OIDC token verifier is set by the HTTP handler when OIDC is enabled.
	oidcVerifier OIDCTokenVerifier

	// Session token verifier is set by the HTTP handler for registered local users.
	sessionVerifier SessionTokenVerifier

	// StartTime is the time the hub was created.
	StartTime time.Time

	// LLM bot support (deprecated: llmClient is legacy; picoclawClient is preferred).
	llmClient      *llm.Client
	picoclawClient *picoclaw.Client
	memory         *llm.Memory
	botName        string
	agentName      string

	// typingRateLimit tracks the last time a typing broadcast was sent per username.
	typingRateLimit map[string]time.Time

	// Friend system: username -> set of friend usernames.
	friends   map[string]map[string]bool
	friendsMu sync.RWMutex

	// Group system: group name -> Group.
	groups   map[string]*Group
	groupsMu sync.RWMutex

	// Pending group invites: username -> groupName -> inviter.
	pendingInvites   map[string]map[string]string
	pendingInvitesMu sync.RWMutex

	// Last seen tracking: username -> last seen timestamp (UnixMilli).
	lastSeen   map[string]int64
	lastSeenMu sync.RWMutex

	// Metrics
	droppedMessages atomic.Int64

	// Room system: room ID -> set of member usernames (in-memory).
	rooms   map[string]map[string]bool
	roomsMu sync.RWMutex

	// botCooldown tracks the last time a bot was triggered per key.
	// Keys use "bot:<username>" and "agent:<username>" for independent cooldowns.
	botCooldown   map[string]time.Time
	botCooldownMu sync.Mutex

	// Call session tracking
	callSessions   map[string]*CallSession
	callSessionsMu sync.RWMutex

	// Call room tracking (group calls)
	callRooms   map[string]*CallRoom
	callRoomsMu sync.RWMutex

	done     chan struct{}
	stopOnce sync.Once

	mu sync.RWMutex
}

// New creates a new Hub with the given store. llmCfg, picoclawCfg, botName and
// agentName are optional. TokenBot uses the legacy LLM adapter; PicoClaw uses
// the PicoClaw gateway.
func New(store Store, llmCfg *llm.Config, picoclawCfg *picoclaw.Config, botName string, agentNames ...string) *Hub {
	var llmClient *llm.Client
	var pcClient *picoclaw.Client
	var mem *llm.Memory
	agentName := "PicoClaw"
	if len(agentNames) > 0 && agentNames[0] != "" {
		agentName = agentNames[0]
	}

	if picoclawCfg != nil {
		pcClient = picoclaw.New(*picoclawCfg)
	}

	if llmCfg != nil {
		llmClient = llm.New(*llmCfg)
		memSize := llmCfg.MemorySize
		if memSize <= 0 {
			memSize = 20
		}
		mem = llm.NewMemory(memSize)
	}

	return &Hub{
		clients:         make(map[*Client]bool),
		broadcast:       make(chan []byte, 256),
		register:        make(chan *Client, 256),
		unregister:      make(chan *Client, 256),
		store:           store,
		StartTime:       time.Now(),
		llmClient:       llmClient,
		picoclawClient:  pcClient,
		memory:          mem,
		botName:         botName,
		agentName:       agentName,
		typingRateLimit: make(map[string]time.Time),
		friends:         make(map[string]map[string]bool),
		groups:          make(map[string]*Group),
		pendingInvites:  make(map[string]map[string]string),
		lastSeen:        make(map[string]int64),
		rooms:           make(map[string]map[string]bool),
		botCooldown:     make(map[string]time.Time),
		callSessions:    make(map[string]*CallSession),
		callRooms:       make(map[string]*CallRoom),
		done:            make(chan struct{}),
	}
}

// SetOIDCTokenVerifier configures WebSocket join validation for OIDC-linked users.
func (h *Hub) SetOIDCTokenVerifier(verifier OIDCTokenVerifier) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.oidcVerifier = verifier
}

func (h *Hub) verifyOIDCJoinToken(username, token string) error {
	h.mu.RLock()
	verifier := h.oidcVerifier
	h.mu.RUnlock()
	if verifier == nil {
		return fmt.Errorf("OIDC token verifier unavailable")
	}
	return verifier.VerifyOIDCJoinToken(username, token)
}

// SetSessionTokenVerifier configures WebSocket join validation for registered users.
func (h *Hub) SetSessionTokenVerifier(verifier SessionTokenVerifier) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.sessionVerifier = verifier
}

func (h *Hub) verifySessionJoinToken(username, token string) error {
	h.mu.RLock()
	verifier := h.sessionVerifier
	h.mu.RUnlock()
	if verifier == nil {
		return fmt.Errorf("session token verifier unavailable")
	}
	return verifier.VerifySessionJoinToken(username, token)
}

// LoadPersistedState restores friends and groups from the store into memory.
func (h *Hub) LoadPersistedState() {
	if h.store == nil {
		return
	}
	// Restore groups.
	allGroups := h.store.GetAllGroups()
	for name, members := range allGroups {
		g := &Group{Name: name, Members: make(map[string]bool)}
		for _, m := range members {
			g.Members[m] = true
		}
		h.groupsMu.Lock()
		h.groups[name] = g
		h.groupsMu.Unlock()
	}
	// Restore friends from the friends table directly.
	allFriends := h.store.GetAllFriends()
	for username, friends := range allFriends {
		h.friendsMu.Lock()
		set := make(map[string]bool)
		for _, f := range friends {
			set[f] = true
		}
		h.friends[username] = set
		h.friendsMu.Unlock()
	}

}

// cleanupMaps prunes stale entries from rate-limit and pending-invite maps
// to prevent unbounded memory growth on long-running servers.
func (h *Hub) cleanupMaps() {
	now := time.Now()

	// Prune typingRateLimit entries older than 10 seconds (cooldown is 3s).
	h.mu.Lock()
	for k, v := range h.typingRateLimit {
		if now.Sub(v) > 10*time.Second {
			delete(h.typingRateLimit, k)
		}
	}
	h.mu.Unlock()

	// Prune botCooldown entries older than 60 seconds (max cooldown is 30s).
	h.botCooldownMu.Lock()
	for k, v := range h.botCooldown {
		if now.Sub(v) > 60*time.Second {
			delete(h.botCooldown, k)
		}
	}
	h.botCooldownMu.Unlock()

	// Prune pendingInvites entries whose inner map is empty.
	h.pendingInvitesMu.Lock()
	for k, v := range h.pendingInvites {
		if len(v) == 0 {
			delete(h.pendingInvites, k)
		}
	}
	h.pendingInvitesMu.Unlock()
}

// Run starts the hub's event loop. It should be run in a goroutine.
func (h *Hub) Run() {
	syncTicker := time.NewTicker(30 * time.Second)
	defer syncTicker.Stop()

	scheduleTicker := time.NewTicker(5 * time.Second)
	defer scheduleTicker.Stop()

	for {
		select {
		case <-h.done:
			return
		case client := <-h.register:
			h.mu.Lock()
			// Kick existing connection with the same username (new login takes over).
			for c := range h.clients {
				if c.username == client.username && c != client {
					kickMsg, _ := json.Marshal(Message{
						Type:    "kicked",
						Content: "您的账号已在其他地方登录，当前连接已断开。",
					})
					select {
					case c.send <- kickMsg:
					default:
					}
					// Close the old WebSocket to trigger cleanup in ReadPump/WritePump.
					// Remove from clients first so unregister handler is a no-op.
					delete(h.clients, c)
					close(c.send)
					c.conn.Close()
					log.Printf("client kicked (new login): %s", c.username)
					break
				}
			}
			h.clients[client] = true
			h.mu.Unlock()

			// Update last seen for this user.
			h.lastSeenMu.Lock()
			h.lastSeen[client.username] = time.Now().UnixMilli()
			h.lastSeenMu.Unlock()

			log.Printf("client registered: %s (total: %d)", client.username, len(h.clients))

			// PicoClaw proactive greeting — send a welcome DM after a short delay.
			if agentName := h.AgentName(); agentName != "" && client.username != agentName {
				username := client.username
				go func() {
					time.Sleep(2 * time.Second)
					greeting := fmt.Sprintf("你好 @%s！我是 PicoClaw，你的 AI 助手。有什么可以帮你的？", username)
					h.SendAssistantMessageToRoom(agentName, greeting, "dm:"+username)
				}()
			}

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()

			if client.username != "" {
				// Update last seen when user disconnects.
				h.lastSeenMu.Lock()
				h.lastSeen[client.username] = time.Now().UnixMilli()
				h.lastSeenMu.Unlock()

				// Broadcast user_left.
				leftMsg := Message{
					Type:     "user_left",
					Username: client.username,
					Online:   h.onlineUsers(),
				}
				data, err := json.Marshal(leftMsg)
				if err != nil {
					log.Printf("marshal user_left error: %v", err)
				} else {
					h.mu.RLock()
					for c := range h.clients {
						select {
						case c.send <- data:
						default:
							// Client's send buffer is full; drop.
						}
					}
					h.mu.RUnlock()
				}
			}
			log.Printf("client unregistered (total: %d)", len(h.clients))

			// Broadcast user_status to all remaining clients after unregister.
			statusMsg := Message{
				Type:  "user_status",
				Users: h.AllUserStatus(),
			}
			if statusData, err := json.Marshal(statusMsg); err == nil {
				h.mu.RLock()
				for c := range h.clients {
					select {
					case c.send <- statusData:
					default:
					}
				}
				h.mu.RUnlock()
			}

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					// Client's send buffer is full; drop the message and close the connection.
					go func(c *Client) {
						h.unregister <- c
					}(client)
				}
			}
			h.mu.RUnlock()

		case <-syncTicker.C:
			h.cleanupMaps()

			online := h.onlineUsers()
			syncMsg, err := json.Marshal(Message{
				Type:   "online_users",
				Online: online,
			})
			if err != nil {
				log.Printf("marshal online_users error: %v", err)
				continue
			}
			h.mu.RLock()
			for c := range h.clients {
				select {
				case c.send <- syncMsg:
				default:
				}
			}
			h.mu.RUnlock()

		case <-scheduleTicker.C:
			h.processScheduledMessages()
		}
	}
}

// onlineUsers returns a slice of unique online usernames.
func (h *Hub) onlineUsers() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()

	seen := make(map[string]bool)
	users := make([]string, 0)
	for c := range h.clients {
		if c.username != "" && !seen[c.username] {
			seen[c.username] = true
			users = append(users, c.username)
		}
	}
	return users
}

// OnlineUsers is the public accessor for online users.
func (h *Hub) OnlineUsers() []string {
	return h.onlineUsers()
}

// IsUsernameTaken checks if a username is already in use by an active client.
func (h *Hub) IsUsernameTaken(username string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.username == username {
			return true
		}
	}
	return false
}

// ConnectionCount returns the number of currently connected clients.
func (h *Hub) ConnectionCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// IsFull returns true when the hub has reached MaxConnections.
func (h *Hub) IsFull() bool {
	return h.ConnectionCount() >= MaxConnections
}

// Uptime returns the duration since the hub was created.
func (h *Hub) Uptime() time.Duration {
	return time.Since(h.StartTime)
}

// DroppedMessages returns the count of messages dropped due to full send buffers.
func (h *Hub) DroppedMessages() int64 {
	return h.droppedMessages.Load()
}

// IncrementDropped increments the dropped message counter.
func (h *Hub) IncrementDropped() {
	h.droppedMessages.Add(1)
}

// BotName returns the configured bot username, or empty string if no bot is configured.
func (h *Hub) BotName() string {
	return h.botName
}

// AgentName returns the configured agent username, or empty string if disabled.
func (h *Hub) AgentName() string {
	return h.agentName
}

// LLMClient returns the legacy LLM client, or nil if not configured.
func (h *Hub) LLMClient() *llm.Client {
	return h.llmClient
}

// PicoclawClient returns the PicoClaw client, or nil if not configured.
func (h *Hub) PicoclawClient() *picoclaw.Client {
	return h.picoclawClient
}

// Memory returns the LLM context memory, or nil if not configured.
func (h *Hub) Memory() *llm.Memory {
	return h.memory
}

// SetMemoryPath sets the MEMORY.md path for the bot's memory if configured.
func (h *Hub) SetMemoryPath(path string) {
	if h.memory != nil {
		h.memory.SetMemoryPath(path)
	}
}

// GetMemoryContent returns the current MEMORY.md content, or empty string.
func (h *Hub) GetMemoryContent() string {
	if h.memory == nil {
		return ""
	}
	return h.memory.GetMemoryContent()
}

// BuildSystemPrompt builds the full system prompt for the LLM,
// including bot identity, rules, and memory context.
func (h *Hub) BuildSystemPrompt() string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "You are a helpful chatbot named %s. Speak Chinese by default. Be concise and friendly.\n\n", h.botName)
	sb.WriteString("Rules:\n")
	sb.WriteString("- No offensive content\n")
	sb.WriteString("- No roleplaying\n")
	fmt.Fprintf(&sb, "- Identify yourself as a bot named %s\n", h.botName)
	sb.WriteString("- When mentioning users, use @username format\n\n")

	if h.memory != nil {
		if content := h.memory.GetMemoryContent(); content != "" {
			sb.WriteString("## Conversation Context (from memory)\n")
			sb.WriteString(content)
			sb.WriteString("\n")
		}
	}

	return sb.String()
}

// LastSeen returns the last seen timestamp for a username.
func (h *Hub) LastSeen(username string) int64 {
	h.lastSeenMu.RLock()
	defer h.lastSeenMu.RUnlock()
	return h.lastSeen[username]
}

// SetLastSeen sets the last seen timestamp for a username.
func (h *Hub) SetLastSeen(username string, ts int64) {
	h.lastSeenMu.Lock()
	h.lastSeen[username] = ts
	h.lastSeenMu.Unlock()
}

// AllUserStatus returns all known users with their online/offline status,
// sorted by online first, then by last seen descending. Profile data
// (display_name, avatar_url, status) is merged from the store.
func (h *Hub) AllUserStatus() []UserStatus {
	onlineMap := make(map[string]bool)
	h.mu.RLock()
	for c := range h.clients {
		onlineMap[c.username] = true
	}
	h.mu.RUnlock()

	h.lastSeenMu.RLock()
	defer h.lastSeenMu.RUnlock()

	profiles, _ := h.store.GetAllUserProfiles()
	profileMap := make(map[string]store.UserProfile, len(profiles))
	for _, p := range profiles {
		profileMap[p.Username] = p
	}

	users := make([]UserStatus, 0, len(h.lastSeen))
	for username, ls := range h.lastSeen {
		us := UserStatus{
			Username: username,
			Online:   onlineMap[username],
			LastSeen: ls,
		}
		if p, ok := profileMap[username]; ok {
			us.DisplayName = p.DisplayName
			us.AvatarURL = p.AvatarURL
			us.Status = p.Status
		}
		users = append(users, us)
	}

	sort.Slice(users, func(i, j int) bool {
		if users[i].Online != users[j].Online {
			return users[i].Online
		}
		return users[i].LastSeen > users[j].LastSeen
	})
	return users
}

// IsOnline returns true if the username is currently connected.
func (h *Hub) IsOnline(username string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.username == username {
			return true
		}
	}
	return false
}

// SendToUser sends a marshaled message to a specific user by username.
// Returns true if the user was online and the message was queued.
func (h *Hub) SendToUser(username string, data []byte) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.username == username {
			select {
			case c.send <- data:
			default:
			}
			return true
		}
	}
	return false
}

// SendToGroup sends a marshaled message to all group members who are online.
func (h *Hub) SendToGroup(groupName string, data []byte) {
	h.groupsMu.RLock()
	g, ok := h.groups[groupName]
	if !ok {
		h.groupsMu.RUnlock()
		return
	}
	// Copy member set to avoid data race with concurrent RemoveGroupMember
	// which modifies g.Members under groupsMu.Lock().
	members := make(map[string]bool, len(g.Members))
	for m := range g.Members {
		members[m] = true
	}
	h.groupsMu.RUnlock()

	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if members[c.username] {
			select {
			case c.send <- data:
			default:
			}
		}
	}
}

// BroadcastToGroup sends a marshaled message to all group members who are online.
// Same as SendToGroup — provided for consistency with the group admin API naming.
func (h *Hub) BroadcastToGroup(groupName string, data []byte) {
	h.SendToGroup(groupName, data)
}

// InGroup checks if a user is a member of a group.
func (h *Hub) InGroup(username, groupName string) bool {
	h.groupsMu.RLock()
	defer h.groupsMu.RUnlock()
	g, ok := h.groups[groupName]
	if !ok {
		return false
	}
	return g.Members[username]
}

// GroupMembers returns the list of members in a group.
func (h *Hub) GroupMembers(groupName string) []string {
	h.groupsMu.RLock()
	defer h.groupsMu.RUnlock()
	g, ok := h.groups[groupName]
	if !ok {
		return nil
	}
	members := make([]string, 0, len(g.Members))
	for m := range g.Members {
		members = append(members, m)
	}
	return members
}

// BroadcastJSON marshals a Message and sends it to the broadcast channel.
// This is used for system messages like typing indicators that don't need store persistence.
func (h *Hub) BroadcastJSON(msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("marshal broadcast error: %v", err)
		return
	}
	select {
	case h.broadcast <- data:
	default:
		h.droppedMessages.Add(1)
		log.Printf("broadcast channel full, dropping message")
	}
}

// BroadcastToRoom sends marshaled data only to clients in the given room.
func (h *Hub) BroadcastToRoom(data []byte, roomID string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if roomID == "" {
		// If no room specified, broadcast to all.
		for c := range h.clients {
			select {
			case c.send <- data:
			default:
			}
		}
		return
	}
	for c := range h.clients {
		if c.getCurrentRoomID() != roomID {
			continue
		}
		select {
		case c.send <- data:
		default:
		}
	}
}

// SendBotMessage persists a bot message to the store and broadcasts it.
func (h *Hub) SendBotMessage(content, roomID string) {
	h.SendAssistantMessage(h.botName, content, roomID)
}

// SendBotMessageToRoom persists a bot message and broadcasts only to the given room.
func (h *Hub) SendBotMessageToRoom(content, roomID string) {
	if roomID == "" {
		h.SendAssistantMessage(h.botName, content, roomID)
		return
	}
	h.SendAssistantMessageToRoom(h.botName, content, roomID)
}

// SendAssistantMessage persists an assistant message to the store and broadcasts it.
func (h *Hub) SendAssistantMessage(username, content, roomID string) {
	if username == "" {
		username = h.botName
	}
	storedMsg, err := h.store.InsertMessage(username, content, "", roomID, "", "", "")
	if err != nil {
		log.Printf("failed to insert assistant message: %v", err)
		return
	}

	broadcastMsg, err := json.Marshal(Message{
		Type:      "message",
		ID:        storedMsg.ID,
		Username:  storedMsg.Username,
		Content:   storedMsg.Content,
		Timestamp: storedMsg.Timestamp,
		RoomID:    roomID,
	})
	if err != nil {
		log.Printf("marshal assistant message error: %v", err)
		return
	}

	select {
	case h.broadcast <- broadcastMsg:
	default:
		log.Printf("broadcast channel full, dropping assistant message")
	}
}

// SendAssistantMessageToRoom persists an assistant message and broadcasts only to the given room.
func (h *Hub) SendAssistantMessageToRoom(username, content, roomID string) {
	if username == "" {
		username = h.botName
	}
	storedMsg, err := h.store.InsertMessage(username, content, "", roomID, "", "", "")
	if err != nil {
		log.Printf("failed to insert assistant message: %v", err)
		return
	}

	broadcastMsg, err := json.Marshal(Message{
		Type:      "message",
		ID:        storedMsg.ID,
		Username:  storedMsg.Username,
		Content:   storedMsg.Content,
		Timestamp: storedMsg.Timestamp,
		RoomID:    roomID,
	})
	if err != nil {
		log.Printf("marshal assistant message error: %v", err)
		return
	}

	h.mu.RLock()
	for c := range h.clients {
		if c.getCurrentRoomID() != roomID {
			continue
		}
		select {
		case c.send <- broadcastMsg:
		default:
		}
	}
	h.mu.RUnlock()
}

// usernameRegex validates: 1-20 chars, alphanumeric, underscore, or Chinese chars.
var usernameRegex = regexp.MustCompile(`^[\p{Han}a-zA-Z0-9_]{1,20}$`)

// ValidateUsername checks if a username meets the requirements.
func ValidateUsername(username string) bool {
	return usernameRegex.MatchString(username)
}

// groupNameRegex validates group names: 1-30 chars.
var groupNameRegex = regexp.MustCompile(`^[\p{Han}a-zA-Z0-9_\- ]{1,30}$`)

// ValidateGroupName checks if a group name meets requirements.
func ValidateGroupName(name string) bool {
	return groupNameRegex.MatchString(name)
}

// --- Friend system methods ---

// IsFriend checks if two users are friends.
func (h *Hub) IsFriend(username, friend string) bool {
	h.friendsMu.RLock()
	defer h.friendsMu.RUnlock()
	set, ok := h.friends[username]
	if !ok {
		return false
	}
	return set[friend]
}

// GetFriends returns the list of friends for a username.
func (h *Hub) GetFriends(username string) []string {
	h.friendsMu.RLock()
	defer h.friendsMu.RUnlock()
	set := h.friends[username]
	friends := make([]string, 0, len(set))
	for f := range set {
		friends = append(friends, f)
	}
	return friends
}

// AddFriend adds a bidirectional friend relationship.
func (h *Hub) AddFriend(a, b string) {
	h.friendsMu.Lock()
	if h.friends[a] == nil {
		h.friends[a] = make(map[string]bool)
	}
	if h.friends[b] == nil {
		h.friends[b] = make(map[string]bool)
	}
	h.friends[a][b] = true
	h.friends[b][a] = true
	h.friendsMu.Unlock()

	// Persist to store.
	if h.store != nil {
		h.store.AddFriend(a, b)
		h.store.AddFriend(b, a)
	}
}

// RemoveFriend removes a bidirectional friend relationship.
func (h *Hub) RemoveFriend(a, b string) {
	h.friendsMu.Lock()
	if h.friends[a] != nil {
		delete(h.friends[a], b)
	}
	if h.friends[b] != nil {
		delete(h.friends[b], a)
	}
	h.friendsMu.Unlock()

	if h.store != nil {
		h.store.RemoveFriend(a, b)
		h.store.RemoveFriend(b, a)
	}
}

// --- Group system methods ---

// CreateGroup creates a new group with the creator as the first member.
func (h *Hub) CreateGroup(name string, creator string) bool {
	h.groupsMu.Lock()
	defer h.groupsMu.Unlock()
	if _, exists := h.groups[name]; exists {
		return false
	}
	h.groups[name] = &Group{
		Name:    name,
		Members: map[string]bool{creator: true},
	}
	// Persist to store.
	if h.store != nil {
		h.store.CreateGroup(name, creator)
	}
	return true
}

// AddGroupMember adds a member to a group.
func (h *Hub) AddGroupMember(groupName, username string) bool {
	h.groupsMu.Lock()
	g, ok := h.groups[groupName]
	if !ok {
		h.groupsMu.Unlock()
		return false
	}
	g.Members[username] = true
	h.groupsMu.Unlock()

	if h.store != nil {
		h.store.AddGroupMember(groupName, username)
	}
	return true
}

// RemoveGroupMember removes a member from a group.
func (h *Hub) RemoveGroupMember(groupName, username string) {
	h.groupsMu.Lock()
	g, ok := h.groups[groupName]
	if !ok {
		h.groupsMu.Unlock()
		return
	}
	delete(g.Members, username)
	h.groupsMu.Unlock()

	if h.store != nil {
		h.store.RemoveGroupMember(groupName, username)
	}
}

// --- User blocking methods ---

// BlockUser blocks a user. Delegates to the store.
func (h *Hub) BlockUser(username, blocked string) error {
	return h.store.BlockUser(username, blocked)
}

// UnblockUser unblocks a user.
func (h *Hub) UnblockUser(username, blocked string) error {
	return h.store.UnblockUser(username, blocked)
}

// IsBlocked checks if a user has blocked another.
func (h *Hub) IsBlocked(username, blocked string) bool {
	return h.store.IsBlocked(username, blocked)
}

// PinMessage pins a message in a room.
func (h *Hub) PinMessage(roomID, messageID, pinnedBy string) error {
	return h.store.PinMessage(roomID, messageID, pinnedBy)
}

// UnpinMessage unpins a message in a room.
func (h *Hub) UnpinMessage(roomID, messageID string) error {
	return h.store.UnpinMessage(roomID, messageID)
}

// GetPinnedMessages returns pinned messages for a room.
func (h *Hub) GetPinnedMessages(roomID string) []StoredMessage {
	return h.store.GetPinnedMessages(roomID)
}

// PinConversation pins a conversation for a user.
func (h *Hub) PinConversation(username, key string) error {
	return h.store.PinConversation(username, key)
}

// UnpinConversation unpins a conversation for a user.
func (h *Hub) UnpinConversation(username, key string) error {
	return h.store.UnpinConversation(username, key)
}

// ListPinnedConversations returns the list of pinned conversation keys for a user.
func (h *Hub) ListPinnedConversations(username string) []string {
	return h.store.ListPinnedConversations(username)
}

// MuteConversation mutes a conversation for a user.
func (h *Hub) MuteConversation(username, key string) error {
	return h.store.MuteConversation(username, key)
}

// UnmuteConversation unmutes a conversation for a user.
func (h *Hub) UnmuteConversation(username, key string) error {
	return h.store.UnmuteConversation(username, key)
}

// ListMutedConversations returns the list of muted conversation keys for a user.
func (h *Hub) ListMutedConversations(username string) []string {
	return h.store.ListMutedConversations(username)
}

// IsConversationMuted checks if a conversation is muted for a user.
func (h *Hub) IsConversationMuted(username, key string) bool {
	return h.store.IsConversationMuted(username, key)
}

// ArchiveConversation archives a conversation for a user.
func (h *Hub) ArchiveConversation(username, key string) error {
	return h.store.ArchiveConversation(username, key)
}

// UnarchiveConversation unarchives a conversation for a user.
func (h *Hub) UnarchiveConversation(username, key string) error {
	return h.store.UnarchiveConversation(username, key)
}

// ListArchivedConversations returns the list of archived conversation keys for a user.
func (h *Hub) ListArchivedConversations(username string) []string {
	return h.store.ListArchivedConversations(username)
}

// IsConversationArchived checks if a conversation is archived for a user.
func (h *Hub) IsConversationArchived(username, key string) bool {
	return h.store.IsConversationArchived(username, key)
}

// SetNotificationPrefs upserts notification preferences for a (username, key) pair.
func (h *Hub) SetNotificationPrefs(username, key string, mutedUntil int64, showPreview bool) error {
	return h.store.SetNotificationPrefs(username, key, mutedUntil, showPreview)
}

// GetNotificationPrefs returns the notification preferences for a (username, key) pair.
func (h *Hub) GetNotificationPrefs(username, key string) (mutedUntil int64, showPreview bool, err error) {
	return h.store.GetNotificationPrefs(username, key)
}

// ListNotificationPrefs returns all notification preference records for a user.
func (h *Hub) ListNotificationPrefs(username string) []store.NotificationPref {
	return h.store.ListNotificationPrefs(username)
}

// SendToAllSessions sends marshaled data to all connected clients with the given username.
func (h *Hub) SendToAllSessions(username string, data []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.username == username {
			select {
			case c.send <- data:
			default:
			}
		}
	}
}

// BroadcastStreamChunk sends a streaming chunk to all connected clients.

// BroadcastStreamChunkToRoom sends a streaming chunk to clients in a specific room.
// If roomID is empty, broadcasts to all connected clients.
func (h *Hub) BroadcastStreamChunkToRoom(username, content string, done bool, roomID string) {
	msg := Message{
		Type:     "stream",
		Username: username,
		Content:  content,
		Done:     done,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("marshal stream error: %v", err)
		return
	}
	if roomID == "" {
		select {
		case h.broadcast <- data:
		default:
			h.droppedMessages.Add(1)
			log.Printf("broadcast channel full, dropping stream chunk")
		}
		return
	}
	h.mu.RLock()
	for c := range h.clients {
		if c.getCurrentRoomID() != roomID {
			continue
		}
		select {
		case c.send <- data:
		default:
		}
	}
	h.mu.RUnlock()
}

// BroadcastTyping sends a typing indicator to all clients except the sender.
// Rate limit is enforced by the caller via shouldBroadcastTyping.
func (h *Hub) BroadcastTyping(username, eventType, context, to string) {
	msg := Message{
		Type:     eventType,
		Username: username,
		Context:  context,
		To:       to,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("marshal typing error: %v", err)
		return
	}
	h.mu.RLock()
	for c := range h.clients {
		// Don't send typing to the sender.
		if c.username == username {
			continue
		}
		select {
		case c.send <- data:
		default:
		}
	}
	h.mu.RUnlock()
}

// ShouldBroadcastTyping checks and updates the typing rate limit for a username.
// Returns true if a typing broadcast is allowed (at most once per 3 seconds).
func (h *Hub) ShouldBroadcastTyping(username string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	last, exists := h.typingRateLimit[username]
	now := time.Now()
	if exists && now.Sub(last) < 3*time.Second {
		return false
	}
	h.typingRateLimit[username] = now
	return true
}

// CheckBotCooldown returns true if a bot response is allowed for the given key.
// Keys use "bot:<username>" for TokenBot and "agent:<username>" for PicoClaw,
// giving each assistant independent per-user cooldowns.
// TokenBot cooldown: 3s (fast Q&A). PicoClaw cooldown: 8s (Agent workflows).
// Records the current timestamp on success.
func (h *Hub) CheckBotCooldown(key string) bool {
	h.botCooldownMu.Lock()
	defer h.botCooldownMu.Unlock()
	last, exists := h.botCooldown[key]
	cooldown := 30 * time.Second
	if strings.HasPrefix(key, "bot:") {
		cooldown = 3 * time.Second
	} else if strings.HasPrefix(key, "agent:") {
		cooldown = 8 * time.Second
	}
	if exists && time.Since(last) < cooldown {
		return false
	}
	h.botCooldown[key] = time.Now()
	return true
}

// --- Pending group invites ---

// AddPendingInvite records a pending group invitation.
func (h *Hub) AddPendingInvite(username, groupName, inviter string) {
	h.pendingInvitesMu.Lock()
	defer h.pendingInvitesMu.Unlock()
	if h.pendingInvites[username] == nil {
		h.pendingInvites[username] = make(map[string]string)
	}
	h.pendingInvites[username][groupName] = inviter
}

// ConsumePendingInvite checks and removes a pending invite, returning true if it existed.
func (h *Hub) ConsumePendingInvite(username, groupName string) bool {
	h.pendingInvitesMu.Lock()
	defer h.pendingInvitesMu.Unlock()
	m, ok := h.pendingInvites[username]
	if !ok {
		return false
	}
	_, exists := m[groupName]
	delete(m, groupName)
	return exists
}

// RemovePendingInvite removes a pending invite without joining.
func (h *Hub) RemovePendingInvite(username, groupName string) {
	h.pendingInvitesMu.Lock()
	defer h.pendingInvitesMu.Unlock()
	if m := h.pendingInvites[username]; m != nil {
		delete(m, groupName)
	}
}

// --- Room system methods ---

// DefaultRoomName is the name of the default public room.
const DefaultRoomName = "公共聊天"

// DefaultRoomID returns the ID of the default room from the store.
func (h *Hub) DefaultRoomID() string {
	id, err := h.store.GetRoomID(DefaultRoomName)
	if err != nil {
		log.Printf("warn: default room not found, creating: %v", err)
		id, err = h.store.CreateRoom(DefaultRoomName)
		if err != nil {
			log.Printf("error creating default room: %v", err)
			return ""
		}
	}
	return id
}

// JoinRoom adds a user to a room's member set.
func (h *Hub) JoinRoom(roomID, username string) bool {
	h.roomsMu.Lock()
	defer h.roomsMu.Unlock()
	if h.rooms[roomID] == nil {
		h.rooms[roomID] = make(map[string]bool)
	}
	h.rooms[roomID][username] = true
	return true
}

// LeaveRoom removes a user from a room's member set.
func (h *Hub) LeaveRoom(roomID, username string) {
	h.roomsMu.Lock()
	defer h.roomsMu.Unlock()
	if h.rooms[roomID] != nil {
		delete(h.rooms[roomID], username)
	}
}

// GetRoomMembers returns usernames of members in a room.
func (h *Hub) GetRoomMembers(roomID string) []string {
	h.roomsMu.RLock()
	defer h.roomsMu.RUnlock()
	members := h.rooms[roomID]
	usernames := make([]string, 0, len(members))
	for u := range members {
		usernames = append(usernames, u)
	}
	return usernames
}

// ListRooms returns all persisted rooms from the store.
func (h *Hub) ListRooms() []StoredRoom {
	return h.store.ListRooms()
}

// CreateRoom creates a new room in the store and returns the room ID.
func (h *Hub) CreateRoom(name string) (string, error) {
	return h.store.CreateRoom(name)
}

// InRoom checks if a user is a member of a room (in-memory, i.e. has joined).
func (h *Hub) InRoom(roomID, username string) bool {
	h.roomsMu.RLock()
	defer h.roomsMu.RUnlock()
	if h.rooms[roomID] == nil {
		return false
	}
	return h.rooms[roomID][username]
}

// -------- PicoClaw 双向查询接口 --------

// RequestOnlineUsers 返回在线用户列表，供 PicoClaw 通过命令通道查询。
func (h *Hub) RequestOnlineUsers() HubCommandResponse {
	users := h.OnlineUsers()
	data := map[string]any{
		"online": users,
		"count":  len(users),
		"time":   time.Now().UnixMilli(),
	}
	return HubCommandResponse{
		Type:    "online_users",
		Success: true,
		Data:    data,
	}
}

// RequestHistory 返回指定房间的消息历史，供 PicoClaw 查询。
// roomID 为空时返回全局消息。
func (h *Hub) RequestHistory(roomID string, limit int, before int64) HubCommandResponse {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	var messages []StoredMessage
	if roomID != "" {
		messages = h.store.GetRoomMessages(roomID, limit, before)
	} else {
		messages = h.store.GetMessages(limit, before)
	}

	if messages == nil {
		messages = []StoredMessage{}
	}

	data := map[string]any{
		"messages": messages,
		"count":    len(messages),
		"room_id":  roomID,
	}
	return HubCommandResponse{
		Type:    "history",
		Success: true,
		Data:    data,
	}
}

// SendDM 以指定身份发送私信给目标用户，供 PicoClaw 调用。
// fromUsername: 发送者标识（通常为 PicoClaw 代理名）。
// toUsername: 接收者用户名。
// content: 私信内容。
func (h *Hub) SendDM(fromUsername, toUsername, content string) HubCommandResponse {
	if fromUsername == "" || toUsername == "" || content == "" {
		return HubCommandResponse{
			Type:    "send_dm",
			Success: false,
			Error:   "缺少必要参数：fromUsername、toUsername 或 content 为空",
		}
	}

	// 持久化到 store。
	storedMsg, err := h.store.InsertMessage(fromUsername, content, "", "", toUsername, "", "")
	if err != nil {
		log.Printf("SendDM: insert message error: %v", err)
		return HubCommandResponse{
			Type:    "send_dm",
			Success: false,
			Error:   fmt.Sprintf("持久化消息失败: %v", err),
		}
	}

	// 构建 DM 消息。
	dmData, err := json.Marshal(Message{
		Type:      "dm_message",
		ID:        storedMsg.ID,
		Username:  fromUsername,
		Content:   content,
		Timestamp: storedMsg.Timestamp,
		To:        toUsername,
		From:      fromUsername,
	})
	if err != nil {
		return HubCommandResponse{
			Type:    "send_dm",
			Success: false,
			Error:   fmt.Sprintf("序列化消息失败: %v", err),
		}
	}

	// 发送给目标用户。
	delivered := h.SendToUser(toUsername, dmData)
	if delivered {
		h.store.MarkMessagesDelivered([]string{storedMsg.ID})
	}

	data := map[string]any{
		"message_id": storedMsg.ID,
		"delivered":  delivered,
		"to":         toUsername,
		"timestamp":  storedMsg.Timestamp,
	}
	return HubCommandResponse{
		Type:    "send_dm",
		Success: true,
		Data:    data,
	}
}

// ExecuteHubCommand 执行 PicoClaw 发来的 Hub 命令。
// 根据 cmd.Type 分派到对应的处理方法。
func (h *Hub) ExecuteHubCommand(cmd HubCommand) HubCommandResponse {
	switch cmd.Type {
	case "online_users":
		return h.RequestOnlineUsers()
	case "history":
		return h.RequestHistory(cmd.RoomID, cmd.Limit, cmd.Before)
	case "send_dm":
		fromUsername := h.AgentName() // 默认使用 PicoClaw 代理名
		if cmd.Params != nil {
			if from, ok := cmd.Params["from"].(string); ok && from != "" {
				fromUsername = from
			}
		}
		return h.SendDM(fromUsername, cmd.ToUser, cmd.Content)
	default:
		return HubCommandResponse{
			Type:    cmd.Type,
			Success: false,
			Error:   fmt.Sprintf("未知命令类型: %s", cmd.Type),
		}
	}
}

// processScheduledMessages checks for pending scheduled messages and delivers them.
func (h *Hub) processScheduledMessages() {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	pending, err := h.store.GetPendingScheduledMessages(ctx)
	if err != nil {
		log.Printf("hub: get pending scheduled messages error: %v", err)
		return
	}

	for _, sm := range pending {
		// Insert as regular message using the scheduled message's timestamp.
		storedMsg, err := h.store.InsertMessage(sm.Username, sm.Content, sm.ReplyToID, sm.RoomID, sm.ToUser, sm.GroupName, sm.ThreadID)
		if err != nil {
			log.Printf("hub: insert scheduled message error: %v", err)
			continue
		}

		if err := h.store.MarkScheduledSent(sm.ID); err != nil {
			log.Printf("hub: mark scheduled sent error: %v", err)
		}

		// Broadcast the message to appropriate recipients.
		broadcastMsg, err := json.Marshal(Message{
			Type:      "message",
			ID:        storedMsg.ID,
			Username:  storedMsg.Username,
			Content:   storedMsg.Content,
			Timestamp: storedMsg.Timestamp,
			RoomID:    storedMsg.RoomID,
			To:        storedMsg.ToUser,
			Group:     storedMsg.GroupName,
			ThreadID:  storedMsg.ThreadID,
		})
		if err != nil {
			log.Printf("hub: marshal scheduled message error: %v", err)
			continue
		}

		if sm.ToUser != "" {
			// DM: send to recipient and echo to sender.
			h.SendToAllSessions(sm.ToUser, broadcastMsg)
			h.SendToAllSessions(sm.Username, broadcastMsg)
			// Notify the sender their scheduled message was sent.
			confirmMsg, _ := json.Marshal(Message{
				Type:      "scheduled_message_sent",
				ID:        sm.ID,
				Content:   sm.Content,
				Username:  sm.Username,
				Timestamp: storedMsg.Timestamp,
			})
			h.SendToAllSessions(sm.Username, confirmMsg)
		} else if sm.GroupName != "" {
			h.SendToGroup(sm.GroupName, broadcastMsg)
		} else if sm.RoomID != "" {
			h.BroadcastToRoom(broadcastMsg, sm.RoomID)
		} else {
			select {
			case h.broadcast <- broadcastMsg:
			default:
			}
		}
	}
}

// -------- Call session management --------

// CreateCallSession creates a new call session and stores it.
func (h *Hub) CreateCallSession(id, caller, callee, callType string) *CallSession {
	h.callSessionsMu.Lock()
	defer h.callSessionsMu.Unlock()
	cs := &CallSession{
		ID:        id,
		Caller:    caller,
		Callee:    callee,
		Type:      callType,
		Status:    "ringing",
		CreatedAt: time.Now().UnixMilli(),
	}
	h.callSessions[id] = cs
	return cs
}

// GetCallSession returns a call session by ID.
func (h *Hub) GetCallSession(id string) *CallSession {
	h.callSessionsMu.RLock()
	defer h.callSessionsMu.RUnlock()
	return h.callSessions[id]
}

// UpdateCallSessionStatus updates the status of a call session.
func (h *Hub) UpdateCallSessionStatus(id, status string) {
	h.callSessionsMu.Lock()
	defer h.callSessionsMu.Unlock()
	if cs, ok := h.callSessions[id]; ok {
		cs.Status = status
	}
}

// RemoveCallSession removes a call session.
func (h *Hub) RemoveCallSession(id string) {
	h.callSessionsMu.Lock()
	defer h.callSessionsMu.Unlock()
	delete(h.callSessions, id)
}

// CreateCallRoom creates a new multi-party call room.
func (h *Hub) CreateCallRoom(id string, participants []string) *CallRoom {
	h.callRoomsMu.Lock()
	defer h.callRoomsMu.Unlock()
	cr := &CallRoom{
		ID:           id,
		Participants: participants,
		CreatedAt:    time.Now().UnixMilli(),
	}
	h.callRooms[id] = cr
	return cr
}

// JoinCallRoom adds a user to an existing call room. Returns the room and whether
// the user was newly added.
func (h *Hub) JoinCallRoom(roomID, username string) (*CallRoom, bool) {
	h.callRoomsMu.Lock()
	defer h.callRoomsMu.Unlock()
	cr, ok := h.callRooms[roomID]
	if !ok {
		return nil, false
	}
	for _, p := range cr.Participants {
		if p == username {
			return cr, false // already in room
		}
	}
	cr.Participants = append(cr.Participants, username)
	return cr, true
}

// LeaveCallRoom removes a user from a call room. Returns the remaining participants.
func (h *Hub) LeaveCallRoom(roomID, username string) []string {
	h.callRoomsMu.Lock()
	defer h.callRoomsMu.Unlock()
	cr, ok := h.callRooms[roomID]
	if !ok {
		return nil
	}
	filtered := make([]string, 0, len(cr.Participants))
	for _, p := range cr.Participants {
		if p != username {
			filtered = append(filtered, p)
		}
	}
	if len(filtered) == 0 {
		delete(h.callRooms, roomID)
		return nil
	}
	cr.Participants = filtered
	return filtered
}

// GetCallRoom returns a call room by ID.
func (h *Hub) GetCallRoom(roomID string) *CallRoom {
	h.callRoomsMu.RLock()
	defer h.callRoomsMu.RUnlock()
	return h.callRooms[roomID]
}

// Stop signals the Run loop to exit cleanly. Safe to call multiple times.
func (h *Hub) Stop() {
	h.stopOnce.Do(func() {
		close(h.done)
	})
}

// Shutdown gracefully stops the hub and closes all client connections.
func (h *Hub) Shutdown() {
	h.Stop()
	h.mu.Lock()
	count := len(h.clients)
	for c := range h.clients {
		close(c.send)
		c.conn.Close()
	}
	h.clients = make(map[*Client]bool)
	h.mu.Unlock()
	log.Printf("hub: shutdown complete, %d clients disconnected", count)
}
