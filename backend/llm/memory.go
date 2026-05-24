package llm

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

// Message represents a chat message.
type Message struct {
	Role     string // "user" or "assistant"
	Content  string
	Username string // optional, who sent this message
}

// Memory stores recent chat messages for LLM context with optional file persistence.
type Memory struct {
	mu           sync.RWMutex
	messages     []Message
	maxSize      int
	filePath     string // if set, persist JSON to this file
	memoryPath   string // if set, write MEMORY.md summary to this file
	messageCount int    // counter for summarization trigger
}

// NewMemory creates a new Memory with the given maximum message count.
func NewMemory(maxSize int) *Memory {
	if maxSize <= 0 {
		maxSize = 20
	}
	return &Memory{
		messages: make([]Message, 0, maxSize),
		maxSize:  maxSize,
	}
}

// SetPersistPath enables file persistence. Loads existing messages if the file exists.
func (m *Memory) SetPersistPath(path string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.filePath = path
	// Load existing memory from file if present.
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // fresh start, no memory yet
		}
		return err
	}
	defer f.Close()
	var loaded []Message
	if err := json.NewDecoder(io.LimitReader(f, 1<<20)).Decode(&loaded); err != nil {
		// Corrupted file, start fresh.
		return nil
	}
	m.messages = loaded
	// Trim to maxSize.
	if len(m.messages) > m.maxSize {
		m.messages = m.messages[len(m.messages)-m.maxSize:]
	}
	return nil
}

// SetMemoryPath sets the path for MEMORY.md summary file.
func (m *Memory) SetMemoryPath(path string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.memoryPath = path
}

// Add adds a message to memory, trimming old messages if needed. Auto-persists if filePath set.
// Triggers summarization every 10 messages.
func (m *Memory) Add(msg Message) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.messages = append(m.messages, msg)

	if len(m.messages) > m.maxSize {
		excess := len(m.messages) - m.maxSize
		m.messages = m.messages[excess:]
	}

	m.messageCount++
	if m.messageCount%10 == 0 {
		m.summarizeLocked()
	}

	m.saveLocked()
}

// GetMessages returns a copy of recent messages for LLM context.
func (m *Memory) GetMessages() []Message {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]Message, len(m.messages))
	copy(result, m.messages)
	return result
}

// Summarize condenses memory into a human-readable MARKDOWN summary and writes it to MEMORY.md.
// Can be called explicitly or is called automatically every 10 messages.
func (m *Memory) Summarize() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.summarizeLocked()
}

// summarizeLocked builds and writes MEMORY.md. Must hold m.mu.
func (m *Memory) summarizeLocked() {
	if m.memoryPath == "" {
		return
	}
	content := m.buildMemoryMarkdown()
	os.WriteFile(m.memoryPath, []byte(content), 0644)
}

// GetMemoryContent reads and returns the current MEMORY.md content, or empty string.
func (m *Memory) GetMemoryContent() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.memoryPath == "" {
		return ""
	}
	data, err := os.ReadFile(m.memoryPath)
	if err != nil {
		return ""
	}
	return string(data)
}

// buildMemoryMarkdown generates a human-readable markdown summary from recent messages.
func (m *Memory) buildMemoryMarkdown() string {
	var sb strings.Builder
	sb.WriteString("# Bot Memory\n")
	sb.WriteString(fmt.Sprintf("Last updated: %s\n\n", time.Now().Format(time.RFC3339)))

	// Collect topics from all user messages.
	topics := make([]string, 0)
	seenTopics := make(map[string]bool)
	// Collect user -> topics mapping.
	userTopics := make(map[string][]string)
	// Collect important facts.
	facts := make([]string, 0)
	seenFacts := make(map[string]bool)

	for _, msg := range m.messages {
		if msg.Content == "" {
			continue
		}
		topic := extractTopic(msg.Content)
		if topic != "" && !seenTopics[topic] {
			seenTopics[topic] = true
			topics = append(topics, topic)
		}

		// Track per-user topics.
		username := msg.Username
		if username == "" {
			if msg.Role == "user" {
				username = "anonymous"
			} else {
				continue // skip assistant messages without username
			}
		}
		userTopics[username] = append(userTopics[username], topic)

		// Extract facts from user messages.
		if msg.Role == "user" {
			fact := extractFact(msg.Content)
			if fact != "" && !seenFacts[fact] {
				seenFacts[fact] = true
				facts = append(facts, fact)
			}
		}
	}

	// Recent Topics section.
	sb.WriteString("## Recent Topics\n")
	if len(topics) == 0 {
		sb.WriteString("- (no topics yet)\n")
	} else {
		// Show at most 10 topics, most recent last.
		start := 0
		if len(topics) > 10 {
			start = len(topics) - 10
		}
		for _, t := range topics[start:] {
			sb.WriteString(fmt.Sprintf("- %s\n", t))
		}
	}
	sb.WriteString("\n")

	// Known Users section.
	sb.WriteString("## Known Users\n")
	if len(userTopics) == 0 {
		sb.WriteString("- (no users yet)\n")
	} else {
		// Sort usernames for consistent output.
		usernames := make([]string, 0, len(userTopics))
		for u := range userTopics {
			usernames = append(usernames, u)
		}
		sort.Strings(usernames)
		for _, u := range usernames {
			userTopicList := userTopics[u]
			// Deduplicate and take up to 3 topics.
			uniqueUserTopics := make([]string, 0)
			seenUser := make(map[string]bool)
			// Reverse to get most recent first.
			for i := len(userTopicList) - 1; i >= 0 && len(uniqueUserTopics) < 3; i-- {
				if !seenUser[userTopicList[i]] {
					seenUser[userTopicList[i]] = true
					uniqueUserTopics = append(uniqueUserTopics, userTopicList[i])
				}
			}
			if len(uniqueUserTopics) == 0 {
				sb.WriteString(fmt.Sprintf("- @%s: (no topics)\n", u))
			} else {
				sb.WriteString(fmt.Sprintf("- @%s: %s\n", u, strings.Join(uniqueUserTopics, ", ")))
			}
		}
	}
	sb.WriteString("\n")

	// Important Facts section.
	sb.WriteString("## Important Facts\n")
	if len(facts) == 0 {
		sb.WriteString("- (no facts recorded yet)\n")
	} else {
		// Show at most 10 recent facts.
		start := 0
		if len(facts) > 10 {
			start = len(facts) - 10
		}
		for _, f := range facts[start:] {
			sb.WriteString(fmt.Sprintf("- %s\n", f))
		}
	}

	return sb.String()
}

