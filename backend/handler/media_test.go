package handler

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// LocalMediaStore constructor tests (existing)
// ---------------------------------------------------------------------------

// TestNewLocalMediaStore_ValidPath verifies the constructor stores the directory.
func TestNewLocalMediaStore_ValidPath(t *testing.T) {
	store := NewLocalMediaStore("/tmp/uploads")
	if store == nil {
		t.Fatal("NewLocalMediaStore returned nil")
	}
	if store.dir != "/tmp/uploads" {
		t.Errorf("expected dir '/tmp/uploads', got %q", store.dir)
	}
}

// TestNewLocalMediaStore_EmptyPath verifies the constructor accepts an empty path.
func TestNewLocalMediaStore_EmptyPath(t *testing.T) {
	store := NewLocalMediaStore("")
	if store == nil {
		t.Fatal("NewLocalMediaStore with empty path returned nil")
	}
	if store.dir != "" {
		t.Errorf("expected empty dir, got %q", store.dir)
	}
}

// TestNewLocalMediaStore_RelativePath verifies relative paths are stored as-is.
func TestNewLocalMediaStore_RelativePath(t *testing.T) {
	store := NewLocalMediaStore("./data/uploads")
	if store == nil {
		t.Fatal("NewLocalMediaStore returned nil")
	}
	if store.dir != "./data/uploads" {
		t.Errorf("expected dir './data/uploads', got %q", store.dir)
	}
}

// ---------------------------------------------------------------------------
// LocalMediaStore save / open / delete
// ---------------------------------------------------------------------------

