package handler

import (
	"log"
	"net/http"

	"tokendancechat/backend/hub"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Allow all origins for development.
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// HandleWebSocket handles GET /ws for WebSocket upgrade.
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Reject if the hub is at capacity.
	if h.hub.IsFull() {
		http.Error(w, "server is full, please try again later", http.StatusServiceUnavailable)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}

	client := hub.NewClient(h.hub, conn)

	go client.WritePump()
	go client.ReadPump()
}
