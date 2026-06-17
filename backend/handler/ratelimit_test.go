package handler

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestRateLimiterWS verifies that allowWS permits up to 50 requests per 10s window
// and rejects the 51st from the same IP.
func TestRateLimiterWS(t *testing.T) {
	rl := &rateLimiter{}
	ip := "192.168.1.100"

	// First 50 requests should be allowed.
	for i := 0; i < 50; i++ {
		if !rl.allowWS(ip) {
			t.Errorf("expected allowWS to return true for request %d", i+1)
		}
	}

	// 51st request within the same window should be denied.
	if rl.allowWS(ip) {
		t.Error("expected allowWS to return false on 51st request within window")
	}
}

// TestRateLimiterAPI verifies that allowAPI permits up to 30 requests per minute
// by default and rejects the 31st from the same IP.
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

func TestRateLimiterAPIEnvOverride(t *testing.T) {
	t.Setenv("CHAT_API_RATE_LIMIT_PER_MINUTE", "3")
	rl := &rateLimiter{}
	ip := "10.0.0.60"

	for i := 0; i < 3; i++ {
		if !rl.allowAPI(ip) {
			t.Errorf("expected allowAPI to return true for request %d", i+1)
		}
	}

	if rl.allowAPI(ip) {
		t.Error("expected allowAPI to return false on 4th request with env override")
	}
}

// TestRateLimiterMultipleIPs verifies that different IPs have independent rate limit counters.
func TestRateLimiterMultipleIPs(t *testing.T) {
	rl := &rateLimiter{}
	ip1 := "192.168.1.1"
	ip2 := "192.168.1.2"

	// Saturate ip1 (50 WS requests).
	for i := 0; i < 50; i++ {
		rl.allowWS(ip1)
	}

	// ip1 should now be blocked.
	if rl.allowWS(ip1) {
		t.Error("expected ip1 to be rate-limited after 50 WS requests")
	}

	// ip2 should still be allowed (independent counter).
	if !rl.allowWS(ip2) {
		t.Error("expected ip2 to NOT be rate-limited (independent counter)")
	}

	// ip2 gets its own 50 requests.
	for i := 0; i < 49; i++ {
		rl.allowWS(ip2)
	}

	// Now ip2 should also be blocked.
	if rl.allowWS(ip2) {
		t.Error("expected ip2 to be rate-limited after 50 WS requests")
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
	ResetRateLimiter()

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

func TestRateLimitMiddlewareSkipsStaticAssets(t *testing.T) {
	ResetRateLimiter()

	wrapped := RateLimitMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))

	ip := "198.51.100.100:12345"
	for i := 0; i < 80; i++ {
		req := httptest.NewRequest(http.MethodGet, "/assets/index.js", nil)
		req.RemoteAddr = ip
		w := httptest.NewRecorder()
		wrapped.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("static request %d: expected 200, got %d", i+1, w.Code)
		}
	}

	for i := 0; i < 30; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		req.RemoteAddr = ip
		w := httptest.NewRecorder()
		wrapped.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("api request %d after static assets: expected 200, got %d", i+1, w.Code)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.RemoteAddr = ip
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Errorf("expected API request 31 to return 429, got %d", w.Code)
	}
}

func TestShouldRateLimitAPI(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{path: "/api", want: true},
		{path: "/api/health", want: true},
		{path: "/api/upload", want: true},
		{path: "/assets/index.js", want: false},
		{path: "/manifest.json", want: false},
		{path: "/uploads/file.png", want: false},
		{path: "/", want: false},
	}

	for _, tt := range tests {
		if got := shouldRateLimitAPI(tt.path); got != tt.want {
			t.Errorf("shouldRateLimitAPI(%q) = %v, want %v", tt.path, got, tt.want)
		}
	}
}