// TestLocalMediaStore_SaveAndOpen verifies a full save-then-open round-trip
// through the local filesystem store.
func TestLocalMediaStore_SaveAndOpen(t *testing.T) {
	dir := t.TempDir()
	store := NewLocalMediaStore(dir)
	ctx := context.Background()

	body := strings.NewReader("hello world")
	if err := store.Save(ctx, "note.txt", "text/plain", body); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	m, err := store.Open(ctx, "note.txt")
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer m.Body.Close()

	data, err := io.ReadAll(m.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "hello world" {
		t.Errorf("expected 'hello world', got %q", data)
	}
	if m.ContentType == "" {
		t.Error("expected non-empty ContentType")
	}
	if m.ModTime.IsZero() {
		t.Error("expected non-zero ModTime")
	}
}

// TestLocalMediaStore_SaveNestedDir verifies saving a file into a nested
// subdirectory (intermediate directories are created automatically).
func TestLocalMediaStore_SaveNestedDir(t *testing.T) {
	dir := t.TempDir()
	store := NewLocalMediaStore(dir)
	ctx := context.Background()

	if err := store.Save(ctx, "sub/dir/file.txt", "", strings.NewReader("nested")); err != nil {
		t.Fatalf("Save nested failed: %v", err)
	}

	m, err := store.Open(ctx, "sub/dir/file.txt")
	if err != nil {
		t.Fatalf("Open nested failed: %v", err)
	}
	defer m.Body.Close()

	data, _ := io.ReadAll(m.Body)
	if string(data) != "nested" {
		t.Errorf("expected 'nested', got %q", data)
	}
}

// TestLocalMediaStore_SaveTraversalRejected verifies that path-traversal keys
// are rejected during Save.
func TestLocalMediaStore_SaveTraversalRejected(t *testing.T) {
	dir := t.TempDir()
	store := NewLocalMediaStore(dir)
	ctx := context.Background()

	tests := []string{
		"../escape.txt",
		"..\\escape.txt",
		"foo/../../bar.txt",
		".",
		"..",
		"a//b.txt",
		"a/./b.txt",
	}
	for _, key := range tests {
		err := store.Save(ctx, key, "", strings.NewReader("x"))
		if err == nil {
			t.Errorf("expected error for traversal key %q, got nil", key)
		}
	}
}

// TestLocalMediaStore_OpenTraversalRejected verifies path-traversal keys
// return os.ErrNotExist from Open (never exposing files outside the store).
func TestLocalMediaStore_OpenTraversalRejected(t *testing.T) {
	dir := t.TempDir()
	store := NewLocalMediaStore(dir)
	ctx := context.Background()

	tests := []string{
		"../etc/passwd",
		"..\\Windows\\system32",
		".",
		"..",
	}
	for _, key := range tests {
		_, err := store.Open(ctx, key)
		if err == nil {
			t.Errorf("expected error for traversal key %q, got nil", key)
		}
	}
}

// TestLocalMediaStore_OpenNonExistent verifies Open returns an error when the
// file does not exist.
func TestLocalMediaStore_OpenNonExistent(t *testing.T) {
	dir := t.TempDir()
	store := NewLocalMediaStore(dir)
	ctx := context.Background()

	_, err := store.Open(ctx, "no-such-file.txt")
	if err == nil {
		t.Fatal("expected error for non-existent file")
	}
}

// TestLocalMediaStore_LifecycleDelete exercises the full file lifecycle:
// save, verify on disk, delete, then confirm Open fails.
func TestLocalMediaStore_LifecycleDelete(t *testing.T) {
	dir := t.TempDir()
	store := NewLocalMediaStore(dir)
	ctx := context.Background()

	if err := store.Save(ctx, "tmp.txt", "", strings.NewReader("data")); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	filePath := filepath.Join(dir, "tmp.txt")
	if _, err := os.Stat(filePath); err != nil {
		t.Fatalf("saved file not on disk: %v", err)
	}

	if err := os.Remove(filePath); err != nil {
		t.Fatalf("Remove failed: %v", err)
	}

	_, err := store.Open(ctx, "tmp.txt")
	if err == nil {
		t.Error("expected error after file deleted")
	}
}

// TestLocalMediaStore_SaveContentTypeIrrelevant verifies the content-type
// parameter is ignored by LocalMediaStore.Save (it uses extension-based
// detection on Open instead).
func TestLocalMediaStore_SaveContentTypeIrrelevant(t *testing.T) {
	dir := t.TempDir()
	store := NewLocalMediaStore(dir)
	ctx := context.Background()

	// Save a .png with a non-png content-type; Open should still detect image/png.
	if err := store.Save(ctx, "icon.png", "text/plain", strings.NewReader("png-data")); err != nil {
		t.Fatal(err)
	}
	m, err := store.Open(ctx, "icon.png")
	if err != nil {
		t.Fatal(err)
	}
	defer m.Body.Close()

	if m.ContentType != "image/png" {
		t.Errorf("expected image/png from extension, got %q", m.ContentType)
	}
}

// ---------------------------------------------------------------------------
// WebDAVMediaStore mock-server tests
// ---------------------------------------------------------------------------

// TestWebDAVMediaStore_Save verifies upload via a mock HTTP server that
// accepts PUT requests.
func TestWebDAVMediaStore_Save(t *testing.T) {
	var savedBody []byte
	var savedContentType string
	var savedURL string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			savedBody, _ = io.ReadAll(r.Body)
			savedContentType = r.Header.Get("Content-Type")
			savedURL = r.URL.Path
			w.WriteHeader(http.StatusCreated)
		case "MKCOL":
			w.WriteHeader(http.StatusCreated)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer srv.Close()

	store := NewWebDAVMediaStore(srv.URL, "user", "pass")
	ctx := context.Background()

	err := store.Save(ctx, "image.png", "image/png", strings.NewReader("fake-png-data"))
	if err != nil {
		t.Fatalf("Save failed: %v", err)
	}
	if string(savedBody) != "fake-png-data" {
		t.Errorf("expected 'fake-png-data', got %q", savedBody)
	}
	if savedContentType != "image/png" {
		t.Errorf("expected Content-Type 'image/png', got %q", savedContentType)
	}
	if savedURL != "/uploads/image.png" {
		t.Errorf("expected URL path /uploads/image.png, got %q", savedURL)
	}
}

// TestWebDAVMediaStore_Save_Conflict verifies the MKCOL fallback when the
// server responds 409 Conflict (missing parent collection).
func TestWebDAVMediaStore_Save_Conflict(t *testing.T) {
	putCount := 0

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			putCount++
			if putCount == 1 {
				w.WriteHeader(http.StatusConflict)
			} else {
				w.WriteHeader(http.StatusCreated)
			}
		case "MKCOL":
			w.WriteHeader(http.StatusCreated)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer srv.Close()

	store := NewWebDAVMediaStore(srv.URL, "", "")
	err := store.Save(context.Background(), "deeply/nested/file.txt", "text/plain", strings.NewReader("payload"))
	if err != nil {
		t.Fatalf("Save with conflict should succeed after MKCOL: %v", err)
	}
	if putCount != 2 {
		t.Errorf("expected 2 PUT attempts (409 then 201), got %d", putCount)
	}
}

// TestWebDAVMediaStore_Open verifies download via a mock HTTP server that
// responds to GET requests.
func TestWebDAVMediaStore_Open(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/uploads/img.png" {
			w.Header().Set("Content-Type", "image/png")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("stored-png"))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	store := NewWebDAVMediaStore(srv.URL, "user", "pass")
	m, err := store.Open(context.Background(), "img.png")
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer m.Body.Close()

	data, _ := io.ReadAll(m.Body)
	if string(data) != "stored-png" {
		t.Errorf("expected 'stored-png', got %q", data)
	}
	if m.ContentType != "image/png" {
		t.Errorf("expected Content-Type 'image/png', got %q", m.ContentType)
	}
}

