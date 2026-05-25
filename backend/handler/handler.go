package handler

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
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
	sessionSecret    []byte

	// OIDC configuration.
	oidcEnabled     bool
	oidcClientID    string
	oidcIssuer      string
	oidcRedirectURI string
	oidcConfig      *OIDCConfig
	oidcStates      *OIDCStateStore
	oidcTokens      *OIDCTokenStore
	oidcJWKS        *oidcJWKSCache
}

// linkPreviewResult stores cached OpenGraph data for a URL.
type linkPreviewResult struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Image       string `json:"image"`
	SiteName    string `json:"site_name"`
	URL         string `json:"url"`
	fetchedAt   time.Time
}

// contextKey is a private type to avoid collisions in context.WithValue.
type contextKey string

const requestIDKey contextKey = "request_id"

const sessionTokenTTL = 7 * 24 * time.Hour

const (
	defaultMessageLimit       = 100
	maxMessageLimit           = 500
	publicPreviewMessageLimit = 20
)

const (
	maxWebhookBodySize      = 8 << 10 // 8 KiB
	maxWebhookContentLength = 2000
)

type sessionTokenPayload struct {
	Username string `json:"username"`
	Exp      int64  `json:"exp"`
	Nonce    string `json:"nonce"`
}

// New creates a new Handler.
func New(h *hub.Hub, s hub.Store, uploadsDir string) *Handler {
	handler := &Handler{
		hub:              h,
		store:            s,
		uploadsDir:       uploadsDir,
		mediaStore:       NewLocalMediaStore(uploadsDir),
		linkPreviewCache: make(map[string]linkPreviewResult),
		sessionSecret:    loadSessionSecret(),
	}
	if h != nil {
		h.SetSessionTokenVerifier(handler)
	}
	// Periodic cleanup of expired link preview cache entries.
	go handler.pruneLinkPreviewCache()
	return handler
}

func loadSessionSecret() []byte {
	if secret := os.Getenv("CHAT_SESSION_SECRET"); secret != "" {
		sum := sha256.Sum256([]byte(secret))
		return sum[:]
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err == nil {
		return secret
	}
	sum := sha256.Sum256([]byte(fmt.Sprintf("%d", time.Now().UnixNano())))
	return sum[:]
}

func (h *Handler) issueSessionToken(username string) (string, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return "", errors.New("username is required")
	}
	nonceBytes := make([]byte, 16)
	if _, err := rand.Read(nonceBytes); err != nil {
		return "", err
	}
	payload := sessionTokenPayload{
		Username: username,
		Exp:      time.Now().Add(sessionTokenTTL).Unix(),
		Nonce:    base64.RawURLEncoding.EncodeToString(nonceBytes),
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	payloadPart := base64.RawURLEncoding.EncodeToString(payloadBytes)
	mac := hmac.New(sha256.New, h.sessionSecret)
	mac.Write([]byte(payloadPart))
	sigPart := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return payloadPart + "." + sigPart, nil
}

func (h *Handler) verifySessionToken(token string) (string, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", false
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", false
	}
	mac := hmac.New(sha256.New, h.sessionSecret)
	mac.Write([]byte(parts[0]))
	expected := mac.Sum(nil)
	if subtle.ConstantTimeCompare(signature, expected) != 1 {
		return "", false
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", false
	}
	var payload sessionTokenPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return "", false
	}
	if payload.Username == "" || payload.Exp <= time.Now().Unix() {
		return "", false
	}
	return payload.Username, true
}

// VerifySessionJoinToken validates a local app session token for WebSocket join.
func (h *Handler) VerifySessionJoinToken(username, token string) error {
	tokenUsername, ok := h.verifySessionToken(token)
	if !ok {
		return errors.New("invalid session token")
	}
	if tokenUsername != strings.TrimSpace(username) {
		return errors.New("session username mismatch")
	}
	return nil
}

