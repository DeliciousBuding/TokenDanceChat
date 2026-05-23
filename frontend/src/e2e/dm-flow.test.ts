import { test, expect } from "@playwright/test";

/**
 * TokenDanceChat DM 与真实用户流程 E2E 测试。
 *
 * 运行方式：
 *   E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/dm-flow.test.ts --project=chromium
 *
 * 覆盖：
 *   1. 公共聊天发消息
 *   2. 验证已发送消息的用户名和内容
 *   3. 两人私信
 *   4. 发送后输入框清空
 *   5. 用户名出现在在线用户列表
 *   6. 语言切换
 *   7. 深色模式切换
 *   8. 滚动回到底部 FAB
 */

const setupPage = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("tokendance:lang", "zh-CN");
    localStorage.setItem("tdchat-theme", "light");
    localStorage.removeItem("tokendance:username");
  });
};

/**
 * Helper: guest-join the chat and wait until connected (textarea visible).
 * Returns the random guest name used.
 */
async function joinChat(
  page: import("@playwright/test").Page,
  name?: string,
): Promise<string> {
  const guestName = name ?? `e2e_${Math.random().toString(36).slice(2, 8)}`;

  await page.goto("/");
  await page.getByPlaceholder("你的用户名...").fill(guestName);
  await page.getByRole("button", { name: "游客加入" }).click();

  await expect(page.locator("textarea").first()).toBeVisible({
    timeout: 15000,
  });

  return guestName;
}

