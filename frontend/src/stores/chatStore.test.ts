import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "@/stores/chatStore";

describe("chatStore", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  describe("connection state", () => {
    it("starts at join view", () => {
      expect(useChatStore.getState().view).toBe("join");
    });

    it("sets username", () => {
      useChatStore.getState().setUsername("Alice");
      expect(useChatStore.getState().username).toBe("Alice");
    });

    it("sets connected", () => {
      useChatStore.getState().setConnected(true);
      expect(useChatStore.getState().connected).toBe(true);
    });
  });

  describe("messages", () => {
    it("adds a message", () => {
      useChatStore.getState().addMessage({
        id: "1", username: "Bob", content: "Hello", timestamp: 1000,
      });
      expect(useChatStore.getState().messages).toHaveLength(1);
      expect(useChatStore.getState().messages[0].content).toBe("Hello");
    });

    it("filters blocked user messages", () => {
      useChatStore.getState().addBlockedUser("Bob");
      useChatStore.getState().addMessage({
        id: "1", username: "Bob", content: "spam", timestamp: 1000,
      });
      expect(useChatStore.getState().messages).toHaveLength(0);
    });

    it("caps messages at 500", () => {
      for (let i = 0; i < 600; i++) {
        useChatStore.getState().addMessage({
          id: String(i), username: "U", content: "x", timestamp: i,
        });
      }
      expect(useChatStore.getState().messages.length).toBeLessThanOrEqual(500);
    });

    it("deletes a message", () => {
      useChatStore.getState().addMessage({
        id: "1", username: "A", content: "hi", timestamp: 1,
      });
      useChatStore.getState().deleteMessage("1");
      expect(useChatStore.getState().messages).toHaveLength(0);
    });

    it("edits message in place", () => {
      useChatStore.getState().addMessage({
        id: "1", username: "A", content: "old", timestamp: 1,
      });
      useChatStore.getState().editMessageInPlace("1", "new");
      const msg = useChatStore.getState().messages[0];
      expect(msg.content).toBe("new");
      expect(msg.edited).toBe(true);
    });
  });

  describe("history", () => {
    it("setHistory merges without duplicating", () => {
      useChatStore.getState().addMessage({
        id: "1", username: "A", content: "existing", timestamp: 1,
      });
      useChatStore.getState().setHistory([
        { id: "1", username: "A", content: "existing", timestamp: 1 },
        { id: "2", username: "B", content: "new", timestamp: 2 },
      ]);
      expect(useChatStore.getState().messages).toHaveLength(2);
    });

    it("prependHistory adds older messages first", () => {
      useChatStore.getState().addMessage({
        id: "2", username: "B", content: "later", timestamp: 2,
      });
      useChatStore.getState().prependHistory([
        { id: "1", username: "A", content: "earlier", timestamp: 1 },
      ]);
      const msgs = useChatStore.getState().messages;
      expect(msgs[0].id).toBe("1");
      expect(msgs[1].id).toBe("2");
    });
  });

  describe("unread tracking", () => {
    it("increments and clears per-conversation unread", () => {
      useChatStore.getState().incrementConversationUnread("dm:Alice");
      useChatStore.getState().incrementConversationUnread("dm:Alice");
      expect(useChatStore.getState().unreadByConversation["dm:Alice"]).toBe(2);

      useChatStore.getState().clearConversationUnread("dm:Alice");
      expect(useChatStore.getState().unreadByConversation["dm:Alice"]).toBeUndefined();
    });

    it("clearAllConversationUnreads wipes everything", () => {
      useChatStore.getState().incrementConversationUnread("public");
      useChatStore.getState().incrementConversationUnread("dm:Bob");
      useChatStore.getState().clearAllConversationUnreads();
      expect(Object.keys(useChatStore.getState().unreadByConversation)).toHaveLength(0);
    });
  });

  describe("blocking", () => {
    it("adds and removes blocked users", () => {
      useChatStore.getState().addBlockedUser("Spammer");
      expect(useChatStore.getState().blockedUsers).toContain("Spammer");

      useChatStore.getState().removeBlockedUser("Spammer");
      expect(useChatStore.getState().blockedUsers).not.toContain("Spammer");
    });

    it("does not duplicate blocked users", () => {
      useChatStore.getState().addBlockedUser("X");
      useChatStore.getState().addBlockedUser("X");
      expect(useChatStore.getState().blockedUsers).toHaveLength(1);
    });
  });

  describe("pinning", () => {
    it("sets pinned messages", () => {
      const pinned = [
        { id: "1", username: "A", content: "important", timestamp: 1 },
      ];
      useChatStore.getState().setPinnedMessages(pinned);
      expect(useChatStore.getState().pinnedMessages).toHaveLength(1);
    });
  });

  describe("read receipts", () => {
    it("marks own messages as read", () => {
      useChatStore.getState().setUsername("Me");
      useChatStore.getState().addMessage({
        id: "1", username: "Me", content: "hi", timestamp: 1,
      });
      useChatStore.getState().markMessagesReadBy("Alice");
      const msg = useChatStore.getState().messages[0];
      expect(msg.read_by).toContain("Alice");
    });

    it("does not mark others messages as read", () => {
      useChatStore.getState().setUsername("Me");
      useChatStore.getState().addMessage({
        id: "1", username: "Bob", content: "hi", timestamp: 1,
      });
      useChatStore.getState().markMessagesReadBy("Alice");
      const msg = useChatStore.getState().messages[0];
      expect(msg.read_by).toBeUndefined();
    });
  });

  describe("mentions", () => {
    it("stores latest mention", () => {
      useChatStore.getState().setLatestMention({
        from: "Alice", content: "@Me check this", messageId: "m1", timestamp: 1,
      });
      expect(useChatStore.getState().latestMention?.from).toBe("Alice");
    });

    it("clears latest mention", () => {
      useChatStore.getState().setLatestMention({
        from: "A", content: "x", messageId: "m1", timestamp: 1,
      });
      useChatStore.getState().setLatestMention(null);
      expect(useChatStore.getState().latestMention).toBeNull();
    });
  });

  describe("friends and groups", () => {
    it("adds friend request", () => {
      useChatStore.getState().addFriendRequest("Charlie");
      expect(useChatStore.getState().pendingFriendRequests).toHaveLength(1);
      expect(useChatStore.getState().pendingFriendRequests[0].from).toBe("Charlie");
    });

    it("adds and removes group invites", () => {
      useChatStore.getState().addGroupInvite("DevTeam", "Alice");
      expect(useChatStore.getState().pendingGroupInvites).toHaveLength(1);

      useChatStore.getState().removeGroupInvite("DevTeam");
      expect(useChatStore.getState().pendingGroupInvites).toHaveLength(0);
    });

    it("sets group members", () => {
      useChatStore.getState().setGroupMembers("Team", ["A", "B"]);
      expect(useChatStore.getState().groups["Team"].members).toEqual(["A", "B"]);
    });

    it("sets friends", () => {
      useChatStore.getState().setFriends(["Alice", "Bob"]);
      expect(useChatStore.getState().friends).toHaveLength(2);
    });
  });

  describe("group webhooks", () => {
    it("stores webhook lists without secrets", () => {
      useChatStore.getState().setGroupWebhooks("Team", [
        {
          id: "wh-1",
          group_name: "Team",
          url: "wh-path",
          created_by: "Alice",
          created_at: 1000,
        },
      ]);

      expect(useChatStore.getState().groupWebhooks.Team).toEqual([
        {
          id: "wh-1",
          group_name: "Team",
          url: "wh-path",
          created_by: "Alice",
          created_at: 1000,
        },
      ]);
    });

    it("keeps a newly created webhook secret only in the one-time field", () => {
      useChatStore.getState().addGroupWebhook("Team", {
        id: "wh-1",
        group_name: "Team",
        url: "wh-path",
        secret: "secret-once",
        created_by: "Alice",
        created_at: 1000,
      });

      expect(useChatStore.getState().latestCreatedWebhook?.secret).toBe("secret-once");
      expect(useChatStore.getState().groupWebhooks.Team[0]).not.toHaveProperty("secret");

      useChatStore.getState().clearLatestCreatedWebhook();
      expect(useChatStore.getState().latestCreatedWebhook).toBeNull();
    });

    it("removes webhooks and clears matching one-time secret", () => {
      useChatStore.getState().addGroupWebhook("Team", {
        id: "wh-1",
        group_name: "Team",
        url: "wh-path",
        secret: "secret-once",
        created_by: "Alice",
        created_at: 1000,
      });

      useChatStore.getState().removeGroupWebhook("Team", "wh-1");

      expect(useChatStore.getState().groupWebhooks.Team).toHaveLength(0);
      expect(useChatStore.getState().latestCreatedWebhook).toBeNull();
    });

    it("rotates a webhook secret: new secret goes to one-time field, list never contains secrets", () => {
      useChatStore.getState().setGroupWebhooks("Team", [
        {
          id: "wh-1",
          group_name: "Team",
          url: "wh-path",
          created_by: "Alice",
          created_at: 1000,
        },
      ]);

      useChatStore.getState().rotateGroupWebhookSecret("Team", {
        id: "wh-1",
        group_name: "Team",
        url: "wh-path",
        secret: "rotated-secret-once",
        created_by: "Alice",
        created_at: 1000,
        rotated_at: 3000,
        rotated_by: "Bob",
      });

      expect(useChatStore.getState().latestCreatedWebhook?.secret).toBe("rotated-secret-once");
      const rotated = useChatStore.getState().groupWebhooks.Team[0];
      expect(rotated).not.toHaveProperty("secret");
      expect(rotated.rotated_at).toBe(3000);
      expect(rotated.rotated_by).toBe("Bob");
    });

    it("stores audit logs per group and resets them", () => {
      useChatStore.getState().setGroupWebhookAuditLogs("Team", [
        {
          id: "audit-1",
          webhook_id: "wh-1",
          group_name: "Team",
          action: "created",
          actor: "Alice",
          created_at: 1000,
        },
      ]);

      expect(useChatStore.getState().groupWebhookAuditLogs.Team).toHaveLength(1);
      expect(useChatStore.getState().groupWebhookAuditLogs.Team[0].action).toBe("created");

      useChatStore.getState().reset();
      expect(useChatStore.getState().groupWebhookAuditLogs).toEqual({});
    });

    it("audit log entries never contain secret fields", () => {
      useChatStore.getState().setGroupWebhookAuditLogs("Team", [
        {
          id: "audit-1",
          webhook_id: "wh-1",
          group_name: "Team",
          action: "rotated",
          actor: "Alice",
          created_at: 1000,
        } as any,
      ]);

      const logs = useChatStore.getState().groupWebhookAuditLogs.Team;
      expect(logs[0]).not.toHaveProperty("secret");
      expect(logs[0]).not.toHaveProperty("hash");
      expect(logs[0]).not.toHaveProperty("metadata");
    });
  });

  describe("reactions", () => {
    it("updates message reactions", () => {
      useChatStore.getState().addMessage({
        id: "1", username: "A", content: "hi", timestamp: 1,
      });
      useChatStore.getState().updateMessageReactions("1", { "👍": ["Alice", "Bob"] });
      expect(useChatStore.getState().messages[0].reactions?.["👍"]).toHaveLength(2);
    });
  });

  describe("pendingImage", () => {
    it("sets pendingImage", () => {
      useChatStore.getState().setPendingImage("data:image/png;base64,abc123");
      expect(useChatStore.getState().pendingImage).toBe("data:image/png;base64,abc123");
    });

    it("clears pendingImage when switching chats via setCurrentChat", () => {
      useChatStore.getState().setPendingImage("data:image/png;base64,abc123");
      expect(useChatStore.getState().pendingImage).toBe("data:image/png;base64,abc123");

      useChatStore.getState().setCurrentChat({ type: "dm", username: "Alice" });
      expect(useChatStore.getState().pendingImage).toBeNull();
      expect(useChatStore.getState().currentChat).toEqual({ type: "dm", username: "Alice" });
    });

    it("setPendingImage(null) clears the image", () => {
      useChatStore.getState().setPendingImage("data:image/png;base64,abc123");
      useChatStore.getState().setPendingImage(null);
      expect(useChatStore.getState().pendingImage).toBeNull();
    });
  });

  describe("setCurrentChat", () => {
    it("switches to DM chat", () => {
      useChatStore.getState().setCurrentChat({ type: "dm", username: "Bob" });
      expect(useChatStore.getState().currentChat).toEqual({ type: "dm", username: "Bob" });
    });

    it("switches to group chat", () => {
      useChatStore.getState().setCurrentChat({ type: "group", name: "DevTeam" });
      expect(useChatStore.getState().currentChat).toEqual({ type: "group", name: "DevTeam" });
    });

    it("switches to public chat", () => {
      useChatStore.getState().setCurrentChat({ type: "dm", username: "Bob" });
      useChatStore.getState().setCurrentChat({ type: "public" });
      expect(useChatStore.getState().currentChat).toEqual({ type: "public" });
    });
  });

  describe("prependHistory cap", () => {
    it("caps prependHistory at 1000 messages", () => {
      // Add 600 messages first
      for (let i = 0; i < 600; i++) {
        useChatStore.getState().addMessage({
          id: `existing-${i}`, username: "U", content: "x", timestamp: i,
        });
      }
      expect(useChatStore.getState().messages).toHaveLength(500); // addMessage caps at 500

      // Prepend 600 older messages (unique IDs)
      const oldMessages = [];
      for (let i = 0; i < 600; i++) {
        oldMessages.push({
          id: `old-${i}`, username: "Archive", content: "history", timestamp: -600 + i,
        });
      }
      useChatStore.getState().prependHistory(oldMessages);
      // 500 existing + 600 new = 1100, capped at 1000
      expect(useChatStore.getState().messages.length).toBeLessThanOrEqual(1000);
      // First message should be an old one (prepended)
      expect(useChatStore.getState().messages[0].id).toBe("old-0");
    });

    it("prependHistory with no new messages returns state unchanged", () => {
      useChatStore.getState().addMessage({
        id: "1", username: "U", content: "x", timestamp: 1,
      });
      const msgsBefore = useChatStore.getState().messages;
      // Prepend same message (no new IDs)
      useChatStore.getState().prependHistory([
        { id: "1", username: "U", content: "x", timestamp: 1 },
      ]);
      expect(useChatStore.getState().messages).toBe(msgsBefore);
    });
  });

  describe("reset", () => {
    it("resets to initial state", () => {
      useChatStore.getState().setUsername("Test");
      useChatStore.getState().setConnected(true);
      useChatStore.getState().addMessage({ id: "1", username: "X", content: "x", timestamp: 1 });
      useChatStore.getState().reset();
      const s = useChatStore.getState();
      expect(s.username).toBe("");
      expect(s.connected).toBe(false);
      expect(s.messages).toHaveLength(0);
      expect(s.view).toBe("join");
    });

    it("resets all state fields including pendingImage, friends, groups", () => {
      useChatStore.getState().setUsername("Alice");
      useChatStore.getState().setConnected(true);
      useChatStore.getState().setView("chat");
      useChatStore.getState().setPendingImage("data:image/png;base64,test");
      useChatStore.getState().setFriends(["Bob", "Charlie"]);
      useChatStore.getState().addFriendRequest("Dave");
      useChatStore.getState().addGroupInvite("Team", "Eve");
      useChatStore.getState().addBlockedUser("Spammer");
      useChatStore.getState().setPinnedMessages([
        { id: "p1", username: "Mod", content: "Rules", timestamp: 1 },
      ]);
      useChatStore.getState().setUnreadCount(5);
      useChatStore.getState().incrementConversationUnread("public");

      useChatStore.getState().reset();
      const s = useChatStore.getState();
      expect(s.view).toBe("join");
      expect(s.username).toBe("");
      expect(s.connected).toBe(false);
      expect(s.messages).toHaveLength(0);
      expect(s.pendingImage).toBeNull();
      expect(s.friends).toHaveLength(0);
      expect(s.pendingFriendRequests).toHaveLength(0);
      expect(s.pendingGroupInvites).toHaveLength(0);
      expect(s.blockedUsers).toHaveLength(0);
      expect(s.pinnedMessages).toHaveLength(0);
      expect(s.unreadCount).toBe(0);
      expect(Object.keys(s.unreadByConversation)).toHaveLength(0);
      expect(s.currentChat).toEqual({ type: "public" });
      expect(s.replyTo).toBeNull();
    });
  });
});
