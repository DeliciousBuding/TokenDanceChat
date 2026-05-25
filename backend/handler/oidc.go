package handler

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"tokendancechat/backend/hub"

	"github.com/golang-jwt/jwt/v5"
)

const oidcHTTPTimeout = 5 * time.Second
const oidcMaxDiscoveryBodyBytes = 64 * 1024
const oidcMaxJWKSBodyBytes = 256 * 1024
const oidcMaxTokenBodyBytes = 64 * 1024
const oidcStateTTL = 10 * time.Minute
const oidcTokenTTL = 5 * time.Minute
const oidcStateStoreMaxEntries = 1024
const oidcTokenStoreMaxEntries = 256

var oidcHTTPClient = &http.Client{Timeout: oidcHTTPTimeout}

func readOIDCResponseBody(r io.Reader, maxBytes int64) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(r, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > maxBytes {
		return nil, fmt.Errorf("OIDC provider response exceeds %d bytes", maxBytes)
	}
	return body, nil
}

// OIDCConfig holds the parsed OIDC discovery document.
type OIDCConfig struct {
	Issuer           string `json:"issuer"`
	AuthEndpoint     string `json:"authorization_endpoint"`
	TokenEndpoint    string `json:"token_endpoint"`
	UserInfoEndpoint string `json:"userinfo_endpoint"`
	JWKSURI          string `json:"jwks_uri"`
}

// oidcStateEntry stores PKCE state for an in-flight OIDC authorization.
type oidcStateEntry struct {
	CodeVerifier string
	CreatedAt    time.Time
}

// OIDCStateStore is an in-memory store for PKCE state → code_verifier mapping.
type OIDCStateStore struct {
	mu        sync.Mutex
	store     map[string]*oidcStateEntry
	stop      chan struct{}
	stopped   chan struct{}
	closeOnce sync.Once
}

func newOIDCStateStore() *OIDCStateStore {
	s := &OIDCStateStore{
		store:   make(map[string]*oidcStateEntry),
		stop:    make(chan struct{}),
		stopped: make(chan struct{}),
	}
	go s.cleanupLoop()
	return s
}

func (s *OIDCStateStore) put(state string, entry *oidcStateEntry) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneExpiredLocked(time.Now())
	if _, exists := s.store[state]; !exists && len(s.store) >= oidcStateStoreMaxEntries {
		return false
	}
	s.store[state] = entry
	return true
}

func (s *OIDCStateStore) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	defer close(s.stopped)
	for {
		select {
		case <-ticker.C:
		case <-s.stop:
			return
		}
		s.mu.Lock()
		s.pruneExpiredLocked(time.Now())
		s.mu.Unlock()
	}
}

func (s *OIDCStateStore) close() {
	s.closeOnce.Do(func() {
		close(s.stop)
	})
	<-s.stopped
}

func (s *OIDCStateStore) take(state string) (*oidcStateEntry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.store[state]
	delete(s.store, state)
	if !ok || time.Since(entry.CreatedAt) > oidcStateTTL {
		return nil, false
	}
	return entry, true
}

func (s *OIDCStateStore) pruneExpiredLocked(now time.Time) {
	cutoff := now.Add(-oidcStateTTL)
	for k, v := range s.store {
		if v.CreatedAt.Before(cutoff) {
			delete(s.store, k)
		}
	}
}

// oidcTokenEntry stores OIDC tokens temporarily after callback, before frontend redemption.
type oidcTokenEntry struct {
	AccessToken  string
	RefreshToken string
	ChatUsername string
	CreatedAt    time.Time
}

// OIDCTokenStore holds callback tokens keyed by a random redeem ID.
type OIDCTokenStore struct {
	mu        sync.Mutex
	store     map[string]*oidcTokenEntry
	stop      chan struct{}
	stopped   chan struct{}
	closeOnce sync.Once
}

func newOIDCTokenStore() *OIDCTokenStore {
	s := &OIDCTokenStore{
		store:   make(map[string]*oidcTokenEntry),
		stop:    make(chan struct{}),
		stopped: make(chan struct{}),
	}
	go s.cleanupLoop()
	return s
}

func (s *OIDCTokenStore) put(redeemID string, entry *oidcTokenEntry) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneExpiredLocked(time.Now())
	if _, exists := s.store[redeemID]; !exists && len(s.store) >= oidcTokenStoreMaxEntries {
		return false
	}
	s.store[redeemID] = entry
	return true
}

