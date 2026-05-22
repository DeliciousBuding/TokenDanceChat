package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestRateLimiterWS verifies that allowWS permits up to 5 requests per 10s window
// and rejects the 6th from the same IP.
func TestRateLimiterWS(t *testing.T) {
	rl := &rateLimiter{}
	ip := "192.168.1.100"

	// First 5 requests should be allowed.
	for i := 0; i < 5; i++ {
		if !rl.allowWS(ip) {
			t.Errorf("expected allowWS to return true for request %d", i+1)
		}
	}

	// 6th request within the same window should be denied.
	if rl.allowWS(ip) {
		t.Error("expected allowWS to return false on 6th request within window")
	}
}

// TestRateLimiterAPI verifies that allowAPI permits up to 30 requests per minute
// and rejects the 31st from the same IP.
func TestRateLimiterAPI(t *testing.T) {
	rl := &rateLimiter{}
	ip := "10.0.0.50"

	// First 30 requests should be allowed.
	for i := 0; i < 30; i++ {
		if !rl.allowAPI(ip) {
			t.Errorf("expected allowAPI to return true for request %d", i+1)
		}
	}

	// 31st request within the same window should be denied.
	if rl.allowAPI(ip) {
		t.Error("expected allowAPI to return false on 31st request within window")
	}
}

// TestRateLimiterMultipleIPs verifies that different IPs have independent rate limit counters.
func TestRateLimiterMultipleIPs(t *testing.T) {
	rl := &rateLimiter{}
	ip1 := "192.168.1.1"
	ip2 := "192.168.1.2"

	// Saturate ip1 (5 WS requests).
	for i := 0; i < 5; i++ {
		rl.allowWS(ip1)
	}

	// ip1 should now be blocked.
	if rl.allowWS(ip1) {
		t.Error("expected ip1 to be rate-limited after 5 WS requests")
	}

	// ip2 should still be allowed (independent counter).
	if !rl.allowWS(ip2) {
		t.Error("expected ip2 to NOT be rate-limited (independent counter)")
	}

	// ip2 gets its own 5 requests.
	for i := 0; i < 4; i++ {
		rl.allowWS(ip2)
	}

	// Now ip2 should also be blocked.
	if rl.allowWS(ip2) {
		t.Error("expected ip2 to be rate-limited after 5 WS requests")
	}
}

// TestRateLimiterSlidingWindow verifies that the rate limit recovers after the
// window expires. Uses the internal allow method with a very short window to
// avoid slow tests.
func TestRateLimiterSlidingWindow(t *testing.T) {
	rl := &rateLimiter{}
	ip := "172.16.0.1"
	shortWindow := 50 * time.Millisecond
	maxRequests := 3

	// Saturate the rate limit.
	for i := 0; i < maxRequests; i++ {
		if !rl.allow(&rl.wsEntries, ip, maxRequests, shortWindow) {
			t.Fatalf("expected allow to return true for request %d", i+1)
		}
	}

	// Next request should be denied.
	if rl.allow(&rl.wsEntries, ip, maxRequests, shortWindow) {
		t.Fatal("expected allow to return false after reaching limit")
	}

	// Wait for the window to expire.
	time.Sleep(shortWindow + 10*time.Millisecond)

	// After the window, requests should be allowed again.
	if !rl.allow(&rl.wsEntries, ip, maxRequests, shortWindow) {
		t.Error("expected allow to return true after window expiration")
	}
}

// TestRateLimitMiddleware verifies that the HTTP middleware returns 429
// when the rate limit is exceeded.
func TestRateLimitMiddleware(t *testing.T) {
	// Use a handler wrapped with the middleware.
	wrapped := RateLimitMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))

	ip := "198.51.100.99:12345"

	// Send 30 requests (all should pass).
	for i := 0; i < 30; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		req.RemoteAddr = ip
		w := httptest.NewRecorder()
		wrapped.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("request %d: expected 200, got %d", i+1, w.Code)
		}
	}

	// 31st request should return 429.
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.RemoteAddr = ip
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429 Too Many Requests, got %d", w.Code)
	}

	// Verify Retry-After header.
	if w.Header().Get("Retry-After") != "60" {
		t.Errorf("expected Retry-After: 60, got %q", w.Header().Get("Retry-After"))
	}

	// Verify JSON error body contains expected fields.
	body := w.Body.String()
	if body == "" {
		t.Error("expected non-empty error body")
	}
}

// TestWSAllow verifies the WSAllow function uses the package-level rate limiter.
func TestWSAllow(t *testing.T) {
	ip := "203.0.113.42"

	// First 5 calls should succeed.
	for i := 0; i < 5; i++ {
		if !WSAllow(ip) {
			t.Errorf("expected WSAllow to return true for request %d", i+1)
		}
	}

	// The 6th call should fail.
	if WSAllow(ip) {
		t.Error("expected WSAllow to return false on 6th call")
	}
}