func TestRequestIPUsesForwardedForFromTrustedProxy(t *testing.T) {
	t.Setenv("CHAT_TRUSTED_PROXY_CIDRS", "127.0.0.1/32,10.0.0.0/8")

	req := httptest.NewRequest(http.MethodGet, "/api/oidc/login", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	req.Header.Set("X-Forwarded-For", "203.0.113.10, 10.0.0.5")

	if got := requestIP(req); got != "203.0.113.10" {
		t.Fatalf("requestIP() = %q, want forwarded client IP", got)
	}
}

func TestRequestIPIgnoresSpoofedForwardedForPrefix(t *testing.T) {
	t.Setenv("CHAT_TRUSTED_PROXY_CIDRS", "127.0.0.1/32")

	req := httptest.NewRequest(http.MethodGet, "/api/oidc/login", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	req.Header.Set("X-Forwarded-For", "198.51.100.250, 203.0.113.10")

	if got := requestIP(req); got != "203.0.113.10" {
		t.Fatalf("requestIP() = %q, want rightmost untrusted forwarded client IP", got)
	}
}

func TestRequestIPIgnoresForwardedForFromUntrustedRemote(t *testing.T) {
	t.Setenv("CHAT_TRUSTED_PROXY_CIDRS", "")

	req := httptest.NewRequest(http.MethodGet, "/api/oidc/login", nil)
	req.RemoteAddr = "198.51.100.20:54321"
	req.Header.Set("X-Forwarded-For", "203.0.113.10")

	if got := requestIP(req); got != "198.51.100.20" {
		t.Fatalf("requestIP() = %q, want remote IP", got)
	}
}

func TestOIDCAllowBudgetsFourCompleteRedirectFlows(t *testing.T) {
	ResetRateLimiter()
	ip := "203.0.113.62"
	requestsForFourFlows := 4 * 3 // login + callback + redeem
	for i := 0; i < requestsForFourFlows; i++ {
		if !OIDCAllow(ip) {
			t.Fatalf("OIDCAllow denied request %d; four complete redirect flows must fit in the window", i+1)
		}
	}
}

func TestRateLimiterPrunesExpiredIPEntries(t *testing.T) {
	rl := &rateLimiter{}
	shortWindow := 20 * time.Millisecond
	for i := 0; i < 5; i++ {
		rl.allow(&rl.oidcEntries, fmt.Sprintf("198.51.100.%d", i), 1, shortWindow)
	}

	time.Sleep(shortWindow + 10*time.Millisecond)
	rl.pruneExpired(&rl.oidcEntries, shortWindow, time.Now())

	count := 0
	rl.oidcEntries.Range(func(_, _ interface{}) bool {
		count++
		return true
	})
	if count != 0 {
		t.Fatalf("expected expired OIDC rate-limit entries to be pruned, got %d", count)
	}
}

// TestWSAllow verifies the WSAllow function uses the package-level rate limiter.
func TestWSAllow(t *testing.T) {
	ResetRateLimiter()

	ip := "203.0.113.42"

	// First 50 calls should succeed.
	for i := 0; i < 50; i++ {
		if !WSAllow(ip) {
			t.Errorf("expected WSAllow to return true for request %d", i+1)
		}
	}

	// The 51st call should fail.
	if WSAllow(ip) {
		t.Error("expected WSAllow to return false on 51st call")
	}
}

// TestAuthAllow verifies that AuthAllow permits up to 5 requests per minute
// and rejects the 6th from the same IP.
func TestAuthAllow(t *testing.T) {
	ResetRateLimiter()
	ip := "203.0.113.60"

	// First 5 auth requests should be allowed.
	for i := 0; i < 5; i++ {
		if !AuthAllow(ip) {
			t.Errorf("expected AuthAllow to return true for request %d", i+1)
		}
	}

	// 6th request within the same window should be denied.
	if AuthAllow(ip) {
		t.Error("expected AuthAllow to return false on 6th request within window")
	}
}

// TestAuthAllowWindowReset verifies that AuthAllow recovers after the rate-limit
// window expires. Uses a short internal window to keep the test fast.
func TestAuthAllowWindowReset(t *testing.T) {
	rl := &rateLimiter{}
	ip := "203.0.113.61"
	shortWindow := 50 * time.Millisecond
	maxRequests := 3

	// Saturate the auth limit.
	for i := 0; i < maxRequests; i++ {
		if !rl.allow(&rl.authEntries, ip, maxRequests, shortWindow) {
			t.Fatalf("expected allow to return true for request %d", i+1)
		}
	}

	// Next request should be denied.
	if rl.allow(&rl.authEntries, ip, maxRequests, shortWindow) {
		t.Fatal("expected allow to return false after reaching limit")
	}

	// Wait for the window to expire.
	time.Sleep(shortWindow + 10*time.Millisecond)

	// After the window, requests should be allowed again.
	if !rl.allow(&rl.authEntries, ip, maxRequests, shortWindow) {
		t.Error("expected allow to return true after window expiration")
	}
}