func (h *Handler) requireSession(w http.ResponseWriter, r *http.Request) (string, bool) {
	requestID := requestIDFromContext(r.Context())
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if auth == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required", "AUTH_REQUIRED", requestID)
		return "", false
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(auth, prefix) {
		writeJSONError(w, http.StatusUnauthorized, "invalid auth token", "INVALID_AUTH_TOKEN", requestID)
		return "", false
	}
	username, ok := h.verifySessionToken(strings.TrimSpace(strings.TrimPrefix(auth, prefix)))
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "invalid auth token", "INVALID_AUTH_TOKEN", requestID)
		return "", false
	}
	return username, true
}

func (h *Handler) optionalSession(w http.ResponseWriter, r *http.Request) (string, bool, bool) {
	requestID := requestIDFromContext(r.Context())
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if auth == "" {
		return "", false, true
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(auth, prefix) {
		writeJSONError(w, http.StatusUnauthorized, "invalid auth token", "INVALID_AUTH_TOKEN", requestID)
		return "", false, false
	}
	username, ok := h.verifySessionToken(strings.TrimSpace(strings.TrimPrefix(auth, prefix)))
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "invalid auth token", "INVALID_AUTH_TOKEN", requestID)
		return "", false, false
	}
	return username, true, true
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

// CORSMiddleware restricts cross-origin requests to explicitly allowed origins.
// CHAT_ALLOWED_ORIGINS accepts comma-separated origins such as
// "https://chat.example.com" or "https://*.example.com". Wildcard "*" is not
// accepted once bearer sessions are present.
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin, ok := allowedOrigin(r); ok {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			if origin != "" {
				w.Header().Set("Vary", "Origin")
			}
		}

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
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data: https:; font-src 'self'; base-uri 'self'; form-action 'self'")
		next.ServeHTTP(w, r)
	})
}

// HealthCheck handles GET /api/health.
func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}
	dbStatus := "ok"
	if err := h.store.Ping(); err != nil {
		dbStatus = "error"
		log.Printf("health check: db ping failed: %v", err)
	}
	statusCode := http.StatusOK
	if dbStatus != "ok" {
		statusCode = http.StatusServiceUnavailable
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  dbStatus,
		"service": "tokendancechat",
		"db":      dbStatus,
	})
}

// GetMessages handles GET /api/messages?limit=100&before=timestamp.
func (h *Handler) GetMessages(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}

	_, authenticated, ok := h.optionalSession(w, r)
	if !ok {
		return
	}
	if !authenticated && r.URL.Query().Get("before") != "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required", "AUTH_REQUIRED", requestID)
		return
	}

	limit := defaultMessageLimit
	maxLimit := maxMessageLimit
	if !authenticated {
		limit = publicPreviewMessageLimit
		maxLimit = publicPreviewMessageLimit
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			if parsed > maxLimit {
				limit = maxLimit
			} else {
				limit = parsed
			}
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
		"started_at":       h.hub.StartTime.UTC().Format("2006-01-02T15:04:05Z"),
	})
}

