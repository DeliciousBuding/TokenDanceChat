import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("index.html security/runtime contract", () => {
  it("does not load external Google Fonts that are blocked by the runtime CSP", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");

    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
  });
});
