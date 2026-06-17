import { expect, type Page } from "@playwright/test";

export async function waitForLightChatReady(page: Page) {
  await expect(page.getByRole("log", { name: /^(公共聊天|Public Chat)$/ })).toBeVisible({ timeout: 15000 });
  const composer = page.locator("[data-visual='composer-textarea']");
  await expect(composer).toBeVisible({ timeout: 15000 });
  await expect(composer).toBeEnabled({ timeout: 15000 });
  return composer;
}

export async function joinGuestFromPreview(page: Page, username: string) {
  await page.evaluate((name) => {
    localStorage.setItem("tokendance:username", name);
    localStorage.removeItem("tokendance:auth");
  }, username);
  await page.reload();
  return waitForLightChatReady(page);
}
