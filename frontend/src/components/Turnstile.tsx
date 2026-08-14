import { useEffect, useRef } from "react";

// Public sitekey for the TokenDance Turnstile widget (shared across TokenDance
// products; the apex domain covers all *.tokendancelab.com subdomains).
const TURNSTILE_SITEKEY = "0x4AAAAAAEPffQ8Jjwy5sCAD";
const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";

interface TurnstileRenderOptions {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  action?: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${TURNSTILE_SCRIPT_URL}?render=explicit`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface TurnstileWidgetProps {
  onTokenChange: (token: string | null) => void;
  onError?: () => void;
}

// TurnstileWidget renders a Cloudflare Turnstile challenge. It calls
// onTokenChange with the siteverify token on success and null on expiry; onError
// fires when the script fails or the widget cannot render (e.g. unregistered
// hostname in local dev).
export function TurnstileWidget({ onTokenChange, onError }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const onErrorRef = useRef(onError);
  onTokenChangeRef.current = onTokenChange;
  onErrorRef.current = onError;

  useEffect(() => {
    let widgetId: string | null = null;
    let disposed = false;

    loadTurnstileScript()
      .then(() => {
        if (disposed || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITEKEY,
          theme: "auto",
          action: "login",
          callback: (token) => onTokenChangeRef.current(token),
          "expired-callback": () => onTokenChangeRef.current(null),
          "error-callback": () => {
            onTokenChangeRef.current(null);
            onErrorRef.current?.();
          },
        });
      })
      .catch(() => {
        if (!disposed) {
          onTokenChangeRef.current(null);
          onErrorRef.current?.();
        }
      });

    return () => {
      disposed = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // Ignore removal errors during teardown.
        }
      }
    };
  }, []);

  return <div ref={containerRef} className="turnstile-widget" />;
}
