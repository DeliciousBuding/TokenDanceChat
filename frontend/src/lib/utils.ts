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

  // Less than 1 minute: "刚刚"
  if (diffSec < 60) return "刚刚";

  // Less than 1 hour: "N分钟前"
  if (diffMin < 60) return `${diffMin}分钟前`;

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

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
