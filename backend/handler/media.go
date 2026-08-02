package handler

import (
	"context"
	"fmt"
	"io"
	"mime"
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
	mediaKey, err := cleanMediaKey(filename)
	if err != nil {
		return err
	}
	dstPath := filepath.Join(s.dir, filepath.FromSlash(mediaKey))
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		return err
	}
	dst, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer dst.Close()
	_, err = io.Copy(dst, body)
	return err
}

func (s *LocalMediaStore) Open(_ context.Context, filename string) (*StoredMedia, error) {
	mediaKey, err := cleanMediaKey(filename)
	if err != nil {
		return nil, os.ErrNotExist
	}
	filePath := filepath.Join(s.dir, filepath.FromSlash(mediaKey))

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
		ContentType: contentTypeForFilename(mediaKey),
		ModTime:     info.ModTime(),
	}, nil
}

func cleanMediaKey(filename string) (string, error) {
	key := strings.ReplaceAll(filename, "\\", "/")
	key = strings.TrimLeft(key, "/")
	if key == "" {
		return "", fmt.Errorf("invalid media key")
	}
	for _, segment := range strings.Split(key, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return "", fmt.Errorf("invalid media key")
		}
	}
	cleaned := path.Clean(key)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", fmt.Errorf("invalid media key")
	}
	return cleaned, nil
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
	case ".webm":
		return "audio/webm"
	case ".ogg":
		return "audio/ogg"
	case ".mp3":
		return "audio/mpeg"
	case ".wav":
		return "audio/wav"
	case ".m4a":
		return "audio/mp4"
	default:
		if ct := mime.TypeByExtension(filepath.Ext(filename)); ct != "" {
			return ct
		}
		return "application/octet-stream"
	}
}
