package handler

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestCheckOrigin(t *testing.T) {
	tests := []struct {
		name       string
		origin     string
		host       string
		envAllowed string
		want       bool
	}{
		{
			name:   "no Origin header (same-origin)",
			origin: "",
			host:   "http://chat.example.com",
			want:   true,
		},
		{
			name:   "same origin matches host",
			origin: "https://chat.example.com",
			host:   "http://chat.example.com",
			want:   true,
		},
		{
			name:   "same origin with port in Host",
			origin: "https://chat.example.com",
			host:   "http://chat.example.com:8080",
			want:   true,
		},
		{
			name:   "bare origin matches www host",
			origin: "https://example.com",
			host:   "http://www.example.com",
			want:   true,
		},
		{
			name:   "disallowed origin",
			origin: "https://evil.com",
			host:   "http://chat.example.com",
			want:   false,
		},
		{
			name:   "invalid origin URL",
			origin: "://bad",
			host:   "http://chat.example.com",
			want:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envAllowed != "" {
				os.Setenv("CHAT_ALLOWED_ORIGINS", tt.envAllowed)
				defer os.Unsetenv("CHAT_ALLOWED_ORIGINS")
			} else {
				// Ensure no env var interferes.
				os.Unsetenv("CHAT_ALLOWED_ORIGINS")
			}

			req := httptest.NewRequest(http.MethodGet, tt.host+"/ws", nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}

			got := upgrader.CheckOrigin(req)
			if got != tt.want {
				t.Errorf("CheckOrigin() = %v, want %v (origin=%q host=%q)",
					got, tt.want, tt.origin, tt.host)
			}
		})
	}
}

func TestCheckOriginWithEnvAllowed(t *testing.T) {
	// Tests that require specific CHAT_ALLOWED_ORIGINS values.
	// Not parallel to avoid env var conflicts.

	t.Run("wildcard allows any origin", func(t *testing.T) {
		os.Setenv("CHAT_ALLOWED_ORIGINS", "*")
		defer os.Unsetenv("CHAT_ALLOWED_ORIGINS")

		req := httptest.NewRequest(http.MethodGet, "http://chat.example.com/ws", nil)
		req.Header.Set("Origin", "https://any-random-domain.io")
		got := upgrader.CheckOrigin(req)
		if !got {
			t.Error("expected wildcard to allow any origin")
		}
	})

	t.Run("specific allowed origin", func(t *testing.T) {
		os.Setenv("CHAT_ALLOWED_ORIGINS", "allowed.com, other.org")
		defer os.Unsetenv("CHAT_ALLOWED_ORIGINS")

		req := httptest.NewRequest(http.MethodGet, "http://chat.example.com/ws", nil)
		req.Header.Set("Origin", "https://allowed.com")
		got := upgrader.CheckOrigin(req)
		if !got {
			t.Error("expected allowed.com to be allowed")
		}
	})

	t.Run("specific origin not in list is disallowed", func(t *testing.T) {
		os.Setenv("CHAT_ALLOWED_ORIGINS", "allowed.com")
		defer os.Unsetenv("CHAT_ALLOWED_ORIGINS")

		req := httptest.NewRequest(http.MethodGet, "http://chat.example.com/ws", nil)
		req.Header.Set("Origin", "https://disallowed.com")
		got := upgrader.CheckOrigin(req)
		if got {
			t.Error("expected disallowed.com to be rejected")
		}
	})

	t.Run("subdomain wildcard allows matching subdomain", func(t *testing.T) {
		os.Setenv("CHAT_ALLOWED_ORIGINS", ".example.com")
		defer os.Unsetenv("CHAT_ALLOWED_ORIGINS")

		req := httptest.NewRequest(http.MethodGet, "http://chat.example.com/ws", nil)
		req.Header.Set("Origin", "https://app.example.com")
		got := upgrader.CheckOrigin(req)
		if !got {
			t.Error("expected subdomain wildcard .example.com to allow app.example.com")
		}
	})

	t.Run("subdomain wildcard rejects bare domain", func(t *testing.T) {
		os.Setenv("CHAT_ALLOWED_ORIGINS", ".example.com")
		defer os.Unsetenv("CHAT_ALLOWED_ORIGINS")

		req := httptest.NewRequest(http.MethodGet, "http://chat.example.com/ws", nil)
		req.Header.Set("Origin", "https://example.com")
		got := upgrader.CheckOrigin(req)
		if got {
			t.Error("expected subdomain wildcard .example.com to reject bare example.com")
		}
	})

	t.Run("subdomain wildcard allows nested subdomain", func(t *testing.T) {
		os.Setenv("CHAT_ALLOWED_ORIGINS", ".example.com")
		defer os.Unsetenv("CHAT_ALLOWED_ORIGINS")

		req := httptest.NewRequest(http.MethodGet, "http://chat.example.com/ws", nil)
		req.Header.Set("Origin", "https://dev.api.example.com")
		got := upgrader.CheckOrigin(req)
		if !got {
			t.Error("expected subdomain wildcard to allow nested subdomain dev.api.example.com")
		}
	})

	t.Run("case-insensitive origin matching", func(t *testing.T) {
		os.Setenv("CHAT_ALLOWED_ORIGINS", "EXAMPLE.COM")
		defer os.Unsetenv("CHAT_ALLOWED_ORIGINS")

		req := httptest.NewRequest(http.MethodGet, "http://chat.example.com/ws", nil)
		req.Header.Set("Origin", "https://example.com")
		got := upgrader.CheckOrigin(req)
		if !got {
			t.Error("expected case-insensitive match for allowed origin")
		}
	})
}

func TestCheckOriginEmptyAllowedOrigins(t *testing.T) {
	os.Unsetenv("CHAT_ALLOWED_ORIGINS")

	t.Run("same-origin allowed when env is unset", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "http://chat.example.com/ws", nil)
		got := upgrader.CheckOrigin(req)
		if !got {
			t.Error("expected same-origin (no Origin header) to be allowed when CHAT_ALLOWED_ORIGINS is unset")
		}
	})

	t.Run("same-origin with Origin header allowed when env is unset", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "http://chat.example.com/ws", nil)
		req.Header.Set("Origin", "https://chat.example.com")
		got := upgrader.CheckOrigin(req)
		if !got {
			t.Error("expected same-origin to be allowed when CHAT_ALLOWED_ORIGINS is unset")
		}
	})

	t.Run("cross-origin rejected when env is unset", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "http://chat.example.com/ws", nil)
		req.Header.Set("Origin", "https://foreign-site.com")
		got := upgrader.CheckOrigin(req)
		if got {
			t.Error("expected cross-origin to be rejected when CHAT_ALLOWED_ORIGINS is unset")
		}
	})

	t.Run("empty string env same as unset", func(t *testing.T) {
		os.Setenv("CHAT_ALLOWED_ORIGINS", "")
		defer os.Unsetenv("CHAT_ALLOWED_ORIGINS")

		req := httptest.NewRequest(http.MethodGet, "http://chat.example.com/ws", nil)
		req.Header.Set("Origin", "https://foreign-site.com")
		got := upgrader.CheckOrigin(req)
		if got {
			t.Error("expected cross-origin to be rejected when CHAT_ALLOWED_ORIGINS is empty string")
		}
	})
}
