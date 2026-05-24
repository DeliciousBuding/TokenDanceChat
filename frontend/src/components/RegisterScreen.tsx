import { useState, useCallback, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { registerUser } from "@/lib/api";

interface RegisterScreenProps {
  onBack: () => void;
  onSuccess: (username: string) => void;
  onSwitchToLogin: () => void;
}

export function RegisterScreen({ onBack, onSuccess, onSwitchToLogin }: RegisterScreenProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();

      const trimmedUsername = username.trim();
      const trimmedInvite = inviteCode.trim();

      // Client-side validation.
      if (!trimmedUsername) {
        setError(t("join.errorEmpty"));
        return;
      }
      if (trimmedUsername.length < 2) {
        setError(t("join.errorTooShort"));
        return;
      }
      if (trimmedUsername.length > 20) {
        setError(t("join.errorTooLong"));
        return;
      }
      if (!/^[一-龥a-zA-Z0-9_]+$/.test(trimmedUsername)) {
        setError(t("join.errorInvalidChars"));
        return;
      }
      if (password.length < 6) {
        setError(t("auth.passwordMinLength"));
        return;
      }
      if (password.length > 72) {
        setError(t("auth.passwordMaxLength"));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("auth.confirmNotMatch"));
        return;
      }
      if (!trimmedInvite) {
        setError(t("auth.invalidCode"));
        return;
      }

      setError("");
      setLoading(true);

      try {
        const result = await registerUser(trimmedUsername, password, trimmedInvite);
        if (result.success) {
          localStorage.setItem("tokendance:auth", "true");
          onSuccess(result.username);
        } else {
          setError(t("error.unknown"));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("error.unknown");
        // Map known server messages to i18n keys.
        if (msg.includes("invalid") || msg.includes("Invalid") || msg.includes("not found")) {
          setError(t("auth.invalidCode"));
        } else if (msg.includes("exhausted") || msg.includes("maximum")) {
          setError(t("auth.codeUsed"));
        } else if (msg.includes("already") || msg.includes("exists") || msg.includes("taken")) {
          setError(msg);
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [username, password, confirmPassword, inviteCode, onSuccess, t],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleRegister();
      }
    },
    [handleRegister],
  );

  return (
    <div className="animate-blur-in w-full max-w-md">
      <div className="rounded-xl border border-border bg-card p-8 shadow-2xl transition-colors duration-300">
        {/* Back button */}
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t("a11y.back")}
        >
          <ArrowLeft className="h-4 w-4" />
          {t("auth.back")}
        </button>

        {/* Title */}
        <h1 className="mb-6 text-center text-2xl font-semibold text-foreground tracking-tight">
          {t("auth.register")}
        </h1>

        {/* Form */}
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("auth.username")}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder={t("join.placeholder")}
              autoFocus
              maxLength={20}
              disabled={loading}
              autoComplete="username"
              aria-label={t("auth.username")}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("auth.password")}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="••••••"
                maxLength={128}
                disabled={loading}
                autoComplete="new-password"
                aria-label={t("auth.password")}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={loading}
                tabIndex={-1}
                aria-label={showPassword ? t("a11y.hidePassword") : t("a11y.showPassword")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("auth.confirmPassword")}
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="••••••"
                maxLength={128}
                disabled={loading}
                autoComplete="new-password"
                aria-label={t("auth.confirmPassword")}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                disabled={loading}
                tabIndex={-1}
                aria-label={showConfirmPassword ? t("a11y.hidePassword") : t("a11y.showPassword")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("auth.inviteCode")}
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => {
                setInviteCode(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="ABCD1234"
              maxLength={20}
              disabled={loading}
              autoComplete="off"
              aria-label={t("auth.inviteCode")}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive animate-fade-in" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password || !confirmPassword || !inviteCode.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:brightness-110 transition-all duration-200 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("auth.registerButton")}...
              </>
            ) : (
              t("auth.registerButton")
            )}
          </button>
        </form>

        {!loading && (!username.trim() || !password || !confirmPassword || !inviteCode.trim()) && (
          <p className="mt-2 text-xs text-muted-foreground/60 text-center">
            {t("auth.fillAllFields")}
          </p>
        )}

        {/* Link to login */}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-primary hover:underline transition-colors"
          >
            {t("auth.haveAccount")}
          </button>
        </p>
      </div>
    </div>
  );
}