// EstimateTokens returns a rough token count for a message based on character-level heuristics.
// English text: ~4 characters per token. CJK characters: ~1 token per character.
func EstimateTokens(text string) int {
	cjk := 0
	nonCJK := 0
	for _, r := range text {
		if r >= 0x4E00 && r <= 0x9FFF || r >= 0x3400 && r <= 0x4DBF ||
			r >= 0x3040 && r <= 0x309F || r >= 0x30A0 && r <= 0x30FF ||
			r >= 0xAC00 && r <= 0xD7AF {
			cjk++
		} else if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			// Whitespace contributes 0 tokens.
		} else {
			nonCJK++
		}
	}
	if cjk+nonCJK == 0 {
		return 0
	}
	return cjk + (nonCJK+3)/4
}

// extractTopic extracts a short topic summary from a message.
// Takes the first sentence or first meaningful chunk, truncated to ~60 chars.
func extractTopic(content string) string {
	content = strings.TrimSpace(content)
	if content == "" {
		return ""
	}

	// Try to get the first sentence.
	sentenceEnders := []string{". ", "。", "! ", "！", "? ", "？", "\n"}
	firstSentence := content
	for _, sep := range sentenceEnders {
		if idx := strings.Index(content, sep); idx > 0 {
			firstSentence = content[:idx+len(sep)]
			break
		}
	}
	firstSentence = strings.TrimSpace(firstSentence)

	// Truncate to ~60 runes.
	runes := []rune(firstSentence)
	if len(runes) > 60 {
		firstSentence = string(runes[:60]) + "..."
	}

	return firstSentence
}

// extractFact tries to extract a factual statement from a user message.
// Looks for patterns like "I am", "I like", "my", "I have", etc.
func extractFact(content string) string {
	lower := strings.ToLower(content)

	// Simple fact patterns.
	patterns := []string{
		"i am ", "i'm ", "i like ", "i love ", "i have ",
		"my ", "i prefer ", "i want ", "i need ",
		"我", "喜欢", "爱", "有", "想",
	}

	for _, pattern := range patterns {
		idx := strings.Index(lower, pattern)
		if idx >= 0 {
			// Extract the sentence containing this pattern.
			// Work with runes for proper Unicode handling.
			runes := []rune(content)
			// Convert byte index to approximate rune index.
			runeIdx := len([]rune(content[:idx]))
			// Go back to find sentence start.
			runeStart := runeIdx
			for i := runeIdx; i >= 0; i-- {
				if runes[i] == '.' || runes[i] == '!' || runes[i] == '?' || runes[i] == '\n' ||
					runes[i] == '。' || runes[i] == '！' || runes[i] == '？' {
					runeStart = i + 1 // Start after the punctuation.
					break
				}
			}
			fact := strings.TrimSpace(string(runes[runeStart:]))

			// Truncate to ~100 runes.
			if len([]rune(fact)) > 100 {
				fact = string([]rune(fact)[:100]) + "..."
			}
			return fact
		}
	}

	return ""
}

// saveLocked writes messages to the persistence file. Must hold m.mu.
func (m *Memory) saveLocked() {
	if m.filePath == "" {
		return
	}
	data, err := json.Marshal(m.messages)
	if err != nil {
		return
	}
	os.WriteFile(m.filePath, data, 0644)
}
