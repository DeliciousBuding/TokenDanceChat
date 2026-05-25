package handler

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"tokendancechat/backend/hub"
	"tokendancechat/backend/store"

	"github.com/golang-jwt/jwt/v5"
)

// generateTestRSAKey creates a 2048-bit RSA key pair for test token signing.
func generateTestRSAKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate RSA key: %v", err)
	}
	return key
}

func TestOIDCHTTPClientHasBoundedTimeout(t *testing.T) {
	if oidcHTTPClient == nil {
		t.Fatal("oidcHTTPClient is nil")
	}
	if oidcHTTPClient.Timeout != oidcHTTPTimeout {
		t.Fatalf("oidcHTTPClient timeout = %s, want %s", oidcHTTPClient.Timeout, oidcHTTPTimeout)
	}
	if oidcHTTPClient.Timeout <= 0 || oidcHTTPClient.Timeout > 5*time.Second {
		t.Fatalf("oidcHTTPClient timeout is not bounded tightly enough: %s", oidcHTTPClient.Timeout)
	}
}

func TestReadOIDCResponseBodyRejectsOversizedResponse(t *testing.T) {
	body, err := readOIDCResponseBody(bytes.NewReader([]byte("ok")), 2)
	if err != nil {
		t.Fatalf("expected small response to be accepted: %v", err)
	}
	if string(body) != "ok" {
		t.Fatalf("body = %q, want ok", string(body))
	}

	_, err = readOIDCResponseBody(bytes.NewReader(bytes.Repeat([]byte("x"), 4)), 3)
	if err == nil {
		t.Fatal("expected oversized response to be rejected")
	}
}

func TestOIDCStateStoreCloseStopsCleanupLoop(t *testing.T) {
	store := newOIDCStateStore()
	done := make(chan struct{})

	go func() {
		store.close()
		store.close()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("state store close did not stop cleanup loop")
	}
}

func TestOIDCTokenStoreCloseStopsCleanupLoop(t *testing.T) {
	store := newOIDCTokenStore()
	done := make(chan struct{})

	go func() {
		store.close()
		store.close()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("token store close did not stop cleanup loop")
	}
}

func TestOIDCStateStoreRejectsNewEntriesAtCapacity(t *testing.T) {
	store := newOIDCStateStore()
	t.Cleanup(store.close)
	now := time.Now()
	for i := 0; i < oidcStateStoreMaxEntries; i++ {
		if ok := store.put(fmt.Sprintf("state-%03d", i), &oidcStateEntry{
			CodeVerifier: fmt.Sprintf("verifier-%03d", i),
			CreatedAt:    now.Add(time.Duration(i) * time.Second),
		}); !ok {
			t.Fatalf("state insert %d was rejected before capacity", i)
		}
	}

	if ok := store.put("state-overflow", &oidcStateEntry{
		CodeVerifier: "verifier-overflow",
		CreatedAt:    now.Add(time.Hour),
	}); ok {
		t.Fatal("expected state store to reject new entry at capacity")
	}

	store.mu.Lock()
	defer store.mu.Unlock()
	if got := len(store.store); got != oidcStateStoreMaxEntries {
		t.Fatalf("state store len = %d, want %d", got, oidcStateStoreMaxEntries)
	}
	if _, ok := store.store["state-000"]; !ok {
		t.Fatal("expected oldest state entry to be retained")
	}
	if _, ok := store.store["state-overflow"]; ok {
		t.Fatal("expected overflow state entry to be absent")
	}
}

func TestOIDCTokenStoreRejectsNewEntriesAtCapacity(t *testing.T) {
	store := newOIDCTokenStore()
	t.Cleanup(store.close)
	now := time.Now()
	for i := 0; i < oidcTokenStoreMaxEntries; i++ {
		if ok := store.put(fmt.Sprintf("redeem-%03d", i), &oidcTokenEntry{
			AccessToken:  fmt.Sprintf("access-%03d", i),
			RefreshToken: fmt.Sprintf("refresh-%03d", i),
			ChatUsername: fmt.Sprintf("user-%03d", i),
			CreatedAt:    now.Add(time.Duration(i) * time.Second),
		}); !ok {
			t.Fatalf("token insert %d was rejected before capacity", i)
		}
	}

	if ok := store.put("redeem-overflow", &oidcTokenEntry{
		AccessToken:  "access-overflow",
		RefreshToken: "refresh-overflow",
		ChatUsername: "user-overflow",
		CreatedAt:    now.Add(time.Hour),
	}); ok {
		t.Fatal("expected token store to reject new entry at capacity")
	}

	store.mu.Lock()
	defer store.mu.Unlock()
	if got := len(store.store); got != oidcTokenStoreMaxEntries {
		t.Fatalf("token store len = %d, want %d", got, oidcTokenStoreMaxEntries)
	}
	if _, ok := store.store["redeem-000"]; !ok {
		t.Fatal("expected oldest redeem token entry to be retained")
	}
	if _, ok := store.store["redeem-overflow"]; ok {
		t.Fatal("expected overflow redeem token entry to be absent")
	}
}

