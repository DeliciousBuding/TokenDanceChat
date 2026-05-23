import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupCreateModal } from "@/components/GroupCreateModal";
import { mockI18n } from "@/test-utils";

vi.mock("@/i18n/context", () => ({
  useTranslation: () =>
    mockI18n({
      "group.createTitle": "Create Group",
      "group.nameErrorEmpty": "Name cannot be empty",
      "group.nameErrorTooLong": "Name too long",
      "group.namePlaceholder": "Group name...",
      "group.selectMembers": "Select members",
      "group.noUsersAvailable": "No users available",
      "group.cancel": "Cancel",
      "group.create": "Create",
    }),
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: vi.fn(),
}));

import { useChatStore } from "@/stores/chatStore";

const DEFAULT_STORE_STATE = {
  username: "alice",
  friends: ["bob", "charlie"],
  onlineUsers: ["dave", "eve"],
};

function setStore(overrides?: Record<string, unknown>) {
  (useChatStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector?: (state: unknown) => unknown) => {
      const state = { ...DEFAULT_STORE_STATE, ...overrides };
      return typeof selector === "function" ? selector(state) : state;
    },
  );
}

describe("GroupCreateModal", () => {
  const onClose = vi.fn();
  const onCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    setStore();
  });

  describe("rendering", () => {
    it("renders nothing when open is false", () => {
      const { container } = render(
        <GroupCreateModal open={false} onClose={onClose} onCreate={onCreate} />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("renders modal with title, input, member list, and action buttons", () => {
      render(
        <GroupCreateModal open={true} onClose={onClose} onCreate={onCreate} />,
      );

      expect(screen.getByText("Create Group")).toBeTruthy();
      expect(screen.getByPlaceholderText("Group name...")).toBeTruthy();
      expect(screen.getByText("Select members")).toBeTruthy();
      expect(screen.getByText("Cancel")).toBeTruthy();
      expect(screen.getByText("Create")).toBeTruthy();
    });

    it("shows available users excluding self", () => {
      render(
        <GroupCreateModal open={true} onClose={onClose} onCreate={onCreate} />,
      );

      // All friends and online users should appear
      expect(screen.getByText("bob")).toBeTruthy();
      expect(screen.getByText("charlie")).toBeTruthy();
      expect(screen.getByText("dave")).toBeTruthy();
      expect(screen.getByText("eve")).toBeTruthy();
      // Self should be filtered out
      expect(screen.queryByText("alice")).toBeFalsy();
    });

    it("shows empty state when no users are available", () => {
      setStore({ friends: [], onlineUsers: [] });

      render(
        <GroupCreateModal open={true} onClose={onClose} onCreate={onCreate} />,
      );

      expect(screen.getByText("No users available")).toBeTruthy();
    });
  });

  describe("validation", () => {
    it("disables create button when name is empty", () => {
      render(
        <GroupCreateModal open={true} onClose={onClose} onCreate={onCreate} />,
      );

      const createBtn = screen.getByText("Create");
      expect(createBtn.closest("button")).toBeDisabled();
    });

    it("disables create button when name is only whitespace", () => {
      render(
        <GroupCreateModal open={true} onClose={onClose} onCreate={onCreate} />,
      );

      const input = screen.getByPlaceholderText("Group name...");
      fireEvent.change(input, { target: { value: "   " } });

      const createBtn = screen.getByText("Create");
      expect(createBtn.closest("button")).toBeDisabled();
    });

    it("shows error when name exceeds 30 characters", () => {
      render(
        <GroupCreateModal open={true} onClose={onClose} onCreate={onCreate} />,
      );

      const input = screen.getByPlaceholderText("Group name...");
      fireEvent.change(input, { target: { value: "a".repeat(31) } });

      fireEvent.click(screen.getByText("Create"));

      expect(screen.getByText("Name too long")).toBeTruthy();
      expect(onCreate).not.toHaveBeenCalled();
    });

    it("clears error when user starts typing", () => {
      render(
        <GroupCreateModal open={true} onClose={onClose} onCreate={onCreate} />,
      );

      const input = screen.getByPlaceholderText("Group name...");
      fireEvent.change(input, { target: { value: "a".repeat(31) } });
      fireEvent.click(screen.getByText("Create"));
      expect(screen.getByText("Name too long")).toBeTruthy();

      // Typing again should clear the error
      fireEvent.change(input, { target: { value: "Valid Name" } });
      expect(screen.queryByText("Name too long")).toBeFalsy();
    });
  });

  describe("closing", () => {
    it("closes on backdrop click", () => {
      render(
        <GroupCreateModal open={true} onClose={onClose} onCreate={onCreate} />,
      );

      const backdrop = document.querySelector(".absolute.inset-0");
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes on Cancel button click", () => {
      render(
        <GroupCreateModal open={true} onClose={onClose} onCreate={onCreate} />,
      );

      fireEvent.click(screen.getByText("Cancel"));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes on X (close icon) button click", () => {
      render(
        <GroupCreateModal open={true} onClose={onClose} onCreate={onCreate} />,
      );

      // The X button contains a lucide-x icon; find the button that renders it
      const buttons = screen.getAllByRole("button");
      const closeBtn = buttons.find((b) => b.querySelector(".lucide-x"));
      expect(closeBtn).toBeTruthy();
      fireEvent.click(closeBtn!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("submit", () => {
    it("calls onCreate with trimmed name and selected members, then closes", () => {
      render(
        <GroupCreateModal open={true} onClose={onClose} onCreate={onCreate} />,
      );

      const input = screen.getByPlaceholderText("Group name...");
      fireEvent.change(input, { target: { value: "  My Group  " } });

      // Select members by label click
      fireEvent.click(screen.getByText("bob"));
      fireEvent.click(screen.getByText("charlie"));

      fireEvent.click(screen.getByText("Create"));

      expect(onCreate).toHaveBeenCalledWith("My Group", ["bob", "charlie"]);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onCreate with empty members array when none selected", () => {
      render(
        <GroupCreateModal open={true} onClose={onClose} onCreate={onCreate} />,
      );

      const input = screen.getByPlaceholderText("Group name...");
      fireEvent.change(input, { target: { value: "Solo Group" } });

      fireEvent.click(screen.getByText("Create"));

      expect(onCreate).toHaveBeenCalledWith("Solo Group", []);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("toggles member selection on repeated click", () => {
      render(
        <GroupCreateModal open={true} onClose={onClose} onCreate={onCreate} />,
      );

      fireEvent.click(screen.getByText("bob"));
      fireEvent.click(screen.getByText("bob")); // deselect

      const input = screen.getByPlaceholderText("Group name...");
      fireEvent.change(input, { target: { value: "Group" } });

      fireEvent.click(screen.getByText("Create"));

      expect(onCreate).toHaveBeenCalledWith("Group", []);
    });
  });
});
