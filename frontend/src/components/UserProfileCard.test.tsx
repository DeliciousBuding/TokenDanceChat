import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { mockI18n } from "@/test-utils";

// ── Mocks ──────────────────────────────────────────

vi.mock("@/i18n/context", () => ({
  useTranslation: () => mockI18n(),
}));

vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendProfileGet: vi.fn(),
    sendFriendRequest: vi.fn(),
    sendBlock: vi.fn(),
    sendUnblock: vi.fn(),
  },
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  usernameHue: () => 180,
  avatarGradient: () => "linear-gradient(135deg, #0071BC, #29ABE2)",
  formatLastSeen: (ts: number) => `last seen at ${ts}`,
}));

vi.mock("@/components/Avatar", () => ({
  Avatar: ({
    src,
    name,
    online,
  }: {
    src?: string | null;
    name: string;
    size?: string;
    online?: boolean;
    className?: string;
    onClick?: () => void;
  }) => (
    <div
      data-testid="avatar"
      data-src={src || "none"}
      data-online={online ? "1" : "0"}
      data-name={name}
    />
  ),
}));

vi.mock("@/components/ProfileEditModal", () => ({
  ProfileEditModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="profile-edit-modal">
      <button onClick={onClose}>Close Edit</button>
    </div>
  ),
}));

// ── Imports (after mocks) ──────────────────────────

import { useChatStore } from "@/stores/chatStore";
import { UserProfileCard } from "@/components/UserProfileCard";

// ── Helpers ────────────────────────────────────────

function renderCard(username: string, onClose = vi.fn()) {
  return render(<UserProfileCard username={username} onClose={onClose} />);
}

// ── Tests ──────────────────────────────────────────

describe("UserProfileCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      username: "testuser",
      userStatusList: [],
      blockedUsers: [],
      userProfiles: {},
      currentChat: { type: "public" },
    });
  });

  describe("display name and username", () => {
    it("renders display name when profile has one", () => {
      useChatStore.setState({
        userProfiles: {
          alice: {
            username: "alice",
            display_name: "Alice Wonderland",
            avatar_url: "",
            bio: "",
            status: "",
            last_seen: 0,
            created_at: 0,
          },
        },
        userStatusList: [{ username: "alice", online: false, last_seen: 0 }],
      });
      renderCard("alice");
      expect(screen.getByText("Alice Wonderland")).toBeTruthy();
      expect(screen.getByText("@alice")).toBeTruthy();
    });

    it("renders username as display name when no display_name is set", () => {
      useChatStore.setState({
        userProfiles: {
          bob: {
            username: "bob",
            display_name: "",
            avatar_url: "",
            bio: "",
            status: "",
            last_seen: 0,
            created_at: 0,
          },
        },
        userStatusList: [{ username: "bob", online: false, last_seen: 0 }],
      });
      renderCard("bob");
      // displayName falls back to username
      expect(screen.getByText("bob")).toBeTruthy();
      // No @username subtitle when displayName === username
      expect(screen.queryByText("@bob")).toBeFalsy();
    });

    it("handles missing profile data gracefully", () => {
      // No profile and no user status
      renderCard("charlie");
      // Should still render the username as display name
      expect(screen.getByText("charlie")).toBeTruthy();
      // No crash, component renders with avatar
      expect(screen.getByTestId("avatar")).toBeTruthy();
    });
  });

  describe("online/offline status", () => {
    it("shows online status when user is online", () => {
      useChatStore.setState({
        userStatusList: [{ username: "alice", online: true, last_seen: 0 }],
      });
      renderCard("alice");
      expect(screen.getByText("sidebar.online")).toBeTruthy();
      expect(screen.getByTestId("avatar").dataset.online).toBe("1");
    });

    it("shows offline status when user is offline and has no last_seen", () => {
      useChatStore.setState({
        userStatusList: [{ username: "alice", online: false, last_seen: 0 }],
      });
      renderCard("alice");
      expect(screen.getByText("sidebar.offline")).toBeTruthy();
    });

    it("shows last seen time when user is offline and last_seen is recent", () => {
      const recentTime = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      useChatStore.setState({
        userStatusList: [
          { username: "alice", online: false, last_seen: recentTime },
        ],
      });
      renderCard("alice");
      // lastSeenText resolves to a profile.minutesAgo key (the mock i18n
      // uses the key as fallback), and the outer display renders
      // sidebar.lastSeen with that value as the time parameter.
      // The key "sidebar.lastSeen" confirms the offline-with-last-seen path.
      expect(screen.getByText("sidebar.lastSeen")).toBeTruthy();
    });
  });

  describe("avatar", () => {
    it("passes avatar_url to Avatar component when available", () => {
      useChatStore.setState({
        userProfiles: {
          alice: {
            username: "alice",
            display_name: "Alice",
            avatar_url: "https://example.com/avatar.png",
            bio: "",
            status: "",
            last_seen: 0,
            created_at: 0,
          },
        },
        userStatusList: [{ username: "alice", online: true, last_seen: 0 }],
      });
      renderCard("alice");
      const avatar = screen.getByTestId("avatar");
      expect(avatar.dataset.src).toBe("https://example.com/avatar.png");
    });

    it("falls back to no src when avatar_url is empty", () => {
      useChatStore.setState({
        userProfiles: {
          alice: {
            username: "alice",
            display_name: "Alice",
            avatar_url: "",
            bio: "",
            status: "",
            last_seen: 0,
            created_at: 0,
          },
        },
        userStatusList: [{ username: "alice", online: false, last_seen: 0 }],
      });
      renderCard("alice");
      const avatar = screen.getByTestId("avatar");
      expect(avatar.dataset.src).toBe("none");
    });
  });

  describe("bio and status text", () => {
    it("shows bio text when profile has one", () => {
      useChatStore.setState({
        userProfiles: {
          alice: {
            username: "alice",
            display_name: "Alice",
            avatar_url: "",
            bio: "Hello, world!",
            status: "",
            last_seen: 0,
            created_at: 0,
          },
        },
        userStatusList: [{ username: "alice", online: false, last_seen: 0 }],
      });
      renderCard("alice");
      expect(screen.getByText("Hello, world!")).toBeTruthy();
    });

    it("shows custom status text when available", () => {
      useChatStore.setState({
        userProfiles: {
          alice: {
            username: "alice",
            display_name: "Alice",
            avatar_url: "",
            bio: "",
            status: "Busy coding",
            last_seen: 0,
            created_at: 0,
          },
        },
        userStatusList: [{ username: "alice", online: false, last_seen: 0 }],
      });
      renderCard("alice");
      expect(screen.getByText("Busy coding")).toBeTruthy();
    });

    it("does not render bio when empty", () => {
      useChatStore.setState({
        userProfiles: {
          alice: {
            username: "alice",
            display_name: "Alice",
            avatar_url: "",
            bio: "",
            status: "",
            last_seen: 0,
            created_at: 0,
          },
        },
        userStatusList: [{ username: "alice", online: false, last_seen: 0 }],
      });
      renderCard("alice");
      // Avatar should exist
      expect(screen.getByTestId("avatar")).toBeTruthy();
      // No bio text should appear
      expect(screen.queryByText("Hello, world!")).toBeFalsy();
    });
  });
});