func TestSetupOIDCFailureDoesNotInstallTransientStores(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()

	h := &Handler{store: &mockStore{}}
	err := h.SetupOIDC(true, "test-client", srv.URL, "http://localhost:8080/api/oidc/callback")
	if err == nil {
		t.Fatal("expected SetupOIDC to fail")
	}
	if h.oidcStates != nil || h.oidcTokens != nil {
		t.Fatal("expected failed SetupOIDC to leave transient stores uninstalled")
	}
}

func TestSetupOIDCReconfigureClosesPreviousTransientStores(t *testing.T) {
	key := generateTestRSAKey(t)
	first := startMockOIDCProvider(t, key, "test-kid-reconfigure-1")
	defer first.Close()
	second := startMockOIDCProvider(t, key, "test-kid-reconfigure-2")
	defer second.Close()

	h := &Handler{store: &mockStore{}}
	if err := h.SetupOIDC(true, "test-client", first.URL, "http://localhost:8080/api/oidc/callback"); err != nil {
		t.Fatalf("first SetupOIDC failed: %v", err)
	}
	oldStates := h.oidcStates
	oldTokens := h.oidcTokens
	if err := h.SetupOIDC(true, "test-client", second.URL, "http://localhost:8080/api/oidc/callback"); err != nil {
		t.Fatalf("second SetupOIDC failed: %v", err)
	}
	t.Cleanup(h.closeOIDCStores)

	select {
	case <-oldStates.stopped:
	default:
		t.Fatal("expected previous state store cleanup loop to be stopped after reconfigure")
	}
	select {
	case <-oldTokens.stopped:
	default:
		t.Fatal("expected previous token store cleanup loop to be stopped after reconfigure")
	}
	if h.oidcStates == oldStates || h.oidcTokens == oldTokens {
		t.Fatal("expected reconfigure to install fresh transient stores")
	}
}

// signTestIDToken creates a valid RS256-signed JWT with the given claims.
func signTestIDToken(t *testing.T, key *rsa.PrivateKey, kid string, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = kid
	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	return signed
}

// startMockOIDCProvider starts a test HTTP server that serves OIDC discovery, JWKS, and token endpoints.
func startMockOIDCProvider(t *testing.T, key *rsa.PrivateKey, kid string) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()

	// All OIDC endpoints at the root of the test server.
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		base := scheme + "://" + r.Host
		json.NewEncoder(w).Encode(map[string]string{
			"issuer":                 base,
			"authorization_endpoint": base + "/authorize",
			"token_endpoint":         base + "/token",
			"userinfo_endpoint":      base + "/userinfo",
			"jwks_uri":               base + "/jwks",
		})
	})

	// JWKS endpoint.
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		n := base64.RawURLEncoding.EncodeToString(key.N.Bytes())
		e := base64.RawURLEncoding.EncodeToString([]byte{0, 0, 0, 0})
		// Compute exponent properly.
		eBytes := make([]byte, 0)
		exp := uint32(key.E)
		for exp > 0 {
			eBytes = append([]byte{byte(exp & 0xff)}, eBytes...)
			exp >>= 8
		}
		if len(eBytes) == 0 {
			eBytes = []byte{1, 0, 1}
		}
		e = base64.RawURLEncoding.EncodeToString(eBytes)

		json.NewEncoder(w).Encode(map[string]interface{}{
			"keys": []map[string]string{
				{
					"kid": kid,
					"kty": "RSA",
					"alg": "RS256",
					"use": "sig",
					"n":   n,
					"e":   e,
				},
			},
		})
	})

	// Token endpoint.
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", 400)
			return
		}
		grantType := r.FormValue("grant_type")

		switch grantType {
		case "authorization_code":
			if r.FormValue("code") == "" {
				http.Error(w, `{"error":"invalid_grant"}`, 400)
				return
			}
			mockIssuer := "http://" + r.Host
			// Generate a test ID token.
			now := time.Now()
			idToken := signTestIDToken(t, key, kid, jwt.MapClaims{
				"iss":                mockIssuer,
				"sub":                "test-oidc-sub-123",
				"aud":                []string{"test-client"},
				"exp":                now.Add(15 * time.Minute).Unix(),
				"iat":                now.Unix(),
				"email":              "testuser@example.com",
				"email_verified":     true,
				"preferred_username": "TestOIDCUser",
				"name":               "Test User",
			})
			json.NewEncoder(w).Encode(map[string]interface{}{
				"access_token":  "test-access-token-value",
				"token_type":    "Bearer",
				"expires_in":    900,
				"id_token":      idToken,
				"refresh_token": "test-refresh-token-value",
			})
		case "refresh_token":
			if r.FormValue("refresh_token") == "" {
				http.Error(w, `{"error":"invalid_grant"}`, 400)
				return
			}
			json.NewEncoder(w).Encode(map[string]interface{}{
				"access_token":  "refreshed-access-token",
				"token_type":    "Bearer",
				"expires_in":    900,
				"refresh_token": "refreshed-refresh-token",
			})
		default:
			http.Error(w, `{"error":"unsupported_grant_type"}`, 400)
		}
	})

	mux.HandleFunc("/userinfo", func(w http.ResponseWriter, r *http.Request) {
		switch r.Header.Get("Authorization") {
		case "Bearer test-access-token-value":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"sub":                "test-oidc-sub-123",
				"email":              "testuser@example.com",
				"preferred_username": "TestOIDCUser",
			})
		case "Bearer other-sub-token":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"sub":                "other-oidc-sub-456",
				"email":              "other@example.com",
				"preferred_username": "OtherUser",
			})
		default:
			http.Error(w, `{"error":"invalid_token"}`, http.StatusUnauthorized)
		}
	})

	return httptest.NewServer(mux)
}

