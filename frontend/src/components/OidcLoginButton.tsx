import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/context";
import { fetchOIDCConfig, type OIDCConfig } from "@/lib/api";

/**
 * OidcLoginButton renders a "Login with TokenDance ID" link.
 * The button only appears when the backend reports OIDC is enabled.
 * Clicking redirects the browser to /api/oidc/login to start the OIDC flow.
 */
export function OidcLoginButton() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<OIDCConfig | null>(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOIDCConfig()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        if (!cancelled) setFetchError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Don't render anything if OIDC is not configured or fetch failed.
  if (!config || fetchError) return null;

  return (
    <a
      href="/api/oidc/login"
      data-visual="auth-modal-oidc"
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-base)] bg-[var(--bg-2)] px-4 text-[14px] text-[var(--text-primary)] hover:bg-[var(--bg-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
    >
      {t("auth.oidcLoginButton")}
    </a>
  );
}