func (s *OIDCTokenStore) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	defer close(s.stopped)
	for {
		select {
		case <-ticker.C:
		case <-s.stop:
			return
		}
		s.mu.Lock()
		s.pruneExpiredLocked(time.Now())
		s.mu.Unlock()
	}
}

func (s *OIDCTokenStore) close() {
	s.closeOnce.Do(func() {
		close(s.stop)
	})
	<-s.stopped
}

func (s *OIDCTokenStore) take(redeemID string) (*oidcTokenEntry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.store[redeemID]
	delete(s.store, redeemID)
	if !ok || time.Since(entry.CreatedAt) > oidcTokenTTL {
		return nil, false
	}
	return entry, true
}

func (s *OIDCTokenStore) pruneExpiredLocked(now time.Time) {
	cutoff := now.Add(-oidcTokenTTL)
	for k, v := range s.store {
		if v.CreatedAt.Before(cutoff) {
			delete(s.store, k)
		}
	}
}

// oidcJWKSCache caches the JWKS key set with periodic refresh.
type oidcJWKSCache struct {
	mu      sync.RWMutex
	keys    map[string]*rsa.PublicKey // kid → public key
	fetched time.Time
	ttl     time.Duration
}

func newOIDCJWKSCache() *oidcJWKSCache {
	return &oidcJWKSCache{ttl: 1 * time.Hour}
}

func (c *oidcJWKSCache) keyFunc(jwksURI string) jwt.Keyfunc {
	return func(token *jwt.Token) (interface{}, error) {
		kid, ok := token.Header["kid"].(string)
		if !ok {
			return nil, fmt.Errorf("missing kid in token header")
		}

		c.mu.RLock()
		if c.keys != nil && time.Since(c.fetched) < c.ttl {
			key, exists := c.keys[kid]
			c.mu.RUnlock()
			if exists {
				return key, nil
			}
			return nil, fmt.Errorf("unknown kid: %s", kid)
		}
		c.mu.RUnlock()

		c.mu.Lock()
		defer c.mu.Unlock()

		if c.keys != nil && time.Since(c.fetched) < c.ttl {
			if key, exists := c.keys[kid]; exists {
				return key, nil
			}
			return nil, fmt.Errorf("unknown kid: %s", kid)
		}

		if err := c.fetchJWKS(jwksURI); err != nil {
			return nil, fmt.Errorf("jwks fetch failed: %w", err)
		}

		if key, exists := c.keys[kid]; exists {
			return key, nil
		}
		return nil, fmt.Errorf("unknown kid: %s", kid)
	}
}

func (c *oidcJWKSCache) fetchJWKS(jwksURI string) error {
	resp, err := oidcHTTPClient.Get(jwksURI)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := readOIDCResponseBody(resp.Body, oidcMaxJWKSBodyBytes)
	if err != nil {
		return err
	}

	var jwks struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.Unmarshal(body, &jwks); err != nil {
		return err
	}

	keys := make(map[string]*rsa.PublicKey)
	for _, jk := range jwks.Keys {
		if jk.Kty != "RSA" {
			continue
		}
		if jk.N == "" || jk.E == "" {
			continue
		}

		nBytes, err := base64.RawURLEncoding.DecodeString(jk.N)
		if err != nil {
			continue
		}
		eBytes, err := base64.RawURLEncoding.DecodeString(jk.E)
		if err != nil {
			continue
		}

		n := new(big.Int).SetBytes(nBytes)
		e := new(big.Int).SetBytes(eBytes)

		keys[jk.Kid] = &rsa.PublicKey{N: n, E: int(e.Int64())}
	}

	if len(keys) == 0 {
		return fmt.Errorf("no usable RSA keys in JWKS")
	}

	c.keys = keys
	c.fetched = time.Now()
	return nil
}

func (h *Handler) closeOIDCStores() {
	if h.oidcStates != nil {
		h.oidcStates.close()
		h.oidcStates = nil
	}
	if h.oidcTokens != nil {
		h.oidcTokens.close()
		h.oidcTokens = nil
	}
}

// oidcClaims extends the standard JWT claims with OIDC-specific fields.
type oidcClaims struct {
	jwt.RegisteredClaims
	Email             string `json:"email"`
	PreferredUsername string `json:"preferred_username"`
	Name              string `json:"name"`
}

