import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { GroupInfoPanel } from "@/components/GroupInfoPanel";
import { chatAPI } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  chatAPI: {
    sendGroupInfo: vi.fn(),
    sendWebhookList: vi.fn(),
    sendWebhookCreate: vi.fn(),
    sendWebhookDelete: vi.fn(),
    sendWebhookRotate: vi.fn(),
    sendWebhookAuditList: vi.fn(),
    sendGroupKick: vi.fn(),
    sendGroupSetRole: vi.fn(),
    sendGroupTransfer: vi.fn(),
    sendGroupRename: vi.fn(),
    sendGroupLeave: vi.fn(),
  },
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

function renderPanel() {
  return render(
    <I18nProvider>
      <GroupInfoPanel groupName="Team" onClose={vi.fn()} />
    </I18nProvider>,
  );
}

describe("GroupInfoPanel webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
    useChatStore.getState().reset();
    useChatStore.setState({
      username: "Alice",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob"],
          roles: { Alice: "admin", Bob: "member" },
          owner: "Owner",
          created_at: 1000,
        },
      },
      groupWebhooks: {
        Team: [
          {
            id: "wh-1",
            group_name: "Team",
            url: "webhook-path",
            created_by: "Alice",
            created_at: 1000,
          },
        ],
      },
      groupWebhookAuditLogs: {
        Team: [
          {
            id: "audit-1",
            webhook_id: "wh-1",
            group_name: "Team",
            action: "created",
            actor: "Alice",
            created_at: 1000,
          },
        ],
      },
      latestCreatedWebhook: {
        id: "wh-2",
        group_name: "Team",
        url: "new-webhook",
        secret: "secret-once",
        created_by: "Alice",
        created_at: 2000,
      },
    });
  });

  it("loads and renders webhook management for group admins without leaking list secrets", () => {
    renderPanel();

    expect(chatAPI.sendGroupInfo).toHaveBeenCalledWith("Team");
    expect(chatAPI.sendWebhookList).toHaveBeenCalledWith("Team");
    expect(chatAPI.sendWebhookAuditList).toHaveBeenCalledWith("Team");
    expect(screen.getByText("传入 Webhook")).toBeTruthy();
    expect(screen.getByText("请立即复制，密钥只显示一次")).toBeTruthy();
    expect(screen.getByText(/secret-once/)).toBeTruthy();
    expect(screen.getByText(/webhook-path/)).toBeTruthy();

    const listURL = screen.getByTitle(/webhook-path/).textContent ?? "";
    expect(listURL).not.toContain("secret");
  });

  it("creates and deletes webhooks through chatAPI", () => {
    renderPanel();

    fireEvent.click(screen.getByText("新建"));
    expect(chatAPI.sendWebhookCreate).toHaveBeenCalledWith("Team");

    fireEvent.click(screen.getByLabelText("删除 webhook"));
    expect(chatAPI.sendWebhookDelete).toHaveBeenCalledWith("Team", "wh-1");
  });

  it("rotates a webhook through chatAPI", () => {
    renderPanel();

    fireEvent.click(screen.getByLabelText("轮换 webhook 密钥"));
    expect(chatAPI.sendWebhookRotate).toHaveBeenCalledWith("Team", "wh-1");
  });

  it("renders webhook audit logs and can refresh", () => {
    renderPanel();

    expect(screen.getByText("Webhook 审计")).toBeTruthy();
    expect(screen.getByText("创建 webhook")).toBeTruthy();
    const auditLogEl = document.querySelector('[data-visual="group-info-webhook-audit-log"]');
    expect(auditLogEl?.textContent).toContain("Alice");

    fireEvent.click(screen.getByText("刷新"));
    expect(chatAPI.sendWebhookAuditList).toHaveBeenCalledWith("Team");
  });

  it("renders rotated metadata row when a webhook has been rotated", () => {
    useChatStore.setState({
      groupWebhooks: {
        Team: [
          {
            id: "wh-1",
            group_name: "Team",
            url: "webhook-path",
            created_by: "Alice",
            created_at: 1000,
            rotated_at: 3000,
            rotated_by: "Bob",
          },
        ],
      },
    });

    renderPanel();

    expect(screen.getByText(/轮换：Bob/)).toBeTruthy();
  });

  it("shows empty audit state when no logs exist", () => {
    useChatStore.setState({
      groupWebhookAuditLogs: { Team: [] },
    });

    renderPanel();

    expect(screen.getByText("暂无审计记录")).toBeTruthy();
  });
});

