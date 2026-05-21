package llm

import "sync"

// Memory stores recent chat messages for LLM context.
type Memory struct {
	mu       sync.RWMutex
	messages []Message
	maxSize  int
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

// Add adds a message to memory, trimming old messages if needed.
func (m *Memory) Add(msg Message) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.messages = append(m.messages, msg)

	// If we exceed the max size, trim oldest non-system messages.
	if len(m.messages) > m.maxSize {
		// Remove from the front to keep recent messages.
		excess := len(m.messages) - m.maxSize
		m.messages = m.messages[excess:]
	}
}

// GetMessages returns a copy of recent messages for LLM context.
func (m *Memory) GetMessages() []Message {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]Message, len(m.messages))
	copy(result, m.messages)
	return result
}