// ─── PKCE Utilities ─────────────────────────────────────────────────

func TestGenerateCodeVerifier(t *testing.T) {
	v, err := generateCodeVerifier()
	if err != nil {
		t.Fatalf("generateCodeVerifier failed: %v", err)
	}
	if len(v) < 43 {
		t.Errorf("code verifier too short: got %d chars, want >=43", len(v))
	}
	// Should be base64url-safe (no +, /, or =).
	for _, ch := range v {
		if ch == '+' || ch == '/' || ch == '=' {
			t.Errorf("code verifier contains invalid char: %c", ch)
		}
	}
}

func TestComputeCodeChallenge(t *testing.T) {
	// Test vector from RFC 7636 Appendix B.
	verifier := "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
	expected := "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

	challenge := computeCodeChallenge(verifier)
	if challenge != expected {
		t.Errorf("code challenge mismatch: got %s, want %s", challenge, expected)
	}
}

// ─── resolveOIDCUsername ──────────────────────────────────────────

func TestResolveOIDCUsername(t *testing.T) {
	tests := []struct {
		name   string
		claims *oidcClaims
		want   string
	}{
		{
			name: "uses preferred_username when valid",
			claims: &oidcClaims{
				PreferredUsername: "Alice",
				Email:             "alice@example.com",
			},
			want: "Alice",
		},
		{
			name: "falls back to email local part",
			claims: &oidcClaims{
				Email: "bob_test@example.com",
			},
			want: "bob_test",
		},
		{
			name: "falls back to sub prefix",
			claims: &oidcClaims{
				RegisteredClaims: jwt.RegisteredClaims{Subject: "abcdef1234567890"},
			},
			want: "oidc_abcdef123456",
		},
		{
			name: "uses name when available",
			claims: &oidcClaims{
				Name: "Charlie",
			},
			want: "Charlie",
		},
		{
			name: "sanitizes email with special chars",
			claims: &oidcClaims{
				Email: "user.name+tag@example.com",
			},
			want: "user_name_tag",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// These usernames need to pass ValidateUsername but they aren't reserved.
			got := resolveOIDCUsername(tt.claims)
			if got != tt.want {
				t.Errorf("resolveOIDCUsername() = %q, want %q", got, tt.want)
			}
			// Must be a valid chat username.
			if got != "" && !hub.ValidateUsername(got) {
				t.Errorf("resolved username %q is not valid", got)
			}
		})
	}
}

// ─── OIDC Handler Integration ─────────────────────────────────────

