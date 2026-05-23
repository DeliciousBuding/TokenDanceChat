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
