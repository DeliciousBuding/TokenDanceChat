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

	got, err := client.Chat(context.Background(), client.systemPrompt, []Message{{Role: "user", Content: "ping"}})
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
