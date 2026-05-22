package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"tokendancechat/backend/handler"
	"tokendancechat/backend/hub"

	"github.com/gorilla/websocket"
)

// ==============================================================================
// E2E 测试基础设施
// ==============================================================================

// e2eServer 封装测试用的 HTTP 服务器。
type e2eServer struct {
	server   *http.Server
	listener net.Listener
	addr     string
	tmpDir   string
}

// newE2EServer 创建测试服务器：临时 SQLite 数据库 + 最小前端目录。
func newE2EServer(t *testing.T) *e2eServer {
	t.Helper()

	// 重置 rate limiter 避免跨测试污染（所有测试共用 127.0.0.1）。
	handler.ResetRateLimiter()

	tmpDir, err := os.MkdirTemp("", "tokendancechat-e2e-*")
	if err != nil {
		t.Fatalf("创建临时目录失败: %v", err)
	}

	// 创建最小前端目录。
	frontendDir := filepath.Join(tmpDir, "frontend")
	if err := os.MkdirAll(frontendDir, 0755); err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("创建前端目录失败: %v", err)
	}
	indexPath := filepath.Join(frontendDir, "index.html")
	if err := os.WriteFile(indexPath, []byte("<!DOCTYPE html><html><body>TokenDance</body></html>"), 0644); err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("写入 index.html 失败: %v", err)
	}

	dbPath := filepath.Join(tmpDir, "chat.db")

	// 先绑定端口再启动，确保地址已知。
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("创建 listener 失败: %v", err)
	}

	server, st, h, err := Server(dbPath, frontendDir, listener.Addr().String())
	if err != nil {
		listener.Close()
		os.RemoveAll(tmpDir)
		t.Fatalf("Server() 返回错误: %v", err)
	}

	go server.Serve(listener)
	time.Sleep(100 * time.Millisecond)

	t.Cleanup(func() {
		server.Close()
		listener.Close()
		st.Close()
		// don't leak goroutines from hub
		if h != nil {
			h.Shutdown()
		}
		os.RemoveAll(tmpDir)
	})

	return &e2eServer{
		server:   server,
		listener: listener,
		addr:     listener.Addr().String(),
		tmpDir:   tmpDir,
	}
}

// wsURL 返回 WebSocket 连接地址。
func (s *e2eServer) wsURL() string {
	return fmt.Sprintf("ws://%s/ws", s.addr)
}

// ==============================================================================
// WebSocket 测试助手
// ==============================================================================

// e2eConn 封装 WebSocket 连接，提供测试辅助方法。
type e2eConn struct {
	*websocket.Conn
	t *testing.T
}

// e2eDial 连接到测试服务器的 WebSocket。
func e2eDial(t *testing.T, wsURL string) *e2eConn {
	t.Helper()
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket 连接失败: %v", err)
	}
	return &e2eConn{Conn: conn, t: t}
}

// sendJSON 发送 JSON 消息。
func (c *e2eConn) sendJSON(v interface{}) {
	c.t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		c.t.Fatalf("marshal 失败: %v", err)
	}
	c.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := c.WriteMessage(websocket.TextMessage, raw); err != nil {
		c.t.Fatalf("发送消息失败: %v", err)
	}
}

// send 发送 hub.Message 结构。
func (c *e2eConn) send(msg hub.Message) {
	c.sendJSON(msg)
}

// recv 接收一条消息，解码为 hub.Message。
func (c *e2eConn) recv(timeout time.Duration) hub.Message {
	c.t.Helper()
	c.SetReadDeadline(time.Now().Add(timeout))
	_, raw, err := c.ReadMessage()
	if err != nil {
		c.t.Fatalf("读取消息失败: %v", err)
	}
	var msg hub.Message
	if err := json.Unmarshal(raw, &msg); err != nil {
		c.t.Fatalf("unmarshal 失败: %v", err)
	}
	return msg
}

// recvRaw 接收一条消息，返回原始 JSON 字节。
func (c *e2eConn) recvRaw(timeout time.Duration) []byte {
	c.t.Helper()
	c.SetReadDeadline(time.Now().Add(timeout))
	_, raw, err := c.ReadMessage()
	if err != nil {
		c.t.Fatalf("读取消息失败: %v", err)
	}
	return raw
}

