package handler

import (
	"encoding/json"
	"net/http"
)

// ConfigHandler returns the public, non-sensitive runtime config the frontend
// needs to render the active model and bot. It deliberately omits API keys,
// base URLs, and any other credential material.
func (h *Handler) ConfigHandler(w http.ResponseWriter, r *http.Request) {
	botName := ""
	model := ""
	llmEnabled := false
	if h.hub != nil {
		botName = h.hub.BotName()
		model = h.hub.LLMModel()
		llmEnabled = h.hub.LLMEnabled()
	}

	resp := map[string]any{
		"bot_name":     botName,
		"model":        model,
		"llm_enabled":  llmEnabled,
		"oidc_enabled": h.oidcEnabled,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
