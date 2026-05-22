package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
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
	mediaKey, err := cleanMediaKey(filename)
	if err != nil {
		return err
	}
	data, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	status, err := s.put(ctx, mediaKey, contentType, bytes.NewReader(data))
	if err == nil && status >= 200 && status < 300 {
		return nil
	}
	if status == http.StatusConflict {
		if err := s.mkcolAll(ctx, mediaKey); err != nil {
			return err
		}
		status, err = s.put(ctx, mediaKey, contentType, bytes.NewReader(data))
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
	mediaURL, err := s.mediaURL(filename)
	if err != nil {
		return 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, mediaURL, body)
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

func (s *WebDAVMediaStore) mkcolAll(ctx context.Context, filename string) error {
	mediaKey, err := cleanMediaKey(filename)
	if err != nil {
		return err
	}
	dirs := []string{"uploads"}
	if dir := path.Dir(mediaKey); dir != "." {
		current := "uploads"
		for _, segment := range strings.Split(dir, "/") {
			current = current + "/" + segment
			dirs = append(dirs, current)
		}
	}
	for _, dir := range dirs {
		if err := s.mkcol(ctx, dir); err != nil {
			return err
		}
	}
	return nil
}

func (s *WebDAVMediaStore) mkcol(ctx context.Context, dir string) error {
	mediaKey, err := cleanMediaKey(dir)
	if err != nil {
		return err
	}
	segments := strings.Split(mediaKey, "/")
	for i, segment := range segments {
		segments[i] = url.PathEscape(segment)
	}
	req, err := http.NewRequestWithContext(ctx, "MKCOL", s.endpoint+"/"+strings.Join(segments, "/"), nil)
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
	mediaURL, err := s.mediaURL(filename)
	if err != nil {
		return nil, os.ErrNotExist
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
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

func (s *WebDAVMediaStore) mediaURL(filename string) (string, error) {
	mediaKey, err := cleanMediaKey(filename)
	if err != nil {
		return "", err
	}
	segments := strings.Split(mediaKey, "/")
	for i, segment := range segments {
		segments[i] = url.PathEscape(segment)
	}
	return s.endpoint + "/uploads/" + strings.Join(segments, "/"), nil
}

func (s *WebDAVMediaStore) setAuth(req *http.Request) {
	if s.username != "" || s.password != "" {
		req.SetBasicAuth(s.username, s.password)
	}
}

// S3MediaStoreConfig configures S3-compatible object storage for chat media.
type S3MediaStoreConfig struct {
	Endpoint        string
	Region          string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
	SessionToken    string
	Prefix          string
	UsePathStyle    bool
}

// S3MediaStore stores media in an S3-compatible bucket using AWS Signature V4.
type S3MediaStore struct {
	endpoint        string
	region          string
	bucket          string
	accessKeyID     string
	secretAccessKey string
	sessionToken    string
	prefix          string
	usePathStyle    bool
	client          *http.Client
}

// NewS3MediaStore returns an S3-compatible media store.
func NewS3MediaStore(cfg S3MediaStoreConfig) (*S3MediaStore, error) {
	endpoint := strings.TrimRight(strings.TrimSpace(cfg.Endpoint), "/")
	region := strings.TrimSpace(cfg.Region)
	bucket := strings.TrimSpace(cfg.Bucket)
	accessKeyID := strings.TrimSpace(cfg.AccessKeyID)
	secretAccessKey := strings.TrimSpace(cfg.SecretAccessKey)
	if endpoint == "" || region == "" || bucket == "" || accessKeyID == "" || secretAccessKey == "" {
		return nil, errors.New("s3 media store requires endpoint, region, bucket, access key, and secret key")
	}
	if parsed, err := url.Parse(endpoint); err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("invalid s3 endpoint: %s", endpoint)
	}
	prefix := strings.Trim(strings.TrimSpace(cfg.Prefix), "/")
	if prefix == "" {
		prefix = "uploads"
	}
	return &S3MediaStore{
		endpoint:        endpoint,
		region:          region,
		bucket:          bucket,
		accessKeyID:     accessKeyID,
		secretAccessKey: secretAccessKey,
		sessionToken:    strings.TrimSpace(cfg.SessionToken),
		prefix:          prefix,
		usePathStyle:    cfg.UsePathStyle,
		client:          &http.Client{Timeout: 30 * time.Second},
	}, nil
}

func (s *S3MediaStore) Save(ctx context.Context, filename, contentType string, body io.Reader) error {
	data, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	objectURL, err := s.objectURL(filename)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, objectURL, bytes.NewReader(data))
	if err != nil {
		return err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	payloadHash := sha256Hex(data)
	s.sign(req, payloadHash, time.Now().UTC())

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		io.Copy(io.Discard, resp.Body)
		return nil
	}
	detail, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	return fmt.Errorf("s3 PUT failed: %s %s", resp.Status, strings.TrimSpace(string(detail)))
}

func (s *S3MediaStore) Open(ctx context.Context, filename string) (*StoredMedia, error) {
	objectURL, err := s.objectURL(filename)
	if err != nil {
		return nil, os.ErrNotExist
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, objectURL, nil)
	if err != nil {
		return nil, err
	}
	payloadHash := sha256Hex(nil)
	s.sign(req, payloadHash, time.Now().UTC())

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		if resp.StatusCode == http.StatusNotFound {
			return nil, os.ErrNotExist
		}
		return nil, fmt.Errorf("s3 GET failed: %s", resp.Status)
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

func (s *S3MediaStore) objectURL(filename string) (string, error) {
	base, _ := url.Parse(s.endpoint)
	mediaKey, err := cleanMediaKey(filename)
	if err != nil {
		return "", err
	}
	objectPath := strings.Trim(s.prefix+"/"+mediaKey, "/")
	if s.usePathStyle {
		base.Path = joinURLPath(base.Path, s.bucket, objectPath)
	} else {
		base.Host = s.bucket + "." + base.Host
		base.Path = joinURLPath(base.Path, objectPath)
	}
	base.RawQuery = ""
	return base.String(), nil
}

func (s *S3MediaStore) sign(req *http.Request, payloadHash string, now time.Time) {
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")

	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	if s.sessionToken != "" {
		req.Header.Set("X-Amz-Security-Token", s.sessionToken)
	}

	canonicalHeaders, signedHeaders := canonicalS3Headers(req)
	canonicalRequest := strings.Join([]string{
		req.Method,
		canonicalURI(req.URL),
		canonicalQuery(req.URL.Query()),
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	}, "\n")

	scope := dateStamp + "/" + s.region + "/s3/aws4_request"
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		sha256Hex([]byte(canonicalRequest)),
	}, "\n")

	signingKey := s3SigningKey(s.secretAccessKey, dateStamp, s.region)
	signature := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))
	req.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+s.accessKeyID+"/"+scope+", SignedHeaders="+signedHeaders+", Signature="+signature)
}

