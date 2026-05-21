import { useCallback, useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "tdchat-theme";

function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "dark";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") {
    root.classList.remove("dark");
    root.classList.add("light");
  } else if (theme === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    // system — follow OS preference
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
    root.classList.remove("light");
  }
}

const icons: Record<Theme, typeof Moon> = {
  dark: Moon,
  light: Sun,
  system: Monitor,
};

const cycleOrder: Theme[] = ["dark", "light", "system"];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Listen for system color-scheme changes when in system mode
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (getStoredTheme() === "system") {
        document.documentElement.classList.toggle("dark", e.matches);
        document.documentElement.classList.remove("light");
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const cycle = useCallback(() => {
    setTheme((prev) => {
      const idx = cycleOrder.indexOf(prev);
      return cycleOrder[(idx + 1) % cycleOrder.length];
    });
  }, []);

  const Icon = icons[theme];

  return (
    <button
      onClick={cycle}
      className="touch-target rounded-lg p-2 text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
      aria-label={`Theme: ${theme}`}
      title={`Theme: ${theme}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