// Search handles GET /api/search?q=...&room=...&limit=...
func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}
	username, ok := h.requireSession(w, r)
	if !ok {
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

	results, err := h.store.SearchMessagesForUser(q, roomID, username, limit)
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
	ogTitleRegex         = regexp.MustCompile(`<meta[^>]+property="og:title"[^>]+content="([^"]*)"`)
	ogDescriptionRegex   = regexp.MustCompile(`<meta[^>]+property="og:description"[^>]+content="([^"]*)"`)
	ogImageRegex         = regexp.MustCompile(`<meta[^>]+property="og:image"[^>]+content="([^"]*)"`)
	ogSiteNameRegex      = regexp.MustCompile(`<meta[^>]+property="og:site_name"[^>]+content="([^"]*)"`)
	metaDescriptionRegex = regexp.MustCompile(`<meta[^>]+name="description"[^>]+content="([^"]*)"`)
	htmlTagRe            = regexp.MustCompile(`<[^>]*>`)
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
		Transport: &http.Transport{
			DialContext: guardedLinkPreviewDialContext(
				resolveLinkPreviewHost,
				(&net.Dialer{Timeout: 5 * time.Second}).DialContext,
			),
		},
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
	if matches := ogSiteNameRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
		result.SiteName = htmlTagRe.ReplaceAllString(strings.TrimSpace(matches[1]), "")
	}

	// Fallbacks if OG tags are missing.
	if result.Title == "" {
		titleRegex := regexp.MustCompile(`<title[^>]*>([^<]+)</title>`)
		if matches := titleRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
			result.Title = htmlTagRe.ReplaceAllString(strings.TrimSpace(matches[1]), "")
		}
	}
	if result.Description == "" {
		if matches := metaDescriptionRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
			result.Description = htmlTagRe.ReplaceAllString(strings.TrimSpace(matches[1]), "")
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

const maxUploadSize = 50 << 20       // 50 MB
const maxEmojiUploadSize = 128 << 10 // 128 KB
const maxLinkPreviewCacheSize = 1000

// UploadImage handles POST /api/upload (multipart form).
func (h *Handler) UploadImage(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}
	if _, ok := h.requireSession(w, r); !ok {
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
		log.Printf("upload save failed for %s: %v", filename, err)
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

// --- Custom Emoji Upload ---

// validEmojiExts are the allowed image extensions for custom emojis.
var validEmojiExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true,
}

// UploadEmoji handles POST /api/emoji/upload (multipart form, image only, max 128KB).
func (h *Handler) UploadEmoji(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}
	if _, ok := h.requireSession(w, r); !ok {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxEmojiUploadSize)

	if err := r.ParseMultipartForm(maxEmojiUploadSize); err != nil {
		writeJSONError(w, http.StatusBadRequest, "file too large (max 128KB)", "FILE_TOO_LARGE", requestID)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "missing file field", "MISSING_FILE", requestID)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !validEmojiExts[ext] {
		writeJSONError(w, http.StatusBadRequest, "unsupported file type (allowed: png, jpg, gif, webp)", "INVALID_FILE_TYPE", requestID)
		return
	}

	filename := uuid.New().String() + ext
	mediaKey := "emojis/" + filename
	contentType := contentTypeForFilename(filename)

	if err := h.mediaStore.Save(r.Context(), mediaKey, contentType, file); err != nil {
		log.Printf("emoji upload: failed to save %s: %v", mediaKey, err)
		writeJSONError(w, http.StatusInternalServerError, "failed to save file", "SERVER_ERROR", requestID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"url":      "/uploads/emojis/" + filename,
		"filename": filename,
	})
}

// ServeEmoji handles GET /uploads/emojis/{filename}
func (h *Handler) ServeEmoji(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/uploads/emojis/")
	filename := filepath.Base(trimmed)
	if filename == "." || filename == "/" || filename == "" {
		http.NotFound(w, r)
		return
	}

	mediaKey := "emojis/" + filename
	media, err := h.mediaStore.Open(r.Context(), mediaKey)
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
		log.Printf("failed to stream emoji %s: %v", filename, err)
	}
}

// --- GIPHY Proxy ---

// giphyAPIKey is loaded once from environment.
var giphyAPIKey = func() string {
	if k := os.Getenv("CHAT_GIPHY_API_KEY"); k != "" {
		return k
	}
	return "dc6zaTOxFJmzC" // GIPHY public beta key for development
}()

// giphyResponse mirrors the GIPHY API response shape we expose to the client.
type giphyResponse struct {
	Data       []giphyItem     `json:"data"`
	Pagination giphyPagination `json:"pagination"`
}

type giphyItem struct {
	ID         string `json:"id"`
	URL        string `json:"url"`
	PreviewURL string `json:"preview_url"`
	Title      string `json:"title"`
}

type giphyPagination struct {
	TotalCount int `json:"total_count"`
	Count      int `json:"count"`
	Offset     int `json:"offset"`
}

