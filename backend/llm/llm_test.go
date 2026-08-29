package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestChatOpenAIEmptyContentDoesNotFallbackToReasoning(t *testing.T) {
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

	_, err := client.Chat(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}})
	if err == nil {
		t.Fatal("expected an error when reply content is empty, regardless of reasoning_content")
	}
	if !strings.Contains(err.Error(), "empty message content") {
		t.Errorf("error should mention empty message content, got: %v", err)
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
	err := client.ChatStream(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}}, func(chunk string) error {
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

// --- Pure-logic tests below (no network / filesystem dependencies) ---

func TestNewDefaults(t *testing.T) {
	c := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
	})

	if c.systemPrompt != "You are a helpful chatbot in a public chat room. Keep responses concise." {
		t.Errorf("default systemPrompt = %q", c.systemPrompt)
	}
	if got := c.getMaxTokens(); got != 8192 {
		t.Errorf("default maxTokens = %d, want 8192", got)
	}
	// Verify MaxTokens=0 in config also defaults.
	c2 := New(Config{
		Provider:  "anthropic",
		MaxTokens: 0,
	})
	if got := c2.getMaxTokens(); got != 8192 {
		t.Errorf("maxTokens with 0 config = %d, want 8192", got)
	}
}

func TestSetSystemPrompt(t *testing.T) {
	c := New(Config{Provider: "anthropic"})

	tests := []struct {
		name   string
		prompt string
	}{
		{"custom prompt", "You are BotX in a group chat. Reply in zh-CN."},
		{"empty prompt", ""},
		{"bot name in prompt", "Your name is XiaoMing. Be friendly."},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c.SetSystemPrompt(tt.prompt)
			if c.systemPrompt != tt.prompt {
				t.Errorf("systemPrompt = %q, want %q", c.systemPrompt, tt.prompt)
			}
		})
	}
}