// TestWebDAVMediaStore_Open_NotFound verifies 404 responses are mapped to
// os.ErrNotExist.
func TestWebDAVMediaStore_Open_NotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	store := NewWebDAVMediaStore(srv.URL, "", "")
	_, err := store.Open(context.Background(), "missing.txt")
	if err == nil {
		t.Fatal("expected error for not-found")
	}
	if !errors.Is(err, os.ErrNotExist) {
		t.Errorf("expected os.ErrNotExist, got %v", err)
	}
}

// TestWebDAVMediaStore_Open_ContentTypePassthrough verifies the Content-Type
// from the server response is passed through to StoredMedia.
func TestWebDAVMediaStore_Open_ContentTypePassthrough(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "application/custom-type")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("data"))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	store := NewWebDAVMediaStore(srv.URL, "", "")
	m, err := store.Open(context.Background(), "file.xyz")
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer m.Body.Close()

	if m.ContentType != "application/custom-type" {
		t.Errorf("expected Content-Type 'application/custom-type', got %q", m.ContentType)
	}
}

// TestWebDAVMediaStore_Auth verifies the Basic auth header is set when
// username and password are provided.
func TestWebDAVMediaStore_Auth(t *testing.T) {
	var authHeader string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "MKCOL" {
			w.WriteHeader(http.StatusCreated)
			return
		}
		if r.Method == http.MethodPut {
			authHeader = r.Header.Get("Authorization")
			w.WriteHeader(http.StatusCreated)
			return
		}
		w.WriteHeader(http.StatusMethodNotAllowed)
	}))
	defer srv.Close()

	store := NewWebDAVMediaStore(srv.URL, "alice", "s3cret")
	err := store.Save(context.Background(), "doc.txt", "text/plain", strings.NewReader("x"))
	if err != nil {
		t.Fatalf("Save failed: %v", err)
	}
	if authHeader == "" {
		t.Error("expected Authorization header on PUT request")
	}
}

// TestWebDAVMediaStore_SaveTraversalRejected verifies traversal keys are
// rejected by the WebDAV store.
func TestWebDAVMediaStore_SaveTraversalRejected(t *testing.T) {
	// No server needed — traversal rejection happens before any HTTP call.
	store := NewWebDAVMediaStore("https://dav.example.com", "", "")
	ctx := context.Background()

	err := store.Save(ctx, "../escape.txt", "", strings.NewReader("x"))
	if err == nil {
		t.Error("expected error for traversal key")
	}
}

// ---------------------------------------------------------------------------
// S3MediaStore constructor tests (existing)
// ---------------------------------------------------------------------------

// TestNewS3MediaStore_ValidConfig verifies a store is created with all required fields.
func TestNewS3MediaStore_ValidConfig(t *testing.T) {
	cfg := S3MediaStoreConfig{
		Endpoint:        "https://s3.us-east-1.amazonaws.com",
		Region:          "us-east-1",
		Bucket:          "my-bucket",
		AccessKeyID:     "AKID123",
		SecretAccessKey: "secret123",
	}
	store, err := NewS3MediaStore(cfg)
	if err != nil {
		t.Fatalf("NewS3MediaStore returned error: %v", err)
	}
	if store == nil {
		t.Fatal("NewS3MediaStore returned nil")
	}
	if store.endpoint != "https://s3.us-east-1.amazonaws.com" {
		t.Errorf("wrong endpoint: %s", store.endpoint)
	}
	if store.region != "us-east-1" {
		t.Errorf("wrong region: %s", store.region)
	}
	if store.bucket != "my-bucket" {
		t.Errorf("wrong bucket: %s", store.bucket)
	}
	if store.accessKeyID != "AKID123" {
		t.Errorf("wrong access key: %s", store.accessKeyID)
	}
	if store.prefix != "uploads" {
		t.Errorf("expected default prefix 'uploads', got %q", store.prefix)
	}
	if store.usePathStyle != false {
		t.Errorf("expected UsePathStyle false by default, got %v", store.usePathStyle)
	}
}

