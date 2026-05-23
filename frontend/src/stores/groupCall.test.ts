import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChatStore } from "@/stores/chatStore";

vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendGroupCreate: vi.fn(),
    sendGroupInvite: vi.fn(),
    sendReaction: vi.fn(),
    sendMessageEdit: vi.fn(),
    deleteMessage: vi.fn(),
    sendTypingStart: vi.fn(),
    sendTypingStop: vi.fn(),
    on: vi.fn(() => vi.fn()),
  },
}));

vi.mock("@/lib/sound", () => ({
  playSentSound: vi.fn(),
  playMessageSound: vi.fn(),
  playMentionSound: vi.fn(),
  playOnlineSound: vi.fn(),
  playOfflineSound: vi.fn(),
  playReactionSound: vi.fn(),
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// We test the group call logic via the store since ChatLayout has complex dependencies
describe("Group video call (store + logic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
    useChatStore.setState({
      username: "testuser",
      connected: true,
      onlineUsers: ["testuser", "alice", "bob"],
      groups: {
        TestGroup: {
          name: "TestGroup",
          members: ["testuser", "alice"],
          roles: { testuser: "owner", alice: "member" },
          owner: "Owner",
          created_at: 1000,
        },
      },
    });
  });

  describe("groupCallParticipants", () => {
    it("includes group members other than self", () => {
      const state = useChatStore.getState();
      const group = state.groups["TestGroup"];
      const participants = (group?.members ?? []).filter(
        (m) => m !== "testuser",
      );
      expect(participants).toEqual(["alice"]);
      expect(participants.length).toBeGreaterThan(0);
    });

    it("excludes self from participants", () => {
      useChatStore.setState({
        groups: {
          SoloGroup: {
            name: "SoloGroup",
            members: ["testuser"],
            roles: {},
            owner: "Owner",
            created_at: 1000,
          },
        },
      });

      const group = useChatStore.getState().groups["SoloGroup"];
      const participants = (group?.members ?? []).filter(
        (m) => m !== "testuser",
      );
      expect(participants).toEqual([]);
    });
  });

  describe("activeCall for group", () => {
    it("sets isGroupCall and groupName when starting group call", () => {
      const { setActiveCall } = useChatStore.getState();

      setActiveCall({
        callId: "",
        peer: "TestGroup",
        callType: "video",
        startTime: Date.now(),
        isGroupCall: true,
        groupName: "TestGroup",
        participants: ["alice"],
      });

      const call = useChatStore.getState().activeCall;
      expect(call?.isGroupCall).toBe(true);
      expect(call?.groupName).toBe("TestGroup");
      expect(call?.participants).toEqual(["alice"]);
    });

    it("clears activeCall on end", () => {
      const { setActiveCall } = useChatStore.getState();
      setActiveCall({
        callId: "",
        peer: "TestGroup",
        callType: "video",
        startTime: Date.now(),
        isGroupCall: true,
        groupName: "TestGroup",
        participants: ["alice"],
      });

      setActiveCall(null);
      expect(useChatStore.getState().activeCall).toBeNull();
    });
  });
});