func TestGetMaxTokens(t *testing.T) {
	tests := []struct {
		name     string
		maxToken int
		want     int
	}{
		{"zero defaults to 8192", 0, 8192},
		{"negative defaults to 8192", -1, 8192},
		{"explicit 4096", 4096, 4096},
		{"explicit 1", 1, 1},
		{"explicit 32768", 32768, 32768},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := New(Config{
				Provider:  "openai",
				MaxTokens: tt.maxToken,
			})
			if got := c.getMaxTokens(); got != tt.want {
				t.Errorf("getMaxTokens() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestMemoryAddAndGetMessages(t *testing.T) {
	t.Run("basic add and retrieve", func(t *testing.T) {
		m := NewMemory(5)
		if msgs := m.GetMessages(); len(msgs) != 0 {
			t.Fatalf("new memory should be empty, got %d", len(msgs))
		}

		m.Add(Message{Role: "user", Content: "hello", Username: "alice"})
		m.Add(Message{Role: "assistant", Content: "hi there"})
		m.Add(Message{Role: "user", Content: "how are you?", Username: "bob"})

		msgs := m.GetMessages()
		if len(msgs) != 3 {
			t.Fatalf("expected 3 messages, got %d", len(msgs))
		}
		if msgs[0].Content != "hello" {
			t.Errorf("msg[0] = %q, want %q", msgs[0].Content, "hello")
		}
		if msgs[1].Role != "assistant" {
			t.Errorf("msg[1].Role = %q, want %q", msgs[1].Role, "assistant")
		}
		if msgs[2].Username != "bob" {
			t.Errorf("msg[2].Username = %q, want %q", msgs[2].Username, "bob")
		}
	})

	t.Run("trim to maxSize", func(t *testing.T) {
		m := NewMemory(3)
		for i := 0; i < 6; i++ {
			m.Add(Message{Role: "user", Content: fmt.Sprintf("msg-%d", i)})
		}
		msgs := m.GetMessages()
		if len(msgs) != 3 {
			t.Fatalf("expected 3 messages after trim, got %d", len(msgs))
		}
		if msgs[0].Content != "msg-3" {
			t.Errorf("oldest kept = %q, want %q", msgs[0].Content, "msg-3")
		}
		if msgs[2].Content != "msg-5" {
			t.Errorf("newest = %q, want %q", msgs[2].Content, "msg-5")
		}
	})

	t.Run("default maxSize is 20", func(t *testing.T) {
		m := NewMemory(0)
		for i := 0; i < 25; i++ {
			m.Add(Message{Role: "user", Content: fmt.Sprintf("msg-%d", i)})
		}
		msgs := m.GetMessages()
		if len(msgs) != 20 {
			t.Errorf("expected 20 messages (default max), got %d", len(msgs))
		}
		if msgs[0].Content != "msg-5" {
			t.Errorf("oldest kept = %q, want %q", msgs[0].Content, "msg-5")
		}
	})

	t.Run("GetMessages returns a copy", func(t *testing.T) {
		m := NewMemory(5)
		m.Add(Message{Role: "user", Content: "original", Username: "alice"})

		msgs := m.GetMessages()
		msgs[0].Content = "corrupted"
		msgs[0].Username = "evilhacker"

		msgs2 := m.GetMessages()
		if msgs2[0].Content != "original" {
			t.Errorf("GetMessages should return a copy, Content was modified: %q", msgs2[0].Content)
		}
		if msgs2[0].Username != "alice" {
			t.Errorf("GetMessages should return a copy, Username was modified: %q", msgs2[0].Username)
		}
	})
}

func TestMemoryBuildMarkdown(t *testing.T) {
	m := NewMemory(20)

	m.Add(Message{Role: "user", Content: "I am a software engineer.", Username: "alice"})
	m.Add(Message{Role: "assistant", Content: "Nice to meet you!"})
	m.Add(Message{Role: "user", Content: "I like pizza.", Username: "bob"})
	m.Add(Message{Role: "user", Content: "今天天气真好。", Username: "charlie"})

	markdown := m.buildMemoryMarkdown()

	// Verify structure.
	if !strings.Contains(markdown, "# Bot Memory") {
		t.Error("markdown should contain title")
	}
	if !strings.Contains(markdown, "## Recent Topics") {
		t.Error("markdown should have Recent Topics section")
	}
	if !strings.Contains(markdown, "## Known Users") {
		t.Error("markdown should have Known Users section")
	}
	if !strings.Contains(markdown, "## Important Facts") {
		t.Error("markdown should have Important Facts section")
	}
	if !strings.Contains(markdown, "software engineer") {
		t.Errorf("markdown should reference fact 'software engineer', got:\n%s", markdown)
	}
	if !strings.Contains(markdown, "pizza") {
		t.Errorf("markdown should reference fact 'pizza', got:\n%s", markdown)
	}

	// Verify users listed.
	if !strings.Contains(markdown, "@alice") {
		t.Error("markdown should list user @alice")
	}
	if !strings.Contains(markdown, "@bob") {
		t.Error("markdown should list user @bob")
	}
	if !strings.Contains(markdown, "@charlie") {
		t.Error("markdown should list user @charlie")
	}
}

func TestMemorySummarizeWritesFile(t *testing.T) {
	dir := t.TempDir()
	memoryPath := filepath.Join(dir, "MEMORY.md")

	m := NewMemory(20)
	m.SetMemoryPath(memoryPath)
	m.Add(Message{Role: "user", Content: "I love coding.", Username: "dev"})

	// Trigger summarization explicitly.
	m.Summarize()

	data, err := os.ReadFile(memoryPath)
	if err != nil {
		t.Fatalf("failed to read MEMORY.md: %v", err)
	}
	content := string(data)
	if !strings.Contains(content, "# Bot Memory") {
		t.Error("MEMORY.md should contain title")
	}
	if !strings.Contains(content, "@dev") {
		t.Error("MEMORY.md should list user @dev")
	}
	if !strings.Contains(content, "love coding") {
		t.Error("MEMORY.md should contain fact")
	}

	// GetMemoryContent should return the same.
	got := m.GetMemoryContent()
	if got != content {
		t.Errorf("GetMemoryContent mismatch:\ngot:  %q\nwant: %q", got, content)
	}

	// GetMemoryContent with no path set returns empty.
	m2 := NewMemory(10)
	if s := m2.GetMemoryContent(); s != "" {
		t.Errorf("GetMemoryContent with no path set = %q, want empty", s)
	}
}

func TestExtractTopic(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"", ""},
		{"   ", ""},
		{"hello", "hello"},
		{"hello world", "hello world"},
		{"This is a message. And more.", "This is a message."},
		{"你好。后面还有内容", "你好。"},
		{"Question? With more.", "Question?"},
		{"First line\nsecond line", "First line"},
		{"Emoji sentence! Exciting stuff.", "Emoji sentence!"},
	}

	for _, tt := range tests {
		got := extractTopic(tt.input)
		if got != tt.want {
			t.Errorf("extractTopic(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

// TestNewZeroConfig verifies New handles a zero-value Config without panicking
// and applies sensible defaults.
func TestNewZeroConfig(t *testing.T) {
	c := New(Config{})
	if c == nil {
		t.Fatal("New(Config{}) returned nil")
	}
	if c.getMaxTokens() != 8192 {
		t.Errorf("default maxTokens = %d, want 8192", c.getMaxTokens())
	}
	if c.systemPrompt != "You are a helpful chatbot in a public chat room. Keep responses concise." {
		t.Errorf("default systemPrompt = %q", c.systemPrompt)
	}
	if c.cfg.Provider != "" {
		t.Errorf("provider = %q, want empty", c.cfg.Provider)
	}
	if c.client == nil {
		t.Error("http.Client should be initialized")
	}
}

// TestMemoryAddExactCapacity verifies old messages are evicted exactly when
// crossing the capacity boundary (at-capacity + 1).
func TestMemoryAddExactCapacity(t *testing.T) {
	m := NewMemory(3)

	// Fill to exact capacity.
	m.Add(Message{Role: "user", Content: "msg-0"})
	m.Add(Message{Role: "user", Content: "msg-1"})
	m.Add(Message{Role: "user", Content: "msg-2"})

	msgs := m.GetMessages()
	if len(msgs) != 3 {
		t.Fatalf("at capacity: got %d msgs, want 3", len(msgs))
	}

	// Add one more — oldest (msg-0) should be evicted.
	m.Add(Message{Role: "user", Content: "msg-3"})
	msgs = m.GetMessages()
	if len(msgs) != 3 {
		t.Fatalf("after overflow: got %d msgs, want 3", len(msgs))
	}
	if msgs[0].Content != "msg-1" {
		t.Errorf("oldest kept = %q, want msg-1", msgs[0].Content)
	}
	if msgs[2].Content != "msg-3" {
		t.Errorf("newest = %q, want msg-3", msgs[2].Content)
	}
}

// TestMemoryNegativeMaxSize verifies NewMemory handles a negative maxSize
// by falling back to the default of 20.
func TestMemoryNegativeMaxSize(t *testing.T) {
	m := NewMemory(-5)
	for i := 0; i < 25; i++ {
		m.Add(Message{Role: "user", Content: fmt.Sprintf("msg-%d", i)})
	}
	msgs := m.GetMessages()
	if len(msgs) != 20 {
		t.Errorf("expected 20 (default max from negative input), got %d", len(msgs))
	}
}

// TestBuildMemoryMarkdownEmpty verifies buildMemoryMarkdown output when the
// memory contains zero messages (the "empty memory" case).
func TestBuildMemoryMarkdownEmpty(t *testing.T) {
	m := NewMemory(20)
	markdown := m.buildMemoryMarkdown()

	if !strings.Contains(markdown, "# Bot Memory") {
		t.Error("markdown should contain title")
	}
	if !strings.Contains(markdown, "(no topics yet)") {
		t.Error("markdown should indicate no topics")
	}
	if !strings.Contains(markdown, "(no users yet)") {
		t.Error("markdown should indicate no users")
	}
	if !strings.Contains(markdown, "(no facts recorded yet)") {
		t.Error("markdown should indicate no facts")
	}
}

func TestExtractFact(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		// No pattern match.
		{"", ""},
		{"random chatter here", ""},
		{"how are you doing today", ""},

		// English patterns.
		{"I am a software engineer.", "I am a software engineer."},
		{"I'm from Beijing.", "I'm from Beijing."},
		{"I like pizza and pasta.", "I like pizza and pasta."},
		{"I love coding at night.", "I love coding at night."},
		{"I have two cats.", "I have two cats."},
		{"My name is John.", "My name is John."},
		{"I prefer tea over coffee.", "I prefer tea over coffee."},
		{"I want to learn Go.", "I want to learn Go."},
		{"I need more sleep.", "I need more sleep."},

		// Chinese patterns (extraction starts at the matched pattern character).
		{"我喜欢吃火锅。", "我喜欢吃火锅。"},
		{"他喜欢打篮球", "喜欢打篮球"},
		{"我爱我的家人。", "我爱我的家人。"},
		{"今天有雨吗？", "有雨吗？"},
		{"我想学习 Rust。", "我想学习 Rust。"},

		// First match wins (multiple patterns in same message).
		{"I am happy and I like food.", "I am happy and I like food."},

		// Case insensitivity.
		{"I AM a developer.", "I AM a developer."},
		{"i'm sleepy today.", "i'm sleepy today."},
	}

	for _, tt := range tests {
		got := extractFact(tt.input)
		if got != tt.want {
			t.Errorf("extractFact(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

// --- Provider selection tests ---

func TestChatRoutesToCorrectProvider(t *testing.T) {
	t.Run("openai", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/v1/chat/completions" {
				t.Errorf("openai provider should hit /v1/chat/completions, got %s", r.URL.Path)
			}
			if auth := r.Header.Get("Authorization"); !strings.HasPrefix(auth, "Bearer ") {
				t.Errorf("openai provider should use Bearer auth, got %q", auth)
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"choices": []map[string]any{
					{"message": map[string]any{"content": "OK"}},
				},
			})
		}))
		defer server.Close()

		client := New(Config{
			Provider: "openai",
			APIKey:   "sk-test",
			Model:    "gpt-4",
			BaseURL:  server.URL,
		})
		_, err := client.Chat(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "hi"}})
		if err != nil {
			t.Fatalf("Chat returned error: %v", err)
		}
	})

	t.Run("anthropic", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/v1/messages" {
				t.Errorf("anthropic provider should hit /v1/messages, got %s", r.URL.Path)
			}
			if auth := r.Header.Get("x-api-key"); auth != "sk-ant-test" {
				t.Errorf("anthropic provider should use x-api-key header, got %q", auth)
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"content": []map[string]any{
					{"type": "text", "text": "OK"},
				},
			})
		}))
		defer server.Close()

		client := New(Config{
			Provider: "anthropic",
			APIKey:   "sk-ant-test",
			Model:    "claude-sonnet-4-20250514",
			BaseURL:  server.URL,
		})
		_, err := client.Chat(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "hi"}})
		if err != nil {
			t.Fatalf("Chat returned error: %v", err)
		}
	})
}

