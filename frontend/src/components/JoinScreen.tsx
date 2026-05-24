import { useState, useCallback, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { MessageCircle, ArrowRight, Loader2, Globe } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTranslation } from "@/i18n/context";
import { ChatError, ErrorCode } from "@/lib/api";
import { ThemeToggle } from "./ThemeToggle";
import { RegisterScreen } from "./RegisterScreen";
import { LoginScreen } from "./LoginScreen";
import type { Language } from "@/i18n/translations";

const USERNAME_STORAGE_KEY = "tokendance:username";

type SubView = "guest" | "login" | "register";

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
  if (err instanceof Error) {
    return err.message;
  }
  return t("error.unknown");
}

export function JoinScreen() {
  const { t, lang, setLang } = useTranslation();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [subView, setSubView] = useState<SubView>("login");
  const { setView, setUsername: setStoreUsername, setGuest } = useChatStore();
  const { connect } = useWebSocket();

  // Load saved username from localStorage on mount.
  useEffect(() => {
    const saved = localStorage.getItem(USERNAME_STORAGE_KEY);
    if (saved) {
      setUsername(saved);
    }
  }, []);

  const handleJoinSuccess = useCallback(
    async (name: string) => {
      try {
        await connect(name);
        localStorage.setItem(USERNAME_STORAGE_KEY, name);
        setStoreUsername(name);
        setView("chat");
      } catch (err) {
        setError(getErrorMessage(err, t));
        setConnecting(false);
      }
    },
    [connect, setStoreUsername, setView, t],
  );

  const handleGuestJoin = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();

      const trimmed = username.trim();
      if (!trimmed) {
        setError(t("join.errorEmpty"));
        return;
      }

      if (trimmed.length < 2) {
        setError(t("join.errorTooShort"));
        return;
      }

      if (trimmed.length > 20) {
        setError(t("join.errorTooLong"));
        return;
      }

      if (!/^[一-龥a-zA-Z0-9_]+$/.test(trimmed)) {
        setError(t("join.errorInvalidChars"));
        return;
      }

      setError("");
      setConnecting(true);
      setGuest(true);
      await handleJoinSuccess(trimmed);
    },
    [username, handleJoinSuccess, t, setGuest],
  );

  const handleAuthSuccess = useCallback(
    (name: string) => {
      // Switch to guest view first, then attempt auto-join
      setSubView("guest");
      setUsername(name);
      setError("");
      setConnecting(true);
      setGuest(false);
      handleJoinSuccess(name);
    },
    [handleJoinSuccess, setGuest],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleGuestJoin();
      }
    },
    [handleGuestJoin],
  );

  const toggleLang = useCallback(() => {
    const next: Language = lang === "zh-CN" ? "en-US" : "zh-CN";
    setLang(next);
  }, [lang, setLang]);

  const goToGuest = useCallback(() => {
    setSubView("guest");
    setError("");
  }, []);

  // Render auth screens managed by subView state.
  if (subView === "register") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <RegisterScreen
          onBack={goToGuest}
          onSuccess={handleAuthSuccess}
          onSwitchToLogin={() => setSubView("login")}
        />
      </div>
    );
  }

  if (subView === "login") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <LoginScreen
          onBack={goToGuest}
          onSuccess={handleAuthSuccess}
          onSwitchToRegister={() => setSubView("register")}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="animate-blur-in w-full max-w-md">
        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-8 shadow-2xl transition-colors duration-300">
          {/* Logo / Icon */}
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent ring-1 ring-border">
              <MessageCircle
                className="h-8 w-8 text-primary"
              />
            </div>
          </div>

          {/* Title */}
          <h1 className="mb-1 text-center text-2xl font-semibold text-foreground tracking-tight">
            {t("join.title")}
          </h1>
          <p className="mb-8 text-center text-sm text-muted-foreground">
            {t("join.subtitle")}
          </p>

          {/* Form */}
          <form onSubmit={handleGuestJoin} className="space-y-4">
            <div>
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
                disabled={connecting}
                aria-label={t("join.placeholder")}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none disabled:opacity-50"
              />
              {error && (
                <p className="mt-2 text-xs text-destructive animate-fade-in" role="alert">
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={connecting || !username.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:brightness-110 transition-all duration-200 disabled:opacity-50"
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("join.buttonConnecting")}
                </>
              ) : (
                <>
                  {t("join.buttonGuest")}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{t("join.orText")}</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Login / Register buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSubView("login")}
              disabled={connecting}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200 disabled:opacity-50"
            >
              {t("join.buttonLogin")}
            </button>
            <button
              type="button"
              onClick={() => setSubView("register")}
              disabled={connecting}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200 disabled:opacity-50"
            >
              {t("join.buttonRegister")}
            </button>
          </div>

          {/* Feature hint */}
          <p className="mt-4 text-center text-xs text-muted-foreground/60">
            {t("join.welcomeHint")}
          </p>

          {/* Language + Theme toggles */}
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-all duration-200"
              aria-label={t("lang.label")}
            >
              <Globe className="h-3 w-3" />
              {t("lang.switchTo")}
            </button>
            <ThemeToggle />
          </div>
        </div>

        {/* Footer hint */}
        <p className="mt-6 text-center text-xs text-muted-foreground/50 transition-colors duration-300">
          {t("join.footer")}
        </p>
      </div>
    </div>
  );
}
