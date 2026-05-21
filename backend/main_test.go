package main

import (
	"context"
	"net"
	"net/http"
	"os"
	"path/filepath"
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