func TestChatUnknownProviderReturnsError(t *testing.T) {
	client := New(Config{
		Provider: "gemini",
		APIKey:   "sk-test",
		Model:    "gemini-pro",
	})

	_, err := client.Chat(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "hi"}})
	if err == nil {
		t.Fatal("expected error for unknown provider, got nil")
	}
	if !strings.Contains(err.Error(), "unknown provider") {
		t.Errorf("error should mention unknown provider, got: %v", err)
	}
}

func TestChatStreamRoutesToCorrectProvider(t *testing.T) {
	t.Run("openai stream path", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/v1/chat/completions" {
				t.Errorf("stream should hit /v1/chat/completions, got %s", r.URL.Path)
			}
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"OK\"}}]}\n\n")
			_, _ = fmt.Fprint(w, "data: [DONE]\n\n")
		}))
		defer server.Close()

		client := New(Config{
			Provider: "openai",
			APIKey:   "sk-test",
			Model:    "gpt-4",
			BaseURL:  server.URL,
		})
		err := client.ChatStream(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "hi"}}, func(chunk string) error {
			return nil
		})
		if err != nil {
			t.Fatalf("ChatStream returned error: %v", err)
		}
	})

	t.Run("anthropic stream path", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/v1/messages" {
				t.Errorf("anthropic stream should hit /v1/messages, got %s", r.URL.Path)
			}
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = fmt.Fprint(w, "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hi\"}}\n\n")
		}))
		defer server.Close()

		client := New(Config{
			Provider: "anthropic",
			APIKey:   "sk-ant-test",
			Model:    "claude-sonnet-4-20250514",
			BaseURL:  server.URL,
		})
		err := client.ChatStream(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "hi"}}, func(chunk string) error {
			return nil
		})
		if err != nil {
			t.Fatalf("ChatStream returned error: %v", err)
		}
	})
}