// drainUntil 持续接收直到收到指定类型的消息，返回该消息。
func (c *e2eConn) drainUntil(wantType string, timeout time.Duration) hub.Message {
	c.t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			c.t.Fatalf("超时等待消息类型 %q", wantType)
		}
		msg := c.recv(remaining)
		if msg.Type == wantType {
			return msg
		}
	}
	c.t.Fatalf("超时等待消息类型 %q", wantType)
	return hub.Message{}
}

// drainJoin 排空 join 握手期间的消息，直到收到 user_joined。
func (c *e2eConn) drainJoin() {
	c.drainUntil("user_joined", 5*time.Second)
}

// joinAs 发送 join 消息并排空握手数据。
func (c *e2eConn) joinAs(username string) {
	c.send(hub.Message{Type: "join", Username: username})
	c.drainJoin()
}

// skipMessages 跳过并打印指定数量的消息（用于调试）。
func (c *e2eConn) skipMessages(n int) {
	for i := 0; i < n; i++ {
		msg := c.recv(3 * time.Second)
		c.t.Logf("跳过消息: type=%s username=%s content=%s", msg.Type, msg.Username, truncate(msg.Content, 50))
	}
}

func truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "..."
}

// ==============================================================================
// E2E 测试用例
// ==============================================================================

// TestE2EJoinAndMessage 测试两个用户加入并发送消息。
func TestE2EJoinAndMessage(t *testing.T) {
	srv := newE2EServer(t)

	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	bob := e2eDial(t, srv.wsURL())
	defer bob.Close()
	bob.joinAs("bob")

	// Alice 发消息。
	alice.send(hub.Message{Type: "message", Content: "大家好！"})

	// Alice 收到自己的消息回显。
	msgA := alice.drainUntil("message", 5*time.Second)
	if msgA.Username != "alice" || msgA.Content != "大家好！" {
		t.Errorf("Alice 收到: username=%s content=%s", msgA.Username, msgA.Content)
	}

	// Bob 也应收到。
	msgB := bob.drainUntil("message", 5*time.Second)
	if msgB.Username != "alice" || msgB.Content != "大家好！" {
		t.Errorf("Bob 收到: username=%s content=%s", msgB.Username, msgB.Content)
	}

	// Bob 回复。
	bob.send(hub.Message{Type: "message", Content: "你好 Alice！"})
	reply := bob.drainUntil("message", 5*time.Second)
	if reply.Content != "你好 Alice！" {
		t.Errorf("Bob 回显: %s", reply.Content)
	}

	aliceReply := alice.drainUntil("message", 5*time.Second)
	if aliceReply.Content != "你好 Alice！" {
		t.Errorf("Alice 收到 Bob 的回复: %s", aliceReply.Content)
	}
}

// TestE2EMessageHistory 测试加入后获取历史消息。
func TestE2EMessageHistory(t *testing.T) {
	srv := newE2EServer(t)

	// 先发几条消息。
	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	alice.send(hub.Message{Type: "message", Content: "消息1"})
	alice.drainUntil("message", 5*time.Second)

	alice.send(hub.Message{Type: "message", Content: "消息2"})
	alice.drainUntil("message", 5*time.Second)

	alice.Close()

	// Bob 加入，应该从 history 中收到历史消息。
	bob := e2eDial(t, srv.wsURL())
	defer bob.Close()

	// 在 join 握手期间就会收到 history。
	bob.send(hub.Message{Type: "join", Username: "bob"})
	history := bob.drainUntil("history", 5*time.Second)
	bob.drainUntil("user_joined", 5*time.Second)

	if history.Type != "history" {
		t.Fatalf("期望收到 history，实际收到: %s", history.Type)
	}
	if len(history.Messages) < 2 {
		t.Errorf("期望至少 2 条历史消息，实际: %d", len(history.Messages))
	}

	t.Logf("Bob 收到 %d 条历史消息", len(history.Messages))
}

