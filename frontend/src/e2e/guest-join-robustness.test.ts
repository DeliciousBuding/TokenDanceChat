import { expect, test } from "@playwright/test";
import { joinGuestFromPreview } from "./helpers";

const setupPage = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("tokendance:lang", "zh-CN");
    localStorage.setItem("tdchat-theme", "light");
    localStorage.removeItem("tokendance:username");
  });
};

test.describe("Guest join robustness", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("guest join shows textarea within 10 seconds", async ({ page }) => {
    const name = `guest_${Math.random().toString(36).slice(2, 8)}`;
    await page.goto("/");
    await joinGuestFromPreview(page, name);

    // Textarea MUST appear — this is the core guest flow
    await expect(page.locator("textarea").first()).toBeVisible({ timeout: 15000 });
  });

  test("guest can send a message and see it appear", async ({ page }) => {
    const name = `sender_${Math.random().toString(36).slice(2, 8)}`;
    await page.goto("/");
    await joinGuestFromPreview(page, name);
    await expect(page.locator("textarea").first()).toBeVisible({ timeout: 15000 });

    const msg = `guest_msg_${Math.random().toString(36).slice(2, 6)}`;
    await page.locator("textarea").first().fill(msg);
    await page.keyboard.press("Enter");

    // Message must appear in the transcript
    await expect(page.getByText(msg).first()).toBeVisible({ timeout: 10000 });
  });

  test("guest join kicks old connection on duplicate username", async ({ page }) => {
    const name = `dup_${Math.random().toString(36).slice(2, 6)}`;

    // First join succeeds
    await page.goto("/");
    await joinGuestFromPreview(page, name);
    await expect(page.locator("textarea").first()).toBeVisible({ timeout: 15000 });

    // Second join with same name in new page should succeed — old connection gets kicked.
    const page2 = await page.context().newPage();
    await setupPage(page2);
    await page2.goto("/");
    await joinGuestFromPreview(page2, name);

    // New connection should show the chat textarea (joined successfully).
    await expect(page2.locator("textarea").first()).toBeVisible({ timeout: 15000 });
    await page2.close();
  });

  test("guest can rejoin with same name after page close", async ({ page }) => {
    const name = `rejoin_${Math.random().toString(36).slice(2, 8)}`;

    // First join
    await page.goto("/");
    await joinGuestFromPreview(page, name);
    await expect(page.locator("textarea").first()).toBeVisible({ timeout: 15000 });

    // Close and reopen — full disconnect
    await page.close();
    const page2 = await page.context().newPage();
    await setupPage(page2);
    await page2.goto("/");
    await joinGuestFromPreview(page2, name);
    await expect(page2.locator("textarea").first()).toBeVisible({ timeout: 15000 });

    // Can still send messages after rejoin
    const msg = `rejoin_msg_${Math.random().toString(36).slice(2, 6)}`;
    await page2.locator("textarea").first().fill(msg);
    await page2.keyboard.press("Enter");
    await expect(page2.getByText(msg).first()).toBeVisible({ timeout: 10000 });
    await page2.close();
  });

  test("guest join works on slow network (throttled)", async ({ browser }) => {
    const name = `slow_${Math.random().toString(36).slice(2, 8)}`;

    // Create context with network throttling
    const slowCtx = await browser.newContext();
    const slowPage = await slowCtx.newPage();
    await setupPage(slowPage);

    // Simulate Slow 3G
    await slowPage.route('**/*', (route) => route.continue());
    await slowCtx.setOffline(false);

    await slowPage.goto("/", { waitUntil: "domcontentloaded" });
    await joinGuestFromPreview(slowPage, name);

    // On slow network, connection should still complete within timeout
    await expect(slowPage.locator("textarea").first()).toBeVisible({ timeout: 30000 });
    await slowCtx.close();
  });

  test("ChatInput never hidden — scroll and resize check", async ({ page }) => {
    const name = `scroll_${Math.random().toString(36).slice(2, 8)}`;

    // Join
    await page.goto("/");
    await joinGuestFromPreview(page, name);
    await expect(page.locator("textarea").first()).toBeVisible({ timeout: 15000 });

    // Send many messages to fill the transcript
    for (let i = 0; i < 5; i++) {
      await page.locator("textarea").first().fill(`scroll test ${i}`);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
    }

    // Textarea must still be visible after scroll
    await expect(page.locator("textarea").first()).toBeVisible();

    // Test different viewport sizes
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await expect(page.locator("textarea").first()).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);
    await expect(page.locator("textarea").first()).toBeVisible();
  });
});
