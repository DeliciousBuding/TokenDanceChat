import { useTranslation } from "@/i18n/context";

/**
 * OidcLoginButton renders a "Login with TokenDance ID" link.
 * The button only appears when the backend reports OIDC is enabled.
 * Clicking redirects the browser to /api/oidc/login to start the OIDC flow.
 */
export function OidcLoginButton() {
  const { t } = useTranslation();

  return (
    <a
      href="/api/oidc/login"
      data-visual="auth-modal-oidc"
      className="td-chat-list-row flex min-h-11 w-full items-center justify-center gap-2 px-4 text-[14px] text-[var(--text-primary)] hover:bg-[var(--bg-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
    >
      {t("auth.oidcLoginButton")}
    </a>
  );
}
