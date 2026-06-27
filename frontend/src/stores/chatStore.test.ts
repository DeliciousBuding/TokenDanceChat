import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "@/stores/chatStore";

describe("chatStore", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  describe("connection state", () => {
    it("starts at chat view", () => {
      expect(useChatStore.getState().view).toBe("chat");
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

    it("deduplicates messages by persisted id", () => {
      useChatStore.getState().addMessage({
        id: "persisted-1", username: "webhook", content: "Deploy finished", timestamp: 1000,
      });
      useChatStore.getState().addMessage({
        id: "persisted-1", username: "webhook", content: "Deploy finished", timestamp: 1000,
      });

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe("persisted-1");
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

    it("keeps legacy targeted messages in the public preview bucket only", () => {
      useChatStore.getState().setUsername("Alice");
      useChatStore.getState().addMessage({
        id: "legacy-dm",
        username: "Alice",
        from: "Alice",
        to: "Bob",
        content: "Old targeted payload",
        timestamp: 1000,
      });
      useChatStore.getState().addMessage({
        id: "legacy-group",
        username: "Carol",
        group: "DevTeam",
        content: "Old group payload",
        timestamp: 2000,
      });

      const previews = useChatStore.getState().lastPreviews;
      expect(previews.public.content).toBe("Old group payload");
      expect(Object.keys(previews)).toEqual(["public"]);
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
    it("increments and clears public unread", () => {
      useChatStore.getState().incrementConversationUnread("public");
      useChatStore.getState().incrementConversationUnread("public");
      expect(useChatStore.getState().unreadByConversation.public).toBe(2);

      useChatStore.getState().clearConversationUnread("public");
      expect(useChatStore.getState().unreadByConversation.public).toBeUndefined();
    });

    it("clearAllConversationUnreads wipes everything", () => {
      useChatStore.getState().incrementConversationUnread("public");
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
    it("marks own messages as read in lookup map", () => {
      useChatStore.getState().setUsername("Me");
      useChatStore.getState().addMessage({
        id: "1", username: "Me", content: "hi", timestamp: 1,
      });
      useChatStore.getState().markMessagesReadBy("Alice");
      expect(useChatStore.getState().readByMessageId["1"]).toContain("Alice");
    });

    it("does not mark others messages as read", () => {
      useChatStore.getState().setUsername("Me");
      useChatStore.getState().addMessage({
        id: "1", username: "Bob", content: "hi", timestamp: 1,
      });
      useChatStore.getState().markMessagesReadBy("Alice");
      expect(useChatStore.getState().readByMessageId["1"]).toBeUndefined();
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

  describe("reactions", () => {
    it("updates message reactions in lookup map", () => {
      useChatStore.getState().addMessage({
        id: "1", username: "A", content: "hi", timestamp: 1,
      });
      useChatStore.getState().updateMessageReactions("1", { "👍": ["Alice", "Bob"] });
      expect(useChatStore.getState().reactionsByMessageId["1"]?.["👍"]).toHaveLength(2);
    });
  });

  describe("setCurrentChat", () => {
    it("coerces legacy DM input to public chat", () => {
      useChatStore.getState().setCurrentChat({ type: "dm", username: "Bob" });
      expect(useChatStore.getState().currentChat).toEqual({ type: "public" });
    });

    it("coerces legacy group input to public chat", () => {
      useChatStore.getState().setCurrentChat({ type: "group", name: "DevTeam" });
      expect(useChatStore.getState().currentChat).toEqual({ type: "public" });
    });

    it("keeps public chat for public input", () => {
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
      expect(s.view).toBe("chat");
    });

    it("resets all current lightweight chat state fields", () => {
      useChatStore.getState().setUsername("Alice");
      useChatStore.getState().setConnected(true);
      useChatStore.getState().setView("chat");
      useChatStore.getState().addBlockedUser("Spammer");
      useChatStore.getState().setPinnedMessages([
        { id: "p1", username: "Mod", content: "Rules", timestamp: 1 },
      ]);
      useChatStore.getState().setUnreadCount(5);
      useChatStore.getState().incrementConversationUnread("public");

      useChatStore.getState().reset();
      const s = useChatStore.getState();
      expect(s.view).toBe("chat");
      expect(s.username).toBe("");
      expect(s.connected).toBe(false);
      expect(s.messages).toHaveLength(0);
      expect(s.blockedUsers).toHaveLength(0);
      expect(s.pinnedMessages).toHaveLength(0);
      expect(s.unreadCount).toBe(0);
      expect(Object.keys(s.unreadByConversation)).toHaveLength(0);
      expect(s.currentChat).toEqual({ type: "public" });
      expect(s.replyTo).toBeNull();
    });
  });

  describe("OIDC auth state", () => {
    it("starts with oidcAuthenticated=false", () => {
      const s = useChatStore.getState();
      expect(s.oidcAuthenticated).toBe(false);
      expect(s.oidcAccessToken).toBeNull();
      expect(s.oidcRefreshToken).toBeNull();
    });

    it("setOidcAuth sets tokens and authenticated flag", () => {
      useChatStore.getState().setOidcAuth("access-abc", "refresh-xyz");
      const s = useChatStore.getState();
      expect(s.oidcAuthenticated).toBe(true);
      expect(s.oidcAccessToken).toBe("access-abc");
      expect(s.oidcRefreshToken).toBe("refresh-xyz");
    });

    it("clearOidcAuth clears tokens and authenticated flag", () => {
      useChatStore.getState().setOidcAuth("access", "refresh");
      useChatStore.getState().clearOidcAuth();
      const s = useChatStore.getState();
      expect(s.oidcAuthenticated).toBe(false);
      expect(s.oidcAccessToken).toBeNull();
      expect(s.oidcRefreshToken).toBeNull();
    });

    it("reset clears OIDC state", () => {
      useChatStore.getState().setOidcAuth("access", "refresh");
      useChatStore.getState().reset();
      const s = useChatStore.getState();
      expect(s.oidcAuthenticated).toBe(false);
      expect(s.oidcAccessToken).toBeNull();
      expect(s.oidcRefreshToken).toBeNull();
    });
  });

  describe("lastReadTimestamps", () => {
    it("markConversationRead sets timestamp for a conversation key", () => {
      const before = Date.now();
      useChatStore.getState().markConversationRead("public");
      const ts = useChatStore.getState().lastReadTimestamps.public;
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(Date.now());
    });

    it("clearConversationUnread also sets lastReadTimestamp when unreads exist", () => {
      useChatStore.getState().incrementConversationUnread("public");
      useChatStore.getState().clearConversationUnread("public");
      expect(useChatStore.getState().lastReadTimestamps["public"]).toBeGreaterThan(0);
      expect(useChatStore.getState().unreadByConversation["public"]).toBeUndefined();
    });

    it("reset clears lastReadTimestamps", () => {
      useChatStore.getState().markConversationRead("public");
      expect(useChatStore.getState().lastReadTimestamps["public"]).toBeGreaterThan(0);
      useChatStore.getState().reset();
      expect(Object.keys(useChatStore.getState().lastReadTimestamps)).toHaveLength(0);
    });

    it("persists lastReadTimestamps across state changes", () => {
      useChatStore.getState().setUsername("Alice");
      useChatStore.getState().markConversationRead("public");
      const stored = JSON.parse(localStorage.getItem("tokendance:lastReadTimestamps:Alice") || "{}");
      expect(stored.public).toBeGreaterThan(0);
    });
  });

  describe("legacy chat input cleanup", () => {
    it("keeps currentChat public when old DM inputs arrive", () => {
      useChatStore.getState().setUsername("Alice");
      useChatStore.getState().setCurrentChat({ type: "dm", username: "Bob" });
      useChatStore.getState().setCurrentChat({ type: "dm", username: "Charlie" });
      const s = useChatStore.getState();
      expect(s.currentChat).toEqual({ type: "public" });
      expect(s.lastReadTimestamps.public).toBeGreaterThan(0);
    });

    it("keeps currentChat public when old group inputs arrive", () => {
      useChatStore.getState().setUsername("Alice");
      useChatStore.getState().setCurrentChat({ type: "group", name: "DevTeam" });
      useChatStore.getState().setCurrentChat({ type: "public" });
      const s = useChatStore.getState();
      expect(s.currentChat).toEqual({ type: "public" });
      expect(s.lastReadTimestamps["public"]).toBeGreaterThan(0);
    });

    });

    describe("addMessage edge cases", () => {
    it("deduplicates repeated messages by persisted id", () => {
      useChatStore.getState().addMessage({
        id: "dup-1", username: "Alice", content: "first", timestamp: 1000,
      });
      useChatStore.getState().addMessage({
        id: "dup-1", username: "Alice", content: "second", timestamp: 2000,
      });
      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].id).toBe("dup-1");
      expect(msgs[0].content).toBe("first");
    });

    it("stores a message with all optional fields set", () => {
      useChatStore.getState().addMessage({
        id: "full-1",
        username: "Alice",
        content: "Check this out",
        timestamp: 5000,
        room_id: "room-1",
        edited: true,
        reactions: { "👍": ["Bob"], "❤️": ["Charlie"] },
        reply_to_id: "msg-99",
        reply_to_content: "original message",
        reply_to_user: "Bob",
        deleted: false,
        to: "Charlie",
        from: "Alice",
        group: "DevTeam",
        read_by: ["Charlie", "Dave"],
        subtype: "file_share",
        poll: {
          id: "poll-1",
          room_id: "room-1",
          creator: "Alice",
          question: "Pizza or tacos?",
          options: ["Pizza", "Tacos"],
          multiple_choice: false,
          is_anonymous: true,
          is_closed: false,
          votes: { 0: 1, 1: 2 },
          voters: { 0: ["Alice"], 1: ["Bob", "Charlie"] },
          created_at: 4000,
        },
        thread_id: "thread-1",
        mention_all: true,
      });
      const msg = useChatStore.getState().messages[0];
      expect(msg.id).toBe("full-1");
      expect(msg.reply_to_id).toBe("msg-99");
      expect(msg.reply_to_user).toBe("Bob");
      expect(msg.subtype).toBe("file_share");
      expect(msg.thread_id).toBe("thread-1");
      expect(msg.mention_all).toBe(true);
      expect(msg.poll?.question).toBe("Pizza or tacos?");
    });
  });

  describe("typing users", () => {
    it("adds a typing user", () => {
      useChatStore.getState().addTypingUser("Alice");
      expect(useChatStore.getState().typingUsers).toContain("Alice");
    });

    it("does not duplicate a typing user", () => {
      useChatStore.getState().addTypingUser("Alice");
      useChatStore.getState().addTypingUser("Alice");
      expect(useChatStore.getState().typingUsers).toHaveLength(1);
    });

    it("adds multiple distinct typing users", () => {
      useChatStore.getState().addTypingUser("Alice");
      useChatStore.getState().addTypingUser("Bob");
      useChatStore.getState().addTypingUser("Charlie");
      expect(useChatStore.getState().typingUsers).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("removes a typing user", () => {
      useChatStore.getState().addTypingUser("Alice");
      useChatStore.getState().addTypingUser("Bob");
      useChatStore.getState().removeTypingUser("Alice");
      expect(useChatStore.getState().typingUsers).toEqual(["Bob"]);
    });

    it("removeTypingUser is a no-op for non-typing users", () => {
      useChatStore.getState().addTypingUser("Alice");
      useChatStore.getState().removeTypingUser("Bob");
      expect(useChatStore.getState().typingUsers).toEqual(["Alice"]);
    });

    it("setTypingUsers replaces the entire list", () => {
      useChatStore.getState().addTypingUser("Alice");
      useChatStore.getState().setTypingUsers(["Bob", "Charlie"]);
      expect(useChatStore.getState().typingUsers).toEqual(["Bob", "Charlie"]);
    });

    it("reset clears typing users", () => {
      useChatStore.getState().addTypingUser("Alice");
      useChatStore.getState().addTypingUser("Bob");
      useChatStore.getState().reset();
      expect(useChatStore.getState().typingUsers).toHaveLength(0);
    });
  });

  describe("user status", () => {
    it("sets the full user status list", () => {
      const statuses = [
        { username: "Alice", online: true, last_seen: 1000 },
        { username: "Bob", online: false, last_seen: 500 },
      ];
      useChatStore.getState().setUserStatusList(statuses);
      expect(useChatStore.getState().userStatusList).toHaveLength(2);
      expect(useChatStore.getState().userStatusList[0].username).toBe("Alice");
      expect(useChatStore.getState().userStatusList[0].online).toBe(true);
      expect(useChatStore.getState().userStatusList[1].online).toBe(false);
    });

    it("setUserStatusList with empty array clears the list", () => {
      useChatStore.getState().setUserStatusList([
        { username: "Alice", online: true, last_seen: 1000 },
      ]);
      useChatStore.getState().setUserStatusList([]);
      expect(useChatStore.getState().userStatusList).toHaveLength(0);
    });

    it("updates a user profile status", () => {
      useChatStore.getState().setUserProfile({
        username: "Alice",
        display_name: "Alice",
        avatar_url: "",
        bio: "",
        status: "online",
        last_seen: 1000,
        created_at: 500,
      });
      useChatStore.getState().updateUserProfileStatus("Alice", "away");
      expect(useChatStore.getState().userProfiles["Alice"].status).toBe("away");
    });

    it("updateUserProfileStatus is a no-op for unknown users", () => {
      useChatStore.getState().updateUserProfileStatus("Nobody", "online");
      expect(useChatStore.getState().userProfiles["Nobody"]).toBeUndefined();
    });
  });

  describe("poll management", () => {
    const samplePoll = {
      id: "poll-1",
      room_id: "room-1",
      creator: "Alice",
      question: "Favorite color?",
      options: ["Red", "Blue", "Green"],
      multiple_choice: true,
      is_anonymous: false,
      is_closed: false,
      votes: { 0: 2, 1: 1, 2: 0 },
      voters: { 0: ["Alice", "Bob"], 1: ["Charlie"] },
      created_at: 1000,
    };

    it("updatePoll adds a new poll to the store", () => {
      useChatStore.getState().updatePoll("poll-1", samplePoll);
      expect(useChatStore.getState().polls["poll-1"]).toEqual(samplePoll);
    });

    it("updatePoll overwrites an existing poll", () => {
      useChatStore.getState().updatePoll("poll-1", samplePoll);
      const updated = { ...samplePoll, is_closed: true };
      useChatStore.getState().updatePoll("poll-1", updated);
      expect(useChatStore.getState().polls["poll-1"].is_closed).toBe(true);
    });

    it("updatePoll supports multiple distinct polls", () => {
      useChatStore.getState().updatePoll("poll-1", samplePoll);
      useChatStore.getState().updatePoll("poll-2", { ...samplePoll, id: "poll-2" });
      expect(Object.keys(useChatStore.getState().polls)).toHaveLength(2);
      expect(useChatStore.getState().polls["poll-1"].id).toBe("poll-1");
      expect(useChatStore.getState().polls["poll-2"].id).toBe("poll-2");
    });

    it("removePoll deletes a poll by ID", () => {
      useChatStore.getState().updatePoll("poll-1", samplePoll);
      useChatStore.getState().updatePoll("poll-2", { ...samplePoll, id: "poll-2" });
      useChatStore.getState().removePoll("poll-1");
      expect(useChatStore.getState().polls["poll-1"]).toBeUndefined();
      expect(useChatStore.getState().polls["poll-2"]).toBeDefined();
    });

    it("removePoll is a no-op for unknown poll IDs", () => {
      useChatStore.getState().updatePoll("poll-1", samplePoll);
      useChatStore.getState().removePoll("nonexistent");
      expect(useChatStore.getState().polls["poll-1"]).toBeDefined();
      expect(Object.keys(useChatStore.getState().polls)).toHaveLength(1);
    });

    it("reset clears all polls", () => {
      useChatStore.getState().updatePoll("poll-1", samplePoll);
      useChatStore.getState().updatePoll("poll-2", { ...samplePoll, id: "poll-2" });
      useChatStore.getState().reset();
      expect(Object.keys(useChatStore.getState().polls)).toHaveLength(0);
    });
  });

  describe("blocked users advanced", () => {
    it("setBlockedUsers replaces the entire list", () => {
      useChatStore.getState().addBlockedUser("Spammer1");
      useChatStore.getState().addBlockedUser("Spammer2");
      useChatStore.getState().setBlockedUsers(["Troll"]);
      expect(useChatStore.getState().blockedUsers).toEqual(["Troll"]);
    });

    it("setBlockedUsers with empty array clears all blocks", () => {
      useChatStore.getState().addBlockedUser("Spammer");
      useChatStore.getState().setBlockedUsers([]);
      expect(useChatStore.getState().blockedUsers).toHaveLength(0);
    });

    it("unblockUser is an alias for removeBlockedUser", () => {
      useChatStore.getState().addBlockedUser("Spammer");
      useChatStore.getState().removeBlockedUser("Spammer");
      expect(useChatStore.getState().blockedUsers).not.toContain("Spammer");
    });

    it("isBlocked check works via addMessage filtering", () => {
      useChatStore.getState().addBlockedUser("Spammer");
      useChatStore.getState().addMessage({
        id: "1", username: "Spammer", content: "Buy now!", timestamp: 1000,
      });
      useChatStore.getState().addMessage({
        id: "2", username: "Friend", content: "Hello!", timestamp: 2000,
      });
      // Spammer's message should be filtered out, Friend's message should remain
      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].username).toBe("Friend");
    });

    it("resets clears blocked users", () => {
      useChatStore.getState().addBlockedUser("A");
      useChatStore.getState().addBlockedUser("B");
      useChatStore.getState().reset();
      expect(useChatStore.getState().blockedUsers).toHaveLength(0);
    });
  });
});