// giphyAPIRaw mirrors the upstream GIPHY JSON for decoding.
type giphyAPIRaw struct {
	Data []struct {
		ID     string `json:"id"`
		Images struct {
			FixedHeight      giphyImage `json:"fixed_height"`
			FixedHeightSmall giphyImage `json:"fixed_height_small"`
		} `json:"images"`
		Title string `json:"title"`
	} `json:"data"`
	Pagination struct {
		TotalCount int `json:"total_count"`
		Count      int `json:"count"`
		Offset     int `json:"offset"`
	} `json:"pagination"`
}

type giphyImage struct {
	URL    string `json:"url"`
	Width  string `json:"width"`
	Height string `json:"height"`
}

// fetchGiphy proxies a request to the GIPHY API and returns a unified response.
func (h *Handler) fetchGiphy(w http.ResponseWriter, r *http.Request, endpoint string, query url.Values) {
	requestID := requestIDFromContext(r.Context())

	query.Set("api_key", giphyAPIKey)
	apiURL := fmt.Sprintf("https://api.giphy.com/v1/%s?%s", endpoint, query.Encode())

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to create request", "UPSTREAM_ERROR", requestID)
		return
	}

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("giphy upstream error: %v", err)
		writeJSONError(w, http.StatusBadGateway, "giphy upstream unavailable", "UPSTREAM_ERROR", requestID)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("giphy upstream returned %d", resp.StatusCode)
		writeJSONError(w, http.StatusBadGateway, "giphy upstream error", "UPSTREAM_ERROR", requestID)
		return
	}

	var raw giphyAPIRaw
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		log.Printf("giphy decode error: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to decode giphy response", "UPSTREAM_ERROR", requestID)
		return
	}

	// Map to our client-facing shape.
	result := giphyResponse{
		Pagination: giphyPagination{
			TotalCount: raw.Pagination.TotalCount,
			Count:      raw.Pagination.Count,
			Offset:     raw.Pagination.Offset,
		},
	}
	for _, item := range raw.Data {
		result.Data = append(result.Data, giphyItem{
			ID:         item.ID,
			URL:        item.Images.FixedHeight.URL,
			PreviewURL: item.Images.FixedHeightSmall.URL,
			Title:      item.Title,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GiphySearch handles GET /api/giphy/search?q=...&limit=20&offset=0&type=gif|sticker.
func (h *Handler) GiphySearch(w http.ResponseWriter, r *http.Request) {
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

	mediaType := r.URL.Query().Get("type")
	if mediaType == "" {
		mediaType = "gif"
	}

	endpoint := "gifs/search"
	if mediaType == "sticker" {
		endpoint = "stickers/search"
	}

	params := url.Values{}
	params.Set("q", q)
	if limit := r.URL.Query().Get("limit"); limit != "" {
		params.Set("limit", limit)
	} else {
		params.Set("limit", "20")
	}
	if offset := r.URL.Query().Get("offset"); offset != "" {
		params.Set("offset", offset)
	}

	h.fetchGiphy(w, r, endpoint, params)
}

// GiphyTrending handles GET /api/giphy/trending?limit=20&offset=0&type=gif|sticker.
func (h *Handler) GiphyTrending(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}

	mediaType := r.URL.Query().Get("type")
	if mediaType == "" {
		mediaType = "gif"
	}

	endpoint := "gifs/trending"
	if mediaType == "sticker" {
		endpoint = "stickers/trending"
	}

	params := url.Values{}
	if limit := r.URL.Query().Get("limit"); limit != "" {
		params.Set("limit", limit)
	} else {
		params.Set("limit", "20")
	}
	if offset := r.URL.Query().Get("offset"); offset != "" {
		params.Set("offset", offset)
	}

	h.fetchGiphy(w, r, endpoint, params)
}

// isPrivateHost checks if a hostname resolves to a private/internal IP address.
func isPrivateHost(host string) bool {
	ips, err := net.LookupIP(host)
	if err != nil {
		return true // block unresolvable hosts (safety first)
	}
	for _, ip := range ips {
		if isPrivateIP(ip) {
			return true
		}
	}
	return false
}

func isPrivateIP(ip net.IP) bool {
	return ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsPrivate() || ip.IsUnspecified()
}

func resolveLinkPreviewHost(ctx context.Context, host string) ([]net.IP, error) {
	return net.DefaultResolver.LookupIP(ctx, "ip", host)
}

func guardedLinkPreviewDialContext(
	resolve func(context.Context, string) ([]net.IP, error),
	dial func(context.Context, string, string) (net.Conn, error),
) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		ips, err := resolve(ctx, host)
		if err != nil {
			return nil, err
		}
		if len(ips) == 0 {
			return nil, errors.New("host resolved to no addresses")
		}
		for _, ip := range ips {
			if isPrivateIP(ip) {
				return nil, errors.New("resolved IP blocked")
			}
		}
		return dial(ctx, network, net.JoinHostPort(ips[0].String(), port))
	}
}

