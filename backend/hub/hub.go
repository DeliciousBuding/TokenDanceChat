package hub

import (
	"encoding/json"
	"log"
	"regexp"
	"sync"
)

// Store defines the interface for message persistence.
// This avoids circular imports between hub and store packages.
type Store interface {
	InsertMessage(username, content string) (StoredMessage, error)
	GetMessages(limit int, before int64) []StoredMessage
}

// StoredMessage is the message model returned by the store.
type StoredMessage struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
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

	mu sync.RWMutex
}

// New creates a new Hub with the given store.
func New(store Store) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		store:      store,
	}
}

// Run starts the hub's event loop. It should be run in a goroutine.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("client registered: %s (total: %d)", client.username, len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()

			if client.username != "" {
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

// usernameRegex validates: 1-20 chars, alphanumeric, underscore, or Chinese chars.
var usernameRegex = regexp.MustCompile(`^[\p{Han}a-zA-Z0-9_]{1,20}$`)

// ValidateUsername checks if a username meets the requirements.
func ValidateUsername(username string) bool {
	return usernameRegex.MatchString(username)
}