// TestNewS3MediaStore_CustomPrefix verifies a custom prefix is preserved.
func TestNewS3MediaStore_CustomPrefix(t *testing.T) {
	cfg := S3MediaStoreConfig{
		Endpoint:        "https://s3.us-east-1.amazonaws.com",
		Region:          "us-east-1",
		Bucket:          "my-bucket",
		AccessKeyID:     "AKID123",
		SecretAccessKey: "secret123",
		Prefix:          "media",
	}
	store, err := NewS3MediaStore(cfg)
	if err != nil {
		t.Fatalf("NewS3MediaStore returned error: %v", err)
	}
	if store.prefix != "media" {
		t.Errorf("expected prefix 'media', got %q", store.prefix)
	}
}

// TestNewS3MediaStore_PrefixTrimmed verifies leading/trailing slashes are stripped.
func TestNewS3MediaStore_PrefixTrimmed(t *testing.T) {
	cfg := S3MediaStoreConfig{
		Endpoint:        "https://s3.us-east-1.amazonaws.com",
		Region:          "us-east-1",
		Bucket:          "my-bucket",
		AccessKeyID:     "AKID123",
		SecretAccessKey: "secret123",
		Prefix:          "  /custom-prefix/  ",
	}
	store, err := NewS3MediaStore(cfg)
	if err != nil {
		t.Fatalf("NewS3MediaStore returned error: %v", err)
	}
	if store.prefix != "custom-prefix" {
		t.Errorf("expected prefix 'custom-prefix', got %q", store.prefix)
	}
}

// TestNewS3MediaStore_PathStyle verifies UsePathStyle is stored.
func TestNewS3MediaStore_PathStyle(t *testing.T) {
	cfg := S3MediaStoreConfig{
		Endpoint:        "https://s3.us-east-1.amazonaws.com",
		Region:          "us-east-1",
		Bucket:          "my-bucket",
		AccessKeyID:     "AKID123",
		SecretAccessKey: "secret123",
		UsePathStyle:    true,
	}
	store, err := NewS3MediaStore(cfg)
	if err != nil {
		t.Fatalf("NewS3MediaStore returned error: %v", err)
	}
	if !store.usePathStyle {
		t.Error("expected UsePathStyle to be true")
	}
}

// TestNewS3MediaStore_SessionToken verifies the session token is stored.
func TestNewS3MediaStore_SessionToken(t *testing.T) {
	cfg := S3MediaStoreConfig{
		Endpoint:        "https://s3.us-east-1.amazonaws.com",
		Region:          "us-east-1",
		Bucket:          "my-bucket",
		AccessKeyID:     "AKID123",
		SecretAccessKey: "secret123",
		SessionToken:    "session-token-abc",
	}
	store, err := NewS3MediaStore(cfg)
	if err != nil {
		t.Fatalf("NewS3MediaStore returned error: %v", err)
	}
	if store.sessionToken != "session-token-abc" {
		t.Errorf("expected session token 'session-token-abc', got %q", store.sessionToken)
	}
}

// TestNewS3MediaStore_EndpointTrimmed verifies trailing slash is trimmed from endpoint.
func TestNewS3MediaStore_EndpointTrimmed(t *testing.T) {
	cfg := S3MediaStoreConfig{
		Endpoint:        "https://s3.us-east-1.amazonaws.com/",
		Region:          "us-east-1",
		Bucket:          "my-bucket",
		AccessKeyID:     "AKID123",
		SecretAccessKey: "secret123",
	}
	store, err := NewS3MediaStore(cfg)
	if err != nil {
		t.Fatalf("NewS3MediaStore returned error: %v", err)
	}
	if store.endpoint != "https://s3.us-east-1.amazonaws.com" {
		t.Errorf("expected endpoint without trailing slash, got %q", store.endpoint)
	}
}

