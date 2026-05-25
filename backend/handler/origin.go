package handler

import (
	"net/http"
	"net/url"
	"os"
	"strings"
)

func normalizeOrigin(raw string) (*url.URL, string, bool) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, "", false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, "", false
	}
	return parsed, strings.ToLower(parsed.Scheme + "://" + parsed.Host), true
}

func originMatchesPattern(originURL *url.URL, origin string, pattern string) bool {
	pattern = strings.TrimSpace(pattern)
	if pattern == "" || pattern == "*" {
		return false
	}

	patternURL, normalizedPattern, ok := normalizeOrigin(pattern)
	if !ok {
		return false
	}
	if strings.EqualFold(origin, normalizedPattern) {
		return true
	}

	patternHost := patternURL.Hostname()
	if !strings.HasPrefix(patternHost, "*.") {
		return false
	}
	if !strings.EqualFold(originURL.Scheme, patternURL.Scheme) {
		return false
	}
	if originURL.Port() != patternURL.Port() {
		return false
	}
	suffix := strings.TrimPrefix(strings.ToLower(patternHost), "*")
	originHost := strings.ToLower(originURL.Hostname())
	return strings.HasSuffix(originHost, suffix) && originHost != strings.TrimPrefix(suffix, ".")
}

func allowedOrigin(r *http.Request) (string, bool) {
	rawOrigin := strings.TrimSpace(r.Header.Get("Origin"))
	if rawOrigin == "" {
		return "", true
	}

	originURL, normalizedOrigin, ok := normalizeOrigin(rawOrigin)
	if !ok {
		return "", false
	}

	if strings.EqualFold(originURL.Host, r.Host) {
		return rawOrigin, true
	}

	for _, pattern := range strings.Split(os.Getenv("CHAT_ALLOWED_ORIGINS"), ",") {
		if originMatchesPattern(originURL, normalizedOrigin, pattern) {
			return rawOrigin, true
		}
	}
	return "", false
}
