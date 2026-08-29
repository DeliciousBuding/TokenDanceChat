package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"tokendancechat/backend/hub"
	"tokendancechat/backend/llm"
)

func newConfigTestHandler(t *testing.T, llmCfg *llm.Config, botName string) *Handler {
	t.Helper()
	ms := &mockStore{}
	h := hub.New(ms, llmCfg, botName)
	return New(h, ms, t.TempDir())
}

func TestConfigHandlerNoLLM(t *testing.T) {
	h := newConfigTestHandler(t, nil, "TokenBot")

	req := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	w := httptest.NewRecorder()
	h.ConfigHandler(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", ct)
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["bot_name"] != "TokenBot" {
		t.Errorf("bot_name = %v, want TokenBot", body["bot_name"])
	}
	if body["llm_enabled"] != false {
		t.Errorf("llm_enabled = %v, want false", body["llm_enabled"])
	}
	if body["model"] != "" {
		t.Errorf("model = %v, want empty", body["model"])
	}
	if body["oidc_enabled"] != false {
		t.Errorf("oidc_enabled = %v, want false", body["oidc_enabled"])
	}
	// No sensitive values may leak.
	for _, k := range []string{"api_key", "apiKey", "base_url", "baseUrl", "chat_llm_api_key", "secret"} {
		if _, ok := body[k]; ok {
			t.Errorf("response must not contain %q", k)
		}
	}
}

func TestConfigHandlerWithLLM(t *testing.T) {
	h := newConfigTestHandler(t, &llm.Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "gpt-4",
		BaseURL:  "https://api.openai.com",
	}, "TokenBot")

	req := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	w := httptest.NewRecorder()
	h.ConfigHandler(w, req)

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["model"] != "gpt-4" {
		t.Errorf("model = %v, want gpt-4", body["model"])
	}
	if body["llm_enabled"] != true {
		t.Errorf("llm_enabled = %v, want true", body["llm_enabled"])
	}
	if body["bot_name"] != "TokenBot" {
		t.Errorf("bot_name = %v, want TokenBot", body["bot_name"])
	}
	// Even with an API key configured, the key and base URL must not be exposed.
	for _, k := range []string{"api_key", "apiKey", "base_url", "baseUrl"} {
		if _, ok := body[k]; ok {
			t.Errorf("response must not contain %q", k)
		}
	}
}