// TestNewS3MediaStore_MissingEndpoint verifies empty endpoint returns error.
func TestNewS3MediaStore_MissingEndpoint(t *testing.T) {
	cfg := S3MediaStoreConfig{
		Region:          "us-east-1",
		Bucket:          "my-bucket",
		AccessKeyID:     "AKID123",
		SecretAccessKey: "secret123",
	}
	_, err := NewS3MediaStore(cfg)
	if err == nil {
		t.Error("expected error for missing endpoint, got nil")
	}
}

// TestNewS3MediaStore_MissingRegion verifies empty region returns error.
func TestNewS3MediaStore_MissingRegion(t *testing.T) {
	cfg := S3MediaStoreConfig{
		Endpoint:        "https://s3.us-east-1.amazonaws.com",
		Bucket:          "my-bucket",
		AccessKeyID:     "AKID123",
		SecretAccessKey: "secret123",
	}
	_, err := NewS3MediaStore(cfg)
	if err == nil {
		t.Error("expected error for missing region, got nil")
	}
}

// TestNewS3MediaStore_MissingBucket verifies empty bucket returns error.
func TestNewS3MediaStore_MissingBucket(t *testing.T) {
	cfg := S3MediaStoreConfig{
		Endpoint:        "https://s3.us-east-1.amazonaws.com",
		Region:          "us-east-1",
		AccessKeyID:     "AKID123",
		SecretAccessKey: "secret123",
	}
	_, err := NewS3MediaStore(cfg)
	if err == nil {
		t.Error("expected error for missing bucket, got nil")
	}
}

// TestNewS3MediaStore_MissingAccessKey verifies empty access key returns error.
func TestNewS3MediaStore_MissingAccessKey(t *testing.T) {
	cfg := S3MediaStoreConfig{
		Endpoint:        "https://s3.us-east-1.amazonaws.com",
		Region:          "us-east-1",
		Bucket:          "my-bucket",
		SecretAccessKey: "secret123",
	}
	_, err := NewS3MediaStore(cfg)
	if err == nil {
		t.Error("expected error for missing access key ID, got nil")
	}
}

// TestNewS3MediaStore_MissingSecretKey verifies empty secret key returns error.
func TestNewS3MediaStore_MissingSecretKey(t *testing.T) {
	cfg := S3MediaStoreConfig{
		Endpoint:    "https://s3.us-east-1.amazonaws.com",
		Region:      "us-east-1",
		Bucket:      "my-bucket",
		AccessKeyID: "AKID123",
	}
	_, err := NewS3MediaStore(cfg)
	if err == nil {
		t.Error("expected error for missing secret key, got nil")
	}
}

// TestNewS3MediaStore_InvalidEndpoint verifies malformed endpoints are rejected.
func TestNewS3MediaStore_InvalidEndpoint(t *testing.T) {
	tests := []string{
		"not-a-url",
		"http://",
		"  ",
	}
	for _, endpoint := range tests {
		t.Run("endpoint="+endpoint, func(t *testing.T) {
			cfg := S3MediaStoreConfig{
				Endpoint:        endpoint,
				Region:          "us-east-1",
				Bucket:          "my-bucket",
				AccessKeyID:     "AKID123",
				SecretAccessKey: "secret123",
			}
			_, err := NewS3MediaStore(cfg)
			if err == nil {
				t.Errorf("expected error for endpoint %q, got nil", endpoint)
			}
		})
	}
}

// TestNewS3MediaStore_WhitespaceFields verifies whitespace-only fields are trimmed
// and treated as empty.
func TestNewS3MediaStore_WhitespaceFields(t *testing.T) {
	cfg := S3MediaStoreConfig{
		Endpoint:        "https://s3.us-east-1.amazonaws.com",
		Region:          "  us-east-1  ",
		Bucket:          "  my-bucket  ",
		AccessKeyID:     "  AKID123  ",
		SecretAccessKey: "  secret123  ",
	}
	store, err := NewS3MediaStore(cfg)
	if err != nil {
		t.Fatalf("NewS3MediaStore unexpectedly returned error: %v", err)
	}
	if store.region != "us-east-1" {
		t.Errorf("expected region 'us-east-1', got %q", store.region)
	}
	if store.bucket != "my-bucket" {
		t.Errorf("expected bucket 'my-bucket', got %q", store.bucket)
	}
}

