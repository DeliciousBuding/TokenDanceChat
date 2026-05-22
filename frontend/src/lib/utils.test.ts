import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatTime, cn, avatarGradient, usernameHue, hashString } from "@/lib/utils";

describe("formatTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Freeze "now" to 2025-01-15T12:00:00.000Z
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("少于60秒显示刚刚（英文显示just now）", () => {
    const ts = Date.now() - 30 * 1000; // 30 seconds ago
    expect(formatTime(ts)).toBe("just now");
  });

  it("1到59分钟显示X分钟前", () => {
    const ts = Date.now() - 5 * 60 * 1000; // 5 minutes ago
    expect(formatTime(ts)).toBe("5m ago");
  });

  it("同一天超过1小时显示HH:mm", () => {
    // 2 hours ago on the same day — use Date.now() for timezone-agnostic test
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const expected = new Date(twoHoursAgo);
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(formatTime(twoHoursAgo)).toBe(`${pad(expected.getHours())}:${pad(expected.getMinutes())}`);
  });

  it("同一年内不同天显示MM-DD HH:mm", () => {
    // 5 days ago — different day, same year
    const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const d = new Date(fiveDaysAgo);
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(formatTime(fiveDaysAgo)).toBe(`${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
  });

  it("不同年份显示YYYY-MM-DD", () => {
    // Create a timestamp in the previous year
    const now = new Date();
    const lastYear = new Date(now.getFullYear() - 1, 5, 15, 12, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(formatTime(lastYear.getTime())).toBe(
      `${lastYear.getFullYear()}-${pad(lastYear.getMonth() + 1)}-${pad(lastYear.getDate())}`,
    );
  });
});

describe("cn", () => {
  it("合并多个类名", () => {
    const result = cn("px-4", "py-2", "bg-red-500");
    expect(result).toContain("px-4");
    expect(result).toContain("py-2");
    expect(result).toContain("bg-red-500");
  });

  it("处理条件类名（falsy值被过滤）", () => {
    const result = cn("base", false && "hidden", "visible");
    expect(result).toContain("base");
    expect(result).toContain("visible");
    expect(result).not.toContain("hidden");
  });

  it("tailwind-merge 合并冲突类名", () => {
    // twMerge should resolve conflicts: later classes override earlier ones
    const result = cn("px-4", "px-6");
    expect(result).toContain("px-6");
    expect(result).not.toContain("px-4");
  });

  it("无参数时返回空字符串", () => {
    expect(cn()).toBe("");
  });
});

describe("hashString", () => {
  it("相同输入产生相同哈希", () => {
    expect(hashString("Alice")).toBe(hashString("Alice"));
  });

  it("不同输入产生不同哈希", () => {
    expect(hashString("Alice")).not.toBe(hashString("Bob"));
  });

  it("返回非负整数", () => {
    const h = hashString("test");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe("avatarGradient", () => {
  it("返回合法的CSS渐变字符串", () => {
    const gradient = avatarGradient("Alice");
    expect(gradient).toContain("linear-gradient");
    expect(gradient).toContain("oklch");
    expect(typeof gradient).toBe("string");
    expect(gradient.length).toBeGreaterThan(0);
  });

  it("相同用户名返回相同渐变", () => {
    expect(avatarGradient("Bob")).toBe(avatarGradient("Bob"));
  });
});

describe("usernameHue", () => {
  it("返回值在0到359之间", () => {
    for (const name of ["Alice", "Bob", "Charlie", "测试用户", "a", "Z" + "x".repeat(100)]) {
      const hue = usernameHue(name);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("相同用户名返回相同色相", () => {
    expect(usernameHue("Alice")).toBe(usernameHue("Alice"));
  });
});
