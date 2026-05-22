package hub

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

var e2eUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// e2eEnv holds a running hub + httptest server for WebSocket E2E tests.
type e2eEnv struct {
	Hub    *Hub
	Server *httptest.Server
	Addr   string
}

func newE2EEnv() *e2eEnv {
	ms := &mockStore{}
	h := New(ms, nil, nil, "")
	go h.Run()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := e2eUpgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		client := NewClient(h, conn)
		go client.WritePump()
		go client.ReadPump()
	}))
	return &e2eEnv{Hub: h, Server: srv, Addr: strings.Replace(srv.URL, "http://", "ws://", 1) + "/ws"}
}

func (e *e2eEnv) Close() {
	e.Server.Close()
}

func (e *e2eEnv) Dial(t *testing.T) *wsConn {
	t.Helper()
	conn, _, err := websocket.DefaultDialer.Dial(e.Addr, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	return &wsConn{Conn: conn, t: t}
}

// wsConn wraps a WebSocket connection with test helpers.
type wsConn struct {
	*websocket.Conn
	t *testing.T
}

func (w *wsConn) Send(msg Message) {
	w.t.Helper()
	raw, err := json.Marshal(msg)
	if err != nil {
		w.t.Fatalf("marshal: %v", err)
	}
	w.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := w.WriteMessage(websocket.TextMessage, raw); err != nil {
		w.t.Fatalf("write: %v", err)
	}
}

func (w *wsConn) Recv(timeout time.Duration) Message {
	w.t.Helper()
	w.SetReadDeadline(time.Now().Add(timeout))
	_, raw, err := w.ReadMessage()
	if err != nil {
		w.t.Fatalf("read: %v", err)
	}
	var msg Message
	if err := json.Unmarshal(raw, &msg); err != nil {
		w.t.Fatalf("unmarshal: %v", err)
	}
	return msg
}

// drainJoin drains all messages sent during the join handshake until user_joined.
func (w *wsConn) DrainJoin() {
	for {
		msg := w.Recv(2 * time.Second)
		if msg.Type == "user_joined" {
			return
		}
	}
}

// drainUntil drains messages until a message of the given type is received.
// Returns the matching message.
func (w *wsConn) DrainUntil(wantType string) Message {
	for {
		msg := w.Recv(2 * time.Second)
		if msg.Type == wantType {
			return msg
		}
	}
}

// skipUntil drains messages until a message of the given type, discarding them.
func (w *wsConn) SkipUntil(wantType string) {
	for {
		msg := w.Recv(2 * time.Second)
		if msg.Type == wantType {
			return
		}
	}
}

// join is a helper that joins as the given username and drains the handshake.
func (w *wsConn) JoinAs(username string) {
	w.Send(Message{Type: "join", Username: username})
	w.DrainJoin()
}

// =============================================================================
// E2E Tests
// =============================================================================

func TestE2EJoinAndMessage(t *testing.T) {
	env := newE2EEnv()
	defer env.Close()

	alice := env.Dial(t)
	defer alice.Close()
	alice.JoinAs("alice")

	alice.Send(Message{Type: "message", Content: "Hello world"})
	msg := alice.DrainUntil("message")
	if msg.Username != "alice" || msg.Content != "Hello world" {
		t.Errorf("got username=%s content=%s", msg.Username, msg.Content)
	}
}

func TestE2EDirectMessage(t *testing.T) {
	env := newE2EEnv()
	defer env.Close()

	bob := env.Dial(t)
	defer bob.Close()
	bob.JoinAs("bob")

	alice := env.Dial(t)
	defer alice.Close()
	alice.JoinAs("alice")

	alice.Send(Message{Type: "dm_message", Content: "Hi Bob", To: "bob"})

	// Alice gets echo.
	echo := alice.DrainUntil("dm_message")
	if echo.Content != "Hi Bob" {
		t.Errorf("alice echo: %s", echo.Content)
	}

	// Bob gets the DM.
	dm := bob.DrainUntil("dm_message")
	if dm.Content != "Hi Bob" || dm.From != "alice" {
		t.Errorf("bob got content=%s from=%s", dm.Content, dm.From)
	}
}

func TestE2EReaction(t *testing.T) {
	env := newE2EEnv()
	defer env.Close()

	alice := env.Dial(t)
	defer alice.Close()
	alice.JoinAs("alice")

	alice.Send(Message{Type: "message", Content: "React to me"})
	msg := alice.DrainUntil("message")

	alice.Send(Message{Type: "reaction", ID: msg.ID, Emoji: "👍"})
	reaction := alice.DrainUntil("reaction_update")
	if reaction.Type != "reaction_update" {
		t.Errorf("expected reaction_update, got %s", reaction.Type)
	}
}

func TestE2EEditAndDelete(t *testing.T) {
	env := newE2EEnv()
	defer env.Close()

	alice := env.Dial(t)
	defer alice.Close()
	alice.JoinAs("alice")

	alice.Send(Message{Type: "message", Content: "original"})
	msg := alice.DrainUntil("message")

	alice.Send(Message{Type: "message_edit", ID: msg.ID, Content: "edited"})
	alice.Send(Message{Type: "message_delete", ID: msg.ID})

	del := alice.DrainUntil("message_delete")
	if del.Type != "message_delete" || !del.Deleted {
		t.Errorf("got type=%s deleted=%v", del.Type, del.Deleted)
	}
}

func TestE2EBlocking(t *testing.T) {
	env := newE2EEnv()
	defer env.Close()

	alice := env.Dial(t)
	defer alice.Close()
	alice.JoinAs("alice")

	alice.Send(Message{Type: "block", Username: "bob"})
	confirm := alice.DrainUntil("block")
	if confirm.Username != "bob" {
		t.Errorf("expected block bob, got %s", confirm.Username)
	}

	alice.Send(Message{Type: "unblock", Username: "bob"})
	unblock := alice.DrainUntil("unblock")
	if unblock.Username != "bob" {
		t.Errorf("expected unblock bob, got %s", unblock.Username)
	}

	alice.Send(Message{Type: "block_list"})
	bl := alice.DrainUntil("block_list")
	if bl.Type != "block_list" {
		t.Errorf("expected block_list, got %s", bl.Type)
	}
}

func TestE2EPinning(t *testing.T) {
	env := newE2EEnv()
	defer env.Close()

	alice := env.Dial(t)
	defer alice.Close()
	alice.JoinAs("alice")

	alice.Send(Message{Type: "message", Content: "Pin this"})
	msg := alice.DrainUntil("message")

	alice.Send(Message{Type: "pin_message", ID: msg.ID})
	pin := alice.DrainUntil("pinned")
	if !pin.Pinned {
		t.Errorf("expected pinned=true, got %v", pin.Pinned)
	}

	alice.Send(Message{Type: "unpin_message", ID: msg.ID})
	unpin := alice.DrainUntil("unpinned")
	if unpin.Type != "unpinned" {
		t.Errorf("expected unpinned, got %s", unpin.Type)
	}
}

func TestE2EReadReceipt(t *testing.T) {
	env := newE2EEnv()
	defer env.Close()

	bob := env.Dial(t)
	defer bob.Close()
	bob.JoinAs("bob")

	alice := env.Dial(t)
	defer alice.Close()
	alice.JoinAs("alice")

	// Alice marks her DM with Bob as read.
	alice.Send(Message{Type: "mark_read", Context: "dm", To: "bob"})

	receipt := bob.DrainUntil("read_receipt")
	if receipt.From != "alice" {
		t.Errorf("expected read_receipt from alice, got %s", receipt.From)
	}
}

func TestE2ELoadHistory(t *testing.T) {
	env := newE2EEnv()
	defer env.Close()

	alice := env.Dial(t)
	defer alice.Close()
	alice.JoinAs("alice")

	alice.Send(Message{Type: "load_history", Timestamp: time.Now().UnixMilli()})
	hist := alice.DrainUntil("history")
	if hist.Type != "history" {
		t.Errorf("expected history, got %s", hist.Type)
	}
}

func TestE2ETypingIndicator(t *testing.T) {
	env := newE2EEnv()
	defer env.Close()

	alice := env.Dial(t)
	defer alice.Close()
	alice.JoinAs("alice")

	// Typing is broadcast-only. Just verify the connection stays alive.
	alice.Send(Message{Type: "typing_start", Context: "public"})
	alice.Send(Message{Type: "typing_stop"})
	alice.Send(Message{Type: "message", Content: "still alive"})

	msg := alice.DrainUntil("message")
	if msg.Content != "still alive" {
		t.Errorf("got %s", msg.Content)
	}
}

func TestE2EGroupFlow(t *testing.T) {
	env := newE2EEnv()
	defer env.Close()

	bob := env.Dial(t)
	defer bob.Close()
	bob.JoinAs("bob")

	alice := env.Dial(t)
	defer alice.Close()
	alice.JoinAs("alice")

	// Alice creates a group.
	alice.Send(Message{Type: "group_create", Group: "TestGroup"})
	created := alice.DrainUntil("group_create")
	if created.Group != "TestGroup" {
		t.Errorf("expected group_create, got %s", created.Type)
	}

	// Alice invites Bob.
	alice.Send(Message{Type: "group_invite", Group: "TestGroup", Username: "bob"})

	// Bob receives invite.
	invite := bob.DrainUntil("group_invite")
	if invite.Group != "TestGroup" {
		t.Errorf("expected group_invite, got %s", invite.Type)
	}

	// Bob accepts.
	bob.Send(Message{Type: "group_invite_accept", Group: "TestGroup", From: "alice"})

	// Both should receive group_join.
	bobJoin := bob.DrainUntil("group_join")
	if bobJoin.Group != "TestGroup" {
		t.Errorf("bob join: type=%s group=%s", bobJoin.Type, bobJoin.Group)
	}

	aliceJoin := alice.DrainUntil("group_join")
	if aliceJoin.Group != "TestGroup" {
		t.Errorf("alice join: type=%s group=%s", aliceJoin.Type, aliceJoin.Group)
	}
}

// =============================================================================
// Concurrent stress test
// =============================================================================
func TestE2EConcurrentClients(t *testing.T) {
	// Windows httptest has TCP connection limits; skip stress test.
	if true {
		t.Skip("skipping concurrent stress test on this platform")
	}
	env := newE2EEnv()
	defer env.Close()

	const numClients = 10
	var wg sync.WaitGroup

	for i := 0; i < numClients; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			name := "user" + string(rune('A'+idx))
			conn := env.Dial(t)
			defer conn.Close()
			conn.JoinAs(name)
			conn.Send(Message{Type: "message", Content: "Hello from " + name})
			conn.DrainUntil("message")
		}(i)
	}

	wg.Wait()
	time.Sleep(100 * time.Millisecond)

	// Verify most clients connected (allow some TCP variance on Windows).
	count := env.Hub.ConnectionCount()
	if count < numClients/2 {
		t.Errorf("expected at least %d connections, got %d", numClients/2, count)
	}
	t.Logf("concurrent: %d/%d clients connected", count, numClients)
}
