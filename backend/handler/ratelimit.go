package handler

import (
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// rateLimiter tracks per-IP request timestamps in a sliding window.
// Separate buckets for WebSocket upgrades (stricter), REST API calls, and auth endpoints.
type rateLimiter struct {
	wsEntries   sync.Map // IP string -> *rateLimitEntry
	apiEntries  sync.Map // IP string -> *rateLimitEntry
	authEntries sync.Map // IP string -> *rateLimitEntry
	oidcEntries sync.Map // IP string -> *rateLimitEntry
	mu          sync.Mutex
	lastPrune   map[*sync.Map]time.Time
}

// rateLimitEntry holds a mutex-protected slice of request timestamps for one IP.
type rateLimitEntry struct {
	mu         sync.Mutex
	timestamps []time.Time
}

const (
	wsMaxPerWindow   = 50
	wsWindow         = 10 * time.Second
	apiMaxPerWindowDefault = 30
	apiWindow        = 1 * time.Minute
	authMaxPerWindow = 5
	authWindow       = 1 * time.Minute
	oidcMaxPerWindow = 20
	oidcWindow       = 1 * time.Minute
	pruneInterval    = 30 * time.Second
)

var rl = &rateLimiter{}

// allowWS checks whether a WebSocket upgrade is allowed for the given IP.
func (r *rateLimiter) allowWS(ip string) bool {
	return r.allow(&r.wsEntries, ip, wsMaxPerWindow, wsWindow)
}

// allowAuth checks whether an auth endpoint request (login/register) is allowed.
func (r *rateLimiter) allowAuth(ip string) bool {
	return r.allow(&r.authEntries, ip, authMaxPerWindow, authWindow)
}

// allowOIDC checks whether an OIDC endpoint request is allowed.
func (r *rateLimiter) allowOIDC(ip string) bool {
	return r.allow(&r.oidcEntries, ip, oidcMaxPerWindow, oidcWindow)
}

// allowAPI checks whether a REST API request is allowed for the given IP.
func (r *rateLimiter) allowAPI(ip string) bool {
	return r.allow(&r.apiEntries, ip, apiMaxPerWindow(), apiWindow)
}

func apiMaxPerWindow() int {
	value := strings.TrimSpace(os.Getenv("CHAT_API_RATE_LIMIT_PER_MINUTE"))
	if value == "" {
		return apiMaxPerWindowDefault
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return apiMaxPerWindowDefault
	}
	return parsed
}

func (r *rateLimiter) allow(m *sync.Map, ip string, max int, window time.Duration) bool {
	now := time.Now()
	r.mu.Lock()
	r.pruneExpiredIfDueLocked(m, window, now)
	entry := r.getOrCreateLocked(m, ip)
	entry.mu.Lock()
	r.mu.Unlock()
	defer entry.mu.Unlock()

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

func (r *rateLimiter) pruneExpiredIfDueLocked(m *sync.Map, window time.Duration, now time.Time) {
	if r.lastPrune == nil {
		r.lastPrune = make(map[*sync.Map]time.Time)
	}
	last := r.lastPrune[m]
	if !last.IsZero() && now.Sub(last) < pruneInterval {
		return
	}
	r.lastPrune[m] = now
	r.pruneExpiredLocked(m, window, now)
}

func (r *rateLimiter) pruneExpired(m *sync.Map, window time.Duration, now time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.pruneExpiredLocked(m, window, now)
}

func (r *rateLimiter) pruneExpiredLocked(m *sync.Map, window time.Duration, now time.Time) {
	cutoff := now.Add(-window)
	m.Range(func(key, value interface{}) bool {
		entry, ok := value.(*rateLimitEntry)
		if !ok {
			m.Delete(key)
			return true
		}
		entry.mu.Lock()
		filtered := entry.timestamps[:0]
		for _, ts := range entry.timestamps {
			if ts.After(cutoff) {
				filtered = append(filtered, ts)
			}
		}
		entry.timestamps = filtered
		empty := len(entry.timestamps) == 0
		entry.mu.Unlock()
		if empty {
			m.Delete(key)
		}
		return true
	})
}

func (r *rateLimiter) getOrCreateLocked(m *sync.Map, ip string) *rateLimitEntry {
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

func requestIP(r *http.Request) string {
	remoteIP := remoteIPFromAddr(r.RemoteAddr)
	if isTrustedProxy(remoteIP) {
		if ip := clientIPFromForwardedFor(r.Header.Get("X-Forwarded-For")); ip != "" {
			return ip
		}
		if ip := parseHeaderIP(r.Header.Get("X-Real-IP")); ip != "" {
			return ip
		}
	}
	return remoteIP
}

func remoteIPFromAddr(addr string) string {
	host, _, err := net.SplitHostPort(addr)
	if err == nil {
		return host
	}
	return addr
}

func clientIPFromForwardedFor(header string) string {
	parts := strings.Split(header, ",")
	for i := len(parts) - 1; i >= 0; i-- {
		ip := parseHeaderIP(parts[i])
		if ip != "" && !isTrustedProxy(ip) {
			return ip
		}
	}
	for _, part := range parts {
		if ip := parseHeaderIP(part); ip != "" {
			return ip
		}
	}
	return ""
}

func parseHeaderIP(value string) string {
	ip := net.ParseIP(strings.TrimSpace(value))
	if ip == nil {
		return ""
	}
	return ip.String()
}

func isTrustedProxy(ipString string) bool {
	ip := net.ParseIP(ipString)
	if ip == nil {
		return false
	}
	for _, part := range strings.Split(os.Getenv("CHAT_TRUSTED_PROXY_CIDRS"), ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if _, network, err := net.ParseCIDR(part); err == nil {
			if network.Contains(ip) {
				return true
			}
			continue
		}
		if trustedIP := net.ParseIP(part); trustedIP != nil && trustedIP.Equal(ip) {
			return true
		}
	}
	return false
}

// RateLimitMiddleware limits REST API requests per minute per IP.
// Place after LoggingMiddleware so blocked requests are still logged.
func RateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !shouldRateLimitAPI(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		ip := requestIP(r)
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
// Returns false when the per-IP rate limit (50 per 10 s) is exceeded.
func WSAllow(ip string) bool {
	return rl.allowWS(ip)
}

// AuthAllow checks whether an auth endpoint request (login/register) is allowed
// for a given IP. Returns false when the rate limit (5 per minute) is exceeded.
func AuthAllow(ip string) bool {
	return rl.allowAuth(ip)
}

// OIDCAllow checks whether an OIDC endpoint request is allowed for a given IP.
// Returns false when the rate limit (20 per minute) is exceeded.
func OIDCAllow(ip string) bool {
	return rl.allowOIDC(ip)
}

// ResetRateLimiter clears all rate limiter state. Use in tests to avoid
// cross-test contamination from shared loopback IPs.
func ResetRateLimiter() {
	rl = &rateLimiter{}
}
