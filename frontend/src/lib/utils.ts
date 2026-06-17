import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CSSProperties } from "react";

export type TFunction = (key: string, params?: Record<string, string | number>) => string;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(timestamp: number, t: TFunction): string {
  const date = new Date(timestamp);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  // Less than 1 minute
  if (diffSec < 60) return t("profile.justNow");

  // Less than 1 hour
  if (diffMin < 60) return t("profile.minutesAgo", { n: String(diffMin) });

  // Less than 4 hours: "HH:mm"
  if (diffHour < 4) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // Different year: "YY-MM-DD"
  if (date.getFullYear() !== new Date().getFullYear()) {
    const yy = date.getFullYear().toString().slice(-2);
    return `${yy}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  // Same year, older: "MM-DD"
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatFullTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDate(timestamp: number, t: TFunction): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return t("profile.today");
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return t("profile.yesterday");
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Consistent string hashing used for avatar colors across all components.
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

/**
 * Returns the shared avatar background token. Pair with avatarIdentityStyle()
 * so each username still receives a stable hue without hardcoding color formulas
 * in component source.
 */
export function avatarGradient(username: string): string {
  void username;
  return "var(--chat-identity-avatar)";
}

export function avatarIdentityStyle(username: string): CSSProperties {
  return { "--chat-identity-hue": `${hashString(username) % 360}` } as CSSProperties;
}

/**
 * Returns the hue value for a username (for name coloring).
 */
export function usernameHue(username: string): number {
  return hashString(username) % 360;
}

/**
 * Formats a "last seen" timestamp into a human-readable relative time string.
 */
export function formatLastSeen(lastSeenTs: number, t: TFunction): string {
  const now = Date.now();
  const diffMs = now - lastSeenTs;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return t("profile.justNow");
  if (diffMin < 60) return t("profile.minutesAgo", { n: String(diffMin) });
  if (diffHour < 24) return t("profile.hoursAgo", { n: String(diffHour) });
  if (diffDay < 30) return t("profile.daysAgo", { n: String(diffDay) });
  return formatTime(lastSeenTs, t);
}