func canonicalS3Headers(req *http.Request) (string, string) {
	headers := map[string]string{
		"host": req.URL.Host,
	}
	for name, values := range req.Header {
		lower := strings.ToLower(name)
		if lower == "content-type" || strings.HasPrefix(lower, "x-amz-") {
			headers[lower] = strings.Join(values, ",")
		}
	}
	keys := make([]string, 0, len(headers))
	for key := range headers {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	var canonical strings.Builder
	for _, key := range keys {
		canonical.WriteString(key)
		canonical.WriteByte(':')
		canonical.WriteString(strings.Join(strings.Fields(headers[key]), " "))
		canonical.WriteByte('\n')
	}
	return canonical.String(), strings.Join(keys, ";")
}

func canonicalURI(u *url.URL) string {
	if u.EscapedPath() == "" {
		return "/"
	}
	return u.EscapedPath()
}

func canonicalQuery(values url.Values) string {
	if len(values) == 0 {
		return ""
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	parts := make([]string, 0)
	for _, key := range keys {
		vals := append([]string(nil), values[key]...)
		sort.Strings(vals)
		for _, value := range vals {
			parts = append(parts, s3Escape(key)+"="+s3Escape(value))
		}
	}
	return strings.Join(parts, "&")
}

func joinURLPath(base string, parts ...string) string {
	all := make([]string, 0, len(parts)+1)
	if trimmedBase := strings.Trim(base, "/"); trimmedBase != "" {
		all = append(all, trimmedBase)
	}
	for _, part := range parts {
		trimmed := strings.Trim(part, "/")
		if trimmed != "" {
			all = append(all, trimmed)
		}
	}
	joined := strings.Join(all, "/")
	if joined == "" {
		return "/"
	}
	return "/" + joined
}

func s3Escape(value string) string {
	escaped := url.QueryEscape(value)
	escaped = strings.ReplaceAll(escaped, "+", "%20")
	escaped = strings.ReplaceAll(escaped, "%7E", "~")
	return escaped
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func hmacSHA256(key, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return mac.Sum(nil)
}

func s3SigningKey(secret, dateStamp, region string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secret), []byte(dateStamp))
	kRegion := hmacSHA256(kDate, []byte(region))
	kService := hmacSHA256(kRegion, []byte("s3"))
	return hmacSHA256(kService, []byte("aws4_request"))
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