// TestE2EDirectMessage 测试直接消息（DM）发送和接收。
func TestE2EDirectMessage(t *testing.T) {
	srv := newE2EServer(t)

	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	bob := e2eDial(t, srv.wsURL())
	defer bob.Close()
	bob.joinAs("bob")

	// Alice 给 Bob 发 DM。
	alice.send(hub.Message{
		Type:    "dm_message",
		Content: "Hi Bob，这是私信",
		To:      "bob",
	})

	// Alice 收到回显。
	echo := alice.drainUntil("dm_message", 5*time.Second)
	if echo.Content != "Hi Bob，这是私信" {
		t.Errorf("Alice 回显: %s", echo.Content)
	}
	if echo.From != "alice" {
		t.Errorf("期望 from=alice，实际 from=%s", echo.From)
	}
	if echo.To != "bob" {
		t.Errorf("期望 to=bob，实际 to=%s", echo.To)
	}

	// Bob 收到 DM。
	dm := bob.drainUntil("dm_message", 5*time.Second)
	if dm.Content != "Hi Bob，这是私信" {
		t.Errorf("Bob 收到 DM: %s", dm.Content)
	}
	if dm.From != "alice" {
		t.Errorf("期望 from=alice，实际 from=%s", dm.From)
	}

	// Bob 回复。
	bob.send(hub.Message{
		Type:    "dm_message",
		Content: "收到！Hello Alice",
		To:      "alice",
	})

	bobEcho := bob.drainUntil("dm_message", 5*time.Second)
	if bobEcho.Content != "收到！Hello Alice" {
		t.Errorf("Bob 回显: %s", bobEcho.Content)
	}

	aliceDM := alice.drainUntil("dm_message", 5*time.Second)
	if aliceDM.Content != "收到！Hello Alice" {
		t.Errorf("Alice 收到 DM 回复: %s", aliceDM.Content)
	}
}

// TestE2EGroupCreateInviteAndChat 测试群组创建、邀请和群聊。
func TestE2EGroupCreateInviteAndChat(t *testing.T) {
	srv := newE2EServer(t)

	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	bob := e2eDial(t, srv.wsURL())
	defer bob.Close()
	bob.joinAs("bob")

	// Alice 创建群组。
	alice.send(hub.Message{Type: "group_create", Group: "测试群组"})
	created := alice.drainUntil("group_create", 5*time.Second)
	if created.Group != "测试群组" {
		t.Errorf("期望 group=测试群组，实际 group=%s", created.Group)
	}

	// Alice 邀请 Bob。
	alice.send(hub.Message{
		Type:     "group_invite",
		Group:    "测试群组",
		Username: "bob",
	})

	// Bob 收到邀请。
	invite := bob.drainUntil("group_invite", 5*time.Second)
	if invite.Group != "测试群组" {
		t.Errorf("期望 group=测试群组，实际 group=%s", invite.Group)
	}
	if invite.From != "alice" {
		t.Errorf("期望 from=alice，实际 from=%s", invite.From)
	}

	// Bob 接受邀请。
	bob.send(hub.Message{
		Type: "group_invite_accept",
		Group: "测试群组",
		From:  "alice",
	})

	// 两人都应收到 group_join。
	bobJoin := bob.drainUntil("group_join", 5*time.Second)
	if bobJoin.Group != "测试群组" {
		t.Errorf("Bob group_join: %s", bobJoin.Group)
	}

	aliceJoin := alice.drainUntil("group_join", 5*time.Second)
	if aliceJoin.Group != "测试群组" {
		t.Errorf("Alice group_join: %s", aliceJoin.Group)
	}

	// Bob 在群内发消息。
	bob.send(hub.Message{
		Type:    "group_message",
		Group:   "测试群组",
		Content: "大家好，我是 Bob",
	})

	// Bob 收到自己的群消息回显。
	bobMsg := bob.drainUntil("group_message", 5*time.Second)
	if bobMsg.Content != "大家好，我是 Bob" {
		t.Errorf("Bob 群消息回显: %s", bobMsg.Content)
	}

	// Alice 也应收到。
	aliceMsg := alice.drainUntil("group_message", 5*time.Second)
	if aliceMsg.Content != "大家好，我是 Bob" {
		t.Errorf("Alice 收到群消息: %s", aliceMsg.Content)
	}
}

