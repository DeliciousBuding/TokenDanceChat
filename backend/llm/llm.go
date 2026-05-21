package llm

import (
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
	MemorySize int    // max context messages (default 20)
}

// Message represents a chat message.
type Message struct {
	Role    string // "user" or "assistant"
	Content string
}

// Client is a lightweight LLM adapter supporting both Anthropic and OpenAI APIs.
type Client struct {
	cfg    Config
	client *http.Client
}

// New creates a new LLM Client.
func New(cfg Config) *Client {
	return &Client{
		cfg: cfg,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
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

const systemPrompt = "You are a helpful chatbot in a public chat room. Keep responses concise."

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

	apiMessages := make([]anthropicMessage, len(messages))
	for i, msg := range messages {
		apiMessages[i] = anthropicMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
	}

	body := anthropicRequest{
		Model:     c.cfg.Model,
		MaxTokens: 1024,
		System:    systemPrompt,
		Messages:  apiMessages,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return fmt.Sprintf("Sorry, I encountered an error: %v", err), err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/v1/messages", bytes.NewReader(bodyBytes))
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

	apiMessages := make([]openaiMessage, 0, len(messages)+1)
	apiMessages = append(apiMessages, openaiMessage{
		Role:    "system",
		Content: systemPrompt,
	})
	for _, msg := range messages {
		apiMessages = append(apiMessages, openaiMessage{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	body := openaiRequest{
		Model:     c.cfg.Model,
		MaxTokens: 1024,
		Messages:  apiMessages,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return fmt.Sprintf("Sorry, I encountered an error: %v", err), err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/v1/chat/completions", bytes.NewReader(bodyBytes))
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