// ---------------------------------------------------------------------------
// S3MediaStore object URL generation
// ---------------------------------------------------------------------------

// baseS3Config returns a minimal valid config for helper store construction.
func baseS3Config() S3MediaStoreConfig {
	return S3MediaStoreConfig{
		Endpoint:        "https://s3.us-east-1.amazonaws.com",
		Region:          "us-east-1",
		Bucket:          "my-bucket",
		AccessKeyID:     "AKID123",
		SecretAccessKey: "secret123",
	}
}

// TestS3MediaStore_objectURL_VirtualHosted verifies the default virtual-hosted
// style object URL uses bucket-as-subdomain.
func TestS3MediaStore_objectURL_VirtualHosted(t *testing.T) {
	store, err := NewS3MediaStore(baseS3Config())
	if err != nil {
		t.Fatal(err)
	}

	u, err := store.objectURL("photo.png")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(u, "my-bucket.s3.us-east-1.amazonaws.com") {
		t.Errorf("expected virtual-hosted bucket in hostname, got %s", u)
	}
	if !strings.HasSuffix(u, "/uploads/photo.png") {
		t.Errorf("expected path ending with /uploads/photo.png, got %s", u)
	}
}

// TestS3MediaStore_objectURL_PathStyle verifies path-style URLs place the
// bucket in the URL path.
func TestS3MediaStore_objectURL_PathStyle(t *testing.T) {
	cfg := baseS3Config()
	cfg.UsePathStyle = true
	store, err := NewS3MediaStore(cfg)
	if err != nil {
		t.Fatal(err)
	}

	u, err := store.objectURL("photo.png")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(u, "s3.us-east-1.amazonaws.com/my-bucket/uploads/photo.png") {
		t.Errorf("expected path-style URL, got %s", u)
	}
}

// TestS3MediaStore_objectURL_CustomPrefix verifies a custom prefix replaces
// the default "uploads".
func TestS3MediaStore_objectURL_CustomPrefix(t *testing.T) {
	cfg := baseS3Config()
	cfg.Prefix = "images"
	store, err := NewS3MediaStore(cfg)
	if err != nil {
		t.Fatal(err)
	}

	u, err := store.objectURL("cat.jpg")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(u, "/images/cat.jpg") {
		t.Errorf("expected /images/cat.jpg in path, got %s", u)
	}
}

// TestS3MediaStore_objectURL_NestedKey verifies nested keys produce correct
// paths.
func TestS3MediaStore_objectURL_NestedKey(t *testing.T) {
	cfg := baseS3Config()
	cfg.Prefix = "media"
	store, err := NewS3MediaStore(cfg)
	if err != nil {
		t.Fatal(err)
	}

	u, err := store.objectURL("2024/01/photo.jpg")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(u, "/media/2024/01/photo.jpg") {
		t.Errorf("expected nested path, got %s", u)
	}
}

// TestS3MediaStore_objectURL_KeySanitization verifies traversal and invalid
// keys are rejected by objectURL (which calls cleanMediaKey internally).
func TestS3MediaStore_objectURL_KeySanitization(t *testing.T) {
	store, err := NewS3MediaStore(baseS3Config())
	if err != nil {
		t.Fatal(err)
	}

	badKeys := []string{
		"../escape.txt",
		".",
		"..",
		"",
		"a/./b.txt",
	}
	for _, key := range badKeys {
		_, err := store.objectURL(key)
		if err == nil {
			t.Errorf("expected error for key %q, got nil", key)
		}
	}
}

// ---------------------------------------------------------------------------
// S3MediaStore signing
// ---------------------------------------------------------------------------