describe("GroupInfoPanel members and roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
    useChatStore.getState().reset();
  });

  function renderWithOnClose(onClose = vi.fn()) {
    return render(
      <I18nProvider>
        <GroupInfoPanel groupName="Team" onClose={onClose} />
      </I18nProvider>,
    );
  }

  // ── Member list rendering ───────────────────────────

  it("renders all group members with their names", () => {
    useChatStore.setState({
      username: "Alice",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob", "Charlie"],
          roles: { Alice: "owner", Bob: "admin", Charlie: "member" },
          owner: "Alice",
          created_at: 1000,
        },
      },
    });

    renderWithOnClose();

    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("Charlie")).toBeTruthy();
    // Each member row should have the data-visual attribute
    expect(document.querySelectorAll('[data-visual="group-info-member"]').length).toBe(3);
  });

  it("shows member count in header and member-list section header", () => {
    useChatStore.setState({
      username: "Alice",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob"],
          roles: { Alice: "owner", Bob: "member" },
          owner: "Alice",
          created_at: 1000,
        },
      },
    });

    renderWithOnClose();

    // Header area: "成员: 2" inside the panel title area
    const headerEl = document.querySelector('[data-visual="group-info-panel"] .flex.items-center.justify-between .text-xs')!;
    expect(headerEl.textContent).toContain("成员");
    expect(headerEl.textContent).toContain("2");
    // Section heading: "成员 — 2" in the member list area
    const sectionHeading = document.querySelector(".uppercase.tracking-wider");
    expect(sectionHeading?.textContent).toContain("成员");
    expect(sectionHeading?.textContent).toContain("2");
  });

  it('shows "(你)" label for the current user', () => {
    useChatStore.setState({
      username: "Alice",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob"],
          roles: { Alice: "owner", Bob: "member" },
          owner: "Alice",
          created_at: 1000,
        },
      },
    });

    renderWithOnClose();

    // Alice should have "(你)" label
    expect(screen.getByText(/\(你\)/)).toBeTruthy();
  });

  // ── Owner / Admin badges ────────────────────────────

  it("renders Crown badge for the group owner", () => {
    useChatStore.setState({
      username: "Alice",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob"],
          roles: { Alice: "owner", Bob: "member" },
          owner: "Alice",
          created_at: 1000,
        },
      },
    });

    renderWithOnClose();

    // Owner badge shows Crown icon + "群主"
    expect(screen.getByText("群主")).toBeTruthy();
    // lucide-crown should be present
    expect(document.querySelector(".lucide-crown")).toBeTruthy();
  });

  it("renders Shield badge for admin members", () => {
    useChatStore.setState({
      username: "Alice",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob", "Charlie"],
          roles: { Alice: "owner", Bob: "admin", Charlie: "member" },
          owner: "Alice",
          created_at: 1000,
        },
      },
    });

    renderWithOnClose();

    // Bob is admin — Shield icon + "管理员"
    expect(screen.getByText("管理员")).toBeTruthy();
    expect(document.querySelector(".lucide-shield")).toBeTruthy();
  });

  it("renders User badge for regular members", () => {
    useChatStore.setState({
      username: "Alice",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob"],
          roles: { Alice: "owner", Bob: "member" },
          owner: "Alice",
          created_at: 1000,
        },
      },
    });

    renderWithOnClose();

    // Bob is member — User icon + "成员"
    expect(screen.getByText("成员")).toBeTruthy();
    expect(document.querySelector(".lucide-user")).toBeTruthy();
  });

  // ── Webhook section visibility (owner/admin only) ───

  it("shows webhook management section for group owner", () => {
    useChatStore.setState({
      username: "Alice",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob"],
          roles: { Alice: "owner", Bob: "member" },
          owner: "Alice",
          created_at: 1000,
        },
      },
      groupWebhooks: { Team: [] },
      groupWebhookAuditLogs: { Team: [] },
    });

    renderWithOnClose();

    // Webhook section should be visible for owner
    expect(document.querySelector('[data-visual="group-info-webhooks"]')).toBeTruthy();
  });

  it("shows webhook management section for group admin", () => {
    useChatStore.setState({
      username: "Bob",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob"],
          roles: { Alice: "owner", Bob: "admin" },
          owner: "Alice",
          created_at: 1000,
        },
      },
      groupWebhooks: { Team: [] },
      groupWebhookAuditLogs: { Team: [] },
    });

    renderWithOnClose();

    // Webhook section should be visible for admin
    expect(document.querySelector('[data-visual="group-info-webhooks"]')).toBeTruthy();
  });

  it("hides webhook management section for regular members", () => {
    useChatStore.setState({
      username: "Charlie",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob", "Charlie"],
          roles: { Alice: "owner", Bob: "admin", Charlie: "member" },
          owner: "Alice",
          created_at: 1000,
        },
      },
    });

    renderWithOnClose();

    // Webhook section should NOT be visible for regular member
    expect(document.querySelector('[data-visual="group-info-webhooks"]')).toBeFalsy();
  });

  // ── Leave group button ──────────────────────────────

  it("shows leave group button for all members", () => {
    useChatStore.setState({
      username: "Charlie",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob", "Charlie"],
          roles: { Alice: "owner", Bob: "admin", Charlie: "member" },
          owner: "Alice",
          created_at: 1000,
        },
      },
    });

    renderWithOnClose();

    // Leave group button is visible for everyone
    expect(screen.getByText("退出群组")).toBeTruthy();
  });

  it("shows confirm dialog when leave group is clicked", () => {
    useChatStore.setState({
      username: "Charlie",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob", "Charlie"],
          roles: { Alice: "owner", Bob: "admin", Charlie: "member" },
          owner: "Alice",
          created_at: 1000,
        },
      },
    });

    renderWithOnClose();

    // Click the leave-group action button in the panel
    const leaveButtons = screen.getAllByText("退出群组");
    fireEvent.click(leaveButtons[0]);

    // Confirm dialog should appear
    expect(screen.getByText("确定要退出群组吗？")).toBeTruthy();
    // Cancel button inside dialog
    expect(screen.getByText("取消")).toBeTruthy();
    // Now there should be two "退出群组" elements: the action button + confirm button
    expect(screen.getAllByText("退出群组").length).toBe(2);
  });

  it("calls sendGroupLeave when leave is confirmed", () => {
    useChatStore.setState({
      username: "Charlie",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob", "Charlie"],
          roles: { Alice: "owner", Bob: "admin", Charlie: "member" },
          owner: "Alice",
          created_at: 1000,
        },
      },
    });

    renderWithOnClose();

    // Click the leave button (first "退出群组" text)
    fireEvent.click(screen.getAllByText("退出群组")[0]);

    // After the dialog opens, click the confirm button (the destructive one
    // with bg-destructive class) — it's the second "退出群组" element
    const confirmBtn = screen.getAllByText("退出群组")[1];
    fireEvent.click(confirmBtn);

    expect(chatAPI.sendGroupLeave).toHaveBeenCalledWith("Team");
  });

  it("cancels leave group when cancel is clicked in dialog", () => {
    useChatStore.setState({
      username: "Charlie",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice", "Bob", "Charlie"],
          roles: { Alice: "owner", Bob: "admin", Charlie: "member" },
          owner: "Alice",
          created_at: 1000,
        },
      },
    });

    renderWithOnClose();

    fireEvent.click(screen.getByText("退出群组"));

    // Click cancel
    fireEvent.click(screen.getByText("取消"));

    expect(chatAPI.sendGroupLeave).not.toHaveBeenCalled();
    // Dialog should be dismissed
    expect(screen.queryByText("确定要退出群组吗？")).toBeFalsy();
  });

  // ── Close button ────────────────────────────────────

  it("calls onClose when close (X) button is clicked", () => {
    const onClose = vi.fn();
    useChatStore.setState({
      username: "Alice",
      groups: {
        Team: {
          name: "Team",
          members: ["Alice"],
          roles: { Alice: "owner" },
          owner: "Alice",
          created_at: 1000,
        },
      },
    });

    renderWithOnClose(onClose);

    // handleClose uses setTimeout(onClose, 200), need fake timers
    vi.useFakeTimers();
    const closeBtn = screen.getByLabelText("关闭");
    fireEvent.click(closeBtn);
    vi.advanceTimersByTime(200);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
