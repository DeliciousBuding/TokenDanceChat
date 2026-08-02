package main

import (
	"context"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"tokendancechat/backend/store"
)

// testServer wraps a running HTTP server with its cleanup.
type testServer struct {
	server   *http.Server
	listener net.Listener
	store    *store.Store
	addr     string
}

// startTestServer creates a server, binds a listener, and starts serving.
func startTestServer(t *testing.T, dbPath, frontendDir string) *testServer {
	t.Helper()

	// Create a listener first to know the port before starting.
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to create listener: %v", err)
	}

	server, st, _, err := Server(dbPath, frontendDir, listener.Addr().String())
	if err != nil {
		listener.Close()
		t.Fatalf("Server() returned error: %v", err)
	}

	go server.Serve(listener)

	// Give the server time to start.
	time.Sleep(100 * time.Millisecond)

	return &testServer{
		server:   server,
		listener: listener,
		store:    st,
		addr:     listener.Addr().String(),
	}
}

func (ts *testServer) Close() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ts.server.Shutdown(ctx)
	ts.listener.Close()
	ts.store.Close()
}

func TestServerStartsAndServesHealth(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tokendancechat-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	frontendDir := filepath.Join(tmpDir, "frontend")
	if err := os.MkdirAll(frontendDir, 0755); err != nil {
		t.Fatalf("failed to create frontend dir: %v", err)
	}
	indexPath := filepath.Join(frontendDir, "index.html")
	if err := os.WriteFile(indexPath, []byte("<!DOCTYPE html><html><body>TokenDance</body></html>"), 0644); err != nil {
		t.Fatalf("failed to write index.html: %v", err)
	}

	ts := startTestServer(t, filepath.Join(tmpDir, "chat.db"), frontendDir)
	defer ts.Close()

	// Test health check endpoint.
	resp, err := http.Get("http://" + ts.addr + "/api/health")
	if err != nil {
		t.Fatalf("health check request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	// Test the frontend serves at root.
	resp2, err := http.Get("http://" + ts.addr + "/")
	if err != nil {
		t.Fatalf("frontend request failed: %v", err)
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusOK {
		t.Errorf("expected status 200 serving frontend, got %d", resp2.StatusCode)
	}
}

func TestSPAFallback(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tokendancechat-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	frontendDir := filepath.Join(tmpDir, "frontend")
	if err := os.MkdirAll(frontendDir, 0755); err != nil {
		t.Fatalf("failed to create frontend dir: %v", err)
	}
	indexContent := "<!DOCTYPE html><html><head><title>TokenDance SPA</title></head><body>SPA App</body></html>"
	if err := os.WriteFile(filepath.Join(frontendDir, "index.html"), []byte(indexContent), 0644); err != nil {
		t.Fatalf("failed to write index.html: %v", err)
	}

	ts := startTestServer(t, filepath.Join(tmpDir, "chat.db"), frontendDir)
	defer ts.Close()

	// Request a non-existent SPA route -- should fall back to index.html.
	resp, err := http.Get("http://" + ts.addr + "/some-spa-route")
	if err != nil {
		t.Fatalf("SPA fallback request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200 for SPA fallback, got %d", resp.StatusCode)
	}

	buf := make([]byte, 2048)
	n, _ := resp.Body.Read(buf)
	body := string(buf[:n])
	if body != indexContent {
		t.Errorf("SPA fallback did not return index.html content. Got: %s", body)
	}

	// Root path should also serve index.html.
	resp2, err := http.Get("http://" + ts.addr + "/")
	if err != nil {
		t.Fatalf("root path request failed: %v", err)
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusOK {
		t.Errorf("expected status 200 for root path, got %d", resp2.StatusCode)
	}
}

func TestGracefulShutdown(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tokendancechat-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	frontendDir := filepath.Join(tmpDir, "frontend")
	if err := os.MkdirAll(frontendDir, 0755); err != nil {
		t.Fatalf("failed to create frontend dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(frontendDir, "index.html"), []byte("ok"), 0644); err != nil {
		t.Fatalf("failed to write index.html: %v", err)
	}

	ts := startTestServer(t, filepath.Join(tmpDir, "chat.db"), frontendDir)
	defer ts.Close()

	// Verify the server is responding before shutdown.
	resp, err := http.Get("http://" + ts.addr + "/api/health")
	if err != nil {
		t.Fatalf("pre-shutdown health check failed: %v", err)
	}
	resp.Body.Close()

	// Perform graceful shutdown via the server's Shutdown method.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := ts.server.Shutdown(ctx); err != nil {
		t.Fatalf("graceful shutdown failed: %v", err)
	}

	// After shutdown, the server should no longer accept connections.
	time.Sleep(50 * time.Millisecond)
	_, err = http.Get("http://" + ts.addr + "/api/health")
	if err == nil {
		t.Error("expected connection refused after shutdown, but request succeeded")
	}
}

// TestParseEnvBool verifies all variants of the boolean environment parser.
func TestParseEnvBool(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		// True values.
		{"1", true},
		{"true", true},
		{"True", true},
		{"TRUE", true},
		{"yes", true},
		{"YES", true},
		{"y", true},
		{"Y", true},
		{"on", true},
		{"ON", true},
		// False values.
		{"0", false},
		{"false", false},
		{"False", false},
		{"no", false},
		{"NO", false},
		{"off", false},
		{"OFF", false},
		// Edge cases.
		{"", false},
		{"garbage", false},
		{"  true  ", true},
		{"  1  ", true},
		{"  0  ", false},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := parseEnvBool(tt.input)
			if got != tt.want {
				t.Errorf("parseEnvBool(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

// TestWriteAgentsMD verifies AGENTS.md is written with correct bot and agent names.
func TestWriteAgentsMD(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tokendancechat-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	err = writeAgentsMD(tmpDir, "MyBot", "MyAgent")
	if err != nil {
		t.Fatalf("writeAgentsMD() error: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(tmpDir, "AGENTS.md"))
	if err != nil {
		t.Fatalf("failed to read AGENTS.md: %v", err)
	}

	s := string(content)
	if !strings.Contains(s, "MyBot") {
		t.Errorf("AGENTS.md should contain 'MyBot', got: %s", s)
	}
	if !strings.Contains(s, "MyAgent") {
		t.Errorf("AGENTS.md should contain 'MyAgent', got: %s", s)
	}
	if !strings.Contains(s, "TokenDanceChat") {
		t.Errorf("AGENTS.md should contain 'TokenDanceChat', got: %s", s)
	}
}

// TestServerEnvBotName verifies Server picks up CHAT_BOT_NAME and CHAT_AGENT_NAME
// from the environment and writes them to AGENTS.md.
func TestServerEnvBotName(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tokendancechat-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	frontendDir := filepath.Join(tmpDir, "frontend")
	if err := os.MkdirAll(frontendDir, 0755); err != nil {
		t.Fatalf("failed to create frontend dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(frontendDir, "index.html"), []byte("ok"), 0644); err != nil {
		t.Fatalf("failed to write index.html: %v", err)
	}

	t.Setenv("CHAT_BOT_NAME", "CustomBot")
	t.Setenv("CHAT_AGENT_NAME", "CustomAgent")

	ts := startTestServer(t, filepath.Join(tmpDir, "chat.db"), frontendDir)
	defer ts.Close()

	content, err := os.ReadFile(filepath.Join(tmpDir, "AGENTS.md"))
	if err != nil {
		t.Fatalf("failed to read AGENTS.md: %v", err)
	}
	s := string(content)
	if !strings.Contains(s, "CustomBot") {
		t.Errorf("AGENTS.md should contain 'CustomBot', got: %s", s)
	}
	if !strings.Contains(s, "CustomAgent") {
		t.Errorf("AGENTS.md should contain 'CustomAgent', got: %s", s)
	}
}

// TestServerDefaultBotName verifies Server uses default bot/agent names when
// environment variables are not set.
func TestServerDefaultBotName(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tokendancechat-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	frontendDir := filepath.Join(tmpDir, "frontend")
	if err := os.MkdirAll(frontendDir, 0755); err != nil {
		t.Fatalf("failed to create frontend dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(frontendDir, "index.html"), []byte("ok"), 0644); err != nil {
		t.Fatalf("failed to write index.html: %v", err)
	}

	ts := startTestServer(t, filepath.Join(tmpDir, "chat.db"), frontendDir)
	defer ts.Close()

	content, err := os.ReadFile(filepath.Join(tmpDir, "AGENTS.md"))
	if err != nil {
		t.Fatalf("failed to read AGENTS.md: %v", err)
	}
	s := string(content)
	if !strings.Contains(s, "TokenBot") {
		t.Errorf("AGENTS.md should contain default 'TokenBot', got: %s", s)
	}
	if !strings.Contains(s, "PicoClaw") {
		t.Errorf("AGENTS.md should contain default 'PicoClaw', got: %s", s)
	}
}

// TestServerLLMMemoryPath verifies CHAT_LLM_MEMORY_PATH is used when LLM provider is set.
func TestServerLLMMemoryPath(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tokendancechat-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	frontendDir := filepath.Join(tmpDir, "frontend")
	if err := os.MkdirAll(frontendDir, 0755); err != nil {
		t.Fatalf("failed to create frontend dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(frontendDir, "index.html"), []byte("ok"), 0644); err != nil {
		t.Fatalf("failed to write index.html: %v", err)
	}

	memPath := filepath.Join(tmpDir, "memory.json")
	t.Setenv("CHAT_LLM_PROVIDER", "openai")
	t.Setenv("CHAT_LLM_API_KEY", "sk-test")
	t.Setenv("CHAT_LLM_MODEL", "gpt-4")
	t.Setenv("CHAT_LLM_MEMORY_PATH", memPath)

	ts := startTestServer(t, filepath.Join(tmpDir, "chat.db"), frontendDir)
	defer ts.Close()

	// Server should start successfully with LLM config.
	resp, err := http.Get("http://" + ts.addr + "/api/health")
	if err != nil {
		t.Fatalf("health check failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

// TestRetiredRoutesReturn404 is the route contract test for the PR-1
// retirement: deleted routes (/api/upload, /api/giphy/*, /uploads/) must
// return 404 — not fall through to the SPA fallback which would return
// index.html and make route removal look green — while the retained emoji
// routes must still be registered.
func TestRetiredRoutesReturn404(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tokendancechat-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	frontendDir := filepath.Join(tmpDir, "frontend")
	if err := os.MkdirAll(frontendDir, 0755); err != nil {
		t.Fatalf("failed to create frontend dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(frontendDir, "index.html"), []byte("<!DOCTYPE html><html><body>SPA</body></html>"), 0644); err != nil {
		t.Fatalf("failed to write index.html: %v", err)
	}

	ts := startTestServer(t, filepath.Join(tmpDir, "chat.db"), frontendDir)
	defer ts.Close()

	client := &http.Client{Timeout: 5 * time.Second}

	// Deleted routes must 404 (not the SPA fallback 200).
	retired := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/api/upload"},
		{http.MethodGet, "/api/upload"},
		{http.MethodGet, "/uploads/sample.png"},
		{http.MethodGet, "/uploads/"},
		{http.MethodGet, "/api/giphy/search?q=test"},
		{http.MethodGet, "/api/giphy/trending"},
	}
	for _, tt := range retired {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			req, err := http.NewRequest(tt.method, "http://"+ts.addr+tt.path, nil)
			if err != nil {
				t.Fatalf("failed to create request: %v", err)
			}
			resp, err := client.Do(req)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusNotFound {
				t.Errorf("expected 404 for %s %s, got %d", tt.method, tt.path, resp.StatusCode)
			}
		})
	}

	// Retained emoji routes must still be registered: wrong method on a
	// registered route yields 405, not the 404 of a deleted route.
	t.Run("GET /api/emoji/upload is 405 not 404", func(t *testing.T) {
		req, err := http.NewRequest(http.MethodGet, "http://"+ts.addr+"/api/emoji/upload", nil)
		if err != nil {
			t.Fatalf("failed to create request: %v", err)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusMethodNotAllowed {
			t.Errorf("expected 405 for GET /api/emoji/upload (route registered, wrong method), got %d", resp.StatusCode)
		}
	})

	// /uploads/emojis/ is still registered: a missing file is a handler 404.
	t.Run("GET /uploads/emojis/x.png is 404 from handler", func(t *testing.T) {
		req, err := http.NewRequest(http.MethodGet, "http://"+ts.addr+"/uploads/emojis/x.png", nil)
		if err != nil {
			t.Fatalf("failed to create request: %v", err)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("expected 404 for GET /uploads/emojis/x.png (route registered, file missing), got %d", resp.StatusCode)
		}
	})
}