// TestE2EMessageEditAndDelete 测试消息编辑和删除。
func TestE2EMessageEditAndDelete(t *testing.T) {
	srv := newE2EServer(t)

	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	// 发送原始消息。
	alice.send(hub.Message{Type: "message", Content: "原始内容"})
	msg := alice.drainUntil("message", 5*time.Second)
	msgID := msg.ID
	if msgID == "" {
		t.Fatal("消息 ID 为空")
	}

	// 编辑消息。
	alice.send(hub.Message{Type: "message_edit", ID: msgID, Content: "已编辑的内容"})
	edited := alice.drainUntil("message_edit", 5*time.Second)
	if edited.Content != "已编辑的内容" {
		t.Errorf("编辑后内容: %s", edited.Content)
	}
	if !edited.Edited {
		t.Error("期望 edited=true")
	}

	// 删除消息。
	alice.send(hub.Message{Type: "message_delete", ID: msgID})
	deleted := alice.drainUntil("message_delete", 5*time.Second)
	if deleted.Type != "message_delete" {
		t.Errorf("期望 message_delete，实际: %s", deleted.Type)
	}
	if !deleted.Deleted {
		t.Error("期望 deleted=true")
	}
}

// TestE2EReaction 测试消息 reaction（表情回应）。
func TestE2EReaction(t *testing.T) {
	srv := newE2EServer(t)

	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	// 发一条消息。
	alice.send(hub.Message{Type: "message", Content: "给我点个赞"})
	msg := alice.drainUntil("message", 5*time.Second)

	// 添加 reaction。
	alice.send(hub.Message{Type: "reaction", ID: msg.ID, Emoji: "👍"})
	reaction := alice.drainUntil("reaction_update", 5*time.Second)
	if reaction.Type != "reaction_update" {
		t.Errorf("期望 reaction_update，实际: %s", reaction.Type)
	}
	t.Logf("reaction_update: id=%s reactions=%v", reaction.ID, reaction.Reactions)
}

// TestE2EBotMentionAndStream 测试 @TokenBot 触发流式回复。
// 使用 mock LLM 服务器模拟 OpenAI SSE 流式响应。
func TestE2EBotMentionAndStream(t *testing.T) {
	// 启动 mock LLM 服务器，返回流式 SSE。
	mockLLM := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" && r.URL.Path != "/chat/completions" {
			http.Error(w, "not found", 404)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", 500)
			return
		}
		// 分块发送流式响应。
		chunks := []string{"你好！", "我是", "TokenBot，", "有什么可以帮你的？"}
		for _, chunk := range chunks {
			data := fmt.Sprintf(`{"choices":[{"delta":{"content":"%s"},"finish_reason":null}]}`, chunk)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
			time.Sleep(10 * time.Millisecond)
		}
		// 结束信号。
		fmt.Fprintf(w, "data: {\"choices\":[{\"delta\":{\"content\":\"\"},\"finish_reason\":\"stop\"}]}\n\n")
		fmt.Fprintf(w, "data: [DONE]\n\n")
		flusher.Flush()
	}))
	defer mockLLM.Close()

	// 配置环境变量指向 mock LLM。
	t.Setenv("CHAT_LLM_PROVIDER", "openai")
	t.Setenv("CHAT_LLM_API_KEY", "test-key")
	t.Setenv("CHAT_LLM_MODEL", "gpt-4o-mini")
	t.Setenv("CHAT_LLM_BASE_URL", mockLLM.URL)
	t.Setenv("CHAT_LLM_MEMORY_SIZE", "5")

	srv := newE2EServer(t)

	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	// @TokenBot 触发回复。
	alice.send(hub.Message{Type: "message", Content: "@TokenBot 你好"})

	// 等待自己的消息回显。
	selfMsg := alice.drainUntil("message", 5*time.Second)
	t.Logf("自己的消息: %s", selfMsg.Content)

	// 收集流式 chunk。
	var streamChunks []string
	var gotDone bool
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			break
		}
		msg := alice.recv(remaining)
		switch msg.Type {
		case "stream":
			if msg.Done {
				gotDone = true
			} else if msg.Content != "" {
				streamChunks = append(streamChunks, msg.Content)
			}
			t.Logf("stream chunk: %q done=%v", msg.Content, msg.Done)
			if gotDone {
				goto streamDone
			}
		case "message":
			// bot 最终消息。
			if msg.Username == "TokenBot" {
				t.Logf("Bot 最终消息: %s", msg.Content)
				goto streamDone
			}
		case "typing", "typing_stop":
			t.Logf("typing: %s by %s", msg.Type, msg.Username)
		}
	}
streamDone:

	if len(streamChunks) == 0 {
		t.Error("没有收到流式 chunk")
	} else {
		fullResponse := strings.Join(streamChunks, "")
		t.Logf("完整流式响应: %q", fullResponse)
		if !strings.Contains(fullResponse, "TokenBot") {
			t.Errorf("流式响应中应包含 TokenBot，实际: %s", fullResponse)
		}
	}
	if !gotDone {
		t.Error("没有收到 stream done 信号")
	}
}