// --- Prompt building tests ---

func TestOpenAIPromptBuilding(t *testing.T) {
	var capturedBody openaiRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&capturedBody)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"content": "OK"}},
			},
		})
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "gpt-4o",
		BaseURL:  server.URL,
	})
	client.SetSystemPrompt("You are a test bot.")

	_, err := client.Chat(context.Background(), client.systemPrompt, []Message{
		{Role: "user", Content: "hello", Username: "alice"},
		{Role: "assistant", Content: "hi"},
	})
	if err != nil {
		t.Fatalf("Chat returned error: %v", err)
	}

	if capturedBody.Model != "gpt-4o" {
		t.Errorf("model = %q, want gpt-4o", capturedBody.Model)
	}
	if capturedBody.MaxTokens != 8192 {
		t.Errorf("max_tokens = %d, want 8192", capturedBody.MaxTokens)
	}
	if len(capturedBody.Messages) != 3 {
		t.Fatalf("expected 3 messages (system + 2), got %d", len(capturedBody.Messages))
	}
	if capturedBody.Messages[0].Role != "system" {
		t.Errorf("first message role = %q, want system", capturedBody.Messages[0].Role)
	}
	if capturedBody.Messages[0].Content != "You are a test bot." {
		t.Errorf("system prompt = %q, want %q", capturedBody.Messages[0].Content, "You are a test bot.")
	}
	if capturedBody.Messages[1].Role != "user" {
		t.Errorf("second message role = %q, want user", capturedBody.Messages[1].Role)
	}
	if capturedBody.Messages[1].Content != "hello" {
		t.Errorf("second message content = %q, want hello", capturedBody.Messages[1].Content)
	}
	if capturedBody.Messages[2].Role != "assistant" {
		t.Errorf("third message role = %q, want assistant", capturedBody.Messages[2].Role)
	}
	if capturedBody.Messages[2].Content != "hi" {
		t.Errorf("third message content = %q, want hi", capturedBody.Messages[2].Content)
	}
}

