import { describe, it, expect } from "vitest";
import { mergeMessageWindow } from "@/stores/mergeMessageWindow";
import type { ChatMessage } from "@/lib/api";

function msg(id: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    username: "alice",
    content: "hello",
    timestamp: 1000,
    ...overrides,
  };
}

describe("mergeMessageWindow", () => {
  describe("append", () => {
    it("appends new messages at the end", () => {
      const current = [msg("1", { timestamp: 1 })];
      const r = mergeMessageWindow(current, [msg("2", { timestamp: 2 })], "append", 500);
      expect(r.messages).toHaveLength(2);
      expect(r.messages[0].id).toBe("1");
      expect(r.messages[1].id).toBe("2");
      expect(r.addedCount).toBe(1);
      expect(r.droppedSide).toBeNull();
    });

    it("deduplicates by ID", () => {
      const current = [msg("1")];
      const r = mergeMessageWindow(current, [msg("1")], "append", 500);
      expect(r.messages).toHaveLength(1);
      expect(r.addedCount).toBe(0);
    });

    it("drops from head when cap exceeded", () => {
      const current = [msg("1", { timestamp: 1 }), msg("2", { timestamp: 2 })];
      const r = mergeMessageWindow(current, [msg("3", { timestamp: 3 })], "append", 2);
      expect(r.messages).toHaveLength(2);
      expect(r.messages[0].id).toBe("2");
      expect(r.messages[1].id).toBe("3");
      expect(r.droppedSide).toBe("head");
    });

    it("replaces optimistic message by client_message_id", () => {
      const optimistic = msg("opt_1", { client_message_id: "opt_1", content: "hello" });
      const echo = msg("real-1", { client_message_id: "opt_1", content: "hello" });
      const current = [optimistic];
      const r = mergeMessageWindow(current, [echo], "append", 500);
      expect(r.messages).toHaveLength(1);
      expect(r.messages[0].id).toBe("real-1");
      expect(r.messages[0].client_message_id).toBe("opt_1");
    });

    it("fallback replaces optimistic by content + username + 5s window", () => {
      const optimistic = msg("optimistic_abc", {
        content: "hello world",
        timestamp: 1000,
        username: "alice",
      });
      const echo = msg("server-42", {
        content: "hello world",
        timestamp: 1002,
        username: "alice",
      });
      const current = [optimistic];
      const r = mergeMessageWindow(current, [echo], "append", 500);
      expect(r.messages).toHaveLength(1);
      expect(r.messages[0].id).toBe("server-42");
    });
  });

  describe("prepend", () => {
    it("adds older messages at the front", () => {
      const current = [msg("3", { timestamp: 3 })];
      const r = mergeMessageWindow(current, [msg("1", { timestamp: 1 }), msg("2", { timestamp: 2 })], "prepend", 500);
      expect(r.messages).toHaveLength(3);
      expect(r.messages[0].id).toBe("1");
      expect(r.messages[1].id).toBe("2");
      expect(r.messages[2].id).toBe("3");
      expect(r.addedCount).toBe(2);
    });

    it("drops from tail when cap exceeded (keeps oldest)", () => {
      const current = [msg("3", { timestamp: 3 }), msg("4", { timestamp: 4 })];
      const r = mergeMessageWindow(current, [msg("1", { timestamp: 1 }), msg("2", { timestamp: 2 })], "prepend", 3);
      expect(r.messages).toHaveLength(3);
      expect(r.messages[0].id).toBe("1");
      expect(r.messages[1].id).toBe("2");
      expect(r.messages[2].id).toBe("3");
      expect(r.droppedSide).toBe("tail");
    });

    it("removes newest messages when cap is exceeded", () => {
      // This is the key test: prepend should NOT evict the live tail.
      // With cap=3, prepending 2 old messages to 3 current should keep
      // the 3 oldest messages (old-old-old, not old-live-live).
      const current = [msg("a", { timestamp: 100 }), msg("b", { timestamp: 200 }), msg("c", { timestamp: 300 })];
      const r = mergeMessageWindow(current, [msg("z", { timestamp: 10 })], "prepend", 3);
      expect(r.messages).toHaveLength(3);
      expect(r.messages[0].id).toBe("z");
      expect(r.messages[1].id).toBe("a");
      expect(r.messages[2].id).toBe("b");
      // "c" was dropped from the tail (newest live message)
      expect(r.droppedSide).toBe("tail");
    });

    it("deduplicates by ID", () => {
      const current = [msg("1")];
      const r = mergeMessageWindow(current, [msg("1")], "prepend", 500);
      expect(r.messages).toHaveLength(1);
      expect(r.addedCount).toBe(0);
    });

    it("with no new messages returns addedCount 0", () => {
      const current = [msg("1")];
      const r = mergeMessageWindow(current, [], "prepend", 500);
      expect(r.messages).toHaveLength(1);
      expect(r.addedCount).toBe(0);
    });
  });

  describe("revision", () => {
    it("bumps revision on change", () => {
      const r1 = mergeMessageWindow([], [msg("1")], "append", 500);
      const r2 = mergeMessageWindow(r1.messages, [msg("2")], "append", 500);
      expect(r2.revision).toBeGreaterThan(r1.revision);
    });

    it("does not bump revision on no-op", () => {
      const current = [msg("1")];
      const r1 = mergeMessageWindow(current, [msg("1")], "append", 500);
      const r2 = mergeMessageWindow(r1.messages, [], "prepend", 500);
      expect(r2.revision).toBe(r1.revision);
    });
  });
});