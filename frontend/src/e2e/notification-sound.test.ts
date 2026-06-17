import { test, expect } from "@playwright/test";
import { joinGuestFromPreview } from "./helpers";

/**
 * TokenDanceChat lightweight notification tests.
 *
 * The current product contract has no DM sidebar or unread-DM badges. These
 * tests cover the remaining core notification behavior: the lightweight
 * notification drawer and public-room mention delivery.
 */

const setupPage = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("tokendance:lang", "zh-CN");
    localStorage.setItem("tdchat-theme", "light");
    localStorage.removeItem("tokendance:username");
  });
};

async function joinChat(page: import("@playwright/test").Page, name?: string): Promise<string> {
  const guestName = name ?? `e2e_${Math.random().toString(36).slice(2, 8)}`;

  await page.goto("/");
  await joinGuestFromPreview(page, guestName);
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 15000 });

  return guestName;
}

async function openSettings(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "更多" }).click();
  await page.locator("[data-more-menu] .td-chat-menu").getByRole("button", { name: /设置|打开设置/ }).click();
  await expect(page.locator("[data-visual='settings-content']")).toBeVisible({ timeout: 10000 });
}

test.describe("Notification surface", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("lightweight notification drawer opens and closes without old settings tabs", async ({ page }) => {
    await joinChat(page);
    await openSettings(page);

    await expect(page.locator("[data-visual='settings-modal']")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("通知偏好")).toBeVisible();
    await expect(page.getByText(/个人资料|外观|Sound|音效/)).toHaveCount(0);

    await page.getByRole("button", { name: "关闭" }).click();
    await expect(page.locator("[data-visual='settings-modal']")).toHaveCount(0);
  });

  test("@mention in public chat renders in the target user's transcript", async ({ page }) => {
    const nameA = await joinChat(page);

    const pageB = await page.context().newPage();
    await setupPage(pageB);
    await joinChat(pageB);

    const mentionMsg = `codex mention @${nameA} ${Math.random().toString(36).slice(2, 6)}`;
    await pageB.locator("textarea").first().fill(mentionMsg);
    await pageB.keyboard.press("Enter");

    await expect(page.getByText("codex mention").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button").filter({ hasText: `@${nameA}` }).first()).toBeVisible({
      timeout: 10000,
    });

    await expect(page.locator("aside").getByText(/私信|Direct Messages|DM/)).toHaveCount(0);
    await pageB.close();
  });
});
