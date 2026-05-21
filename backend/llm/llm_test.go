package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestChatOpenAIUsesReasoningContentFallback(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer test-key" {
			t.Fatalf("unexpected Authorization header %q", auth)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]any{
						"content":           "",
						"reasoning_content": "可以，我来处理。",
					},
				},
			},
		})
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "test-key",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	got, err := client.Chat(context.Background(), []Message{{Role: "user", Content: "ping"}})
	if err != nil {
		t.Fatalf("Chat returned error: %v", err)
	}
	if got != "可以，我来处理。" {
		t.Fatalf("Chat returned %q, want reasoning content fallback", got)
	}
}

func TestChatOpenAIStreamIgnoresReasoningContent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"internal reasoning\"}}]}\n\n")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"OK\"}}]}\n\n")
		_, _ = fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "test-key",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	var chunks []string
	err := client.ChatStream(context.Background(), []Message{{Role: "user", Content: "ping"}}, func(chunk string) error {
		chunks = append(chunks, chunk)
		return nil
	})
	if err != nil {
		t.Fatalf("ChatStream returned error: %v", err)
	}
	if len(chunks) != 1 || chunks[0] != "OK" {
		t.Fatalf("stream chunks = %#v, want only final content", chunks)
	}
}
