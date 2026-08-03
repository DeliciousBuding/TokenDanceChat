package handler

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
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