// ExportMessages handles GET /api/export?conversation=...&format=json|text&limit=...
func (h *Handler) ExportMessages(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}
	authUsername, ok := h.requireSession(w, r)
	if !ok {
		return
	}

	conversation := r.URL.Query().Get("conversation")
	format := r.URL.Query().Get("format")

	if format == "" {
		format = "json"
	}
	if format != "json" && format != "text" {
		writeJSONError(w, http.StatusBadRequest, "format must be json or text", "INVALID_FORMAT", requestID)
		return
	}

	limit := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			if parsed > 10000 {
				limit = 10000
			} else {
				limit = parsed
			}
		}
	}

	ctx := r.Context()

	var roomID, toUser, groupName, currentUser string
	var displayName string

	// Parse conversation key.
	switch {
	case strings.HasPrefix(conversation, "dm:"):
		toUser = strings.TrimPrefix(conversation, "dm:")
		currentUser = authUsername
		displayName = toUser
	case strings.HasPrefix(conversation, "group:"):
		groupName = strings.TrimPrefix(conversation, "group:")
		if _, err := h.store.GetGroupMemberRole(groupName, authUsername); err != nil {
			writeJSONError(w, http.StatusForbidden, "not a member of this group", "NOT_IN_GROUP", requestID)
			return
		}
		displayName = groupName
	case conversation != "" && conversation != "public":
		roomID = conversation
		displayName = conversation
	default:
		// Public chat (conversation is empty, "public", or just the room_id).
		if conversation == "" || conversation == "public" {
			displayName = "Public Chat"
		}
	}

	messages, err := h.store.ExportMessages(ctx, roomID, toUser, groupName, currentUser, limit)
	if err != nil {
		log.Printf("export error: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to export messages", "EXPORT_ERROR", requestID)
		return
	}

	now := time.Now().Format("2006-01-02")
	filename := fmt.Sprintf("chat_export_%s_%s.%s",
		sanitizeExportName(displayName), now, format)

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	switch format {
	case "text":
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		h.writeTextExport(w, messages, displayName)
	default:
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(messages)
	}
}

// sanitizeExportName replaces characters unsafe for filenames.
func sanitizeExportName(name string) string {
	if name == "" {
		return "public"
	}
	re := regexp.MustCompile(`[^a-zA-Z0-9\p{Han}_-]`)
	safe := re.ReplaceAllString(name, "_")
	if len(safe) > 100 {
		safe = safe[:100]
	}
	return safe
}

// writeTextExport writes messages in Telegram-style plain text format.
func (h *Handler) writeTextExport(w io.Writer, messages []hub.StoredMessage, conversationName string) {
	now := time.Now().Format("2006-01-02 15:04")
	fmt.Fprintf(w, "TokenDanceChat Export\r\n")
	fmt.Fprintf(w, "Conversation: %s\r\n", conversationName)
	fmt.Fprintf(w, "Exported: %s\r\n", now)
	fmt.Fprintf(w, "\r\n")

	for _, m := range messages {
		ts := time.UnixMilli(m.Timestamp).Format("2006-01-02 15:04")
		content := m.Content
		if m.Deleted {
			content = "[deleted]"
		}
		if m.Edited {
			content += " (edited)"
		}
		fmt.Fprintf(w, "[%s] %s: %s\r\n", ts, m.Username, content)

		// Append reactions on a new line.
		if len(m.Reactions) > 0 {
			var parts []string
			for emoji, users := range m.Reactions {
				parts = append(parts, fmt.Sprintf("%s %d", emoji, len(users)))
			}
			fmt.Fprintf(w, "    %s\r\n", strings.Join(parts, "  "))
		}
	}
}

