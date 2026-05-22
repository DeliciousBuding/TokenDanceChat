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

  describe("reactions", () => {
    it("updates message reactions", () => {
      useChatStore.getState().addMessage({
        id: "1", username: "A", content: "hi", timestamp: 1,
      });
      useChatStore.getState().updateMessageReactions("1", { "👍": ["Alice", "Bob"] });
      expect(useChatStore.getState().messages[0].reactions?.["👍"]).toHaveLength(2);
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
  });
});