func setupOIDCForTest(t *testing.T, h *Handler, issuer string) {
	t.Helper()
	if err := h.SetupOIDC(true, "test-client", issuer, "http://localhost:8080/api/oidc/callback"); err != nil {
		t.Fatalf("SetupOIDC failed: %v", err)
	}
	t.Cleanup(h.closeOIDCStores)
}

func TestOIDCConfigHandler(t *testing.T) {
	key := generateTestRSAKey(t)
	kid := "test-kid-001"
	srv := startMockOIDCProvider(t, key, kid)
	defer srv.Close()

	// Extract the actual host from the test server to construct the issuer URL.
	addr := srv.Listener.Addr().String()
	issuer := "http://" + addr

	h := &Handler{
		store: &mockStore{},
	}
	setupOIDCForTest(t, h, issuer)

	req := httptest.NewRequest("GET", "/api/oidc/config", nil)
	rec := httptest.NewRecorder()

	h.OIDCConfigHandler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp oidcConfigResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if !resp.Enabled {
		t.Error("expected enabled=true")
	}
	if resp.ClientID != "test-client" {
		t.Errorf("expected client_id=test-client, got %s", resp.ClientID)
	}
	if resp.AuthURL == "" {
		t.Error("expected non-empty auth_url")
	}
}

func TestOIDCConfigHandlerNotEnabled(t *testing.T) {
	h := &Handler{store: &mockStore{}}
	req := httptest.NewRequest("GET", "/api/oidc/config", nil)
	rec := httptest.NewRecorder()
	h.OIDCConfigHandler(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 when not enabled, got %d", rec.Code)
	}
}

func TestOIDCLoginRedirect(t *testing.T) {
	key := generateTestRSAKey(t)
	kid := "test-kid-002"
	srv := startMockOIDCProvider(t, key, kid)
	defer srv.Close()

	addr := srv.Listener.Addr().String()
	issuer := "http://" + addr

	h := &Handler{
		store: &mockStore{},
	}
	setupOIDCForTest(t, h, issuer)

	req := httptest.NewRequest("GET", "/api/oidc/login", nil)
	rec := httptest.NewRecorder()

	h.OIDCLogin(rec, req)

	if rec.Code != http.StatusFound {
		t.Errorf("expected 302, got %d", rec.Code)
	}

	location := rec.Header().Get("Location")
	if location == "" {
		t.Fatal("expected Location header")
	}

	parsed, err := url.Parse(location)
	if err != nil {
		t.Fatalf("failed to parse redirect URL: %v", err)
	}

	params := parsed.Query()
	if params.Get("response_type") != "code" {
		t.Error("missing response_type=code")
	}
	if params.Get("client_id") != "test-client" {
		t.Error("wrong client_id")
	}
	if params.Get("code_challenge_method") != "S256" {
		t.Error("wrong code_challenge_method")
	}
	if params.Get("code_challenge") == "" {
		t.Error("missing code_challenge")
	}
	if params.Get("state") == "" {
		t.Error("missing state")
	}

	// Verify state was stored.
	h.oidcStates.mu.Lock()
	entries := len(h.oidcStates.store)
	h.oidcStates.mu.Unlock()
	if entries != 1 {
		t.Errorf("expected 1 stored state, got %d", entries)
	}
}

