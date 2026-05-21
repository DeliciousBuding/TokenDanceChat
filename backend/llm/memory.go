package llm

import (
	"encoding/json"
	"io"
	"os"
	"sync"
)

// Memory stores recent chat messages for LLM context with optional file persistence.
type Memory struct {
	mu       sync.RWMutex
	messages []Message
	maxSize  int
	filePath string // if set, persist to this file
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

// Add adds a message to memory, trimming old messages if needed. Auto-persists if filePath set.
func (m *Memory) Add(msg Message) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.messages = append(m.messages, msg)

	if len(m.messages) > m.maxSize {
		excess := len(m.messages) - m.maxSize
		m.messages = m.messages[excess:]
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
