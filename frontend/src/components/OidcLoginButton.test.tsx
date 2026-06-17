import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OidcLoginButton } from "./OidcLoginButton";
import { mockI18n } from "@/test-utils";

vi.mock("@/i18n/context", () => ({
  useTranslation: () =>
    mockI18n({
      "auth.oidcLoginButton": "Login with TokenDance ID",
    }),
}));

describe("OidcLoginButton", () => {
  it("renders login link without probing a protected API", () => {
    const fetchMock = vi.spyOn(window, "fetch");
    render(<OidcLoginButton />);

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/api/oidc/login");
    expect(link.getAttribute("data-visual")).toBe("auth-modal-oidc");
    expect(link.className).toContain("min-h-11");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
