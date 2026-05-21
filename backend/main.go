package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"tokendancechat/backend/handler"
	"tokendancechat/backend/hub"
	"tokendancechat/backend/llm"
	"tokendancechat/backend/store"
)

// Server creates and returns the configured HTTP server, store, and hub.
func Server(dbPath, frontendDist, addr string) (*http.Server, *store.Store, *hub.Hub, error) {
	st, err := store.New(dbPath)
	if err != nil {
		return nil, nil, nil, err
	}

	// Read bot config from environment.
	botName := os.Getenv("CHAT_BOT_NAME")
	if botName == "" {
		botName = "bot"
	}

	var llmCfg *llm.Config
	provider := os.Getenv("CHAT_LLM_PROVIDER")
	if provider != "" {
		memorySize := 20
		if ms := os.Getenv("CHAT_LLM_MEMORY_SIZE"); ms != "" {
			if parsed, err := strconv.Atoi(ms); err == nil && parsed > 0 {
				memorySize = parsed
			}
		}
		maxTokens := 8192
		if mt := os.Getenv("CHAT_LLM_MAX_TOKENS"); mt != "" {
			if parsed, err := strconv.Atoi(mt); err == nil && parsed > 0 {
				maxTokens = parsed
			}
		}

		llmCfg = &llm.Config{
			Provider:   strings.ToLower(provider),
			APIKey:     os.Getenv("CHAT_LLM_API_KEY"),
			Model:      os.Getenv("CHAT_LLM_MODEL"),
			BaseURL:    os.Getenv("CHAT_LLM_BASE_URL"),
			MaxTokens:  maxTokens,
			MemorySize: memorySize,
		}
	}

	h := hub.New(st, llmCfg, botName)

	// Set up bot memory persistence if LLM is configured and path is set.
	if llmCfg != nil {
		memPath := os.Getenv("CHAT_LLM_MEMORY_PATH")
		if memPath != "" {
			if h.Memory() != nil {
				if err := h.Memory().SetPersistPath(memPath); err != nil {
					log.Printf("warn: failed to load bot memory from %s: %v", memPath, err)
				} else {
					log.Printf("bot memory loaded from %s", memPath)
				}
			}
		}
	}

	// Server restart announcement: if there are existing messages, broadcast restart.
	existingCount := len(st.GetMessages(1, 0))
	if existingCount > 0 {
		st.InsertMessage("system", "服务器已重启 Server restarted", "")
		log.Printf("server restart announced (existing messages: %d)", existingCount)
	}

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
		cleanPath := filepath.Clean(r.URL.Path)

		// SPA fallback: root or empty path serves index.html.
		if cleanPath == "/" || cleanPath == "." {
			http.ServeFile(w, r, filepath.Join(frontendDist, "index.html"))
			return
		}

		resolved := filepath.Join(frontendDist, cleanPath)

		// Path traversal guard: ensure resolved path is within frontendDist.
		absBase, err := filepath.Abs(frontendDist)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		absResolved, err := filepath.Abs(resolved)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if !strings.HasPrefix(absResolved, absBase+string(filepath.Separator)) && absResolved != absBase {
			http.NotFound(w, r)
			return
		}

		// Serve file directly, fall back to index.html for SPA routes.
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
