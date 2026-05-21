// Package llm provides a lightweight LLM adapter supporting Anthropic and OpenAI APIs.
//
// Deprecated: This package is preserved for reference on the archive/llm-bot branch.
// New integrations should use the picoclaw adapter (backend/picoclaw/) which connects
// to a PicoClaw gateway via WebSocket for LLM routing, streaming, and conversation memory.
package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Config holds LLM client configuration.
type Config struct {
	Provider   string // "anthropic" or "openai"
	APIKey     string
	Model      string
	BaseURL    string // optional, for proxies/custom endpoints
	MaxTokens  int    // max output tokens (default 8192)
	MemorySize int    // max context messages (default 20)
}

// Client is a lightweight LLM adapter supporting both Anthropic and OpenAI APIs.
type Client struct {
	cfg          Config
	client       *http.Client
	systemPrompt string
}

// New creates a new LLM Client.
func New(cfg Config) *Client {
	if cfg.MaxTokens <= 0 {
		cfg.MaxTokens = 8192
	}
	return &Client{
		cfg: cfg,
		client: &http.Client{
			Timeout: 60 * time.Second,
		},
		systemPrompt: "You are a helpful chatbot in a public chat room. Keep responses concise.",
	}
}

// SetSystemPrompt updates the system prompt used for subsequent LLM calls.
func (c *Client) SetSystemPrompt(prompt string) {
	c.systemPrompt = prompt
}

func (c *Client) getMaxTokens() int {
	if c.cfg.MaxTokens > 0 {
		return c.cfg.MaxTokens
	}
	return 8192
}

// Chat sends messages and returns the assistant response text.
func (c *Client) Chat(ctx context.Context, messages []Message) (string, error) {
	switch c.cfg.Provider {
	case "anthropic":
		return c.chatAnthropic(ctx, messages)
	case "openai":
		return c.chatOpenAI(ctx, messages)
	default:
		return "", fmt.Errorf("unknown provider: %s", c.cfg.Provider)
	}
}

// StreamCallback is called for each text chunk during streaming.
type StreamCallback func(chunk string) error

// ChatStream sends messages and streams the assistant response via onChunk.
func (c *Client) ChatStream(ctx context.Context, messages []Message, onChunk StreamCallback) error {
	switch c.cfg.Provider {
	case "anthropic":
		return c.chatAnthropicStream(ctx, messages, onChunk)
	case "openai":
		return c.chatOpenAIStream(ctx, messages, onChunk)
	default:
		return fmt.Errorf("unknown provider: %s", c.cfg.Provider)
	}
}


// anthropicRequest is the request body for the Anthropic Messages API.
type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    string             `json:"system"`
	Messages  []anthropicMessage `json:"messages"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// anthropicResponse is the response from the Anthropic Messages API.
type anthropicResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (c *Client) chatAnthropic(ctx context.Context, messages []Message) (string, error) {
	baseURL := c.cfg.BaseURL
	if baseURL == "" {
		baseURL = "https://api.anthropic.com"
	}
	baseURL = strings.TrimRight(baseURL, "/")

	messagesURL := baseURL + "/v1/messages"
	if strings.HasSuffix(baseURL, "/v1") {
		messagesURL = baseURL + "/messages"
	}

	apiMessages := make([]anthropicMessage, len(messages))
	for i, msg := range messages {
		apiMessages[i] = anthropicMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
	}

	body := anthropicRequest{
		Model:     c.cfg.Model,
		MaxTokens: c.getMaxTokens(),
		System:    c.systemPrompt,
		Messages:  apiMessages,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return fmt.Sprintf("Sorry, I encountered an error: %v", err), err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, messagesURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Sprintf("Sorry, I encountered an error: %v", err), err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.cfg.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Sprintf("Sorry, I encountered an error: %v", err), err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MB limit
	if err != nil {
		return fmt.Sprintf("Sorry, I encountered an error: %v", err), err
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Sprintf("Sorry, the LLM returned an error (status %d).", resp.StatusCode), fmt.Errorf("anthropic status %d: %s", resp.StatusCode, string(respBytes))
	}

	var result anthropicResponse
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return fmt.Sprintf("Sorry, I encountered an error parsing the response."), err
	}

	if result.Error != nil {
		return fmt.Sprintf("Sorry, I encountered an error: %s", result.Error.Message), fmt.Errorf("anthropic API error: %s", result.Error.Message)
	}

	var textParts []string
	for _, block := range result.Content {
		if block.Type == "text" {
			textParts = append(textParts, block.Text)
		}
	}
	if len(textParts) == 0 {
		return "Sorry, I received an empty response.", fmt.Errorf("anthropic: no text content in response")
	}

	return strings.Join(textParts, "\n"), nil
}

// openaiRequest is the request body for the OpenAI Chat Completions API.
type openaiRequest struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens"`
	Messages  []openaiMessage `json:"messages"`
}

type openaiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// openaiResponse is the response from the OpenAI Chat Completions API.
type openaiResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (c *Client) chatOpenAI(ctx context.Context, messages []Message) (string, error) {
	baseURL := c.cfg.BaseURL
	if baseURL == "" {
		baseURL = "https://api.openai.com"
	}
	baseURL = strings.TrimRight(baseURL, "/")

	// Don't append /v1 if the base URL already includes it.
	chatURL := baseURL + "/v1/chat/completions"
	if strings.HasSuffix(baseURL, "/v1") {
		chatURL = baseURL + "/chat/completions"
	}

	apiMessages := make([]openaiMessage, 0, len(messages)+1)
	apiMessages = append(apiMessages, openaiMessage{
		Role:    "system",
		Content: c.systemPrompt,
	})
	for _, msg := range messages {
		apiMessages = append(apiMessages, openaiMessage{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	body := openaiRequest{
		Model:     c.cfg.Model,
		MaxTokens: c.getMaxTokens(),
		Messages:  apiMessages,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return fmt.Sprintf("Sorry, I encountered an error: %v", err), err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, chatURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Sprintf("Sorry, I encountered an error: %v", err), err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Sprintf("Sorry, I encountered an error: %v", err), err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MB limit
	if err != nil {
		return fmt.Sprintf("Sorry, I encountered an error: %v", err), err
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Sprintf("Sorry, the LLM returned an error (status %d).", resp.StatusCode), fmt.Errorf("openai status %d: %s", resp.StatusCode, string(respBytes))
	}

	var result openaiResponse
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return fmt.Sprintf("Sorry, I encountered an error parsing the response."), err
	}

	if result.Error != nil {
		return fmt.Sprintf("Sorry, I encountered an error: %s", result.Error.Message), fmt.Errorf("openai API error: %s", result.Error.Message)
	}

	if len(result.Choices) == 0 {
		return "Sorry, I received an empty response.", fmt.Errorf("openai: no choices in response")
	}

	return result.Choices[0].Message.Content, nil
}

// openaiStreamChunk represents a single SSE chunk from OpenAI streaming API.
type openaiStreamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
}

func (c *Client) chatOpenAIStream(ctx context.Context, messages []Message, onChunk StreamCallback) error {
	baseURL := c.cfg.BaseURL
	if baseURL == "" {
		baseURL = "https://api.openai.com"
	}
	baseURL = strings.TrimRight(baseURL, "/")

	chatURL := baseURL + "/v1/chat/completions"
	if strings.HasSuffix(baseURL, "/v1") {
		chatURL = baseURL + "/chat/completions"
	}

	apiMessages := make([]openaiMessage, 0, len(messages)+1)
	apiMessages = append(apiMessages, openaiMessage{
		Role:    "system",
		Content: c.systemPrompt,
	})
	for _, msg := range messages {
		apiMessages = append(apiMessages, openaiMessage{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	body := openaiStreamRequest{
		Model:     c.cfg.Model,
		MaxTokens: c.getMaxTokens(),
		Messages:  apiMessages,
		Stream:    true,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("openai stream marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, chatURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("openai stream request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("openai stream do: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		return fmt.Errorf("openai stream status %d: %s", resp.StatusCode, string(errBytes))
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || line == "data: [DONE]" {
			continue
		}
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")

		var chunk openaiStreamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			if err := onChunk(chunk.Choices[0].Delta.Content); err != nil {
				return err
			}
		}
	}
	return scanner.Err()
}

// openaiStreamRequest extends openaiRequest with a Stream field.
type openaiStreamRequest struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens"`
	Messages  []openaiMessage `json:"messages"`
	Stream    bool            `json:"stream"`
}

// anthropicStreamEvent represents an SSE event from the Anthropic streaming API.
type anthropicStreamEvent struct {
	Type  string `json:"type"`
	Delta *struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"delta"`
	ContentBlock *struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content_block,omitempty"`
}

func (c *Client) chatAnthropicStream(ctx context.Context, messages []Message, onChunk StreamCallback) error {
	baseURL := c.cfg.BaseURL
	if baseURL == "" {
		baseURL = "https://api.anthropic.com"
	}
	baseURL = strings.TrimRight(baseURL, "/")

	messagesURL := baseURL + "/v1/messages"
	if strings.HasSuffix(baseURL, "/v1") {
		messagesURL = baseURL + "/messages"
	}

	apiMessages := make([]anthropicMessage, len(messages))
	for i, msg := range messages {
		apiMessages[i] = anthropicMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
	}

	body := anthropicStreamRequest{
		Model:     c.cfg.Model,
		MaxTokens: c.getMaxTokens(),
		System:    c.systemPrompt,
		Messages:  apiMessages,
		Stream:    true,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("anthropic stream marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, messagesURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("anthropic stream request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.cfg.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("Accept", "text/event-stream")

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("anthropic stream do: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		return fmt.Errorf("anthropic stream status %d: %s", resp.StatusCode, string(errBytes))
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")

		var event anthropicStreamEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		switch event.Type {
		case "content_block_delta":
			if event.Delta != nil && event.Delta.Type == "text_delta" && event.Delta.Text != "" {
				if err := onChunk(event.Delta.Text); err != nil {
					return err
				}
			}
		case "content_block_start":
			if event.ContentBlock != nil && event.ContentBlock.Type == "text" && event.ContentBlock.Text != "" {
				if err := onChunk(event.ContentBlock.Text); err != nil {
					return err
				}
			}
		}
	}
	return scanner.Err()
}

// anthropicStreamRequest extends anthropicRequest with a Stream field.
type anthropicStreamRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    string             `json:"system"`
	Messages  []anthropicMessage `json:"messages"`
	Stream    bool               `json:"stream"`
}