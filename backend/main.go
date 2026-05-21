package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"tokendancechat/backend/handler"
	"tokendancechat/backend/hub"
	"tokendancechat/backend/store"
)

// Server creates and returns the configured HTTP server, store, and hub.
func Server(dbPath, frontendDist, addr string) (*http.Server, *store.Store, *hub.Hub, error) {
	st, err := store.New(dbPath)
	if err != nil {
		return nil, nil, nil, err
	}

	h := hub.New(st)
	go h.Run()

	hdlr := handler.New(h, st)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", hdlr.HealthCheck)
	mux.HandleFunc("/api/messages", hdlr.GetMessages)
	mux.HandleFunc("/api/users/online", hdlr.GetOnlineUsers)
	mux.HandleFunc("/api/stats", hdlr.Stats)
	mux.HandleFunc("/ws", hdlr.HandleWebSocket)

	fs := http.FileServer(http.Dir(frontendDist))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Resolve the cleaned path — prevent path traversal.
		cleanPath := filepath.Clean(r.URL.Path)
		resolved := filepath.Join(frontendDist, cleanPath)
		// Compute absolute prefix to verify containment.
		absBase, err := filepath.Abs(frontendDist)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		absResolved, err := filepath.Abs(resolved)
		if err != nil || !strings.HasPrefix(absResolved, absBase+string(filepath.Separator)) && absResolved != absBase {
			http.NotFound(w, r)
			return
		}
		if _, err := os.Stat(resolved); os.IsNotExist(err) {
			http.ServeFile(w, r, filepath.Join(frontendDist, "index.html"))
			return
		}
		fs.ServeHTTP(w, r)
	}))

	var srv http.Handler = mux
	srv = handler.LoggingMiddleware(srv)
	srv = handler.SecurityHeadersMiddleware(srv)
	srv = handler.CORSMiddleware(srv)

	server := &http.Server{
		Addr:         addr,
		Handler:      srv,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return server, st, h, nil
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("starting TokenDanceChat backend...")

	dbPath := filepath.Join("..", "data", "chat.db")
	if envPath := os.Getenv("CHAT_DB_PATH"); envPath != "" {
		dbPath = envPath
	}

	frontendDist := os.Getenv("CHAT_FRONTEND_DIR")
	if frontendDist == "" {
		frontendDist = filepath.Join("..", "frontend", "dist")
	}

	addr := ":8080"
	if envAddr := os.Getenv("CHAT_ADDR"); envAddr != "" {
		addr = envAddr
	}

	server, st, _, err := Server(dbPath, frontendDist, addr)
	if err != nil {
		log.Fatalf("failed to create server: %v", err)
	}
	defer st.Close()

	go func() {
		log.Printf("listening on %s", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("server forced to shutdown: %v", err)
	}

	log.Println("server exited gracefully")
}
