import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Mock fetch for /api/admin/stats
const mockStats = {
  total_messages: 42,
  active_connections: 3,
  rooms: 2,
  groups: 5,
  friends: 8,
  registered_users: 15,
};

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(mockStats),
  });
});

import { AdminPanel } from "@/components/AdminPanel";

describe("AdminPanel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <AdminPanel open={false} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders admin dashboard when open", async () => {
    render(<AdminPanel open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Admin Dashboard")).toBeTruthy();
    });
  });

  it("displays stats after loading", async () => {
    render(<AdminPanel open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeTruthy();
    });
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("15")).toBeTruthy();
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(<AdminPanel open={true} onClose={onClose} />);

    // Click the backdrop overlay
    const backdrop = document.querySelector(".fixed.inset-0");
    if (backdrop) {
      (backdrop as HTMLElement).click();
      expect(onClose).toHaveBeenCalled();
    }
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    render(<AdminPanel open={true} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("handles fetch errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    render(<AdminPanel open={true} onClose={vi.fn()} />);

    // Should still render the panel shell, just no stats
    await waitFor(() => {
      expect(screen.getByText("Admin Dashboard")).toBeTruthy();
    });
    // Stats should show "-" on error
    await waitFor(() => {
      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });
});