// oidcTokenResponse is the JSON body from POST /oidc/token.
type oidcTokenResponse struct {
	AccessToken  string `json:"access_token"`
	IDToken      string `json:"id_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

// oidcConfigResponse is returned by GET /api/oidc/config.
type oidcConfigResponse struct {
	Enabled     bool   `json:"enabled"`
	Issuer      string `json:"issuer"`
	ClientID    string `json:"client_id"`
	RedirectURI string `json:"redirect_uri"`
	AuthURL     string `json:"auth_url"`
	TokenURL    string `json:"token_url"`
}

// SetupOIDC initializes the OIDC subsystem by fetching the discovery document.
func (h *Handler) SetupOIDC(enabled bool, clientID, issuer, redirectURI string) error {
	if !enabled {
		h.closeOIDCStores()
		h.oidcEnabled = false
		h.oidcConfig = nil
		return nil
	}
	if clientID == "" || issuer == "" || redirectURI == "" {
		return fmt.Errorf("CHAT_OIDC_CLIENT_ID, CHAT_OIDC_ISSUER, and CHAT_OIDC_REDIRECT_URI are required when OIDC is enabled")
	}

	normalizedIssuer := strings.TrimRight(issuer, "/")
	wellKnown := normalizedIssuer + "/.well-known/openid-configuration"
	resp, err := oidcHTTPClient.Get(wellKnown)
	if err != nil {
		return fmt.Errorf("oidc discovery failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("oidc discovery returned status %d", resp.StatusCode)
	}
	body, err := readOIDCResponseBody(resp.Body, oidcMaxDiscoveryBodyBytes)
	if err != nil {
		return fmt.Errorf("oidc discovery read failed: %w", err)
	}
	var cfg OIDCConfig
	if err := json.Unmarshal(body, &cfg); err != nil {
		return fmt.Errorf("oidc discovery parse failed: %w", err)
	}
	newStates := newOIDCStateStore()
	newTokens := newOIDCTokenStore()
	h.closeOIDCStores()
	h.oidcEnabled = true
	h.oidcClientID = clientID
	h.oidcIssuer = normalizedIssuer
	h.oidcRedirectURI = redirectURI
	h.oidcStates = newStates
	h.oidcTokens = newTokens
	h.oidcJWKS = newOIDCJWKSCache()
	h.oidcConfig = &cfg
	if h.hub != nil {
		h.hub.SetOIDCTokenVerifier(h)
	}
	log.Printf("oidc: discovered provider at %s", h.oidcIssuer)
	return nil
}

// OIDCConfigHandler returns OIDC configuration to the frontend.
// GET /api/oidc/config
func (h *Handler) OIDCConfigHandler(w http.ResponseWriter, r *http.Request) {
	if !h.oidcEnabled {
		writeJSONError(w, http.StatusNotFound, "OIDC not enabled", "NOT_FOUND", requestIDFromContext(r.Context()))
		return
	}
	resp := oidcConfigResponse{
		Enabled:     true,
		Issuer:      h.oidcIssuer,
		ClientID:    h.oidcClientID,
		RedirectURI: h.oidcRedirectURI,
		AuthURL:     h.oidcConfig.AuthEndpoint,
		TokenURL:    h.oidcConfig.TokenEndpoint,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// OIDCLogin initiates the OIDC authorization code flow.
// GET /api/oidc/login
func (h *Handler) OIDCLogin(w http.ResponseWriter, r *http.Request) {
	if !h.oidcEnabled {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if !OIDCAllow(requestIP(r)) {
		writeJSONError(w, http.StatusTooManyRequests, "too many OIDC attempts, try again later", "RATE_LIMITED", requestIDFromContext(r.Context()))
		return
	}

	stateBytes := make([]byte, 16)
	if _, err := rand.Read(stateBytes); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	state := base64.RawURLEncoding.EncodeToString(stateBytes)

	verifier, err := generateCodeVerifier()
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	challenge := computeCodeChallenge(verifier)

	if ok := h.oidcStates.put(state, &oidcStateEntry{
		CodeVerifier: verifier,
		CreatedAt:    time.Now(),
	}); !ok {
		log.Printf("oidc: state store at capacity")
		writeJSONError(w, http.StatusServiceUnavailable, "OIDC login capacity exceeded, try again later", "OIDC_BUSY", requestIDFromContext(r.Context()))
		return
	}

	authURL := fmt.Sprintf("%s?response_type=code&client_id=%s&redirect_uri=%s&scope=%s&state=%s&code_challenge=%s&code_challenge_method=S256",
		h.oidcConfig.AuthEndpoint,
		url.QueryEscape(h.oidcClientID),
		url.QueryEscape(h.oidcRedirectURI),
		url.QueryEscape("openid profile email"),
		url.QueryEscape(state),
		url.QueryEscape(challenge),
	)
	http.Redirect(w, r, authURL, http.StatusFound)
}

// OIDCCallback handles the authorization code callback from the OIDC provider.
// GET /api/oidc/callback?code=...&state=...
func (h *Handler) OIDCCallback(w http.ResponseWriter, r *http.Request) {
	if !h.oidcEnabled {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if !OIDCAllow(requestIP(r)) {
		http.Redirect(w, r, "/?oidc_error=rate_limited", http.StatusFound)
		return
	}

	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	errorParam := r.URL.Query().Get("error")

	if errorParam != "" {
		desc := r.URL.Query().Get("error_description")
		log.Printf("oidc: authorization error from provider: %s (%s)", errorParam, desc)
		http.Redirect(w, r, "/?oidc_error="+url.QueryEscape(errorParam), http.StatusFound)
		return
	}
	if state == "" || code == "" {
		http.Redirect(w, r, "/?oidc_error=invalid_request", http.StatusFound)
		return
	}

	entry, ok := h.oidcStates.take(state)

	if !ok {
		log.Printf("oidc: unknown or expired state: %s", state)
		http.Redirect(w, r, "/?oidc_error=invalid_state", http.StatusFound)
		return
	}

	tokenResp, err := h.exchangeCodeForTokens(code, entry.CodeVerifier)
	if err != nil {
		log.Printf("oidc: token exchange failed: %v", err)
		http.Redirect(w, r, "/?oidc_error=token_exchange_failed", http.StatusFound)
		return
	}

	claims, err := h.validateIDToken(tokenResp.IDToken)
	if err != nil {
		log.Printf("oidc: id_token validation failed: %v", err)
		http.Redirect(w, r, "/?oidc_error=invalid_token", http.StatusFound)
		return
	}

	chatUsername := resolveOIDCUsername(claims)

	if err := h.store.UpsertOIDCUser(claims.Subject, chatUsername, claims.Email, claims.PreferredUsername); err != nil {
		log.Printf("oidc: user upsert failed: %v", err)
		http.Redirect(w, r, "/?oidc_error=registration_failed", http.StatusFound)
		return
	}

	log.Printf("oidc: user %q authenticated via sub=%s", chatUsername, claims.Subject)

	// Store tokens server-side and pass only a one-time redeem ID in the URL.
	redeemIDBytes := make([]byte, 16)
	if _, err := rand.Read(redeemIDBytes); err != nil {
		http.Redirect(w, r, "/?oidc_error=internal", http.StatusFound)
		return
	}
	redeemID := base64.RawURLEncoding.EncodeToString(redeemIDBytes)
	if ok := h.oidcTokens.put(redeemID, &oidcTokenEntry{
		AccessToken:  tokenResp.AccessToken,
		RefreshToken: tokenResp.RefreshToken,
		ChatUsername: chatUsername,
		CreatedAt:    time.Now(),
	}); !ok {
		log.Printf("oidc: token store at capacity")
		http.Redirect(w, r, "/?oidc_error=server_busy", http.StatusFound)
		return
	}

	redirectURL := fmt.Sprintf("/?oidc_success=1&oidc_username=%s&oidc_rid=%s",
		url.QueryEscape(chatUsername),
		url.QueryEscape(redeemID),
	)
	http.Redirect(w, r, redirectURL, http.StatusFound)
}

// OIDCRedeem exchanges a one-time redeem ID for stored OIDC tokens.
// POST /api/oidc/redeem
func (h *Handler) OIDCRedeem(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if !h.oidcEnabled {
		writeJSONError(w, http.StatusNotFound, "OIDC not enabled", "NOT_FOUND", requestID)
		return
	}
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}
	if !OIDCAllow(requestIP(r)) {
		writeJSONError(w, http.StatusTooManyRequests, "too many OIDC attempts, try again later", "RATE_LIMITED", requestID)
		return
	}

	var body struct {
		RedeemID string `json:"redeem_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RedeemID == "" {
		writeJSONError(w, http.StatusBadRequest, "redeem_id is required", "INVALID_PARAMS", requestID)
		return
	}

	entry, ok := h.oidcTokens.take(body.RedeemID)

	if !ok {
		writeJSONError(w, http.StatusNotFound, "invalid or expired redeem_id", "INVALID_REDEEM", requestID)
		return
	}
	sessionToken, err := h.issueSessionToken(entry.ChatUsername)
	if err != nil {
		log.Printf("oidc redeem: session token issue failed: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "redeem failed", "SERVER_ERROR", requestID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"username":      entry.ChatUsername,
		"access_token":  entry.AccessToken,
		"refresh_token": entry.RefreshToken,
		"session_token": sessionToken,
	})
}