func TestAnthropicPromptBuilding(t *testing.T) {
	var capturedSystem string
	var capturedMessages []anthropicMessage
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body anthropicRequest
		_ = json.NewDecoder(r.Body).Decode(&body)
		capturedSystem = body.System
		capturedMessages = body.Messages
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"content": []map[string]any{
				{"type": "text", "text": "OK"},
			},
		})
	}))
	defer server.Close()

	client := New(Config{
		Provider: "anthropic",
		APIKey:   "sk-ant-test",
		Model:    "claude-sonnet-4-20250514",
		BaseURL:  server.URL,
	})
	client.SetSystemPrompt("You are Claude, a helpful assistant.")

	_, err := client.Chat(context.Background(), client.systemPrompt, []Message{
		{Role: "user", Content: "What is 2+2?"},
		{Role: "assistant", Content: "4"},
	})
	if err != nil {
		t.Fatalf("Chat returned error: %v", err)
	}

	if capturedSystem != "You are Claude, a helpful assistant." {
		t.Errorf("system = %q, want %q", capturedSystem, "You are Claude, a helpful assistant.")
	}
	if len(capturedMessages) != 2 {
		t.Fatalf("expected 2 messages (user + assistant, no system message in array), got %d", len(capturedMessages))
	}
	if capturedMessages[0].Role != "user" {
		t.Errorf("first message role = %q, want user", capturedMessages[0].Role)
	}
	if capturedMessages[0].Content != "What is 2+2?" {
		t.Errorf("first message content = %q, want %q", capturedMessages[0].Content, "What is 2+2?")
	}
	if capturedMessages[1].Role != "assistant" {
		t.Errorf("second message role = %q, want assistant", capturedMessages[1].Role)
	}
}

