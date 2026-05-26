import { useState, useCallback, type FormEvent, type KeyboardEvent } from "react";
import { X, Loader2, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { useChatStore } from "@/stores/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { loginUser, registerUser, ChatError, ErrorCode, persistSessionToken } from "@/lib/api";
import { OidcLoginButton } from "./OidcLoginButton";

const USERNAME_STORAGE_KEY = "tokendance:username";
const AUTH_STORAGE_KEY = "tokendance:auth";

type TabView = "guest" | "login" | "register";

function getErrorMessage(err: unknown, t: (key: string) => string): string {
  if (err instanceof ChatError) {
    switch (err.code) {
      case ErrorCode.TIMEOUT:
        return t("error.timeout");
      case ErrorCode.CLOSED:
        return t("error.closed");
      case ErrorCode.CANNOT_CONNECT:
        return t("error.cannotConnect");
    }
  }
  if (err instanceof Error) return err.message;
  return t("error.unknown");
}

export function AuthModal() {
  const { t } = useTranslation();
  const show = useChatStore((s) => s.showAuthModal);
  const setShowAuthModal = useChatStore((s) => s.setShowAuthModal);
  const setView = useChatStore((s) => s.setView);
  const setStoreUsername = useChatStore((s) => s.setUsername);
  const setGuest = useChatStore((s) => s.setGuest);
  const { connect } = useWebSocket();

  const [tab, setTab] = useState<TabView>("guest");
  const [guestName, setGuestName] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regInviteCode, setRegInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const close = useCallback(() => {
    if (!loading) setShowAuthModal(false);
  }, [loading, setShowAuthModal]);

  const handleJoinSuccess = useCallback(
    async (name: string, persistAuth = false, sessionToken?: string) => {
      try {
        await connect(name, sessionToken);
        if (persistAuth) {
          localStorage.setItem(AUTH_STORAGE_KEY, "true");
          persistSessionToken(sessionToken ?? null);
        }
        localStorage.setItem(USERNAME_STORAGE_KEY, name);
        setStoreUsername(name);
        setView("chat");
        setShowAuthModal(false);
      } catch (err) {
        if (persistAuth) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          localStorage.removeItem(USERNAME_STORAGE_KEY);
          persistSessionToken(null);
        }
        setError(getErrorMessage(err, t));
        setLoading(false);
      }
    },
    [connect, setStoreUsername, setView, setShowAuthModal, t],
  );

  // ── Guest join ──
  const handleGuestJoin = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const trimmed = guestName.trim();
      if (!trimmed) { setError(t("join.errorEmpty")); return; }
      if (trimmed.length < 2) { setError(t("join.errorTooShort")); return; }
      if (trimmed.length > 20) { setError(t("join.errorTooLong")); return; }
      if (!/^[一-龥a-zA-Z0-9_]+$/.test(trimmed)) { setError(t("join.errorInvalidChars")); return; }
      setError("");
      setLoading(true);
      setGuest(true);
      await handleJoinSuccess(trimmed);
    },
    [guestName, handleJoinSuccess, t, setGuest],
  );

  // ── Login ──
  const handleLogin = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (!loginUsername.trim() || !loginPassword) {
        setError(t("auth.fillAllFields")); return;
      }
      setError("");
      setLoading(true);
      try {
        const result = await loginUser(loginUsername.trim(), loginPassword);
        setGuest(false);
        await handleJoinSuccess(result.username, true, result.session_token);
      } catch (err) {
        setLoading(false);
        if (err instanceof ChatError && err.code === ErrorCode.AUTH_FAILED) {
          setError(t("auth.loginFailed"));
        } else {
          setError(err instanceof Error ? err.message : t("auth.loginFailed"));
        }
      }
    },
    [loginUsername, loginPassword, handleJoinSuccess, t, setGuest],
  );

  // ── Register ──
  const handleRegister = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const uname = regUsername.trim();
      if (!uname || !regPassword || !regConfirmPassword || !regInviteCode.trim()) {
        setError(t("auth.fillAllFields")); return;
      }
      if (regPassword.length < 6) { setError(t("auth.passwordMinLength")); return; }
      if (regPassword !== regConfirmPassword) { setError(t("auth.confirmNotMatch")); return; }
      setError("");
      setLoading(true);
      try {
        const result = await registerUser(uname, regPassword, regInviteCode.trim());
        setGuest(false);
        await handleJoinSuccess(result.username, true, result.session_token);
      } catch (err) {
        setLoading(false);
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("invalid") || msg.includes("Invalid")) setError(t("auth.invalidCode"));
        else if (msg.includes("exhausted")) setError(t("auth.codeUsed"));
        else if (msg.includes("already") || msg.includes("exists") || msg.includes("taken")) setError(msg);
        else setError(msg || t("auth.loginFailed"));
      }
    },
    [regUsername, regPassword, regConfirmPassword, regInviteCode, handleJoinSuccess, t, setGuest],
  );

  if (!show) return null;

  const title = tab === "guest" ? t("join.buttonGuest") : tab === "login" ? t("auth.login") : t("auth.register");
  const inputClass = "w-full h-11 rounded-xl border border-[var(--border-base)] bg-[var(--surface-glass)] px-3.5 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none disabled:opacity-50 transition-colors";
  const primaryButtonClass = "w-full min-h-[46px] rounded-xl bg-[var(--accent)] text-white font-semibold text-[15px] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]";
  const inlineAuthSwitchClass = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 align-middle text-brand hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]";

  return (
    <div
      data-visual="auth-modal-root"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={close}
    >
      {/* Backdrop */}
      <div data-visual="auth-modal-backdrop" className="absolute inset-0 bg-black/25 backdrop-blur-md" />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        data-visual="auth-modal"
        className="glass-strong relative z-10 w-full max-w-[380px] overflow-hidden rounded-[22px] shadow-[0_22px_72px_rgba(0,0,0,0.22)] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="auth-modal-title" className="sr-only">{title}</h2>

        {/* Close button */}
        <button
          type="button"
          onClick={close}
          disabled={loading}
          data-visual="auth-modal-close"
          className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] sm:right-3 sm:top-3"
          aria-label={t("a11y.close")}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Tabs */}
        <div data-visual="auth-modal-tabs" className="flex border-b border-base pr-12">
          {(["guest", "login", "register"] as TabView[]).map((tv) => (
            <button
              type="button"
              key={tv}
              data-visual="auth-modal-tab"
              data-active={tab === tv ? "true" : "false"}
              onClick={() => { setTab(tv); setError(""); }}
              disabled={loading}
              className={`flex min-h-11 flex-1 items-center justify-center px-2 text-[15px] font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${
                tab === tv
                  ? "text-brand border-b-2 border-brand"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tv === "guest" ? t("join.buttonGuest") : tv === "login" ? t("auth.login") : t("auth.register")}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div data-visual="auth-modal-content" className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl shadow-sm">
              <img src="/token-dance-icon-rounded.svg" alt="TokenDance" className="h-10 w-10" draggable={false} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">TokenDance Chat</p>
              <p className="truncate text-xs text-[var(--text-secondary)]">{t("join.subtitle")}</p>
            </div>
          </div>

          {/* ── Guest Tab ── */}
          {tab === "guest" && (
            <form onSubmit={handleGuestJoin} className="space-y-4">
              <p className="text-[13px] text-[var(--text-secondary)]">{t("join.welcomeHint")}</p>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && handleGuestJoin()}
                placeholder={t("join.placeholder")}
                aria-label={t("join.placeholder")}
                disabled={loading}
                autoFocus
                className={inputClass}
              />
              <button
                type="submit"
                disabled={loading || !guestName.trim()}
                data-visual="auth-modal-primary"
                className={primaryButtonClass}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("join.buttonJoin")}
              </button>
            </form>
          )}

          {/* ── Login Tab ── */}
          {tab === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder={t("auth.username")}
                aria-label={t("auth.username")}
                disabled={loading}
                autoFocus
                autoComplete="username"
                className={inputClass}
              />
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder={t("auth.password")}
                  aria-label={t("auth.password")}
                  disabled={loading}
                  autoComplete="current-password"
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  data-visual="auth-modal-password-toggle"
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                  aria-label={showPassword ? t("a11y.hidePassword") : t("a11y.showPassword")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading || !loginUsername.trim() || !loginPassword}
                data-visual="auth-modal-primary"
                className={primaryButtonClass}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("auth.loginButton")}
              </button>
              <p className="text-center text-[13px] text-[var(--text-secondary)]">
                {t("auth.noAccount")}{" "}
                <button type="button" data-visual="auth-modal-inline-switch" onClick={() => { setTab("register"); setError(""); }} className={inlineAuthSwitchClass}>
                  {t("auth.register")}
                </button>
              </p>
            </form>
          )}

          {/* ── Register Tab ── */}
          {tab === "register" && (
            <form onSubmit={handleRegister} className="space-y-3">
              <input
                type="text"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                placeholder={t("auth.username")}
                aria-label={t("auth.username")}
                disabled={loading}
                autoFocus
                autoComplete="username"
                className={inputClass}
              />
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder={t("auth.password")}
                aria-label={t("auth.password")}
                disabled={loading}
                autoComplete="new-password"
                className={inputClass}
              />
              <input
                type="password"
                value={regConfirmPassword}
                onChange={(e) => setRegConfirmPassword(e.target.value)}
                placeholder={t("auth.confirmPassword")}
                aria-label={t("auth.confirmPassword")}
                disabled={loading}
                autoComplete="new-password"
                className={inputClass}
              />
              <input
                type="text"
                value={regInviteCode}
                onChange={(e) => setRegInviteCode(e.target.value)}
                placeholder={t("auth.inviteCode")}
                aria-label={t("auth.inviteCode")}
                disabled={loading}
                className={inputClass}
              />
              <button
                type="submit"
                disabled={loading || !regUsername.trim() || !regPassword || !regConfirmPassword || !regInviteCode.trim()}
                data-visual="auth-modal-primary"
                className={primaryButtonClass}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("auth.registerButton")}
              </button>
              <p className="text-center text-[13px] text-[var(--text-secondary)]">
                {t("auth.haveAccount")}{" "}
                <button type="button" data-visual="auth-modal-inline-switch" onClick={() => { setTab("login"); setError(""); }} className={inlineAuthSwitchClass}>
                  {t("auth.login")}
                </button>
              </p>
            </form>
          )}

          {/* ── OIDC ── */}
          <div className="mt-4 pt-4 border-t border-base">
            <OidcLoginButton />
          </div>

          {/* ── Error ── */}
          {error && (
            <p className="mt-3 text-center text-[13px] bg-[#fef2f2] text-[#dc2626] rounded-lg p-3" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