func TestOIDCLoginRateLimitedByIP(t *testing.T) {
	ResetRateLimiter()
	key := generateTestRSAKey(t)
	kid := "test-kid-rate-limit"
	srv := startMockOIDCProvider(t, key, kid)
	defer srv.Close()

	addr := srv.Listener.Addr().String()
	issuer := "http://" + addr

	h := &Handler{store: &mockStore{}}
	setupOIDCForTest(t, h, issuer)

	ip := "192.0.2.222:1234"
	for i := 0; i < oidcMaxPerWindow; i++ {
		req := httptest.NewRequest("GET", "/api/oidc/login", nil)
		req.RemoteAddr = ip
		rec := httptest.NewRecorder()
		h.OIDCLogin(rec, req)
		if rec.Code != http.StatusFound {
			t.Fatalf("request %d: expected 302 before limit, got %d: %s", i+1, rec.Code, rec.Body.String())
		}
	}

	req := httptest.NewRequest("GET", "/api/oidc/login", nil)
	req.RemoteAddr = ip
	rec := httptest.NewRecorder()
	h.OIDCLogin(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected OIDC login to be rate limited, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestOIDCCallbackSuccess(t *testing.T) {
	key := generateTestRSAKey(t)
	kid := "test-kid-003"
	srv := startMockOIDCProvider(t, key, kid)
	defer srv.Close()

	addr := srv.Listener.Addr().String()
	issuer := "http://" + addr

	st := newMockStoreForOIDC()

	h := &Handler{
		store: st,
	}
	setupOIDCForTest(t, h, issuer)

	// First, simulate a login to create a valid state entry.
	reqLogin := httptest.NewRequest("GET", "/api/oidc/login", nil)
	recLogin := httptest.NewRecorder()
	h.OIDCLogin(recLogin, reqLogin)

	// Extract the state from the redirect URL.
	parsed, _ := url.Parse(recLogin.Header().Get("Location"))
	state := parsed.Query().Get("state")

	// Now simulate the callback with that state and a fake code.
	callbackURL := fmt.Sprintf("/api/oidc/callback?state=%s&code=fake-auth-code", state)
	req := httptest.NewRequest("GET", callbackURL, nil)
	rec := httptest.NewRecorder()

	h.OIDCCallback(rec, req)

	if rec.Code != http.StatusFound {
		t.Errorf("expected 302, got %d: %s", rec.Code, rec.Body.String())
		return
	}

	location := rec.Header().Get("Location")
	if location == "" {
		t.Fatal("expected Location header")
	}

	returnedParams, err := url.ParseQuery(location[2:]) // skip "/?"
	if err != nil {
		t.Fatalf("bad redirect URL: %v", err)
	}
	if returnedParams.Get("oidc_success") != "1" {
		t.Errorf("expected oidc_success=1, got params: %v", returnedParams)
	}
	if returnedParams.Get("oidc_username") == "" {
		t.Error("expected non-empty oidc_username")
	}

	// Verify state was cleaned up (one-time use).
	h.oidcStates.mu.Lock()
	remaining := len(h.oidcStates.store)
	h.oidcStates.mu.Unlock()
	if remaining != 0 {
		t.Errorf("expected 0 remaining states, got %d", remaining)
	}
}

func TestOIDCCallbackInvalidState(t *testing.T) {
	key := generateTestRSAKey(t)
	kid := "test-kid-004"
	srv := startMockOIDCProvider(t, key, kid)
	defer srv.Close()

	addr := srv.Listener.Addr().String()
	issuer := "http://" + addr

	h := &Handler{
		store: &mockStore{},
	}
	setupOIDCForTest(t, h, issuer)

	req := httptest.NewRequest("GET", "/api/oidc/callback?state=bad-state&code=fake-code", nil)
	rec := httptest.NewRecorder()

	h.OIDCCallback(rec, req)

	if rec.Code != http.StatusFound {
		t.Errorf("expected 302, got %d", rec.Code)
	}
	location := rec.Header().Get("Location")
	if location == "" || !containsQueryParam(location, "oidc_error", "invalid_state") {
		t.Errorf("expected oidc_error=invalid_state in redirect: %s", location)
	}
}

func TestOIDCRefresh(t *testing.T) {
	key := generateTestRSAKey(t)
	kid := "test-kid-005"
	srv := startMockOIDCProvider(t, key, kid)
	defer srv.Close()

	addr := srv.Listener.Addr().String()
	issuer := "http://" + addr

	h := &Handler{
		store: &mockStore{},
	}
	setupOIDCForTest(t, h, issuer)

	body := stringsNewReader(`{"refresh_token":"test-refresh-token"}`)
	req := httptest.NewRequest("POST", "/api/oidc/refresh", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.OIDCRefresh(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["access_token"] != "refreshed-access-token" {
		t.Errorf("unexpected access_token: %v", resp["access_token"])
	}
}

func TestOIDCRefreshWrongMethodDoesNotConsumeOIDCRateLimit(t *testing.T) {
	ResetRateLimiter()
	key := generateTestRSAKey(t)
	kid := "test-kid-refresh-method-limit"
	srv := startMockOIDCProvider(t, key, kid)
	defer srv.Close()

	addr := srv.Listener.Addr().String()
	issuer := "http://" + addr

	h := &Handler{store: &mockStore{}}
	setupOIDCForTest(t, h, issuer)

	ip := "192.0.2.223:1234"
	for i := 0; i < oidcMaxPerWindow; i++ {
		req := httptest.NewRequest("GET", "/api/oidc/refresh", nil)
		req.RemoteAddr = ip
		rec := httptest.NewRecorder()
		h.OIDCRefresh(rec, req)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Fatalf("wrong-method request %d: expected 405, got %d", i+1, rec.Code)
		}
	}

	req := httptest.NewRequest("POST", "/api/oidc/refresh", stringsNewReader(`{"refresh_token":"test-refresh-token"}`))
	req.RemoteAddr = ip
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.OIDCRefresh(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected valid refresh to remain allowed after wrong-method requests, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestOIDCExchange(t *testing.T) {
	key := generateTestRSAKey(t)
	kid := "test-kid-006"
	srv := startMockOIDCProvider(t, key, kid)
	defer srv.Close()

	addr := srv.Listener.Addr().String()
	issuer := "http://" + addr

	st := newMockStoreForOIDC()

	h := &Handler{
		store: st,
	}
	setupOIDCForTest(t, h, issuer)

	body := stringsNewReader(`{"code":"test-code","code_verifier":"test-verifier"}`)
	req := httptest.NewRequest("POST", "/api/oidc/exchange", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.OIDCExchange(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["success"] != true {
		t.Error("expected success=true")
	}
	if resp["username"] == nil || resp["username"] == "" {
		t.Error("expected non-empty username")
	}
}

func TestVerifyOIDCJoinToken(t *testing.T) {
	key := generateTestRSAKey(t)
	kid := "test-kid-join-token"
	srv := startMockOIDCProvider(t, key, kid)
	defer srv.Close()

	addr := srv.Listener.Addr().String()
	issuer := "http://" + addr
	st := newMockStoreForOIDC()
	st.UpsertOIDCUser("test-oidc-sub-123", "TestOIDCUser", "testuser@example.com", "TestOIDCUser")

	h := &Handler{store: st}
	setupOIDCForTest(t, h, issuer)

	if err := h.VerifyOIDCJoinToken("TestOIDCUser", "test-access-token-value"); err != nil {
		t.Fatalf("expected valid token to pass, got %v", err)
	}
	if err := h.VerifyOIDCJoinToken("TestOIDCUser", "bad-token"); err == nil {
		t.Fatal("expected bad token to be rejected")
	}
	if err := h.VerifyOIDCJoinToken("TestOIDCUser", "other-sub-token"); err == nil {
		t.Fatal("expected mismatched sub token to be rejected")
	}
}

// ─── Helpers ────────────────────────────────────────────────────────

func containsQueryParam(rawURL, key, value string) bool {
	parts := stringsSplitN(rawURL, "?", 2)
	if len(parts) < 2 {
		return false
	}
	params, _ := url.ParseQuery(parts[1])
	return params.Get(key) == value
}

// mockStoreForOIDC is the standard mockStore from handler_test.go with
// OIDC methods overridden to actually store OIDC users.
type mockStoreForOIDC struct {
	mockStore
	oidcUsers map[string]*store.OIDCUser
}

func newMockStoreForOIDC() *mockStoreForOIDC {
	return &mockStoreForOIDC{
		oidcUsers: make(map[string]*store.OIDCUser),
	}
}

func (m *mockStoreForOIDC) UpsertOIDCUser(sub, chatUsername, email, preferredUsername string) error {
	m.oidcUsers[chatUsername] = &store.OIDCUser{
		Sub:               sub,
		ChatUsername:      chatUsername,
		Email:             email,
		PreferredUsername: preferredUsername,
	}
	return nil
}

func (m *mockStoreForOIDC) GetOIDCUserBySub(sub string) (*store.OIDCUser, error) {
	for _, u := range m.oidcUsers {
		if u.Sub == sub {
			return u, nil
		}
	}
	return nil, fmt.Errorf("not found")
}

func (m *mockStoreForOIDC) GetOIDCUserByUsername(username string) (*store.OIDCUser, error) {
	if u, ok := m.oidcUsers[username]; ok {
		return u, nil
	}
	return nil, fmt.Errorf("not found")
}

// Avoid importing strings for simple helpers.
func stringsNewReader(s string) *stringsReaderImpl { return &stringsReaderImpl{s: s} }

type stringsReaderImpl struct {
	s string
	i int
}

func (r *stringsReaderImpl) Read(p []byte) (int, error) {
	if r.i >= len(r.s) {
		return 0, fmt.Errorf("EOF")
	}
	n := copy(p, r.s[r.i:])
	r.i += n
	return n, nil
}

func stringsSplitN(s, sep string, n int) []string {
	result := make([]string, 0, n)
	remaining := s
	for i := 0; i < n-1 && remaining != ""; i++ {
		idx := stringsIndex(remaining, sep)
		if idx < 0 {
			break
		}
		result = append(result, remaining[:idx])
		remaining = remaining[idx+len(sep):]
	}
	result = append(result, remaining)
	return result
}

func stringsIndex(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
