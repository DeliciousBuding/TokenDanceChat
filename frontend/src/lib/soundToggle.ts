// Lightweight sound toggle config — kept synchronous for UI instant read.
const SOUND_STORAGE_KEY = "tokendance:soundEnabled";

export function isSoundEnabled(): boolean {
  try {
    const stored = localStorage.getItem(SOUND_STORAGE_KEY);
    if (stored === "false") return false;
    return true; // default on
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
  } catch {
    // ignore
  }
}
