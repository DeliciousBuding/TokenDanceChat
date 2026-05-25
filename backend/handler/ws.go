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
	CheckOrigin: func(r *http.Request) bool {
		if _, ok := allowedOrigin(r); ok {
			return true
		}
		log.Printf("ws: rejected origin %q for host %q", r.Header.Get("Origin"), r.Host)
		return false
	},
}

// HandleWebSocket handles GET /ws for WebSocket upgrade.
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Rate limit per-IP WebSocket upgrades (5 per 10s).
	ip := requestIP(r)
	if !WSAllow(ip) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"error":"too many connections, try again later","code":"RATE_LIMITED"}`))
		log.Printf("ws: rate limit blocked for %s", ip)
		return
	}

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
