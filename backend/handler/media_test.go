package handler

import (
	"testing"
)

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
