package hub

import (
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strings"
	"sync"
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

// Store defines the interface for message persistence.
type Store interface {
	InsertMessage(username, content, replyToID, roomID, toUser, groupName string) (StoredMessage, error)
	GetMessages(limit int, before int64) []StoredMessage
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

	// DM delivery tracking
	GetUndeliveredDMs(username string, limit int) []StoredMessage
	MarkMessagesDelivered(ids []string) error

	// Message pinning
	PinMessage(roomID, messageID, pinnedBy string) error
	UnpinMessage(roomID, messageID string) error
	GetPinnedMessages(roomID string) []StoredMessage

	// User blocking
	BlockUser(username, blocked string) error
	UnblockUser(username, blocked string) error
	IsBlocked(username, blocked string) bool
	GetBlockedUsers(username string) []string
}

// Group represents a chat group.
type Group struct {
	Name    string          `json:"name"`
	Members map[string]bool `json:"members"`
}

// UserStatus represents a user with their online/offline status.
type UserStatus struct {
	Username string `json:"username"`
	Online   bool   `json:"online"`
	LastSeen int64  `json:"last_seen"`
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

	// Group system
	Group   string   `json:"group,omitempty"`
	Members []string `json:"members,omitempty"`

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

	// Pinned
	Pinned   bool            `json:"pinned,omitempty"`
	PinnedBy string           `json:"pinned_by,omitempty"`
	PinnedAt int64            `json:"pinned_at,omitempty"`
}

// Hub maintains the set of active clients and broadcasts messages to them.
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
		register:        make(chan *Client),
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
	}
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
// Run starts the hub's event loop. It should be run in a goroutine.
func (h *Hub) Run() {
	syncTicker := time.NewTicker(30 * time.Second)
	defer syncTicker.Stop()

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			// Reject duplicate usernames atomically.
			usernameTaken := false
			for c := range h.clients {
				if c.username == client.username {
					usernameTaken = true
					break
				}
			}
			if usernameTaken {
				h.mu.Unlock()
				close(client.send)
				log.Printf("client rejected (duplicate username): %s", client.username)
				continue
			}
			h.clients[client] = true
			h.mu.Unlock()

			// Update last seen for this user.
			h.lastSeenMu.Lock()
			h.lastSeen[client.username] = time.Now().UnixMilli()
			h.lastSeenMu.Unlock()

			log.Printf("client registered: %s (total: %d)", client.username, len(h.clients))

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
// sorted by online first, then by last seen descending.
func (h *Hub) AllUserStatus() []UserStatus {
	onlineMap := make(map[string]bool)
	h.mu.RLock()
	for c := range h.clients {
		if c.username != "" {
			onlineMap[c.username] = true
		}
	}
	h.mu.RUnlock()

	h.lastSeenMu.RLock()
	defer h.lastSeenMu.RUnlock()

	users := make([]UserStatus, 0, len(h.lastSeen))
	for username, ls := range h.lastSeen {
		users = append(users, UserStatus{
			Username: username,
			Online:   onlineMap[username],
			LastSeen: ls,
		})
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
	h.groupsMu.RUnlock()
	if !ok {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if g.Members[c.username] {
			select {
			case c.send <- data:
			default:
			}
		}
	}
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
	storedMsg, err := h.store.InsertMessage(username, content, "", roomID, "", "")
	if err != nil {
		log.Printf("failed to insert assistant message: %v", err)
		return
	}

	broadcastMsg, _ := json.Marshal(Message{
		Type:      "message",
		ID:        storedMsg.ID,
		Username:  storedMsg.Username,
		Content:   storedMsg.Content,
		Timestamp: storedMsg.Timestamp,
		RoomID:    roomID,
	})

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
	storedMsg, err := h.store.InsertMessage(username, content, "", roomID, "", "")
	if err != nil {
		log.Printf("failed to insert assistant message: %v", err)
		return
	}

	broadcastMsg, _ := json.Marshal(Message{
		Type:      "message",
		ID:        storedMsg.ID,
		Username:  storedMsg.Username,
		Content:   storedMsg.Content,
		Timestamp: storedMsg.Timestamp,
		RoomID:    roomID,
	})

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

// BroadcastStreamChunk sends a streaming chunk to all connected clients.
// Deprecated: use BroadcastStreamChunkToRoom for room-scoped delivery.
func (h *Hub) BroadcastStreamChunk(username, content string, done bool) {
	h.BroadcastStreamChunkToRoom(username, content, done, "")
}

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

// Shutdown gracefully stops the hub and closes all client connections.
func (h *Hub) Shutdown() {
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
