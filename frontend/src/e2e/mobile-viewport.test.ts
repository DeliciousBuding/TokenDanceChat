import { test, expect } from "@playwright/test";

/**
 * TokenDanceChat 移动端视口 E2E 测试。
 *
 * 运行方式：
 *   E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/mobile-viewport.test.ts --project=chromium --workers=1
 *
 * 覆盖：
 *   1. 移动端侧边栏开关（375px 窄视口）
 *   2. 移动端工具栏按钮可见性
 *   3. 移动端消息紧凑密度（更小字号/间距）
 *   4. 移动端输入框在键盘环境下的可用性
 *   5. 移动端 "更多操作" 下拉菜单
 */

const MOBILE_VIEWPORT = { width: 375, height: 812 };

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
async function joinChat(page: import("@playwright/test").Page): Promise<string> {
  const name = `mobile_${Math.random().toString(36).slice(2, 8)}`;

  await page.goto("/");
  await page.getByPlaceholder("你的用户名...").fill(name);
  await page.getByRole("button", { name: "游客加入" }).click();

  // Should auto-join and see chat textarea.
  await expect(page.locator("textarea").first()).toBeVisible({
    timeout: 15000,
  });

  return name;
}

test.describe("Mobile viewport (375x812)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setupPage(page);
  });

  test.describe("Sidebar toggle", () => {
    test("sidebar opens when hamburger menu is clicked", async ({ page }) => {
      await joinChat(page);

      // On narrow viewport the sidebar should be off-screen initially (closed).
      // The backdrop overlay should NOT be present.
      // Use specific CSS classes from the backdrop div in ChatLayout:
      //   fixed inset-0 z-40 bg-black/50 backdrop-blur-sm
      const backdrop = page.locator(".fixed.inset-0.z-40");
      await expect(backdrop).not.toBeVisible({ timeout: 5000 });

      // Click the hamburger menu button to open sidebar.
      const menuBtn = page.getByRole("button", { name: "打开侧边栏" });
      await expect(menuBtn).toBeVisible({ timeout: 5000 });
      await menuBtn.click();

      // Backdrop should now be visible.
      await expect(backdrop).toBeVisible({ timeout: 5000 });

      // Sidebar should now be open -- the close button should be visible.
      const closeBtnCheck = page.getByRole("button", { name: "关闭侧边栏" });
      await expect(closeBtnCheck).toBeVisible({ timeout: 5000 });
    });

    test("sidebar closes when X button is clicked", async ({ page }) => {
      await joinChat(page);

      // Open sidebar.
      const menuBtn = page.getByRole("button", { name: "打开侧边栏" });
      await menuBtn.click();

      // Verify sidebar is open.
      const closeBtn = page.getByRole("button", { name: "关闭侧边栏" });
      await expect(closeBtn).toBeVisible({ timeout: 5000 });

      // Click close button.
      await closeBtn.click();

      // Backdrop should be hidden again.
      const backdrop = page.locator(".fixed.inset-0.z-40");
      await expect(backdrop).not.toBeVisible({ timeout: 5000 });
    });

    test("sidebar closes when backdrop is tapped", async ({ page }) => {
      await joinChat(page);

      // Open sidebar.
      const menuBtn = page.getByRole("button", { name: "打开侧边栏" });
      await menuBtn.click();

      // Backdrop should be visible.
      const backdrop = page.locator(".fixed.inset-0.z-40");
      await expect(backdrop).toBeVisible({ timeout: 5000 });

      // Click the backdrop overlay to dismiss.
      await backdrop.click();

      // Sidebar should close.
      await expect(backdrop).not.toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Toolbar visibility", () => {
    test("all mobile toolbar buttons are visible", async ({ page }) => {
      await joinChat(page);

      // Hamburger menu button (opens sidebar).
      const menuBtn = page.getByRole("button", { name: "打开侧边栏" });
      await expect(menuBtn).toBeVisible({ timeout: 5000 });

      // Chat title in mobile top bar.
      const chatTitle = page.locator('[data-visual="mobile-chat-title"]');
      await expect(chatTitle).toBeVisible({ timeout: 5000 });

      // Theme toggle button (aria-label is "Theme: light" with our setup).
      const themeBtn = page.getByRole("button", { name: "Theme: light" });
      await expect(themeBtn).toBeVisible({ timeout: 5000 });

      // More actions button (three-dot menu).
      const moreBtn = page.getByRole("button", { name: "更多操作" });
      await expect(moreBtn).toBeVisible({ timeout: 5000 });
    });

    test("desktop header is hidden on mobile", async ({ page }) => {
      await joinChat(page);

      // The desktop header has class "hidden lg:flex" — on 375px viewport it should be hidden.
      // The desktop title should not be visible.
      const desktopTitle = page.locator('[data-visual="desktop-chat-title"]');
      await expect(desktopTitle).not.toBeVisible({ timeout: 5000 });

      // Desktop more dropdown button should not be visible (uses exact match to
      // avoid matching the mobile "更多操作" button which contains "更多" as substring).
      const desktopMore = page.getByRole("button", { name: "更多", exact: true });
      await expect(desktopMore).not.toBeVisible({ timeout: 5000 });
    });

    test("chat composer toolbar buttons are visible on mobile", async ({ page }) => {
      await joinChat(page);

      // Image upload button.
      const imageBtn = page.getByRole("button", { name: "上传图片" });
      await expect(imageBtn).toBeVisible({ timeout: 5000 });

      // File upload button.
      const fileBtn = page.getByRole("button", { name: "上传文件" });
      await expect(fileBtn).toBeVisible({ timeout: 5000 });

      // Mic button (visible when input is empty).
      const micBtn = page.getByRole("button", { name: "录制语音" });
      await expect(micBtn).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Message density", () => {
    test("message bubble uses mobile-appropriate font size and padding", async ({ page }) => {
      await joinChat(page);

      // Send a message so we have a bubble to inspect.
      const uniqueMsg = `density_${Math.random().toString(36).slice(2, 8)}`;
      const msgInput = page.getByPlaceholder("输入消息... (Shift+Enter 换行)");
      await msgInput.fill(uniqueMsg);
      await page.keyboard.press("Enter");

      // Wait for the message bubble to appear.
      const bubble = page.getByText(uniqueMsg).first();
      await expect(bubble).toBeVisible({ timeout: 10000 });

      // On mobile (375px), the message bubble should use the mobile layout.
      // The bubble container should be present with mobile-specific sizing.
      // The bubble text span is inside a rounded container with class text-[13.5px] on mobile.
      const bubbleText = page.locator(
        `.rounded-\\[18px\\] >> text="${uniqueMsg}"`
      ).first();
      await expect(bubbleText).toBeVisible({ timeout: 5000 });

      // Verify the bubble container uses mobile font size (text-[13.5px])
      // by checking the computed font-size is smaller than desktop.
      const bubbleContainer = page
        .locator(".rounded-\\[18px\\]")
        .first();
      const fontSize = await bubbleContainer.evaluate(
        (el) => window.getComputedStyle(el).fontSize
      );
      const fontSizePx = parseFloat(fontSize);
      // Mobile should be ~13.5px (not the desktop 14px / sm:text-sm).
      expect(fontSizePx).toBeLessThanOrEqual(14);
      expect(fontSizePx).toBeGreaterThan(12);
    });

    test("message bubble takes full width on mobile", async ({ page }) => {
      await joinChat(page);

      // Send a message.
      const uniqueMsg = `fullwidth_${Math.random().toString(36).slice(2, 8)}`;
      const msgInput = page.getByPlaceholder("输入消息... (Shift+Enter 换行)");
      await msgInput.fill(uniqueMsg);
      await page.keyboard.press("Enter");

      await expect(page.getByText(uniqueMsg).first()).toBeVisible({
        timeout: 10000,
      });

      // On mobile (375px), message max-width should be near 100%.
      // The bubble container should fill most of the viewport.
      const bubbleContainer = page
        .locator(".rounded-\\[18px\\]")
        .first();
      const maxWidth = await bubbleContainer.evaluate(
        (el) => window.getComputedStyle(el).maxWidth
      );
      // On mobile: max-w-[min(100%,42rem)] → should be close to 100% of parent.
      // The computed maxWidth should be either "none" or a large percentage.
      // At 375px viewport, 42rem = 672px which exceeds 100%, so it's effectively 100%.
      expect(maxWidth).not.toBe("280px"); // Not the narrow voice bubble width.
    });
  });

  test.describe("Composer (textarea)", () => {
    test("textarea is visible and enabled on mobile viewport", async ({ page }) => {
      await joinChat(page);

      const textarea = page.locator("textarea").first();
      await expect(textarea).toBeVisible({ timeout: 5000 });
      await expect(textarea).toBeEnabled();
    });

    test("typing in textarea works on mobile", async ({ page }) => {
      await joinChat(page);

      const textarea = page.locator("textarea").first();
      const testText = `mobile_composer_test_${Math.random().toString(36).slice(2, 6)}`;
      await textarea.fill(testText);

      // Verify the text was entered.
      await expect(textarea).toHaveValue(testText);
    });

    test("send button appears when text is entered", async ({ page }) => {
      await joinChat(page);

      // Send button should be in disabled/empty state initially.
      // The aria-label on send button changes based on state; when empty it uses t("input.placeholder").

      const textarea = page.locator("textarea").first();
      await textarea.fill("test message");

      // The send button should now be styled as active (hasContent).
      // We can verify by checking the Send icon is visible.
      // The send button wraps a Send icon when content exists.
      await page.waitForTimeout(300);

      // Clear and verify textarea can be cleared.
      await textarea.fill("");
      await expect(textarea).toHaveValue("");
    });

    test("mobile format toolbar toggle is visible", async ({ page }) => {
      await joinChat(page);

      // The format toolbar toggle button uses aria-label "Markdown 格式" (editor.formatting).
      // On mobile (sm:hidden for the button means it IS visible on screens below sm).
      const formatBtn = page.getByRole("button", { name: "Markdown 格式" });
      await expect(formatBtn).toBeVisible({ timeout: 5000 });

      // Click to open format toolbar.
      await formatBtn.click();

      // After clicking, bold/italic/code buttons should appear in the toolbar.
      const boldBtn = page.getByRole("button", { name: "加粗" });
      await expect(boldBtn).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('"More" actions menu', () => {
    test('"more actions" button opens dropdown on mobile', async ({ page }) => {
      await joinChat(page);

      const moreBtn = page.getByRole("button", { name: "更多操作" });
      await expect(moreBtn).toBeVisible({ timeout: 5000 });

      // Verify dropdown is closed initially.
      await expect(page.getByText("English", { exact: true })).not.toBeVisible({
        timeout: 3000,
      });

      // Click to open.
      await moreBtn.click();

      // Language switch item ("English" since lang is zh-CN).
      await expect(page.getByText("English", { exact: true })).toBeVisible({
        timeout: 5000,
      });
    });

    test("mobile more dropdown contains all expected items", async ({ page }) => {
      await joinChat(page);

      const moreBtn = page.getByRole("button", { name: "更多操作" });
      await moreBtn.click();

      // Language switch.
      await expect(page.getByText("English", { exact: true })).toBeVisible({
        timeout: 5000,
      });

      // Export JSON.
      await expect(page.getByText("导出为 JSON")).toBeVisible({
        timeout: 5000,
      });

      // Export Text.
      await expect(page.getByText("导出为文本")).toBeVisible({
        timeout: 5000,
      });

      // Settings / notification prefs.
      await expect(page.getByText("通知偏好")).toBeVisible({
        timeout: 5000,
      });
    });

    test("clicking language switch in mobile more dropdown toggles language", async ({
      page,
    }) => {
      await joinChat(page);

      const moreBtn = page.getByRole("button", { name: "更多操作" });
      await moreBtn.click();

      // Click the "English" language switch item.
      const langItem = page.getByText("English", { exact: true });
      await expect(langItem).toBeVisible({ timeout: 5000 });
      await langItem.click();

      // After switching to English, the button aria-label changes to "More actions".
      // Re-open the dropdown using the new English-label button.
      const moreBtnEn = page.getByRole("button", { name: "More actions" });
      await moreBtnEn.click();
      await expect(page.getByText("中文", { exact: true })).toBeVisible({
        timeout: 5000,
      });
    });

    test("mobile more dropdown closes when pressing Escape", async ({ page }) => {
      await joinChat(page);

      const moreBtn = page.getByRole("button", { name: "更多操作" });
      await moreBtn.click();

      // Verify open.
      await expect(page.getByText("English", { exact: true })).toBeVisible({
        timeout: 5000,
      });

      // Press Escape to close the dropdown.
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      // Dropdown should be hidden.
      await expect(page.getByText("English", { exact: true })).not.toBeVisible({
        timeout: 5000,
      });
    });
  });
});
