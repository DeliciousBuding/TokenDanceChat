package main

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"tokendancechat/backend/handler"
)

// ==============================================================================
// Default config / env-var parsing tests
// ==============================================================================

// defaultConfigFromEnv mirrors main() env-var reading for testability.
func defaultConfigFromEnv() (dbPath, frontendDist, addr string) {
	dbPath = filepath.Join("..", "data", "chat.db")
	if envPath := os.Getenv("CHAT_DB_PATH"); envPath != "" {
		dbPath = envPath
	}
	frontendDist = os.Getenv("CHAT_FRONTEND_DIR")
	if frontendDist == "" {
		frontendDist = filepath.Join("..", "frontend", "dist")
	}
	addr = ":8080"
	if envAddr := os.Getenv("CHAT_ADDR"); envAddr != "" {
		addr = envAddr
	}
	return
}

func TestDefaultConfigValues(t *testing.T) {
	dbPath, frontendDist, addr := defaultConfigFromEnv()

	if dbPath != filepath.Join("..", "data", "chat.db") {
		t.Errorf("default dbPath: got %q, want %q", dbPath, filepath.Join("..", "data", "chat.db"))
	}
	if frontendDist != filepath.Join("..", "frontend", "dist") {
		t.Errorf("default frontendDist: got %q, want %q", frontendDist, filepath.Join("..", "frontend", "dist"))
	}
	if addr != ":8080" {
		t.Errorf("default addr: got %q, want :8080", addr)
	}
}

func TestEnvVarCHAT_DB_PATH(t *testing.T) {
	t.Setenv("CHAT_DB_PATH", "/custom/path/chat.db")
	dbPath, _, _ := defaultConfigFromEnv()
	if dbPath != "/custom/path/chat.db" {
		t.Errorf("CHAT_DB_PATH override: got %q, want /custom/path/chat.db", dbPath)
	}
}

func TestEnvVarCHAT_FRONTEND_DIR(t *testing.T) {
	t.Setenv("CHAT_FRONTEND_DIR", "/custom/frontend")
	_, frontendDist, _ := defaultConfigFromEnv()
	if frontendDist != "/custom/frontend" {
		t.Errorf("CHAT_FRONTEND_DIR override: got %q, want /custom/frontend", frontendDist)
	}
}

func TestEnvVarCHAT_ADDR(t *testing.T) {
	t.Setenv("CHAT_ADDR", ":9090")
	_, _, addr := defaultConfigFromEnv()
	if addr != ":9090" {
		t.Errorf("CHAT_ADDR override: got %q, want :9090", addr)
	}
}

func TestEnvVarAllCustom(t *testing.T) {
	t.Setenv("CHAT_DB_PATH", "/a/chat.db")
	t.Setenv("CHAT_FRONTEND_DIR", "/a/frontend")
	t.Setenv("CHAT_ADDR", ":3000")
	dbPath, frontendDist, addr := defaultConfigFromEnv()
	if dbPath != "/a/chat.db" || frontendDist != "/a/frontend" || addr != ":3000" {
		t.Errorf("all custom: db=%q fe=%q addr=%q", dbPath, frontendDist, addr)
	}
}

func TestServerStartsWithEnvAddr(t *testing.T) {
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

	t.Setenv("CHAT_ADDR", "127.0.0.1:0")
	_, _, addr := defaultConfigFromEnv()

	server, st, _, err := Server(filepath.Join(tmpDir, "chat.db"), frontendDir, addr)
	if err != nil {
		t.Fatalf("Server() returned error: %v", err)
	}
	defer st.Close()

	if server.Addr != addr {
		t.Errorf("server.Addr = %q, want %q", server.Addr, addr)
	}

	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		t.Fatalf("failed to listen on %s: %v", server.Addr, err)
	}
	listener.Close()
}

func TestServerStartsWithEnvDBPath(t *testing.T) {
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

	dbPath := filepath.Join(tmpDir, "custom.db")
	ts := startTestServer(t, dbPath, frontendDir)
	defer ts.Close()

	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Errorf("database file not created at %s", dbPath)
	}
}

// ==============================================================================
// Graceful shutdown via signal tests
// ==============================================================================

