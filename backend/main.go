package main

import (
	"context"
	"fmt"
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
		botName = "TokenBot"
	}
	agentName := os.Getenv("CHAT_AGENT_NAME")
	if agentName == "" {
		agentName = "PicoClaw"
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

	h := hub.New(st, llmCfg, botName, agentName)
	h.LoadPersistedState()

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

	// Set up AGENTS.md and MEMORY.md in the data directory.
	dataDir := filepath.Dir(dbPath)
	if err := writeAgentsMD(dataDir, botName, agentName); err != nil {
		log.Printf("warn: failed to write AGENTS.md: %v", err)
	} else {
		log.Printf("AGENTS.md written to %s", dataDir)
	}

	// Set MEMORY.md path for periodic summarization.
	memoryMDPath := filepath.Join(dataDir, "MEMORY.md")
	h.SetMemoryPath(memoryMDPath)
	log.Printf("MEMORY.md path set to %s", memoryMDPath)

	// Server restart announcement: if there are existing messages, broadcast restart.
	existingCount := len(st.GetMessages(1, 0))
	if existingCount > 0 {
		st.InsertMessage("system", "服务器已重启 Server restarted", "", "", "", "", "")
		log.Printf("server restart announced (existing messages: %d)", existingCount)
	}

	go h.Run()

	dataDir = filepath.Dir(dbPath)
	uploadsDir := filepath.Join(dataDir, "uploads")
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		return nil, nil, nil, err
	}
	emojiDir := filepath.Join(uploadsDir, "emojis")
	if err := os.MkdirAll(emojiDir, 0755); err != nil {
		return nil, nil, nil, err
	}

	hdlr := handler.New(h, st, uploadsDir)

	// OIDC setup (TokenDance ID integration).
	oidcEnabled := parseEnvBool(os.Getenv("CHAT_OIDC_ENABLED"))
	oidcIssuer := os.Getenv("CHAT_OIDC_ISSUER")
	oidcClientID := os.Getenv("CHAT_OIDC_CLIENT_ID")
	oidcClientSecret := os.Getenv("CHAT_OIDC_CLIENT_SECRET")
	oidcRedirectURI := os.Getenv("CHAT_OIDC_REDIRECT_URI")
	if err := hdlr.SetupOIDC(oidcEnabled, oidcClientID, oidcClientSecret, oidcIssuer, oidcRedirectURI); err != nil {
		return nil, nil, nil, fmt.Errorf("OIDC setup failed: %w", err)
	}
	if oidcEnabled {
		log.Printf("oidc: enabled — issuer=%s client_id=%s confidential=%v", oidcIssuer, oidcClientID, oidcClientSecret != "")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", hdlr.HealthCheck)
	mux.HandleFunc("/api/messages", hdlr.GetMessages)
	mux.HandleFunc("/api/users/online", hdlr.GetOnlineUsers)
	mux.HandleFunc("/api/stats", hdlr.Stats)
	mux.HandleFunc("/api/link-preview", hdlr.LinkPreview)
	mux.HandleFunc("/api/emoji/upload", hdlr.UploadEmoji)
	mux.HandleFunc("/api/search", hdlr.Search)
	mux.HandleFunc("/api/export", hdlr.ExportMessages)
	mux.HandleFunc("/api/register", hdlr.Register)
	mux.HandleFunc("/api/login", hdlr.Login)
	mux.HandleFunc("/api/invite/generate", hdlr.InviteGenerate)
	mux.HandleFunc("/api/invite/list", hdlr.InviteList)
	mux.HandleFunc("/api/webhook/", hdlr.WebhookHandler)
	mux.HandleFunc("/api/admin/stats", hdlr.AdminStats)
	mux.HandleFunc("/uploads/emojis/", hdlr.ServeEmoji)
	mux.HandleFunc("/ws", hdlr.HandleWebSocket)

	// OIDC routes (only registered when enabled).
	if oidcEnabled {
		mux.HandleFunc("/api/oidc/config", hdlr.OIDCConfigHandler)
		mux.HandleFunc("/api/oidc/login", hdlr.OIDCLogin)
		mux.HandleFunc("/api/oidc/callback", hdlr.OIDCCallback)
		mux.HandleFunc("/api/oidc/exchange", hdlr.OIDCExchange)
		mux.HandleFunc("/api/oidc/refresh", hdlr.OIDCRefresh)
		mux.HandleFunc("/api/oidc/redeem", hdlr.OIDCRedeem)
	}

	fs := http.FileServer(http.Dir(frontendDist))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleanPath := filepath.Clean(r.URL.Path)

		// Retired routes must 404, not fall through to the SPA fallback (which
		// would serve index.html and make route removal look green). Check the
		// raw URL path: filepath.Clean is platform-dependent (backslashes on
		// Windows) and strips trailing slashes ("/uploads/" -> "/uploads").
		rawPath := r.URL.Path
		if rawPath == "/api" || strings.HasPrefix(rawPath, "/api/") ||
			rawPath == "/uploads" || strings.HasPrefix(rawPath, "/uploads/") {
			http.NotFound(w, r)
			return
		}

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
	srv = handler.RateLimitMiddleware(srv)
	srv = handler.SecurityHeadersMiddleware(srv)
	srv = handler.CORSMiddleware(srv)

	server := &http.Server{
		Addr:         addr,
		Handler:      srv,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return server, st, h, nil
}

func parseEnvBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}

// writeAgentsMD writes the AGENTS.md file with bot rules and system prompt.
func writeAgentsMD(dataDir, botName, agentName string) error {
	content := fmt.Sprintf(`# AGENTS.md

## System Prompt
TokenDanceChat has two assistant identities:
- %s: normal chat bot backed by the LLM adapter.
- %s: Agent workflow bot backed by the LLM adapter.

Speak Chinese by default. Be concise and friendly.

## Rules
- No offensive content
- No roleplaying
- Identify yourself as %s when responding as the normal bot
- Identify yourself as %s when responding as the Agent workflow bot
- When mentioning users, use @username format
- Be helpful, concise, and friendly

## Identity
Bot name: %s
Agent name: %s
This file is auto-generated from config on server startup.
`, botName, agentName, botName, agentName, botName, agentName)

	agentsPath := filepath.Join(dataDir, "AGENTS.md")
	return os.WriteFile(agentsPath, []byte(content), 0644)
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

	server, st, h, err := Server(dbPath, frontendDist, addr)
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

	// Shut down HTTP server first to stop accepting new connections
	// and drain in-flight requests, then close hub connections.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("server forced to shutdown: %v", err)
	}

	log.Println("server exited gracefully")

	h.Shutdown()
	log.Println("hub shut down")
}
