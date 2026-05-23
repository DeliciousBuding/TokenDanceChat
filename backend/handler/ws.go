package handler

import (
	"log"
	"os"
	"net"
	"net/http"
	"net/url"
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
		originURL, err := url.Parse(origin)
		if err != nil {
			return false
		}
		originHost := originURL.Hostname()
		host := r.Host
		// Strip port from Host header for comparison.
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		// Allow same-origin.
		if strings.EqualFold(originHost, host) || strings.EqualFold(originHost, strings.TrimPrefix(host, "www.")) {
			return true
		}
		// Allow origins from CHAT_ALLOWED_ORIGINS env var (comma-separated).
		if allowed := os.Getenv("CHAT_ALLOWED_ORIGINS"); allowed != "" {
			if allowed == "*" {
				return true
			}
			for _, o := range strings.Split(allowed, ",") {
				o = strings.TrimSpace(o)
				if strings.EqualFold(originHost, o) || (strings.HasPrefix(o, ".") && strings.HasSuffix(originHost, o)) {
					return true
				}
			}
		}
		log.Printf("ws: rejected origin %q for host %q", origin, host)
		return false
	},
}

// HandleWebSocket handles GET /ws for WebSocket upgrade.
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Rate limit per-IP WebSocket upgrades (5 per 10s).
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
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
