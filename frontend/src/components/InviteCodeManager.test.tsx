import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { mockI18n } from "@/test-utils";
import { InviteCodeManager } from "@/components/InviteCodeManager";

const { mockGenerateInviteCode, mockListInviteCodes } = vi.hoisted(() => ({
  mockGenerateInviteCode: vi.fn(),
  mockListInviteCodes: vi.fn(),
}));

vi.mock("@/i18n/context", () => ({ useTranslation: () => mockI18n() }));
vi.mock("@/stores/chatStore", () => ({
  useChatStore: vi.fn(() => ({ username: "admin" })),
}));
vi.mock("@/lib/api", () => ({
  generateInviteCode: mockGenerateInviteCode,
  listInviteCodes: mockListInviteCodes,
}));

function setupClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    writable: true,
    configurable: true,
  });
  return writeText;
}

describe("InviteCodeManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner while codes are being fetched", async () => {
    // Return a promise that never resolves so loading stays true
    mockListInviteCodes.mockReturnValue(new Promise(() => {}));
    render(<InviteCodeManager open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      // The loading spinner is a Loader2 with animate-spin class
      const spinner = document.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });

  it("shows empty state when no invite codes exist", async () => {
    mockListInviteCodes.mockResolvedValue([]);
    render(<InviteCodeManager open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("invite.noCodes")).toBeInTheDocument();
    });
  });

  it("renders invite codes list with usage info", async () => {
    const codes = [
      { code: "ABC123", creator: "admin", max_uses: 5, use_count: 2, created_at: Date.now() },
      { code: "DEF456", creator: "admin", max_uses: 10, use_count: 0, created_at: Date.now() },
    ];
    mockListInviteCodes.mockResolvedValue(codes);

    render(<InviteCodeManager open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("ABC123")).toBeInTheDocument();
    });
    expect(screen.getByText("DEF456")).toBeInTheDocument();
    // Two instances of usesLeft (one per code)
    const usesLeftElements = screen.getAllByText("invite.usesLeft");
    expect(usesLeftElements).toHaveLength(2);
  });

  it("generates a new invite code and prepends to list", async () => {
    mockListInviteCodes.mockResolvedValue([
      { code: "EXISTING", creator: "admin", max_uses: 3, use_count: 1, created_at: Date.now() },
    ]);
    mockGenerateInviteCode.mockResolvedValue({ code: "NEWCODE" });

    render(<InviteCodeManager open={true} onClose={vi.fn()} />);

    // Wait for initial list to load
    await waitFor(() => {
      expect(screen.getByText("EXISTING")).toBeInTheDocument();
    });

    // Click generate button
    const genBtn = screen.getByText("invite.generateCode");
    fireEvent.click(genBtn);

    await waitFor(() => {
      expect(mockGenerateInviteCode).toHaveBeenCalledWith("admin", 5);
      // New code should appear in the list
      expect(screen.getByText("NEWCODE")).toBeInTheDocument();
    });
    // Existing code should still be there
    expect(screen.getByText("EXISTING")).toBeInTheDocument();
  });

  it("displays error message when code generation fails", async () => {
    mockListInviteCodes.mockResolvedValue([]);
    mockGenerateInviteCode.mockRejectedValue(new Error("Server refused"));

    render(<InviteCodeManager open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("invite.noCodes")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("invite.generateCode"));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Server refused");
    });
  });

  it("calls onClose when close button is clicked", async () => {
    mockListInviteCodes.mockResolvedValue([]);
    const onClose = vi.fn();

    render(<InviteCodeManager open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("invite.noCodes")).toBeInTheDocument();
    });

    const closeBtn = screen.getByLabelText("关闭");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("copies invite code to clipboard", async () => {
    const writeText = setupClipboard();
    mockListInviteCodes.mockResolvedValue([
      { code: "COPYME", creator: "admin", max_uses: 5, use_count: 0, created_at: Date.now() },
    ]);

    render(<InviteCodeManager open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("COPYME")).toBeInTheDocument();
    });

    const copyBtn = screen.getByLabelText("invite.copyCode");
    fireEvent.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith("COPYME");
  });

  it("does not render when open is false", () => {
    const { container } = render(<InviteCodeManager open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