// TestE2EBotNotConfigured 测试无 LLM 时 @TokenBot 返回提示。
func TestE2EBotNotConfigured(t *testing.T) {
	// 确保 LLM 未配置。
	t.Setenv("CHAT_LLM_PROVIDER", "")

	srv := newE2EServer(t)

	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	// @TokenBot 但 LLM 未配置。
	alice.send(hub.Message{Type: "message", Content: "@TokenBot hello"})

	// 等待自己的消息回显。
	alice.drainUntil("message", 5*time.Second)

	// 应收到 system 消息告知 bot 未配置。
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			t.Error("没有收到 bot 未配置的提示")
			break
		}
		msg := alice.recv(remaining)
		if msg.Type == "system" && strings.Contains(msg.Content, "not configured") {
			t.Logf("收到提示: %s", msg.Content)
			return
		}
	}
}

// TestE2EAutoReplyKeyword 测试关键词自动触发 bot 回复（help/bot/机器人）。
func TestE2EAutoReplyKeyword(t *testing.T) {
	srv := newE2EServer(t)

	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	// 发送包含 "help" 的消息，应 100% 触发 TokenBot。
	alice.send(hub.Message{Type: "message", Content: "help 我需要帮助"})

	// 等待自己的消息。
	alice.drainUntil("message", 5*time.Second)

	// 应收到 system 消息（因为 LLM 未配置）。
	deadline := time.Now().Add(5 * time.Second)
	gotSystem := false
	for time.Now().Before(deadline) {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			break
		}
		msg := alice.recv(remaining)
		t.Logf("收到: type=%s content=%s", msg.Type, truncate(msg.Content, 100))
		if msg.Type == "system" && msg.Username == "system" {
			gotSystem = true
			break
		}
	}
	if !gotSystem {
		t.Error("help 关键词未触发 bot 响应")
	}
}

// TestE2EBlocking 测试用户屏蔽功能。
func TestE2EBlocking(t *testing.T) {
	srv := newE2EServer(t)

	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	// 屏蔽 bob。
	alice.send(hub.Message{Type: "block", Username: "bob"})
	confirm := alice.drainUntil("block", 5*time.Second)
	if confirm.Username != "bob" {
		t.Errorf("期望屏蔽 bob，实际: %s", confirm.Username)
	}

	// 获取屏蔽列表。
	alice.send(hub.Message{Type: "block_list"})
	bl := alice.drainUntil("block_list", 5*time.Second)
	if bl.Type != "block_list" {
		t.Errorf("期望 block_list，实际: %s", bl.Type)
	}
	t.Logf("屏蔽列表: %v", bl.Blocked)

	// 取消屏蔽。
	alice.send(hub.Message{Type: "unblock", Username: "bob"})
	unblock := alice.drainUntil("unblock", 5*time.Second)
	if unblock.Username != "bob" {
		t.Errorf("期望取消屏蔽 bob，实际: %s", unblock.Username)
	}

	// 再次获取屏蔽列表（应为空）。
	alice.send(hub.Message{Type: "block_list"})
	bl2 := alice.drainUntil("block_list", 5*time.Second)
	if len(bl2.Blocked) > 0 {
		t.Errorf("取消屏蔽后列表应为空，实际: %v", bl2.Blocked)
	}
}

// TestE2EBlockedDM 测试屏蔽后 DM 被拦截。
func TestE2EBlockedDM(t *testing.T) {
	srv := newE2EServer(t)

	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	bob := e2eDial(t, srv.wsURL())
	defer bob.Close()
	bob.joinAs("bob")

	// Bob 屏蔽 Alice。
	bob.send(hub.Message{Type: "block", Username: "alice"})
	bob.drainUntil("block", 5*time.Second)

	// Alice 尝试给 Bob 发 DM（被屏蔽，不会收到回显）。
	alice.send(hub.Message{
		Type:    "dm_message",
		Content: "Bob 你在吗？",
		To:      "bob",
	})

	// Bob 不应收到 DM（被屏蔽拦截）。设置短超时直接读取。
	bob.SetReadDeadline(time.Now().Add(1 * time.Second))
	_, _, err := bob.ReadMessage()
	if err == nil {
		t.Error("Bob 收到了消息，但应被屏蔽拦截")
	} else {
		t.Logf("Bob 未收到 Alice 的 DM（符合预期）: %v", err)
	}

	// 验证 Alice 的连接仍然正常。
	alice.send(hub.Message{Type: "message", Content: "验证连接"})
	verify := alice.drainUntil("message", 5*time.Second)
	if verify.Content != "验证连接" {
		t.Errorf("Alice 连接异常: %s", verify.Content)
	}
}

