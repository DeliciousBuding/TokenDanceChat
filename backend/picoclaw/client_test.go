package picoclaw

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestClientUsesPicoPayloadProtocol(t *testing.T) {
	upgrader := websocket.Upgrader{}
	received := make(chan Message, 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var inbound Message
		if err := conn.ReadJSON(&inbound); err != nil {
			t.Fatalf("read inbound: %v", err)
		}
		received <- inbound

		_ = conn.WriteJSON(Message{
			Type: "message.create",
			Payload: map[string]any{
				"content": "agent reply",
			},
		})
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	replies := make(chan Message, 1)
	handler, err := client.SendMessage("run workflow")
	if err != nil {
		t.Fatalf("SendMessage failed: %v", err)
	}
	handler.OnMessage = func(msg Message) {
		replies <- msg
	}

	select {
	case msg := <-received:
		if msg.Type != "message.send" {
			t.Fatalf("sent type = %q, want message.send", msg.Type)
		}
		if got, _ := msg.Payload["content"].(string); got != "run workflow" {
			raw, _ := json.Marshal(msg)
			t.Fatalf("sent payload content = %q, want run workflow; raw=%s", got, raw)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for inbound message")
	}

	select {
	case msg := <-replies:
		if msg.Content != "agent reply" {
			t.Fatalf("reply content = %q, want agent reply", msg.Content)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for reply")
	}
}

func TestClientReconnectsBeforeSendingAfterConnectionDrops(t *testing.T) {
	upgrader := websocket.Upgrader{}
	received := make(chan string, 2)
	connected := make(chan struct{}, 2)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		connected <- struct{}{}
		defer conn.Close()

		var inbound Message
		if err := conn.ReadJSON(&inbound); err != nil {
			return
		}
		if content, _ := inbound.Payload["content"].(string); content != "" {
			received <- content
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	client := New(Config{WSURL: wsURL})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	if _, err := client.SendMessage("first"); err != nil {
		t.Fatalf("first SendMessage failed: %v", err)
	}
	select {
	case got := <-received:
		if got != "first" {
			t.Fatalf("first received = %q, want first", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for first send")
	}

	deadline := time.After(2 * time.Second)
	for {
		client.mu.Lock()
		disconnected := client.conn == nil
		client.mu.Unlock()
		if disconnected {
			break
		}
		select {
		case <-deadline:
			t.Fatal("timeout waiting for dropped PicoClaw connection")
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}

	if _, err := client.SendMessage("second"); err != nil {
		t.Fatalf("second SendMessage failed after reconnect: %v", err)
	}
	select {
	case got := <-received:
		if got != "second" {
			t.Fatalf("second received = %q, want second", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting for second send")
	}

	if len(connected) < 2 {
		t.Fatalf("expected reconnect to open second websocket, got %d connection(s)", len(connected))
	}
}
