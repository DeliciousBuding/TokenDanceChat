import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { OidcLoginButton } from "./OidcLoginButton";
import { mockI18n } from "@/test-utils";

vi.mock("@/i18n/context", () => ({
  useTranslation: () =>
    mockI18n({
      "auth.oidcLoginButton": "Login with TokenDance ID",
    }),
}));

describe("OidcLoginButton", () => {
  let originalFetch: typeof window.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchMock: any;

  beforeEach(() => {
    originalFetch = window.fetch;
    fetchMock = vi.fn();
    window.fetch = fetchMock as typeof window.fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it("renders nothing when OIDC config fetch fails (not enabled)", async () => {
    fetchMock.mockRejectedValue(new Error("OIDC not available"));
    render(<OidcLoginButton />);

    // Initially nothing is rendered while fetch is in-flight.
    // After the promise rejects, it should still render nothing.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/oidc/config");
    });
    // Component renders null when config is null.
    // Rather than asserting on container, just ensure no link exists.
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders login link when OIDC is enabled", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        enabled: true,
        issuer: "https://id.example.com",
        client_id: "test-client",
        redirect_uri: "http://localhost:8080/api/oidc/callback",
        auth_url: "https://id.example.com/authorize",
        token_url: "https://id.example.com/token",
      }),
    });

    render(<OidcLoginButton />);

    await waitFor(() => {
      expect(screen.getByText("Login with TokenDance ID")).toBeTruthy();
    });

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/api/oidc/login");
  });

  it("does not render when config response is not ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    render(<OidcLoginButton />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(screen.queryByRole("link")).toBeNull();
  });
});