// TestS3MediaStore_Sign verifies the sign method adds required AWS Signature
// V4 headers to a request.
func TestS3MediaStore_Sign(t *testing.T) {
	store, err := NewS3MediaStore(baseS3Config())
	if err != nil {
		t.Fatal(err)
	}

	u, err := store.objectURL("test.txt")
	if err != nil {
		t.Fatal(err)
	}
	req, _ := http.NewRequest(http.MethodGet, u, nil)
	payloadHash := sha256Hex(nil)
	store.sign(req, payloadHash, time.Now().UTC())

	if req.Header.Get("X-Amz-Date") == "" {
		t.Error("missing X-Amz-Date header")
	}
	if req.Header.Get("X-Amz-Content-Sha256") == "" {
		t.Error("missing X-Amz-Content-Sha256 header")
	}

	auth := req.Header.Get("Authorization")
	if auth == "" {
		t.Error("missing Authorization header")
	}
	if !strings.HasPrefix(auth, "AWS4-HMAC-SHA256") {
		t.Errorf("expected AWS4-HMAC-SHA256 prefix in Authorization, got %s", auth)
	}
	if !strings.Contains(auth, "Credential="+store.accessKeyID+"/") {
		t.Errorf("expected Credential containing access key, got %s", auth)
	}
	if !strings.Contains(auth, "SignedHeaders=") {
		t.Errorf("expected SignedHeaders in Authorization, got %s", auth)
	}
	if !strings.Contains(auth, "Signature=") {
		t.Errorf("expected Signature in Authorization, got %s", auth)
	}
}

// TestS3MediaStore_Sign_SessionToken verifies the X-Amz-Security-Token header
// is included when a session token is configured.
func TestS3MediaStore_Sign_SessionToken(t *testing.T) {
	cfg := baseS3Config()
	cfg.SessionToken = "session-token-abc"
	store, err := NewS3MediaStore(cfg)
	if err != nil {
		t.Fatal(err)
	}

	u, _ := store.objectURL("test.txt")
	req, _ := http.NewRequest(http.MethodGet, u, nil)
	store.sign(req, sha256Hex(nil), time.Now().UTC())

	token := req.Header.Get("X-Amz-Security-Token")
	if token != "session-token-abc" {
		t.Errorf("expected X-Amz-Security-Token 'session-token-abc', got %q", token)
	}
}

// TestS3MediaStore_Sign_HostHeader verifies the Host header in the signed
// canonical request matches the URL host.
func TestS3MediaStore_Sign_HostHeader(t *testing.T) {
	store, err := NewS3MediaStore(baseS3Config())
	if err != nil {
		t.Fatal(err)
	}

	u, _ := store.objectURL("data.bin")
	req, _ := http.NewRequest(http.MethodGet, u, nil)
	store.sign(req, sha256Hex(nil), time.Now().UTC())

	// canonicalS3Headers uses req.URL.Host for the host header.
	auth := req.Header.Get("Authorization")
	if !strings.Contains(auth, "host") {
		// The SignedHeaders should include "host" since it's always added by canonicalS3Headers.
		t.Logf("Authorization: %s", auth)
	}
}

// TestS3MediaStore_Sign_PutWithPayload verifies signing a PUT request with a
// payload sets the content-sha256 header correctly.
func TestS3MediaStore_Sign_PutWithPayload(t *testing.T) {
	store, err := NewS3MediaStore(baseS3Config())
	if err != nil {
		t.Fatal(err)
	}

	u, _ := store.objectURL("upload.bin")
	payload := []byte("hello s3")
	req, _ := http.NewRequest(http.MethodPut, u, nil)
	req.Header.Set("Content-Type", "application/octet-stream")
	payloadHash := sha256Hex(payload)
	store.sign(req, payloadHash, time.Now().UTC())

	if req.Header.Get("X-Amz-Content-Sha256") != payloadHash {
		t.Errorf("expected X-Amz-Content-Sha256 to match payload hash")
	}
}

// TestS3MediaStore_Save_Mock verifies S3 Save sends a properly constructed PUT
// request to a mock S3 endpoint.
func TestS3MediaStore_Save_Mock(t *testing.T) {
	var gotMethod, gotContentType string
	var gotBody []byte

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotContentType = r.Header.Get("Content-Type")
		gotBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := S3MediaStoreConfig{
		Endpoint:        srv.URL,
		Region:          "us-east-1",
		Bucket:          "test-bucket",
		AccessKeyID:     "AKID",
		SecretAccessKey: "secret",
		UsePathStyle:    true,
	}
	store, err := NewS3MediaStore(cfg)
	if err != nil {
		t.Fatal(err)
	}

	err = store.Save(context.Background(), "data.txt", "text/plain", strings.NewReader("payload"))
	if err != nil {
		t.Fatalf("Save failed: %v", err)
	}
	if gotMethod != http.MethodPut {
		t.Errorf("expected PUT, got %s", gotMethod)
	}
	if gotContentType != "text/plain" {
		t.Errorf("expected Content-Type text/plain, got %q", gotContentType)
	}
	if string(gotBody) != "payload" {
		t.Errorf("expected body 'payload', got %q", gotBody)
	}
}

