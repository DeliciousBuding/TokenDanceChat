import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n/context";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App";
import "./index.css";

// Theme initialization — runs before React to avoid flash
function initTheme() {
  const stored = localStorage.getItem("tdchat-theme");
  const root = document.documentElement;

  if (stored === "light") {
    root.classList.remove("dark");
    root.classList.add("light");
  } else if (stored === "dark" || !stored) {
    root.classList.add("dark");
    root.classList.remove("light");
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
);