test.describe("DM & Real User Flows", () => {
  test.describe("Public chat messaging", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("guest can send a message in public chat", async ({ page }) => {
      await joinChat(page);

      const msg = `pub_${Math.random().toString(36).slice(2, 8)}`;
      await page.locator("textarea").first().fill(msg);
      await page.keyboard.press("Enter");

      await expect(page.getByText(msg).first()).toBeVisible({
        timeout: 15000,
      });
    });

    test("guest can see their own message with correct username and content", async ({
      page,
    }) => {
      const name = await joinChat(page);

      const msg = `verify_${Math.random().toString(36).slice(2, 8)}`;
      await page.locator("textarea").first().fill(msg);
      await page.keyboard.press("Enter");

      // The message content must appear in the transcript.
      await expect(page.getByText(msg).first()).toBeVisible({
        timeout: 15000,
      });

      // The sender's guest name should be visible on the page
      // (rendered in the message bubble sender label and the online users sidebar).
      await expect(page.getByText(name).first()).toBeVisible({
        timeout: 10000,
      });
    });

    test("message input clears after sending", async ({ page }) => {
      await joinChat(page);

      const msg = `clear_${Math.random().toString(36).slice(2, 8)}`;
      const textarea = page.locator("textarea").first();

      await textarea.fill(msg);
      await page.keyboard.press("Enter");

      // Wait for the message to render.
      await expect(page.getByText(msg).first()).toBeVisible({
        timeout: 15000,
      });

      // Textarea must be cleared after a successful send.
      await expect(textarea).toHaveValue("", { timeout: 5000 });
    });
  });

  test.describe("Sidebar & online users", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("guest name appears in online users list after joining", async ({
      page,
    }) => {
      const name = await joinChat(page);

      // The online users section lives inside the sidebar <aside>.
      // The current user is rendered as a UserListItem button whose text content
      // includes the guest name. Scoping to the <aside> avoids matching other
      // elements that happen to contain the name text.
      const sidebar = page.locator("aside");
      await expect(sidebar).toBeVisible({ timeout: 10000 });

      await expect(sidebar.getByText(name).first()).toBeVisible({
        timeout: 10000,
      });
    });
  });

  test.describe("DM between guests", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("two guests can DM each other", async ({ page }) => {
      // Guest1 joins first.
      await joinChat(page);

      // Guest2 joins in a second tab.
      const page2 = await page.context().newPage();
      await setupPage(page2);
      const name2 = await joinChat(page2);

      // Verify guest2 appears in guest1's online users sidebar.
      const sidebar = page.locator("aside");
      await expect(sidebar.getByText(name2).first()).toBeVisible({
        timeout: 15000,
      });

      // The inline context menu in UserListItem can be clipped by the
      // sidebar's overflow-hidden container, making Playwright-level
      // clicks unreliable.  Use page.evaluate with async setTimeout to
      // let React re-render between clicks.
      await page.evaluate(
        async (targetName: string) => {
          const buttons = Array.from(
            document.querySelectorAll("aside button"),
          );
          const userBtn = buttons.find(
            (b) => b.getAttribute("aria-label")?.trim() === targetName,
          );
          if (!userBtn)
            throw new Error(`User button not found: ${targetName}`);

          // Click the user list item to open the inline context menu.
          (userBtn as HTMLElement).click();

          // Wait for React 18 to commit the re-render.
          await new Promise((r) => setTimeout(r, 800));

          // Find and click the "发送消息" button in the context menu.
          const inner = Array.from(
            userBtn.querySelectorAll<HTMLButtonElement>("button"),
          );
          const dmBtn = inner.find(
            (b) => b.textContent?.trim() === "发送消息",
          );
          if (!dmBtn)
            throw new Error("DM context-menu item not found after click");

          dmBtn.click();
        },
        name2,
      );

      // The chat should switch to DM mode. The desktop header should show
      // guest2's name.
      const header = page.locator('[data-visual="desktop-chat-title"]');
      await expect(header).toContainText(name2, { timeout: 10000 });

      // Send a DM message.
      const dmMsg = `dm_${Math.random().toString(36).slice(2, 8)}`;
      await page.locator("textarea").first().fill(dmMsg);
      await page.keyboard.press("Enter");

      // The DM message must appear in the transcript.
      await expect(page.getByText(dmMsg).first()).toBeVisible({
        timeout: 15000,
      });

      await page2.close();
    });
  });

  test.describe("UI toggles", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("language switch toggles UI text on join screen", async ({ page }) => {
      await page.goto("/");

      // Start in Chinese (set by setupPage).
      await expect(
        page.getByRole("button", { name: "游客加入" }),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByPlaceholder("你的用户名..."),
      ).toBeVisible({ timeout: 5000 });

      // The language toggle button has aria-label="切换语言" (t("lang.label")).
      const langButton = page.getByRole("button", { name: "切换语言" });
      await expect(langButton).toBeVisible({ timeout: 10000 });
      await langButton.click();

      // UI must switch to English.
      await expect(
        page.getByRole("button", { name: "Join as Guest" }),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByPlaceholder("Your username..."),
      ).toBeVisible({ timeout: 5000 });

      // Toggle back to Chinese.
      const langButtonEn = page.getByRole("button", {
        name: "Switch language",
      });
      await expect(langButtonEn).toBeVisible({ timeout: 10000 });
      await langButtonEn.click();

      await expect(
        page.getByRole("button", { name: "游客加入" }),
      ).toBeVisible({ timeout: 15000 });
    });

    test("language switch works inside chat after joining", async ({ page }) => {
      await joinChat(page);

      // Inside chat, the language toggle is in the "More" dropdown (desktop).
      // Open the More dropdown.
      const moreBtn = page.getByRole("button", { name: "更多" });
      await expect(moreBtn).toBeVisible({ timeout: 10000 });
      await moreBtn.click();
      await page.waitForTimeout(300);

      // The language switch item shows the target language.
      // Current lang is zh-CN, so the item shows "English".
      const langItem = page.getByText("English", { exact: true });
      await expect(langItem).toBeVisible({ timeout: 5000 });
      await langItem.click();

      // After switching to English, the disconnect button accessible name changes.
      // Desktop header: aria-label="Disconnect" (t("chat.disconnect")).
      await expect(
        page.getByRole("button", { name: "Disconnect" }),
      ).toBeVisible({ timeout: 10000 });

      // Verify the more dropdown is closed after clicking.
      await expect(page.getByText("English", { exact: true })).not.toBeVisible({
        timeout: 5000,
      });
    });

    test("dark mode toggle works on join screen", async ({ page }) => {
      await page.goto("/");

      // The ThemeToggle has aria-label="Theme: light" initially.
      const themeBtn = page.getByRole("button", { name: "Theme: light" });
      await expect(themeBtn).toBeVisible({ timeout: 10000 });

      // Click to cycle to dark.
      await themeBtn.click();

      // The html element should now have class "dark".
      const html = page.locator("html");
      await expect(html).toHaveClass(/dark/, { timeout: 5000 });

      // The button aria-label should update to "Theme: dark".
      await expect(
        page.getByRole("button", { name: "Theme: dark" }),
      ).toBeVisible({ timeout: 5000 });

      // Toggle back to light.
      await page.getByRole("button", { name: "Theme: dark" }).click();
      await expect(html).not.toHaveClass(/dark/, { timeout: 5000 });
    });

    test("dark mode toggle works inside chat", async ({ page }) => {
      await joinChat(page);

      // On desktop, the theme toggle is hidden (lg:hidden).
      // Use the More dropdown to change theme.
      const moreBtn = page.getByRole("button", { name: "更多" });
      await expect(moreBtn).toBeVisible({ timeout: 10000 });
      await moreBtn.click();
      await page.waitForTimeout(300);

      // The theme item shows the current theme label.
      // Initial theme is "light" → label is "浅色" (t("settings.themeLight")).
      const themeItem = page.getByText("浅色", { exact: true });
      await expect(themeItem).toBeVisible({ timeout: 5000 });

      // Click to switch to dark mode.
      await themeItem.click();

      // The html element should have the "dark" class.
      await expect(page.locator("html")).toHaveClass(/dark/, {
        timeout: 5000,
      });

      // Reopen the More dropdown to switch back.
      await page.getByRole("button", { name: "更多" }).click();
      await page.waitForTimeout(300);

      // Current theme is dark → label is "深色" (t("settings.themeDark")).
      const darkItem = page.getByText("深色", { exact: true });
      await expect(darkItem).toBeVisible({ timeout: 5000 });
      await darkItem.click();

      await expect(page.locator("html")).not.toHaveClass(/dark/, {
        timeout: 5000,
      });
    });
  });

  test.describe("Scroll-to-bottom FAB", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("scroll-to-bottom FAB appears when scrolled up", async ({ page }) => {
      await joinChat(page);

      // Send multiple messages to fill enough content for scrolling.
      for (let i = 0; i < 12; i++) {
        const msg = `scroll_${i}_${Math.random().toString(36).slice(2, 6)}`;
        await page.locator("textarea").first().fill(msg);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(150);
      }

      // Scroll the transcript container up to trigger the FAB.
      // The MessageTranscript manages its own scroll container.
      await page.evaluate(() => {
        // Find a scrollable element within the transcript area.
        const containers = document.querySelectorAll(
          '[class*="overflow"], [class*="scroll"]',
        );
        for (const el of containers) {
          if (
            el instanceof HTMLElement &&
            el.scrollHeight > el.clientHeight + 200
          ) {
            el.scrollTop = 0;
            return;
          }
        }
        // Fallback: scroll the window.
        window.scrollTo(0, 0);
      });

      // The ScrollToBottom FAB has aria-label="Scroll to bottom".
      const fab = page.getByRole("button", { name: /回到底部|scroll to bottom/i });
      await expect(fab).toBeVisible({ timeout: 10000 });
    });
  });
});
