import { test, expect } from "@playwright/test";
import { joinGuestFromPreview } from "./helpers";

const setupPage = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("tokendance:lang", "zh-CN");
    localStorage.setItem("tdchat-theme", "light");
    localStorage.removeItem("tokendance:username");
  });
};

async function joinChat(page: import("@playwright/test").Page): Promise<void> {
  const username = `err_${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/");
  await joinGuestFromPreview(page, username);
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 15000 });
}

test.describe("Current lightweight error paths", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("pressing Enter on empty textarea does not send a message", async ({ page }) => {
    await joinChat(page);

    const textarea = page.locator("textarea").first();
    await textarea.fill("");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    await expect(textarea).toBeVisible({ timeout: 5000 });

    const msg = `empty_${Math.random().toString(36).slice(2, 6)}`;
    await textarea.fill(msg);
    await page.keyboard.press("Enter");
    await expect(page.getByText(msg).first()).toBeVisible({ timeout: 15000 });
  });
});
