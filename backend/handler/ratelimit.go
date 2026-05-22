package handler

import (
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// rateLimiter tracks per-IP request timestamps in a sliding window.
// Separate buckets for WebSocket upgrades (stricter) and REST API calls.
type rateLimiter struct {
	wsEntries  sync.Map // IP string -> *rateLimitEntry
	apiEntries sync.Map // IP string -> *rateLimitEntry
}

// rateLimitEntry holds a mutex-protected slice of request timestamps for one IP.
type rateLimitEntry struct {
	mu         sync.Mutex
	timestamps []time.Time
}

const (
	wsMaxPerWindow  = 5
	wsWindow        = 10 * time.Second
	apiMaxPerWindow = 30
	apiWindow       = 1 * time.Minute
)

var rl = &rateLimiter{}

// allowWS checks whether a WebSocket upgrade is allowed for the given IP.
func (r *rateLimiter) allowWS(ip string) bool {
	return r.allow(&r.wsEntries, ip, wsMaxPerWindow, wsWindow)
}

// allowAPI checks whether a REST API request is allowed for the given IP.
func (r *rateLimiter) allowAPI(ip string) bool {
	return r.allow(&r.apiEntries, ip, apiMaxPerWindow, apiWindow)
}

func (r *rateLimiter) allow(m *sync.Map, ip string, max int, window time.Duration) bool {
	entry := r.getOrCreate(m, ip)
	entry.mu.Lock()
	defer entry.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-window)

	// Filter out timestamps outside the window, reusing backing array.
	filtered := entry.timestamps[:0]
	for _, ts := range entry.timestamps {
		if ts.After(cutoff) {
			filtered = append(filtered, ts)
		}
	}
	entry.timestamps = filtered

	if len(entry.timestamps) >= max {
		return false
	}
	entry.timestamps = append(entry.timestamps, now)
	return true
}

func (r *rateLimiter) getOrCreate(m *sync.Map, ip string) *rateLimitEntry {
	if v, ok := m.Load(ip); ok {
		return v.(*rateLimitEntry)
	}
	entry := &rateLimitEntry{}
	actual, _ := m.LoadOrStore(ip, entry)
	return actual.(*rateLimitEntry)
}

func shouldRateLimitAPI(path string) bool {
	return path == "/api" || strings.HasPrefix(path, "/api/")
}

// RateLimitMiddleware limits REST API requests to 30 per minute per IP.
// Place after LoggingMiddleware so blocked requests are still logged.
func RateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !shouldRateLimitAPI(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			ip = r.RemoteAddr
		}
		if !rl.allowAPI(ip) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error":"rate limit exceeded, try again later","code":"RATE_LIMITED"}`))
			log.Printf("rate limit: REST API blocked for %s", ip)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// WSAllow checks whether a WebSocket upgrade is allowed for a given IP.
// Returns false when the per-IP rate limit (5 per 10 s) is exceeded.
func WSAllow(ip string) bool {
	return rl.allowWS(ip)
}

// ResetRateLimiter clears all rate limiter state. Use in tests to avoid
// cross-test contamination from shared loopback IPs.
func ResetRateLimiter() {
	rl = &rateLimiter{}
}
