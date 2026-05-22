import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  // Less than 1 minute: "just now"
  if (diffSec < 60) return "just now";

  // Less than 1 hour: "Nm ago"
  if (diffMin < 60) return `${diffMin}m ago`;

  // Less than 24h and same day: "HH:mm"
  const today = new Date();
  if (
    diffHour < 24 &&
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  ) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // This year: "MM-DD HH:mm"
  if (date.getFullYear() === today.getFullYear()) {
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // Other years: "YYYY-MM-DD HH:mm"
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatFullTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
 * Returns a CSS gradient string for a user avatar background.
 */
export function avatarGradient(username: string): string {
  const baseHue = hashString(username) % 360;
  const hue1 = baseHue;
  const hue2 = (baseHue + 45) % 360;
  return `linear-gradient(135deg, oklch(65% 0.16 ${hue1}), oklch(58% 0.14 ${hue2}))`;
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
export function formatLastSeen(lastSeenTs: number): string {
  const now = Date.now();
  const diffMs = now - lastSeenTs;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatTime(lastSeenTs);
}