// TestE2EConcurrentMessages 测试并发消息处理。
func TestE2EConcurrentMessages(t *testing.T) {
	srv := newE2EServer(t)

	const numUsers = 3
	users := make([]*e2eConn, numUsers)
	for i := 0; i < numUsers; i++ {
		conn := e2eDial(t, srv.wsURL())
		defer conn.Close()
		name := fmt.Sprintf("user%d", i)
		conn.joinAs(name)
		users[i] = conn
	}

	// 所有用户并发发消息。
	var wg sync.WaitGroup
	for i, conn := range users {
		wg.Add(1)
		go func(idx int, c *e2eConn) {
			defer wg.Done()
			for j := 0; j < 3; j++ {
				c.send(hub.Message{
					Type:    "message",
					Content: fmt.Sprintf("user%d 消息 %d", idx, j),
				})
				time.Sleep(250 * time.Millisecond) // 限速
			}
		}(i, conn)
	}
	wg.Wait()

	// 等待消息传播。
	time.Sleep(1 * time.Second)

	// 用新连接验证服务仍正常运行。
	verifier := e2eDial(t, srv.wsURL())
	defer verifier.Close()
	verifier.joinAs("verifier")
	verifier.send(hub.Message{Type: "message", Content: "最终验证消息"})
	verify := verifier.drainUntil("message", 5*time.Second)
	if verify.Content != "最终验证消息" {
		t.Errorf("最终验证失败: %s", verify.Content)
	}
}

// TestE2EPinning 测试消息置顶功能。
func TestE2EPinning(t *testing.T) {
	srv := newE2EServer(t)

	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	// 发消息。
	alice.send(hub.Message{Type: "message", Content: "置顶这条消息"})
	msg := alice.drainUntil("message", 5*time.Second)

	// 置顶。
	alice.send(hub.Message{Type: "pin_message", ID: msg.ID})
	pinned := alice.drainUntil("pinned", 5*time.Second)
	if !pinned.Pinned {
		t.Error("期望 pinned=true")
	}

	// 取消置顶。
	alice.send(hub.Message{Type: "unpin_message", ID: msg.ID})
	unpinned := alice.drainUntil("unpinned", 5*time.Second)
	if unpinned.Type != "unpinned" {
		t.Errorf("期望 unpinned，实际: %s", unpinned.Type)
	}
}

// TestE2EReadReceipt 测试已读回执。
func TestE2EReadReceipt(t *testing.T) {
	srv := newE2EServer(t)

	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	bob := e2eDial(t, srv.wsURL())
	defer bob.Close()
	bob.joinAs("bob")

	// Alice 标记已读 Bob 的 DM。
	alice.send(hub.Message{Type: "mark_read", Context: "dm", To: "bob"})

	receipt := bob.drainUntil("read_receipt", 5*time.Second)
	if receipt.From != "alice" {
		t.Errorf("期望来自 alice 的 read_receipt，实际 from=%s", receipt.From)
	}
}

// TestE2ETypingIndicator 测试打字指示器。
func TestE2ETypingIndicator(t *testing.T) {
	srv := newE2EServer(t)

	alice := e2eDial(t, srv.wsURL())
	defer alice.Close()
	alice.joinAs("alice")

	bob := e2eDial(t, srv.wsURL())
	defer bob.Close()
	bob.joinAs("bob")

	// 打字指示器是广播的（不发给发送者）。验证连接不中断。
	alice.send(hub.Message{Type: "typing_start", Context: "public"})
	alice.send(hub.Message{Type: "typing_stop"})

	// 发一条消息验证连接正常。
	alice.send(hub.Message{Type: "message", Content: "连接正常"})
	msg := alice.drainUntil("message", 5*time.Second)
	if msg.Content != "连接正常" {
		t.Errorf("连接可能异常: %s", msg.Content)
	}
}