func TestServerGracefulShutdownViaSignal(t *testing.T) {
	// os.Process.Signal is not supported on Windows.
	// Use a channel-based simulation of the main() shutdown pattern instead.
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

	// Verify server is alive before shutdown.
	resp, err := http.Get("http://" + ts.addr + "/api/health")
	if err != nil {
		t.Fatalf("pre-shutdown health check failed: %v", err)
	}
	resp.Body.Close()

	// Simulate the main() signal loop using a channel.
	// In main(), this would be: quit := make(chan os.Signal, 1)
	//                          signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	//                          <-quit
	// We simulate the same pattern without depending on OS signals.
	quit := make(chan struct{})

	shutdownDone := make(chan error, 1)
	go func() {
		<-quit
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		shutdownDone <- ts.server.Shutdown(ctx)
	}()

	// Simulate receiving a signal by closing the quit channel.
	close(quit)

	// Wait for shutdown to complete.
	select {
	case err := <-shutdownDone:
		if err != nil {
			t.Fatalf("shutdown after signal returned error: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for signal-triggered shutdown")
	}

	// After signal-triggered shutdown, server should reject connections.
	time.Sleep(50 * time.Millisecond)
	_, err = http.Get("http://" + ts.addr + "/api/health")
	if err == nil {
		t.Error("expected connection refused after signal-triggered shutdown, but request succeeded")
	}
}

func TestServerShutdownCleansUpListener(t *testing.T) {
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

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := ts.server.Shutdown(ctx); err != nil {
		t.Fatalf("shutdown failed: %v", err)
	}

	if err := ts.listener.Close(); err != nil {
		t.Logf("listener close returned (expected after shutdown): %v", err)
	}

	listener2, err := net.Listen("tcp", ts.addr)
	if err != nil {
		t.Errorf("port %s could not be re-bound after shutdown: %v", ts.addr, err)
	} else {
		listener2.Close()
	}
}

// ==============================================================================
// CORS middleware tests
// ==============================================================================

func newCORSHandler() http.Handler {
	okHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	return handler.CORSMiddleware(okHandler)
}

func TestCORSMiddlewareNoOrigin(t *testing.T) {
	t.Setenv("CHAT_ALLOWED_ORIGINS", "")
	h := newCORSHandler()

	// Same-origin request (no Origin header) succeeds with no ACAO.
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("same-origin request: expected 200, got %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("same-origin request should not set ACAO, got %q",
			rec.Header().Get("Access-Control-Allow-Origin"))
	}

	// Cross-origin request without config: no ACAO.
	req2 := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req2.Header.Set("Origin", "https://evil.com")
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)

	if rec2.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("cross-origin with no config: expected empty ACAO, got %q",
			rec2.Header().Get("Access-Control-Allow-Origin"))
	}
	if rec2.Code != http.StatusOK {
		t.Errorf("cross-origin request body: expected 200, got %d", rec2.Code)
	}
}

func TestCORSMiddlewareStarOrigin(t *testing.T) {
	t.Setenv("CHAT_ALLOWED_ORIGINS", "*")
	h := newCORSHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Header.Set("Origin", "https://any-origin.example.com")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Header().Get("Access-Control-Allow-Origin") != "https://any-origin.example.com" {
		t.Errorf("star origin: expected ACAO=%q, got %q",
			"https://any-origin.example.com",
			rec.Header().Get("Access-Control-Allow-Origin"))
	}
	if rec.Header().Get("Vary") != "Origin" {
		t.Errorf("star origin: expected Vary=Origin, got %q", rec.Header().Get("Vary"))
	}
}

func TestCORSMiddlewareExactOrigin(t *testing.T) {
	// The middleware compares hostnames (url.Parse(origin).Hostname()) against
	// the configured values, so CHAT_ALLOWED_ORIGINS should contain bare hostnames.
	t.Setenv("CHAT_ALLOWED_ORIGINS", "myapp.example.com")
	h := newCORSHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Header.Set("Origin", "https://myapp.example.com")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Header().Get("Access-Control-Allow-Origin") != "https://myapp.example.com" {
		t.Errorf("exact match: expected ACAO=%q, got %q",
			"https://myapp.example.com",
			rec.Header().Get("Access-Control-Allow-Origin"))
	}

	// Non-matching origin.
	req2 := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req2.Header.Set("Origin", "https://evil.com")
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)

	if rec2.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("exact mismatch: expected empty ACAO, got %q",
			rec2.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestCORSMiddlewareSubdomainOrigin(t *testing.T) {
	t.Setenv("CHAT_ALLOWED_ORIGINS", ".example.com")
	h := newCORSHandler()

	tests := []struct {
		origin    string
		shouldSet bool
	}{
		{"https://app.example.com", true},
		{"https://admin.example.com", true},
		{"https://deep.sub.example.com", true},
		{"https://example.com", false},
		{"https://evil.com", false},
		{"https://example.com.evil.com", false},
	}

	for _, tt := range tests {
		t.Run(tt.origin, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
			req.Header.Set("Origin", tt.origin)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)

			acao := rec.Header().Get("Access-Control-Allow-Origin")
			if tt.shouldSet && acao != tt.origin {
				t.Errorf("expected ACAO=%q, got %q", tt.origin, acao)
			}
			if !tt.shouldSet && acao != "" {
				t.Errorf("expected no ACAO, got %q", acao)
			}
		})
	}
}

