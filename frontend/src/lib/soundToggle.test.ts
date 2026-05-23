import { beforeEach, describe, expect, it } from "vitest";
import { isSoundEnabled, setSoundEnabled } from "@/lib/soundToggle";

const KEY = "tokendance:soundEnabled";

describe("soundToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  // ── isSoundEnabled ───────────────────────────────────────────────
  describe("isSoundEnabled", () => {
    it("returns true by default when nothing is stored", () => {
      expect(isSoundEnabled()).toBe(true);
    });

    it("returns false when stored value is the string \"false\"", () => {
      localStorage.setItem(KEY, "false");
      expect(isSoundEnabled()).toBe(false);
    });

    it("returns true when stored value is the string \"true\"", () => {
      localStorage.setItem(KEY, "true");
      expect(isSoundEnabled()).toBe(true);
    });

    it("treats any value other than \"false\" as true", () => {
      localStorage.setItem(KEY, "random-string");
      expect(isSoundEnabled()).toBe(true);
    });

    it("treats empty string as true", () => {
      localStorage.setItem(KEY, "");
      expect(isSoundEnabled()).toBe(true);
    });
  });

  // ── setSoundEnabled ──────────────────────────────────────────────
  describe("setSoundEnabled", () => {
    it("writes \"true\" to localStorage when called with true", () => {
      setSoundEnabled(true);
      expect(localStorage.getItem(KEY)).toBe("true");
    });

    it("writes \"false\" to localStorage when called with false", () => {
      setSoundEnabled(false);
      expect(localStorage.getItem(KEY)).toBe("false");
    });

    it("overwrites the previous value", () => {
      setSoundEnabled(true);
      setSoundEnabled(false);
      expect(localStorage.getItem(KEY)).toBe("false");

      setSoundEnabled(true);
      expect(localStorage.getItem(KEY)).toBe("true");
    });
  });
});
