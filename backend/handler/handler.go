package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"tokendancechat/backend/hub"

	"github.com/google/uuid"
)

// Handler holds dependencies for HTTP handlers.
type Handler struct {
	hub              *hub.Hub
	store            hub.Store
	mu               sync.RWMutex
	uploadsDir       string
	mediaStore       MediaStore
	linkPreviewCache map[string]linkPreviewResult
}

// linkPreviewResult stores cached OpenGraph data for a URL.
type linkPreviewResult struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Image       string `json:"image"`
	URL         string `json:"url"`
	fetchedAt   time.Time
}

// contextKey is a private type to avoid collisions in context.WithValue.
type contextKey string

const requestIDKey contextKey = "request_id"

// New creates a new Handler.
func New(h *hub.Hub, s hub.Store, uploadsDir string) *Handler {
	handler := &Handler{
		hub:              h,
		store:            s,
		uploadsDir:       uploadsDir,
		mediaStore:       NewLocalMediaStore(uploadsDir),
		linkPreviewCache: make(map[string]linkPreviewResult),
	}
	// Periodic cleanup of expired link preview cache entries.
	go handler.pruneLinkPreviewCache()
	return handler
}

func (h *Handler) pruneLinkPreviewCache() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		h.mu.Lock()
		now := time.Now()
		for k, v := range h.linkPreviewCache {
			if now.Sub(v.fetchedAt) > 1*time.Hour {
				delete(h.linkPreviewCache, k)
			}
		}
		h.mu.Unlock()
	}
}

// SetMediaStore replaces the default local upload storage.
func (h *Handler) SetMediaStore(store MediaStore) {
	if store != nil {
		h.mediaStore = store
	}
}

// writeJSONError writes a consistent JSON error response.
func writeJSONError(w http.ResponseWriter, status int, msg, code, requestID string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":      msg,
		"code":       code,
		"request_id": requestID,
	})
}

// CORSMiddleware wraps an http.Handler with CORS headers allowing all origins.
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// SecurityHeadersMiddleware adds security-related HTTP headers to every response.
func SecurityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("X-XSS-Protection", "0")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		// CSP: 'self' covers same-origin ws/wss; https: for user uploads and previews
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https:; font-src 'self'; base-uri 'self'; form-action 'self'")
		next.ServeHTTP(w, r)
	})
}

// HealthCheck handles GET /api/health.
func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"service": "tokendancechat",
	})
}

// GetMessages handles GET /api/messages?limit=100&before=timestamp.
func (h *Handler) GetMessages(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}

	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 500 {
			limit = parsed
		}
	}

	var before int64
	if b := r.URL.Query().Get("before"); b != "" {
		if parsed, err := strconv.ParseInt(b, 10, 64); err == nil {
			before = parsed
		}
	}

	messages := h.store.GetMessages(limit, before)
	if messages == nil {
		messages = []hub.StoredMessage{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"messages": messages,
	})
}

// GetOnlineUsers handles GET /api/users/online.
func (h *Handler) GetOnlineUsers(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}

	users := h.hub.OnlineUsers()
	if users == nil {
		users = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"online": users,
		"count":  len(users),
	})
}

// Stats handles GET /api/stats.
func (h *Handler) Stats(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}

	connections := h.hub.ConnectionCount()
	messagesTotal := h.store.TotalMessages()
	uptime := h.hub.Uptime()
	droppedMessages := h.hub.DroppedMessages()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"connections":      connections,
		"messages_total":   messagesTotal,
		"uptime_seconds":   int64(uptime.Seconds()),
		"dropped_messages": droppedMessages,
		"started_at":     h.hub.StartTime.UTC().Format("2006-01-02T15:04:05Z"),
	})
}

// Search handles GET /api/search?q=...&room=...&limit=...
func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}

	q := r.URL.Query().Get("q")
	if q == "" {
		writeJSONError(w, http.StatusBadRequest, "q parameter is required", "MISSING_QUERY", requestID)
		return
	}

	roomID := r.URL.Query().Get("room")
	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	results, err := h.store.SearchMessages(q, roomID, limit)
	if err != nil {
		log.Printf("search error: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "search failed", "SEARCH_ERROR", requestID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"results": results,
		"total":   len(results),
		"query":   q,
	})
}

// requestIDFromContext retrieves the request ID from the context, or returns "".
func requestIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}

// LoggingMiddleware logs incoming HTTP requests with a generated request ID.
func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := uuid.New().String()[:8]
		ctx := context.WithValue(r.Context(), requestIDKey, reqID)
		log.Printf("[%s] %s %s %s", reqID, r.Method, r.URL.Path, r.RemoteAddr)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// --- Link Preview ---

var (
	ogTitleRegex       = regexp.MustCompile(`<meta[^>]+property="og:title"[^>]+content="([^"]*)"`)
	ogDescriptionRegex = regexp.MustCompile(`<meta[^>]+property="og:description"[^>]+content="([^"]*)"`)
	ogImageRegex       = regexp.MustCompile(`<meta[^>]+property="og:image"[^>]+content="([^"]*)"`)
	htmlTagRe          = regexp.MustCompile(`<[^>]*>`)
)

