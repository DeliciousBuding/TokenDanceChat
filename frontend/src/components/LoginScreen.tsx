import { useState, useCallback, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { loginUser } from "@/lib/api";

interface LoginScreenProps {
  onBack: () => void;
  onSuccess: (username: string) => void;
  onSwitchToRegister: () => void;
}

export function LoginScreen({ onBack, onSuccess, onSwitchToRegister }: LoginScreenProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();

      const trimmedUsername = username.trim();

      if (!trimmedUsername) {
        setError(t("join.errorEmpty"));
        return;
      }
      if (!password) {
        setError(t("auth.passwordMinLength"));
        return;
      }

      setError("");
      setLoading(true);

      try {
        const result = await loginUser(trimmedUsername, password);
        if (result.success) {
          onSuccess(result.username);
        } else {
          setError(t("error.unknown"));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("error.unknown");
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [username, password, onSuccess, t],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleLogin();
      }
    },
    [handleLogin],
  );

  return (
    <div className="animate-blur-in w-full max-w-md">
      <div className="rounded-xl border border-border bg-card p-8 shadow-2xl transition-colors duration-300">
        {/* Back button */}
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("auth.guestLogin")}
        </button>

        {/* Title */}
        <h1 className="mb-6 text-center text-2xl font-semibold text-foreground tracking-tight">
          {t("auth.login")}
        </h1>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
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
              aria-label={t("auth.username")}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("auth.password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="••••••"
              maxLength={128}
              disabled={loading}
              aria-label={t("auth.password")}
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
            disabled={loading || !username.trim() || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:brightness-110 transition-all duration-200 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("auth.loginButton")}...
              </>
            ) : (
              t("auth.loginButton")
            )}
          </button>
        </form>

        {/* Link to register */}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-primary hover:underline transition-colors"
          >
            {t("auth.noAccount")}
          </button>
        </p>
      </div>
    </div>
  );
}
