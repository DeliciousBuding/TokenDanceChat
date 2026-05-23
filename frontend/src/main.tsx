// Global error trap: log the raw error BEFORE React's ErrorBoundary
// swallows it as #321 (which is often a cascade from an earlier failure).
const _origError = console.error;
console.error = (...args: unknown[]) => {
  _origError.apply(console, args);
  // Surface the raw error in a visible overlay so we can diagnose
  // the real root cause without browser devtools.
  try {
    const el = document.getElementById("root");
    if (el && args[0] instanceof Error) {
      const banner = document.createElement("div");
      banner.id = "raw-error-banner";
      banner.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#b91c1c;color:#fff;padding:8px 12px;font:12px/1.4 monospace;white-space:pre-wrap;max-height:40vh;overflow:auto;";
      banner.textContent = `[RAW ERROR] ${args[0].message}\n${args[0].stack || ""}`;
      if (!document.getElementById("raw-error-banner")) {
        document.body.appendChild(banner);
      }
    }
  } catch { /* best-effort */ }
};

import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n/context";
import App from "./App";
import "./index.css";

// Theme initialization — runs before React to avoid flash
function initTheme() {
  const stored = localStorage.getItem("tdchat-theme");
  const root = document.documentElement;

  if (stored === "light") {
    root.classList.remove("dark");
    root.classList.add("light");
  } else if (stored === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else if (!stored) {
    root.classList.remove("dark");
    root.classList.add("light");
  } else if (stored === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
    root.classList.remove("light");
    // Listen for OS preference changes
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (localStorage.getItem("tdchat-theme") === "system") {
        root.classList.toggle("dark", e.matches);
        root.classList.remove("light");
      }
    });
  }
}
initTheme();

// Register service worker for PWA offline support.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // SW registration failed — app still works online.
  });
}

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { chatAPI } from "@/lib/api";

// Expose chatAPI for E2E tests (sends via existing WS, avoids kick mechanism).
// Only available in dev mode or when ?e2e query param is present.
if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('e2e')) {
  (window as any).__chatAPI = chatAPI;
}

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </I18nProvider>,
);