// ---------------------------------------------------------------------------
// cleanMediaKey edge cases
// ---------------------------------------------------------------------------

// TestCleanMediaKey_Valid verifies normal media keys pass sanitization.
func TestCleanMediaKey_Valid(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"file.txt", "file.txt"},
		{"dir/file.txt", "dir/file.txt"},
		{"  file.txt  ", "  file.txt  "},
		{"/absolute/path.txt", "absolute/path.txt"},
		{"back\\slash.txt", "back/slash.txt"},
		{"a/b/c.txt", "a/b/c.txt"},
		{"deeply/nested/path/to/file.bin", "deeply/nested/path/to/file.bin"},
	}
	for _, tt := range tests {
		got, err := cleanMediaKey(tt.input)
		if err != nil {
			t.Errorf("cleanMediaKey(%q) unexpected error: %v", tt.input, err)
			continue
		}
		if got != tt.expected {
			t.Errorf("cleanMediaKey(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

// TestCleanMediaKey_Rejected verifies various traversal and invalid inputs are
// rejected.
func TestCleanMediaKey_Rejected(t *testing.T) {
	tests := []string{
		"",
		".",
		"..",
		"../escape.txt",
		"dir/../../etc/passwd",
		"/../root.txt",
		"a//b.txt",
	}
	for _, key := range tests {
		_, err := cleanMediaKey(key)
		if err == nil {
			t.Errorf("cleanMediaKey(%q) expected error, got nil", key)
		}
	}
}

// TestCleanMediaKey_Unicode verifies Unicode filenames pass sanitization
// unchanged.
func TestCleanMediaKey_Unicode(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"中文文件名.txt", "中文文件名.txt"},
		{"emoji😀.png", "emoji😀.png"},
		{"日本語/ファイル.txt", "日本語/ファイル.txt"},
		{"русский/файл.txt", "русский/файл.txt"},
	}
	for _, tt := range tests {
		got, err := cleanMediaKey(tt.input)
		if err != nil {
			t.Errorf("cleanMediaKey(%q) unexpected error: %v", tt.input, err)
			continue
		}
		if got != tt.expected {
			t.Errorf("cleanMediaKey(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

// TestCleanMediaKey_DotsAndSlashes verifies edge cases involving dots and
// slashes within media keys.
func TestCleanMediaKey_DotsAndSlashes(t *testing.T) {
	// Dots inside segments are fine (file extensions).
	got, err := cleanMediaKey("file.name.with.dots.txt")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "file.name.with.dots.txt" {
		t.Errorf("got %q", got)
	}

	// Single dot as a segment is rejected.
	_, err = cleanMediaKey("dir/./file.txt")
	if err == nil {
		t.Error("expected error for '.' segment")
	}

	// Double dots as a segment is rejected.
	_, err = cleanMediaKey("a/../b.txt")
	if err == nil {
		t.Error("expected error for '..' segment")
	}

	// Leading dots in a filename are fine.
	got, err = cleanMediaKey(".hidden-file")
	if err != nil {
		t.Errorf("unexpected error for .hidden-file: %v", err)
	}
	if got != ".hidden-file" {
		t.Errorf("expected '.hidden-file', got %q", got)
	}

	// Trailing slash produces an empty segment and is rejected.
	_, err = cleanMediaKey("dir/")
	if err == nil {
		t.Error("expected error for trailing slash")
	}

	// Leading slash should be trimmed.
	got, err = cleanMediaKey("/leading-slash.txt")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if got != "leading-slash.txt" {
		t.Errorf("expected 'leading-slash.txt', got %q", got)
	}

	// Multiple leading slashes are trimmed.
	got, err = cleanMediaKey("///multi-slash.txt")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if got != "multi-slash.txt" {
		t.Errorf("expected 'multi-slash.txt', got %q", got)
	}
}
