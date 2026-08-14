package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	turnstileSiteVerifyURL  = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
	turnstileDefaultAction  = "login"
	turnstileMaxTokenLength = 2048
)

// turnstileVerifier validates Cloudflare Turnstile tokens server-side. An empty
// secret disables verification, so local development and tests keep working.
type turnstileVerifier struct {
	secret    string
	hostnames map[string]struct{}
	action    string
	client    *http.Client
}

func newTurnstileVerifier(secret string, hostnames []string, action string) *turnstileVerifier {
	set := make(map[string]struct{}, len(hostnames))
	for _, hostname := range hostnames {
		if hostname = strings.TrimSpace(hostname); hostname != "" {
			set[hostname] = struct{}{}
		}
	}
	if action == "" {
		action = turnstileDefaultAction
	}
	return &turnstileVerifier{
		secret:    secret,
		hostnames: set,
		action:    action,
		client:    &http.Client{Timeout: 10 * time.Second},
	}
}

func (v *turnstileVerifier) enabled() bool {
	return v != nil && v.secret != ""
}

type turnstileVerifyResponse struct {
	Success    bool     `json:"success"`
	Action     string   `json:"action"`
	Hostname   string   `json:"hostname"`
	ErrorCodes []string `json:"error-codes"`
}

// verify checks a cf-turnstile-response token against the Siteverify endpoint.
func (v *turnstileVerifier) verify(ctx context.Context, token, remoteIP string) error {
	if !v.enabled() {
		return nil
	}
	if token == "" || len(token) > turnstileMaxTokenLength {
		return fmt.Errorf("turnstile: missing or invalid token")
	}

	form := url.Values{}
	form.Set("secret", v.secret)
	form.Set("response", token)
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, turnstileSiteVerifyURL, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("turnstile: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := v.client.Do(req)
	if err != nil {
		return fmt.Errorf("turnstile: siteverify request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return fmt.Errorf("turnstile: read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("turnstile: siteverify status %d", resp.StatusCode)
	}

	var parsed turnstileVerifyResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return fmt.Errorf("turnstile: decode response: %w", err)
	}
	if !parsed.Success {
		return fmt.Errorf("turnstile: verification failed: %s", strings.Join(parsed.ErrorCodes, ", "))
	}
	if parsed.Action != v.action {
		return fmt.Errorf("turnstile: unexpected action %q", parsed.Action)
	}
	if len(v.hostnames) > 0 {
		if _, ok := v.hostnames[parsed.Hostname]; !ok {
			return fmt.Errorf("turnstile: unexpected hostname %q", parsed.Hostname)
		}
	}
	return nil
}

// loadTurnstileVerifier builds a verifier from CHAT_TURNSTILE_* environment
// variables. An empty CHAT_TURNSTILE_SECRET disables server-side verification.
func loadTurnstileVerifier() *turnstileVerifier {
	secret := strings.TrimSpace(os.Getenv("CHAT_TURNSTILE_SECRET"))
	var hostnames []string
	if raw := strings.TrimSpace(os.Getenv("CHAT_TURNSTILE_HOSTNAMES")); raw != "" {
		hostnames = strings.Split(raw, ",")
	}
	action := strings.TrimSpace(os.Getenv("CHAT_TURNSTILE_ACTION"))
	return newTurnstileVerifier(secret, hostnames, action)
}

// verifyTurnstile validates a token against the configured verifier. It is a
// no-op when Turnstile is disabled (no secret configured).
func (h *Handler) verifyTurnstile(r *http.Request, token string) error {
	if h.turnstile == nil {
		return nil
	}
	return h.turnstile.verify(r.Context(), token, requestIP(r))
}
