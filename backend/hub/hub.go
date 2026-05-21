package hub

import (
	"encoding/json"
	"log"
	"regexp"
	"sync"
	"time"

	"tokendancechat/backend/llm"
)

// MaxConnections is the hard limit on concurrent WebSocket connections.
const MaxConnections = 100

// Store defines the interface for message persistence.
// This avoids circular imports between hub and store packages.
type Store interface {
	InsertMessage(username, content, replyToID string) (StoredMessage, error)
	GetMessages(limit int, before int64) []StoredMessage
	TotalMessages() int64
	MarkDeleted(messageID string) error
}

// StoredMessage is the message model returned by the store.
type StoredMessage struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
	ReplyToID string `json:"reply_to_id,omitempty"`
	Deleted   bool   `json:"deleted"`
}

// Group represents a chat group.
type Group struct {
	Name    string          `json:"name"`
	Members map[string]bool `json:"members"`
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

	// LLM bot support.
	llmClient *llm.Client
	memory    *llm.Memory
	botName   string

	// typingRateLimit tracks the last time a typing broadcast was sent per username.
	typingRateLimit map[string]time.Time

	// Friend system: username -> set of friend usernames.
	friends   map[string]map[string]bool
	friendsMu sync.RWMutex

	// Group system: group name -> Group.
	groups   map[string]*Group
	groupsMu sync.RWMutex

	// Last seen tracking: username -> last seen timestamp (UnixMilli).
	lastSeen   map[string]int64
	lastSeenMu sync.RWMutex

	mu sync.RWMutex
}

// New creates a new Hub with the given store. llmCfg and botName are optional;
// pass nil for llmCfg to disable LLM bot support.
func New(store Store, llmCfg *llm.Config, botName string) *Hub {
	var client *llm.Client
	var mem *llm.Memory
	if llmCfg != nil {
		client = llm.New(*llmCfg)
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
		unregister:      make(chan *Client),
		store:           store,
		StartTime:       time.Now(),
		llmClient:       client,
		memory:          mem,
		botName:         botName,
		typingRateLimit: make(map[string]time.Time),
		friends:         make(map[string]map[string]bool),
		groups:          make(map[string]*Group),
		lastSeen:        make(map[string]int64),
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

// BotName returns the configured bot username, or empty string if no bot is configured.
func (h *Hub) BotName() string {
	return h.botName
}

// LLMClient returns the LLM client, or nil if not configured.
func (h *Hub) LLMClient() *llm.Client {
	return h.llmClient
}

// Memory returns the LLM context memory, or nil if not configured.
func (h *Hub) Memory() *llm.Memory {
	return h.memory
}

// LastSeen returns the last seen timestamp for a username.
func (h *Hub) LastSeen(username string) int64 {
	h.lastSeenMu.RLock()
	defer h.lastSeenMu.RUnlock()
	return h.lastSeen[username]
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
func (h *Hub) SendToUser(username string, data []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.username == username {
			select {
			case c.send <- data:
			default:
			}
			return
		}
	}
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
		log.Printf("broadcast channel full, dropping message")
	}
}

// SendBotMessage persists a bot message to the store and broadcasts it.
func (h *Hub) SendBotMessage(content string) {
	storedMsg, err := h.store.InsertMessage(h.botName, content, "")
	if err != nil {
		log.Printf("failed to insert bot message: %v", err)
		return
	}

	broadcastMsg, _ := json.Marshal(Message{
		Type:      "message",
		ID:        storedMsg.ID,
		Username:  storedMsg.Username,
		Content:   storedMsg.Content,
		Timestamp: storedMsg.Timestamp,
	})

	select {
	case h.broadcast <- broadcastMsg:
	default:
		log.Printf("broadcast channel full, dropping bot message")
	}
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
	defer h.friendsMu.Unlock()
	if h.friends[a] == nil {
		h.friends[a] = make(map[string]bool)
	}
	if h.friends[b] == nil {
		h.friends[b] = make(map[string]bool)
	}
	h.friends[a][b] = true
	h.friends[b][a] = true
}

// RemoveFriend removes a bidirectional friend relationship.
func (h *Hub) RemoveFriend(a, b string) {
	h.friendsMu.Lock()
	defer h.friendsMu.Unlock()
	if h.friends[a] != nil {
		delete(h.friends[a], b)
	}
	if h.friends[b] != nil {
		delete(h.friends[b], a)
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
	return true
}

// AddGroupMember adds a member to a group.
func (h *Hub) AddGroupMember(groupName, username string) bool {
	h.groupsMu.Lock()
	defer h.groupsMu.Unlock()
	g, ok := h.groups[groupName]
	if !ok {
		return false
	}
	g.Members[username] = true
	return true
}

// RemoveGroupMember removes a member from a group.
func (h *Hub) RemoveGroupMember(groupName, username string) {
	h.groupsMu.Lock()
	defer h.groupsMu.Unlock()
	g, ok := h.groups[groupName]
	if !ok {
		return
	}
	delete(g.Members, username)
}

// BroadcastStreamChunk sends a streaming chunk to all connected clients.
// This is used for streaming LLM responses without persisting to the store.
func (h *Hub) BroadcastStreamChunk(username, content string, done bool) {
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
	select {
	case h.broadcast <- data:
	default:
		log.Printf("broadcast channel full, dropping stream chunk")
	}
}

// BroadcastTyping sends a typing indicator to all clients except the sender.
// Rate limit is enforced by the caller via shouldBroadcastTyping.
func (h *Hub) BroadcastTyping(username, eventType string) {
	msg := Message{
		Type:     eventType,
		Username: username,
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