// OIDCExchange handles SPA-side token exchange.
// POST /api/oidc/exchange
func (h *Handler) OIDCExchange(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if !h.oidcEnabled {
		writeJSONError(w, http.StatusNotFound, "OIDC not enabled", "NOT_FOUND", requestID)
		return
	}
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}
	if !OIDCAllow(requestIP(r)) {
		writeJSONError(w, http.StatusTooManyRequests, "too many OIDC attempts, try again later", "RATE_LIMITED", requestID)
		return
	}

	var body struct {
		Code         string `json:"code"`
		CodeVerifier string `json:"code_verifier"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body", "INVALID_JSON", requestID)
		return
	}
	if body.Code == "" || body.CodeVerifier == "" {
		writeJSONError(w, http.StatusBadRequest, "code and code_verifier are required", "INVALID_PARAMS", requestID)
		return
	}

	tokenResp, err := h.exchangeCodeForTokens(body.Code, body.CodeVerifier)
	if err != nil {
		log.Printf("oidc exchange: token exchange failed: %v", err)
		writeJSONError(w, http.StatusBadRequest, "token exchange failed", "TOKEN_EXCHANGE_FAILED", requestID)
		return
	}

	claims, err := h.validateIDToken(tokenResp.IDToken)
	if err != nil {
		log.Printf("oidc exchange: id_token validation failed: %v", err)
		writeJSONError(w, http.StatusUnauthorized, "invalid id_token", "INVALID_TOKEN", requestID)
		return
	}

	chatUsername := resolveOIDCUsername(claims)
	if err := h.store.UpsertOIDCUser(claims.Subject, chatUsername, claims.Email, claims.PreferredUsername); err != nil {
		log.Printf("oidc exchange: user upsert failed: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "user registration failed", "REGISTRATION_FAILED", requestID)
		return
	}
	sessionToken, err := h.issueSessionToken(chatUsername)
	if err != nil {
		log.Printf("oidc exchange: session token issue failed: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "user registration failed", "REGISTRATION_FAILED", requestID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"username":      chatUsername,
		"access_token":  tokenResp.AccessToken,
		"refresh_token": tokenResp.RefreshToken,
		"session_token": sessionToken,
	})
}

// OIDCRefresh refreshes an OIDC access token using a refresh_token.
// POST /api/oidc/refresh
func (h *Handler) OIDCRefresh(w http.ResponseWriter, r *http.Request) {
	requestID := requestIDFromContext(r.Context())
	if !h.oidcEnabled {
		writeJSONError(w, http.StatusNotFound, "OIDC not enabled", "NOT_FOUND", requestID)
		return
	}
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED", requestID)
		return
	}
	if !OIDCAllow(requestIP(r)) {
		writeJSONError(w, http.StatusTooManyRequests, "too many OIDC attempts, try again later", "RATE_LIMITED", requestID)
		return
	}

	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body", "INVALID_JSON", requestID)
		return
	}
	if body.RefreshToken == "" {
		writeJSONError(w, http.StatusBadRequest, "refresh_token is required", "INVALID_PARAMS", requestID)
		return
	}

	data := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {body.RefreshToken},
		"client_id":     {h.oidcClientID},
	}
	resp, err := oidcHTTPClient.PostForm(h.oidcConfig.TokenEndpoint, data)
	if err != nil {
		log.Printf("oidc refresh: request failed: %v", err)
		writeJSONError(w, http.StatusBadGateway, "token refresh failed", "REFRESH_FAILED", requestID)
		return
	}
	defer resp.Body.Close()

	respBody, err := readOIDCResponseBody(resp.Body, oidcMaxTokenBodyBytes)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "read refresh response failed", "INTERNAL_ERROR", requestID)
		return
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("oidc refresh: provider returned %d (body redacted, %d bytes)", resp.StatusCode, len(respBody))
		writeJSONError(w, http.StatusUnauthorized, "token refresh rejected by provider", "REFRESH_REJECTED", requestID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(respBody)
}

// exchangeCodeForTokens calls POST /oidc/token with an authorization code.
func (h *Handler) exchangeCodeForTokens(code, codeVerifier string) (*oidcTokenResponse, error) {
	data := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {h.oidcRedirectURI},
		"client_id":     {h.oidcClientID},
		"code_verifier": {codeVerifier},
	}
	resp, err := oidcHTTPClient.PostForm(h.oidcConfig.TokenEndpoint, data)
	if err != nil {
		return nil, fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := readOIDCResponseBody(resp.Body, oidcMaxTokenBodyBytes)
	if err != nil {
		return nil, fmt.Errorf("read token response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token endpoint returned status %d", resp.StatusCode)
	}

	var tr oidcTokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return nil, fmt.Errorf("parse token response: %w", err)
	}
	return &tr, nil
}

// validateIDToken validates an RS256-signed OIDC ID token.
func (h *Handler) validateIDToken(idToken string) (*oidcClaims, error) {
	if idToken == "" {
		return nil, fmt.Errorf("empty id_token")
	}

	keyFunc := h.oidcJWKS.keyFunc(h.oidcConfig.JWKSURI)

	token, err := jwt.ParseWithClaims(idToken, &oidcClaims{}, keyFunc,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(h.oidcIssuer),
		jwt.WithAudience(h.oidcClientID),
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("id_token parse: %w", err)
	}

	claims, ok := token.Claims.(*oidcClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid claims or token not valid")
	}
	if claims.Subject == "" {
		return nil, fmt.Errorf("missing sub claim")
	}
	return claims, nil
}

// resolveOIDCUsername resolves a chat username from OIDC claims.
func resolveOIDCUsername(claims *oidcClaims) string {
	if claims.PreferredUsername != "" && hub.ValidateUsername(claims.PreferredUsername) {
		if !hub.IsReservedUsername(claims.PreferredUsername) {
			return claims.PreferredUsername
		}
	}
	if claims.Email != "" {
		local := strings.Split(claims.Email, "@")[0]
		sanitized := sanitizeOIDCUsername(local)
		if sanitized != "" && hub.ValidateUsername(sanitized) && !hub.IsReservedUsername(sanitized) {
			return sanitized
		}
	}
	if claims.Name != "" && hub.ValidateUsername(claims.Name) {
		if !hub.IsReservedUsername(claims.Name) {
			return claims.Name
		}
	}
	prefix := claims.Subject
	if len(prefix) > 12 {
		prefix = prefix[:12]
	}
	return "oidc_" + prefix
}

func sanitizeOIDCUsername(s string) string {
	result := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			return r
		}
		return '_'
	}, s)
	result = strings.Trim(result, "_")
	if len(result) < 2 {
		if len(s) >= 2 {
			return s[:2]
		}
		return ""
	}
	return result
}

// PKCE utilities.

func generateCodeVerifier() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func computeCodeChallenge(verifier string) string {
	h := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

// VerifyOIDCUser checks whether a username belongs to a registered OIDC user.
func (h *Handler) VerifyOIDCUser(username string) bool {
	if !h.oidcEnabled {
		return false
	}
	_, err := h.store.GetOIDCUserByUsername(username)
	return err == nil
}

// VerifyOIDCJoinToken validates an OIDC access token and confirms it belongs
// to the identity mapped to the requested chat username.
func (h *Handler) VerifyOIDCJoinToken(username, token string) error {
	if !h.oidcEnabled {
		return fmt.Errorf("OIDC not enabled")
	}
	if username == "" || token == "" {
		return fmt.Errorf("username and token are required")
	}
	if h.oidcConfig == nil || h.oidcConfig.UserInfoEndpoint == "" {
		return fmt.Errorf("OIDC userinfo endpoint unavailable")
	}

	mapped, err := h.store.GetOIDCUserByUsername(username)
	if err != nil {
		return fmt.Errorf("OIDC user not linked: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.oidcConfig.UserInfoEndpoint, nil)
	if err != nil {
		return fmt.Errorf("userinfo request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("userinfo request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("userinfo returned status %d", resp.StatusCode)
	}

	var info struct {
		Subject string `json:"sub"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return fmt.Errorf("userinfo parse: %w", err)
	}
	if info.Subject == "" {
		return fmt.Errorf("userinfo missing sub")
	}
	if info.Subject != mapped.Sub {
		return fmt.Errorf("OIDC subject mismatch")
	}
	return nil
}