func TestCORSMiddlewareMultipleOrigins(t *testing.T) {
	t.Setenv("CHAT_ALLOWED_ORIGINS", "app.example.com, admin.example.com, .cdn.example.com")
	h := newCORSHandler()

	tests := []struct {
		origin    string
		shouldSet bool
	}{
		{"https://app.example.com", true},
		{"https://admin.example.com", true},
		{"https://cdn.example.com", false},
		{"https://static.cdn.example.com", true},
		{"https://other.example.com", false},
	}

	for _, tt := range tests {
		t.Run(tt.origin, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
			req.Header.Set("Origin", tt.origin)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)

			acao := rec.Header().Get("Access-Control-Allow-Origin")
			if tt.shouldSet && acao != tt.origin {
				t.Errorf("expected ACAO=%q, got %q", tt.origin, acao)
			}
			if !tt.shouldSet && acao != "" {
				t.Errorf("expected no ACAO, got %q", acao)
			}
		})
	}
}

func TestCORSMiddlewareCaseInsensitive(t *testing.T) {
	t.Setenv("CHAT_ALLOWED_ORIGINS", "MyApp.Example.COM")
	h := newCORSHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Header.Set("Origin", "https://myapp.example.com")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Header().Get("Access-Control-Allow-Origin") != "https://myapp.example.com" {
		t.Errorf("case-insensitive match: expected ACAO=%q, got %q",
			"https://myapp.example.com",
			rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestCORSMiddlewarePreflightOptions(t *testing.T) {
	t.Setenv("CHAT_ALLOWED_ORIGINS", "myapp.example.com")
	h := newCORSHandler()

	req := httptest.NewRequest(http.MethodOptions, "/api/health", nil)
	req.Header.Set("Origin", "https://myapp.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("preflight: expected 204, got %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Methods") != "GET, POST, OPTIONS" {
		t.Errorf("preflight methods: got %q", rec.Header().Get("Access-Control-Allow-Methods"))
	}
	if rec.Header().Get("Access-Control-Allow-Headers") != "Content-Type, Authorization" {
		t.Errorf("preflight headers: got %q", rec.Header().Get("Access-Control-Allow-Headers"))
	}
	if rec.Header().Get("Access-Control-Max-Age") != "86400" {
		t.Errorf("preflight max-age: got %q", rec.Header().Get("Access-Control-Max-Age"))
	}
	if rec.Body.Len() != 0 {
		t.Errorf("preflight body should be empty, got %d bytes", rec.Body.Len())
	}
}

func TestCORSMiddlewareStaticHeadersAlwaysSet(t *testing.T) {
	t.Setenv("CHAT_ALLOWED_ORIGINS", "*")
	h := newCORSHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Header.Set("Origin", "https://example.com")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Header().Get("Access-Control-Allow-Methods") == "" {
		t.Error("expected Access-Control-Allow-Methods header")
	}
	if rec.Header().Get("Access-Control-Allow-Headers") == "" {
		t.Error("expected Access-Control-Allow-Headers header")
	}
	if rec.Header().Get("Access-Control-Max-Age") == "" {
		t.Error("expected Access-Control-Max-Age header")
	}
}

// ==============================================================================
// Health check endpoint tests
// ==============================================================================

type healthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	DB      string `json:"db"`
}

func TestHealthCheckResponseBody(t *testing.T) {
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

	resp, err := http.Get("http://" + ts.addr + "/api/health")
	if err != nil {
		t.Fatalf("health check request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	contentType := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "application/json") {
		t.Errorf("expected Content-Type application/json, got %q", contentType)
	}

	var body healthResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode health response: %v", err)
	}

	if body.Status != "ok" {
		t.Errorf("expected status=ok, got %q", body.Status)
	}
	if body.Service != "tokendancechat" {
		t.Errorf("expected service=tokendancechat, got %q", body.Service)
	}
	if body.DB != "ok" {
		t.Errorf("expected db=ok, got %q", body.DB)
	}
}

func TestHealthCheckMethodNotAllowed(t *testing.T) {
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

	resp, err := http.Post("http://"+ts.addr+"/api/health", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatalf("POST health request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("POST /api/health: expected 405, got %d", resp.StatusCode)
	}

	var errBody map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&errBody); err != nil {
		t.Fatalf("failed to decode error body: %v", err)
	}
	if errBody["code"] != "METHOD_NOT_ALLOWED" {
		t.Errorf("expected code=METHOD_NOT_ALLOWED, got %v", errBody["code"])
	}
}

// TestHealthCheckEndpointRegistered confirms /api/health is registered in the
// mux with all middleware layers applied (logging, rate-limit, security, CORS).
func TestHealthCheckEndpointRegistered(t *testing.T) {
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

	server, st, _, err := Server(filepath.Join(tmpDir, "chat.db"), frontendDir, "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Server() returned error: %v", err)
	}
	defer st.Close()

	// Exercise the fully-wired handler via httptest (no port binding needed).
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	server.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	// Verify CORS middleware is applied.
	if rec.Header().Get("Access-Control-Allow-Methods") == "" {
		t.Error("CORS headers missing -- middleware may not be applied")
	}

	// Verify security headers middleware is applied.
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Error("security headers missing -- SecurityHeadersMiddleware may not be applied")
	}

	var body healthResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body.Service != "tokendancechat" {
		t.Errorf("expected service=tokendancechat, got %q", body.Service)
	}
}
