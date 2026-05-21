import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const oneDay = 86400000;

  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  if (diff < oneDay && now.getDate() === date.getDate()) {
    return `${hours}:${minutes}`;
  }

  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");

  if (now.getFullYear() === date.getFullYear()) {
    return `${month}-${day} ${hours}:${minutes}`;
  }

  return `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}`;
}