func TestPromptBuildingEmptyMessages(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body openaiRequest
		_ = json.NewDecoder(r.Body).Decode(&body)
		// With empty messages, should still have the system message.
		if len(body.Messages) != 1 {
			t.Errorf("expected 1 message (system only), got %d", len(body.Messages))
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"content": "OK"}},
			},
		})
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "gpt-4o",
		BaseURL:  server.URL,
	})
	_, err := client.Chat(context.Background(), client.systemPrompt, []Message{})
	if err != nil {
		t.Fatalf("Chat with empty messages returned error: %v", err)
	}
}

// --- Streaming tests ---

func TestChatStreamMultipleChunks(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\" \"}}]}\n\n")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"World\"}}]}\n\n")
		_, _ = fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	var chunks []string
	err := client.ChatStream(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}}, func(chunk string) error {
		chunks = append(chunks, chunk)
		return nil
	})
	if err != nil {
		t.Fatalf("ChatStream returned error: %v", err)
	}
	if len(chunks) != 3 {
		t.Fatalf("expected 3 chunks, got %d: %#v", len(chunks), chunks)
	}
	if chunks[0] != "Hello" || chunks[1] != " " || chunks[2] != "World" {
		t.Errorf("chunks = %#v, want [Hello, ' ', World]", chunks)
	}
}

func TestChatStreamDoneSignal(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		// Only DONE signal, no content chunks.
		_, _ = fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	var chunks []string
	err := client.ChatStream(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}}, func(chunk string) error {
		chunks = append(chunks, chunk)
		return nil
	})
	if err != nil {
		t.Fatalf("ChatStream returned error: %v", err)
	}
	if len(chunks) != 0 {
		t.Errorf("expected 0 chunks for DONE-only stream, got %d: %#v", len(chunks), chunks)
	}
}

func TestChatStreamEmptyLines(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		// Empty lines and comments should be skipped.
		_, _ = fmt.Fprint(w, "\n\n")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"X\"}}]}\n\n")
		_, _ = fmt.Fprint(w, "\n")
		_, _ = fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	var chunks []string
	err := client.ChatStream(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}}, func(chunk string) error {
		chunks = append(chunks, chunk)
		return nil
	})
	if err != nil {
		t.Fatalf("ChatStream returned error: %v", err)
	}
	if len(chunks) != 1 || chunks[0] != "X" {
		t.Errorf("expected 1 chunk 'X', got %#v", chunks)
	}
}

func TestChatStreamAllReasoningContent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		// Only reasoning_content, no regular content.
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"thinking...\"}}]}\n\n")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"more thinking\"}}]}\n\n")
		_, _ = fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	var chunks []string
	err := client.ChatStream(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}}, func(chunk string) error {
		chunks = append(chunks, chunk)
		return nil
	})
	if err != nil {
		t.Fatalf("ChatStream returned error: %v", err)
	}
	if len(chunks) != 0 {
		t.Errorf("expected 0 chunks (reasoning_content ignored), got %d: %#v", len(chunks), chunks)
	}
}

func TestChatStreamCallbackError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"chunk1\"}}]}\n\n")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"chunk2\"}}]}\n\n")
		_, _ = fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	expectedErr := fmt.Errorf("callback aborted")
	var chunks []string
	err := client.ChatStream(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}}, func(chunk string) error {
		chunks = append(chunks, chunk)
		if chunk == "chunk1" {
			return expectedErr
		}
		return nil
	})
	if err != expectedErr {
		t.Errorf("expected callback error to propagate, got %v", err)
	}
	if len(chunks) != 1 {
		t.Errorf("expected 1 chunk before abort, got %d: %#v", len(chunks), chunks)
	}
}

