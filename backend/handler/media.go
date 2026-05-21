package handler

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

// StoredMedia is a readable media object returned by MediaStore.
type StoredMedia struct {
	Body        io.ReadCloser
	ContentType string
	ModTime     time.Time
}

// MediaStore stores and reads uploaded chat media.
type MediaStore interface {
	Save(ctx context.Context, filename, contentType string, body io.Reader) error
	Open(ctx context.Context, filename string) (*StoredMedia, error)
}

// LocalMediaStore stores media on the local filesystem.
type LocalMediaStore struct {
	dir string
}

// NewLocalMediaStore returns a filesystem media store rooted at dir.
func NewLocalMediaStore(dir string) *LocalMediaStore {
	return &LocalMediaStore{dir: dir}
}

func (s *LocalMediaStore) Save(_ context.Context, filename, _ string, body io.Reader) error {
	if err := os.MkdirAll(s.dir, 0755); err != nil {
		return err
	}
	dst, err := os.Create(filepath.Join(s.dir, filepath.Base(filename)))
	if err != nil {
		return err
	}
	defer dst.Close()
	_, err = io.Copy(dst, body)
	return err
}

func (s *LocalMediaStore) Open(_ context.Context, filename string) (*StoredMedia, error) {
	cleanName := filepath.Base(filename)
	filePath := filepath.Join(s.dir, cleanName)

	absBase, err := filepath.Abs(s.dir)
	if err != nil {
		return nil, err
	}
	absFile, err := filepath.Abs(filePath)
	if err != nil || !strings.HasPrefix(absFile, absBase+string(filepath.Separator)) {
		return nil, os.ErrNotExist
	}

	file, err := os.Open(absFile)
	if err != nil {
		return nil, err
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, err
	}

	return &StoredMedia{
		Body:        file,
		ContentType: contentTypeForFilename(cleanName),
		ModTime:     info.ModTime(),
	}, nil
}

// WebDAVMediaStore stores media through a WebDAV endpoint using PUT and GET.
type WebDAVMediaStore struct {
	endpoint string
	username string
	password string
	client   *http.Client
}

// NewWebDAVMediaStore returns a WebDAV-backed media store.
func NewWebDAVMediaStore(endpoint, username, password string) *WebDAVMediaStore {
	return &WebDAVMediaStore{
		endpoint: strings.TrimRight(endpoint, "/"),
		username: username,
		password: password,
		client:   &http.Client{Timeout: 30 * time.Second},
	}
}

func (s *WebDAVMediaStore) Save(ctx context.Context, filename, contentType string, body io.Reader) error {
	data, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	status, err := s.put(ctx, filename, contentType, bytes.NewReader(data))
	if err == nil && status >= 200 && status < 300 {
		return nil
	}
	if status == http.StatusConflict {
		if err := s.mkcol(ctx, "uploads"); err != nil {
			return err
		}
		status, err = s.put(ctx, filename, contentType, bytes.NewReader(data))
	}
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("webdav PUT failed: %d", status)
	}
	return nil
}

func (s *WebDAVMediaStore) put(ctx context.Context, filename, contentType string, body io.Reader) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, s.mediaURL(filename), body)
	if err != nil {
		return 0, err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	s.setAuth(req)

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	return resp.StatusCode, nil
}

func (s *WebDAVMediaStore) mkcol(ctx context.Context, dir string) error {
	req, err := http.NewRequestWithContext(ctx, "MKCOL", s.endpoint+"/"+url.PathEscape(dir), nil)
	if err != nil {
		return err
	}
	s.setAuth(req)
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusMethodNotAllowed {
		return nil
	}
	return fmt.Errorf("webdav MKCOL failed: %s", resp.Status)
}

func (s *WebDAVMediaStore) Open(ctx context.Context, filename string) (*StoredMedia, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.mediaURL(filename), nil)
	if err != nil {
		return nil, err
	}
	s.setAuth(req)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		if resp.StatusCode == http.StatusNotFound {
			return nil, os.ErrNotExist
		}
		return nil, fmt.Errorf("webdav GET failed: %s", resp.Status)
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = contentTypeForFilename(filename)
	}
	return &StoredMedia{
		Body:        resp.Body,
		ContentType: contentType,
		ModTime:     time.Now(),
	}, nil
}

func (s *WebDAVMediaStore) mediaURL(filename string) string {
	escaped := url.PathEscape(path.Base(filename))
	return s.endpoint + "/uploads/" + escaped
}

func (s *WebDAVMediaStore) setAuth(req *http.Request) {
	if s.username != "" || s.password != "" {
		req.SetBasicAuth(s.username, s.password)
	}
}

func contentTypeForFilename(filename string) string {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	default:
		if ct := mime.TypeByExtension(filepath.Ext(filename)); ct != "" {
			return ct
		}
		return "application/octet-stream"
	}
}