// --- User registration and authentication endpoints ---

// Register handles POST /api/register.
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}

	if !AuthAllow(requestIP(r)) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "60")
		writeJSONError(w, http.StatusTooManyRequests, "too many attempts, try again later", "RATE_LIMITED", requestID)
		return
	}

	var body struct {
		Username   string `json:"username"`
		Password   string `json:"password"`
		InviteCode string `json:"invite_code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body", "INVALID_JSON", requestID)
		return
	}

	username := strings.TrimSpace(body.Username)
	password := body.Password
	inviteCode := strings.TrimSpace(body.InviteCode)

	if !hub.ValidateUsername(username) {
		writeJSONError(w, http.StatusBadRequest, "invalid username: 1-20 chars, letters, digits, underscore, or Chinese", "INVALID_USERNAME", requestID)
		return
	}

	if hub.IsReservedUsername(username) {
		writeJSONError(w, http.StatusBadRequest, "username is reserved", "RESERVED_USERNAME", requestID)
		return
	}

	if len(password) < 6 {
		writeJSONError(w, http.StatusBadRequest, "password must be at least 6 characters", "WEAK_PASSWORD", requestID)
		return
	}
	if len(password) > 72 {
		writeJSONError(w, http.StatusBadRequest, "password must be at most 72 characters", "PASSWORD_TOO_LONG", requestID)
		return
	}

	if inviteCode == "" {
		writeJSONError(w, http.StatusBadRequest, "invite code is required", "MISSING_INVITE_CODE", requestID)
		return
	}

	if err := h.store.RegisterUser(username, password, inviteCode); err != nil {
		log.Printf("register error: %v", err)
		if strings.Contains(err.Error(), "invalid invite code") ||
			strings.Contains(err.Error(), "no remaining uses") ||
			strings.Contains(err.Error(), "expired") {
			writeJSONError(w, http.StatusBadRequest, "invalid or expired invite code", "INVALID_INVITE_CODE", requestID)
			return
		}
		if strings.Contains(err.Error(), "already registered") {
			writeJSONError(w, http.StatusConflict, "username already registered", "USERNAME_TAKEN", requestID)
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "registration failed", "SERVER_ERROR", requestID)
		return
	}
	sessionToken, err := h.issueSessionToken(username)
	if err != nil {
		log.Printf("register: session token issue failed: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "registration failed", "SERVER_ERROR", requestID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"username":      username,
		"session_token": sessionToken,
	})
}

// Login handles POST /api/login.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}

	if !AuthAllow(requestIP(r)) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "60")
		writeJSONError(w, http.StatusTooManyRequests, "too many attempts, try again later", "RATE_LIMITED", requestID)
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body", "INVALID_JSON", requestID)
		return
	}

	username := strings.TrimSpace(body.Username)
	password := body.Password

	if username == "" || password == "" {
		writeJSONError(w, http.StatusBadRequest, "username and password are required", "MISSING_FIELDS", requestID)
		return
	}

	ok, err := h.store.VerifyUser(username, password)
	if err != nil {
		log.Printf("login error: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "login failed", "SERVER_ERROR", requestID)
		return
	}
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "invalid username or password", "INVALID_CREDENTIALS", requestID)
		return
	}
	sessionToken, err := h.issueSessionToken(username)
	if err != nil {
		log.Printf("login: session token issue failed: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "login failed", "SERVER_ERROR", requestID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"username":      username,
		"session_token": sessionToken,
	})
}

// InviteGenerate handles POST /api/invite/generate.
func (h *Handler) InviteGenerate(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}

	authUsername, ok := h.requireSession(w, r)
	if !ok {
		return
	}
	if !AuthAllow(requestIP(r)) {
		writeJSONError(w, http.StatusTooManyRequests, "too many attempts, try again later", "RATE_LIMITED", requestID)
		return
	}
	var body struct {
		Username string `json:"username"`
		MaxUses  int    `json:"max_uses"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body", "INVALID_JSON", requestID)
		return
	}

	maxUses := body.MaxUses
	if maxUses <= 0 {
		maxUses = 5
	}

	code, err := h.store.GenerateInviteCode(authUsername, maxUses)
	if err != nil {
		log.Printf("generate invite code error: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to generate invite code", "SERVER_ERROR", requestID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code": code,
	})
}