// LinkPreview handles GET /api/link-preview?url=...
func (h *Handler) LinkPreview(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}

	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		writeJSONError(w, http.StatusBadRequest, "url parameter is required", "MISSING_URL", requestID)
		return
	}

	// Validate URL: https only to prevent SSRF to internal services.
	parsedURL, err := url.Parse(rawURL)
	if err != nil || parsedURL.Scheme != "https" {
		writeJSONError(w, http.StatusBadRequest, "invalid URL (https only)", "INVALID_URL", requestID)
		return
	}

	// Block private/internal IP ranges to prevent SSRF.
	if isPrivateHost(parsedURL.Hostname()) {
		writeJSONError(w, http.StatusBadRequest, "internal URLs are not allowed", "INVALID_URL", requestID)
		return
	}

	// Check cache (entries expire after 1 hour).
	h.mu.RLock()
	if cached, ok := h.linkPreviewCache[rawURL]; ok {
		if time.Since(cached.fetchedAt) < 1*time.Hour {
			h.mu.RUnlock()
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(cached)
			return
		}
	}
	h.mu.RUnlock()

	// Fetch the URL.
	client := &http.Client{
		Timeout: 5 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if req.URL.Scheme != "https" || isPrivateHost(req.URL.Hostname()) {
				return errors.New("redirect blocked")
			}
			return nil
		},
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, rawURL, nil)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to create request", "FETCH_ERROR", requestID)
		return
	}
	req.Header.Set("User-Agent", "TokenDanceChat/1.0 LinkPreview")

	resp, err := client.Do(req)
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, "failed to fetch URL", "FETCH_ERROR", requestID)
		return
	}
	defer resp.Body.Close()

	// Read up to 1MB of the response body.
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, "failed to read response", "FETCH_ERROR", requestID)
		return
	}

	bodyStr := string(body)

	// Parse OG tags.
	result := linkPreviewResult{
		URL:       rawURL,
		fetchedAt: time.Now(),
	}

	if matches := ogTitleRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
		result.Title = htmlTagRe.ReplaceAllString(strings.TrimSpace(matches[1]), "")
	}
	if matches := ogDescriptionRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
		result.Description = htmlTagRe.ReplaceAllString(strings.TrimSpace(matches[1]), "")
	}
	if matches := ogImageRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
		result.Image = strings.TrimSpace(matches[1])
	}

	// If no OG title, try <title> tag as fallback.
	if result.Title == "" {
		titleRegex := regexp.MustCompile(`<title[^>]*>([^<]+)</title>`)
		if matches := titleRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
			result.Title = htmlTagRe.ReplaceAllString(strings.TrimSpace(matches[1]), "")
		}
	}

	// Cache the result.
	h.mu.Lock()
	if len(h.linkPreviewCache) >= maxLinkPreviewCacheSize {
		for k := range h.linkPreviewCache {
			delete(h.linkPreviewCache, k)
			break
		}
	}
	h.linkPreviewCache[rawURL] = result
	h.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// --- Image Upload ---

const maxUploadSize = 5 << 20 // 5 MB
const maxLinkPreviewCacheSize = 1000

// UploadImage handles POST /api/upload (multipart form).
func (h *Handler) UploadImage(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}

	// Limit request body to maxUploadSize.
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeJSONError(w, http.StatusBadRequest, "file too large (max 5MB)", "FILE_TOO_LARGE", requestID)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "missing file field", "MISSING_FILE", requestID)
		return
	}
	defer file.Close()

	// Validate file type.
	ext := strings.ToLower(filepath.Ext(header.Filename))
		allowedExts := map[string]bool{
			".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true,
			".pdf": true, ".doc": true, ".docx": true, ".txt": true, ".md": true,
			".csv": true, ".json": true, ".xml": true,
			".zip": true, ".tar": true, ".gz": true, ".7z": true, ".rar": true,
			".webm": true, ".ogg": true, ".mp3": true, ".wav": true, ".m4a": true,
		}
	if !allowedExts[ext] {
		writeJSONError(w, http.StatusBadRequest, "unsupported file type", "INVALID_FILE_TYPE", requestID)
		return
	}

	// Generate a unique filename.
	filename := uuid.New().String() + ext
	contentType := contentTypeForFilename(filename)

	if err := h.mediaStore.Save(r.Context(), filename, contentType, file); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to write file", "SERVER_ERROR", requestID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"url":      "/uploads/" + filename,
		"filename": filename,
	})
}

// ServeUpload handles GET /uploads/{filename}
func (h *Handler) ServeUpload(w http.ResponseWriter, r *http.Request) {
	// Extract filename from path.
	filename := filepath.Base(r.URL.Path)
	if filename == "." || filename == "/" || filename == "" {
		http.NotFound(w, r)
		return
	}

	media, err := h.mediaStore.Open(r.Context(), filename)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer media.Body.Close()

	if media.ContentType != "" {
		w.Header().Set("Content-Type", media.ContentType)
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	if _, err := io.Copy(w, media.Body); err != nil {
		log.Printf("failed to stream upload %s: %v", filename, err)
	}
}


// isPrivateHost checks if a hostname resolves to a private/internal IP address.
func isPrivateHost(host string) bool {
	ips, err := net.LookupIP(host)
	if err != nil {
		return true // block unresolvable hosts (safety first)
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
			ip.IsPrivate() || ip.IsUnspecified() {
			return true
		}
	}
	return false
}