func TestChatStreamWithFinishReason(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		finish := "stop"
		chunk := openaiStreamChunk{
			Choices: []struct {
				Delta struct {
					Content          string `json:"content"`
					ReasoningContent string `json:"reasoning_content"`
				} `json:"delta"`
				FinishReason *string `json:"finish_reason"`
			}{
				{FinishReason: &finish},
			},
		}
		data, _ := json.Marshal(chunk)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
		_, _ = fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	var chunks []string
	err := client.ChatStream(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}}, func(chunk string) error {
		chunks = append(chunks, chunk)
		return nil
	})
	if err != nil {
		t.Fatalf("ChatStream returned error: %v", err)
	}
	// Finish reason chunk has no delta content, so nothing should be emitted.
	if len(chunks) != 0 {
		t.Errorf("expected 0 chunks for finish-only chunk, got %d: %#v", len(chunks), chunks)
	}
}

// --- Error handling tests ---

func TestChatNon200Status(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":{"message":"internal error"}}`))
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	userMsg, err := client.Chat(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}})
	if err == nil {
		t.Fatal("expected error for 500 status, got nil")
	}
	if !strings.Contains(err.Error(), "status 500") {
		t.Errorf("error should mention status 500, got: %v", err)
	}
	// User-facing message should be a friendly apology.
	if !strings.Contains(userMsg, "Sorry") {
		t.Errorf("user message should be a friendly apology, got: %q", userMsg)
	}
}

func TestChatUnauthorizedStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	_, err := client.Chat(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}})
	if err == nil {
		t.Fatal("expected error for 401 status, got nil")
	}
	if !strings.Contains(err.Error(), "status 401") {
		t.Errorf("error should mention status 401, got: %v", err)
	}
}

func TestChatInvalidJSONResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`not valid json {{{`))
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	userMsg, err := client.Chat(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}})
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
	if !strings.Contains(userMsg, "Sorry") {
		t.Errorf("user message should be a friendly apology, got: %q", userMsg)
	}
}

func TestChatEmptyChoices(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{},
		})
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	userMsg, err := client.Chat(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}})
	if err == nil {
		t.Fatal("expected error for empty choices, got nil")
	}
	if !strings.Contains(err.Error(), "no choices in response") {
		t.Errorf("error should mention no choices, got: %v", err)
	}
	if !strings.Contains(userMsg, "empty response") {
		t.Errorf("user message should mention empty response, got: %q", userMsg)
	}
}

func TestChatAPIErrorObject(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]any{
				"message": "model overloaded, please retry",
			},
		})
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	userMsg, err := client.Chat(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}})
	if err == nil {
		t.Fatal("expected error for API error object, got nil")
	}
	if !strings.Contains(err.Error(), "model overloaded") {
		t.Errorf("error should contain API error message, got: %v", err)
	}
	if !strings.Contains(userMsg, "model overloaded") {
		t.Errorf("user message should contain error detail, got: %q", userMsg)
	}
}

func TestChatContextCanceled(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simulate a slow response.
		select {
		case <-r.Context().Done():
			return
		}
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately.

	userMsg, err := client.Chat(ctx, client.systemPrompt, []Message{{Role: "user", Content: "ping"}})
	if err == nil {
		t.Fatal("expected error for canceled context, got nil")
	}
	if !strings.Contains(userMsg, "Sorry") {
		t.Errorf("user message should be a friendly apology, got: %q", userMsg)
	}
}

func TestChatStreamNon200Status(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`service unavailable`))
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	err := client.ChatStream(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}}, func(chunk string) error {
		return nil
	})
	if err == nil {
		t.Fatal("expected error for 503 status in stream, got nil")
	}
	if !strings.Contains(err.Error(), "status 503") {
		t.Errorf("error should mention status 503, got: %v", err)
	}
}

func TestChatEmptyContentReasoningOnlyReturnsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]any{
						"content":           "",
						"reasoning_content": "step-by-step reasoning result",
					},
				},
			},
		})
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	userMsg, err := client.Chat(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}})
	if err == nil {
		t.Fatal("expected error when content is empty even if reasoning_content is present, got nil")
	}
	if !strings.Contains(err.Error(), "empty message content") {
		t.Errorf("error should mention empty message content, got: %v", err)
	}
	if !strings.Contains(userMsg, "empty response") {
		t.Errorf("user message should mention empty response, got: %q", userMsg)
	}
}

