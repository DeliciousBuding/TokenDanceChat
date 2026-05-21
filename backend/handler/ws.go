package handler

import (
	"log"
	"net/http"
	"strings"

	"tokendancechat/backend/hub"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // same-origin requests don't send Origin
		}
		host := r.Host
		// Allow same-origin and vectorcontrol.tech subdomains.
		if strings.HasSuffix(origin, "://"+host) || strings.HasSuffix(origin, "://"+strings.TrimPrefix(host, "www.")) {
			return true
		}
		if strings.HasSuffix(origin, ".vectorcontrol.tech") || strings.HasSuffix(origin, "://vectorcontrol.tech") {
			return true
		}
		log.Printf("ws: rejected origin %q for host %q", origin, host)
		return false
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
