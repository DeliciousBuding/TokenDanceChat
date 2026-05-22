package handler

import (
	"context"
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
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data: https:; font-src 'self'; base-uri 'self'; form-action 'self'")
		next.ServeHTTP(w, r)
	})
}

// HealthCheck handles GET /api/health.
func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
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
		if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
			ip.IsPrivate() || ip.IsUnspecified() {
			return true
		}
	}
	return false
}

// ExportMessages handles GET /api/export?conversation=...&format=json|text&limit=...&username=...
func (h *Handler) ExportMessages(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}

	conversation := r.URL.Query().Get("conversation")
	format := r.URL.Query().Get("format")
	username := r.URL.Query().Get("username")

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
		currentUser = username
		displayName = toUser
	case strings.HasPrefix(conversation, "group:"):
		groupName = strings.TrimPrefix(conversation, "group:")
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

	if toUser != "" && currentUser == "" {
		writeJSONError(w, http.StatusBadRequest, "username query parameter is required for DM export", "MISSING_USERNAME", requestID)
		return
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

	if len(password) < 6 {
		writeJSONError(w, http.StatusBadRequest, "password must be at least 6 characters", "WEAK_PASSWORD", requestID)
		return
	}

	if inviteCode == "" {
		writeJSONError(w, http.StatusBadRequest, "invite code is required", "MISSING_INVITE_CODE", requestID)
		return
	}

	if err := h.store.RegisterUser(username, password, inviteCode); err != nil {
		log.Printf("register error: %v", err)
		if strings.Contains(err.Error(), "invalid invite code") {
			writeJSONError(w, http.StatusBadRequest, "invalid or expired invite code", "INVALID_INVITE_CODE", requestID)
			return
		}
		if strings.Contains(err.Error(), "no remaining uses") {
			writeJSONError(w, http.StatusBadRequest, "invite code has reached maximum uses", "INVITE_CODE_EXHAUSTED", requestID)
			return
		}
		if strings.Contains(err.Error(), "already registered") {
			writeJSONError(w, http.StatusConflict, "username already registered", "USERNAME_TAKEN", requestID)
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "registration failed", "SERVER_ERROR", requestID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"username": username,
	})
}

// Login handles POST /api/login.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"username": username,
	})
}

// InviteGenerate handles POST /api/invite/generate.
func (h *Handler) InviteGenerate(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
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

	username := strings.TrimSpace(body.Username)
	if username == "" {
		writeJSONError(w, http.StatusBadRequest, "username is required", "MISSING_USERNAME", requestID)
		return
	}

	maxUses := body.MaxUses
	if maxUses <= 0 {
		maxUses = 5
	}

	code, err := h.store.GenerateInviteCode(username, maxUses)
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
	// Verify secret from query param
	secret := r.URL.Query().Get("secret")
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
	var body struct {
		Content  string `json:"content"`
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Content == "" {
		http.Error(w, "invalid body: content required", http.StatusBadRequest)
		return
	}
	sender := body.Username
	if sender == "" {
		sender = "webhook"
	}
	// Broadcast to group via hub
	msg := hub.Message{
		Type:      "group_message",
		Group:     webhook.GroupName,
		Username:  sender,
		Content:   body.Content,
		Timestamp: time.Now().UnixMilli(),
	}
	h.hub.BroadcastJSON(msg)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// AdminStats handles GET /api/admin/stats — returns server statistics.
func (h *Handler) AdminStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
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

	username := r.URL.Query().Get("username")
	if username == "" {
		writeJSONError(w, http.StatusBadRequest, "username query parameter is required", "MISSING_USERNAME", requestID)
		return
	}

	codes, err := h.store.ListInviteCodes(username)
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
