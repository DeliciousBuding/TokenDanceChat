package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"tokendancechat/backend/handler"
	"tokendancechat/backend/hub"
	"tokendancechat/backend/store"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("starting TokenDanceChat backend...")

	// Initialize SQLite store.
	dbPath := filepath.Join("..", "data", "chat.db")
	if envPath := os.Getenv("CHAT_DB_PATH"); envPath != "" {
		dbPath = envPath
	}
	st, err := store.New(dbPath)
	if err != nil {
		log.Fatalf("failed to open store: %v", err)
	}
	defer st.Close()

	// Initialize WebSocket hub.
	h := hub.New(st)
	go h.Run()

	// Initialize HTTP handler.
	hdlr := handler.New(h, st)

	// Set up routes.
	mux := http.NewServeMux()

	// API routes.
	mux.HandleFunc("/api/health", hdlr.HealthCheck)
	mux.HandleFunc("/api/messages", hdlr.GetMessages)
	mux.HandleFunc("/api/users/online", hdlr.GetOnlineUsers)
	mux.HandleFunc("/ws", hdlr.HandleWebSocket)

	// Static file serving for SPA.
	frontendDist := filepath.Join("..", "frontend", "dist")
	fs := http.FileServer(http.Dir(frontendDist))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// If the request path matches an API route, it's already handled by the mux above.
		// For static files, try serving the file; if not found, serve index.html (SPA fallback).
		path := filepath.Join(frontendDist, filepath.Clean(r.URL.Path))
		if _, err := os.Stat(path); os.IsNotExist(err) {
			http.ServeFile(w, r, filepath.Join(frontendDist, "index.html"))
			return
		}
		fs.ServeHTTP(w, r)
	}))

	// Apply middleware.
	var srv http.Handler = mux
	srv = handler.LoggingMiddleware(srv)
	srv = handler.CORSMiddleware(srv)

	// Create HTTP server.
	addr := ":8080"
	if envAddr := os.Getenv("CHAT_ADDR"); envAddr != "" {
		addr = envAddr
	}

	server := &http.Server{
		Addr:         addr,
		Handler:      srv,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine.
	go func() {
		log.Printf("listening on %s", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Wait for interrupt signal for graceful shutdown.
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