func TestChatBothContentEmpty(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]any{
						"content":           "",
						"reasoning_content": "",
					},
				},
			},
		})
	}))
	defer server.Close()

	client := New(Config{
		Provider: "openai",
		APIKey:   "sk-test",
		Model:    "test-model",
		BaseURL:  server.URL,
	})

	userMsg, err := client.Chat(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}})
	if err == nil {
		t.Fatal("expected error when both content and reasoning are empty, got nil")
	}
	if !strings.Contains(err.Error(), "empty message content") {
		t.Errorf("error should mention empty message content, got: %v", err)
	}
	if !strings.Contains(userMsg, "empty response") {
		t.Errorf("user message should mention empty response, got: %q", userMsg)
	}
}

// --- Token counting tests ---

func TestEstimateTokens(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  int
	}{
		{"empty string", "", 0},
		{"whitespace only", "   \t\n  ", 0},
		{"single word", "hello", 2},                            // 5 chars / 4 = 2
		{"short phrase", "hello world", 3},                     // 10 chars / 4 = 3
		{"sentence", "The quick brown fox jumps over the lazy dog", 9}, // 35 chars / 4 = 9
		{"Chinese only", "你好世界", 4},                             // 4 CJK chars
		{"Chinese sentence", "今天天气真好。", 7},                      // 6 CJK + 1 punct / 4 = 7
		{"mixed CN/EN", "Hello 世界", 4},                          // 5 ASCII / 4 + 2 CJK = 4
		{"code snippet", "func main() { return 0 }", 5},        // 17 chars / 4 = 5
		{"long English", "This is a longer piece of text that should be approximately twenty tokens", 16},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := EstimateTokens(tt.input)
			if got != tt.want {
				t.Errorf("EstimateTokens(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}

func TestEstimateTokensScale(t *testing.T) {
	// Verify that token count scales roughly linearly with text length.
	short := EstimateTokens("a")
	medium := EstimateTokens(strings.Repeat("a", 100))
	long := EstimateTokens(strings.Repeat("a", 1000))

	if short < 1 {
		t.Errorf("single char should be >= 1 token, got %d", short)
	}
	if medium < 20 || medium > 30 {
		t.Errorf("100 chars should be ~25 tokens, got %d", medium)
	}
	if long < 240 || long > 260 {
		t.Errorf("1000 chars should be ~250 tokens, got %d", long)
	}
}

func TestEstimateTokensCJKProportional(t *testing.T) {
	// CJK characters should contribute ~1 token each.
	cnTokens := EstimateTokens("你好世界测试文本内容")
	if cnTokens < 8 || cnTokens > 10 {
		t.Errorf("8 CJK chars should be ~8 tokens, got %d", cnTokens)
	}

	// Mixed content: CJK + ASCII.
	mixedTokens := EstimateTokens("你好hello世界world")
	// 4 CJK + 10 ASCII: 4 + ceil(10/4) = 4 + 3 = 7
	if mixedTokens < 6 || mixedTokens > 8 {
		t.Errorf("mixed CJK+ASCII should be ~7 tokens, got %d", mixedTokens)
	}
}

func TestEstimateTokensMessageBulk(t *testing.T) {
	// Simulate counting tokens for a full message array.
	messages := []Message{
		{Role: "system", Content: "You are a helpful assistant."},
		{Role: "user", Content: "Hello, how are you?"},
		{Role: "assistant", Content: "I'm doing well, thank you for asking!"},
		{Role: "user", Content: "请帮我翻译这段文字。"},
	}

	total := 0
	for _, msg := range messages {
		total += EstimateTokens(msg.Content)
	}
	// Should be a reasonable number (not zero, not absurdly large).
	if total < 10 {
		t.Errorf("total tokens for 4 messages too low: %d", total)
	}
	if total > 50 {
		t.Errorf("total tokens for 4 messages too high: %d", total)
	}
}