// WebhookHandler handles incoming webhook POST requests.
// POST /api/webhook/{url}
func (h *Handler) WebhookHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Extract webhook URL from path: /api/webhook/{url}
	url := strings.TrimPrefix(r.URL.Path, "/api/webhook/")
	if url == "" {
		http.Error(w, "missing webhook URL", http.StatusBadRequest)
		return
	}
	// Verify secret from the Authorization header. Do not accept query-string
	// secrets; URLs are commonly logged and copied.
	const bearerPrefix = "Bearer "
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(auth, bearerPrefix) {
		http.Error(w, "missing secret", http.StatusUnauthorized)
		return
	}
	secret := strings.TrimSpace(strings.TrimPrefix(auth, bearerPrefix))
	if secret == "" {
		http.Error(w, "missing secret", http.StatusUnauthorized)
		return
	}
	webhook, ok, err := h.store.VerifyWebhookSecret(url, secret)
	if err != nil || !ok {
		http.Error(w, "invalid webhook URL or secret", http.StatusNotFound)
		return
	}
	// Parse JSON body
	r.Body = http.MaxBytesReader(w, r.Body, maxWebhookBodySize)
	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			http.Error(w, "webhook body too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "invalid body: content required", http.StatusBadRequest)
		return
	}
	content := strings.TrimSpace(body.Content)
	if content == "" {
		http.Error(w, "invalid body: content required", http.StatusBadRequest)
		return
	}
	if len([]rune(content)) > maxWebhookContentLength {
		http.Error(w, "webhook content too long", http.StatusBadRequest)
		return
	}
	storedMsg, err := h.store.InsertMessage("webhook", content, "", "", "", webhook.GroupName, "")
	if err != nil {
		log.Printf("webhook: failed to insert group message: %v", err)
		http.Error(w, "failed to save webhook message", http.StatusInternalServerError)
		return
	}

	msg := hub.Message{
		Type:      "group_message",
		ID:        storedMsg.ID,
		Group:     webhook.GroupName,
		Username:  "webhook",
		Content:   content,
		Timestamp: storedMsg.Timestamp,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("webhook: failed to marshal group message: %v", err)
		http.Error(w, "failed to send webhook message", http.StatusInternalServerError)
		return
	}
	h.hub.SendToGroup(webhook.GroupName, data)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// AdminStats handles GET /api/admin/stats — returns server statistics.
func (h *Handler) AdminStats(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}
	if _, ok := h.requireSession(w, r); !ok {
		return
	}
	stats := map[string]interface{}{
		"total_messages":     h.store.TotalMessages(),
		"active_connections": h.hub.ConnectionCount(),
		"rooms":              len(h.store.ListRooms()),
		"groups":             len(h.store.GetAllGroups()),
		"friends":            len(h.store.GetAllFriends()),
		"registered_users":   h.store.TotalUsers(),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// InviteList handles GET /api/invite/list?username=xxx.
func (h *Handler) InviteList(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}
	authUsername, ok := h.requireSession(w, r)
	if !ok {
		return
	}

	codes, err := h.store.ListInviteCodes(authUsername)
	if err != nil {
		log.Printf("list invite codes error: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to list invite codes", "SERVER_ERROR", requestID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"codes": codes,
	})
}
