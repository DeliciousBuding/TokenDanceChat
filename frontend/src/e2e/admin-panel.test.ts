import { test, expect } from "@playwright/test";

/**
 * TokenDanceChat 管理面板 E2E 测试。
 *
 * 运行方式：
 *   E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/admin-panel.test.ts --project=chromium --workers=1
 *
 * 覆盖：
 *   1. Admin panel opens from sidebar button
 *   2. Admin panel shows server stats (total messages, active connections)
 *   3. Admin panel shows registered users count
 *   4. Admin panel close button works
 *
 * 管理面板可能仅对注册用户可见。如果游客看不到管理按钮，则验证按钮不可见。
 * 使用 E2E_TEST_USER / E2E_TEST_PASS 环境变量可测试注册用户流程。
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
async function joinChat(page: import("@playwright/test").Page): Promise<string> {
  const name = `admin_${Math.random().toString(36).slice(2, 8)}`;

  await page.goto("/");
  await page.getByPlaceholder("你的用户名...").fill(name);
  await page.getByRole("button", { name: "游客加入" }).click();

  // Should auto-join and see chat textarea.
  await expect(page.locator("textarea").first()).toBeVisible({
    timeout: 15000,
  });

  return name;
}

/** Read an environment variable at runtime. */
function readEnv(name: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).process?.env?.[name];
}

/**
 * Helper: login as a registered user and wait until connected.
 * Returns true on success, false if credentials are missing.
 */
async function loginAsRegistered(
  page: import("@playwright/test").Page,
): Promise<boolean> {
  const username = readEnv("E2E_TEST_USER");
  const password = readEnv("E2E_TEST_PASS");

  if (!username || !password) return false;

  await page.goto("/");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({
    timeout: 15000,
  });

  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();

  // Should auto-join chat.
  await expect(page.locator("textarea").first()).toBeVisible({
    timeout: 15000,
  });

  return true;
}

test.describe("Admin panel", () => {
  test.describe("Guest user", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("admin button presence is verifiable", async ({ page }) => {
      await joinChat(page);

      // Check if the admin dashboard button is visible.
      const adminBtn = page.getByRole("button", { name: "管理面板" });
      const isVisible = await adminBtn.isVisible().catch(() => false);

      if (isVisible) {
        // Admin panel is available to guests — proceed with full flow.
        await expect(adminBtn).toBeVisible();

        // Click to open admin panel.
        await adminBtn.click();

        // Admin panel heading should appear.
        const heading = page.getByText("管理面板");
        await expect(heading.first()).toBeVisible({ timeout: 10000 });

        // Verify close button works.
        const closeBtn = page.getByRole("button", { name: "关闭" });
        await expect(closeBtn).toBeVisible({ timeout: 5000 });
        await closeBtn.click();

        // Panel should close.
        await expect(heading.first()).not.toBeVisible({ timeout: 5000 });
      } else {
        // Admin panel is hidden for guests — that's acceptable.
        // Just verify the button is truly not visible.
        await expect(adminBtn).not.toBeVisible({ timeout: 5000 });
      }
    });

    test("admin panel shows server stats when opened (guest)", async ({ page }) => {
      await joinChat(page);

      const adminBtn = page.getByRole("button", { name: "管理面板" });
      const isVisible = await adminBtn.isVisible().catch(() => false);

      if (!isVisible) {
        test.skip(true, "Admin button not visible for guest — skipping stats test");
        return;
      }

      // Open admin panel.
      await adminBtn.click();

      // Wait for the admin panel heading to appear.
      await expect(page.getByText("管理面板").first()).toBeVisible({
        timeout: 10000,
      });

      // Wait for stats to load (the skeleton pulsing should disappear).
      // The stat labels should be visible once loaded.
      await expect(page.getByText("消息总数")).toBeVisible({ timeout: 10000 });
      await expect(page.getByText("活跃连接")).toBeVisible({ timeout: 10000 });

      // Verify numeric values are present (not empty/dash).
      // Each stat card has a text-2xl font-bold value next to its label.
      // We check that the cards contain numbers (or "-" on error) — not blank.
      const statValues = page.locator(".text-2xl.font-bold.tabular-nums");
      const count = await statValues.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Each displayed value should be non-empty.
      for (let i = 0; i < count; i++) {
        const text = await statValues.nth(i).textContent();
        expect(text).toBeTruthy();
      }
    });

    test("admin panel shows registered users count (guest)", async ({ page }) => {
      await joinChat(page);

      const adminBtn = page.getByRole("button", { name: "管理面板" });
      const isVisible = await adminBtn.isVisible().catch(() => false);

      if (!isVisible) {
        test.skip(true, "Admin button not visible for guest — skipping users count test");
        return;
      }

      // Open admin panel.
      await adminBtn.click();
      await expect(page.getByText("管理面板").first()).toBeVisible({
        timeout: 10000,
      });

      // Verify the "注册用户" label is visible.
      await expect(page.getByText("注册用户")).toBeVisible({ timeout: 10000 });

      // Verify there is a numeric value in the registered users card.
      // The registered users card contains the label "注册用户" and a value.
      const usersLabel = page.getByText("注册用户");
      const usersCard = usersLabel.locator("..").locator("..");
      const valueEl = usersCard.locator(".text-2xl.font-bold.tabular-nums");
      await expect(valueEl).toBeVisible({ timeout: 5000 });
      const valueText = await valueEl.textContent();
      expect(valueText).toBeTruthy();
    });

    test("admin panel close button works (guest)", async ({ page }) => {
      await joinChat(page);

      const adminBtn = page.getByRole("button", { name: "管理面板" });
      const isVisible = await adminBtn.isVisible().catch(() => false);

      if (!isVisible) {
        test.skip(true, "Admin button not visible for guest — skipping close button test");
        return;
      }

      // Open the admin panel.
      await adminBtn.click();

      const heading = page.getByText("管理面板").first();
      await expect(heading).toBeVisible({ timeout: 10000 });

      // Close via the X button (aria-label="关闭").
      const closeBtn = page.getByRole("button", { name: "关闭" });
      await expect(closeBtn).toBeVisible({ timeout: 5000 });
      await closeBtn.click();

      // Panel should be gone.
      await expect(heading).not.toBeVisible({ timeout: 5000 });
    });

    test("Escape key closes admin panel (guest)", async ({ page }) => {
      await joinChat(page);

      const adminBtn = page.getByRole("button", { name: "管理面板" });
      const isVisible = await adminBtn.isVisible().catch(() => false);

      if (!isVisible) {
        test.skip(true, "Admin button not visible for guest — skipping Escape key test");
        return;
      }

      // Open the admin panel.
      await adminBtn.click();

      const heading = page.getByText("管理面板").first();
      await expect(heading).toBeVisible({ timeout: 10000 });

      // Dispatch an Escape keydown on the document to trigger the panel's
      // window-level keyboard listener.
      await page.evaluate(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      });

      // Panel should close.
      await expect(heading).not.toBeVisible({ timeout: 10000 });
    });

    test("admin panel shows server stats footer (guest)", async ({ page }) => {
      await joinChat(page);

      const adminBtn = page.getByRole("button", { name: "管理面板" });
      const isVisible = await adminBtn.isVisible().catch(() => false);

      if (!isVisible) {
        test.skip(true, "Admin button not visible for guest — skipping footer test");
        return;
      }

      // Open admin panel.
      await adminBtn.click();
      await expect(page.getByText("管理面板").first()).toBeVisible({
        timeout: 10000,
      });

      // The footer should show the server stats label.
      await expect(page.getByText("TokenDanceChat 服务器状态")).toBeVisible({
        timeout: 10000,
      });
    });
  });

  test.describe("Registered user", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("admin panel opens from sidebar button (registered)", async ({ page }) => {
      const loggedIn = await loginAsRegistered(page);

      if (!loggedIn) {
        test.skip(
          true,
          "Skipped: set E2E_TEST_USER and E2E_TEST_PASS env vars to run",
        );
        return;
      }

      // Admin button should be visible.
      const adminBtn = page.getByRole("button", { name: "管理面板" });
      await expect(adminBtn).toBeVisible({ timeout: 10000 });

      // Click to open.
      await adminBtn.click();

      // Admin panel heading should appear.
      await expect(page.getByText("管理面板").first()).toBeVisible({
        timeout: 10000,
      });
    });

    test("admin panel shows server stats (registered)", async ({ page }) => {
      const loggedIn = await loginAsRegistered(page);

      if (!loggedIn) {
        test.skip(
          true,
          "Skipped: set E2E_TEST_USER and E2E_TEST_PASS env vars to run",
        );
        return;
      }

      const adminBtn = page.getByRole("button", { name: "管理面板" });
      await expect(adminBtn).toBeVisible({ timeout: 10000 });
      await adminBtn.click();

      await expect(page.getByText("管理面板").first()).toBeVisible({
        timeout: 10000,
      });

      // Wait for stats to load.
      await expect(page.getByText("消息总数")).toBeVisible({ timeout: 10000 });
      await expect(page.getByText("活跃连接")).toBeVisible({ timeout: 10000 });

      // Verify numeric stat values are present.
      const statValues = page.locator(".text-2xl.font-bold.tabular-nums");
      const count = await statValues.count();
      expect(count).toBeGreaterThanOrEqual(2);

      for (let i = 0; i < count; i++) {
        const text = await statValues.nth(i).textContent();
        expect(text).toBeTruthy();
      }
    });

    test("admin panel shows registered users count (registered)", async ({
      page,
    }) => {
      const loggedIn = await loginAsRegistered(page);

      if (!loggedIn) {
        test.skip(
          true,
          "Skipped: set E2E_TEST_USER and E2E_TEST_PASS env vars to run",
        );
        return;
      }

      const adminBtn = page.getByRole("button", { name: "管理面板" });
      await expect(adminBtn).toBeVisible({ timeout: 10000 });
      await adminBtn.click();

      await expect(page.getByText("管理面板").first()).toBeVisible({
        timeout: 10000,
      });

      // Verify "注册用户" label and value.
      await expect(page.getByText("注册用户")).toBeVisible({ timeout: 10000 });

      const usersLabel = page.getByText("注册用户");
      const usersCard = usersLabel.locator("..").locator("..");
      const valueEl = usersCard.locator(".text-2xl.font-bold.tabular-nums");
      await expect(valueEl).toBeVisible({ timeout: 5000 });
      const valueText = await valueEl.textContent();
      expect(valueText).toBeTruthy();
    });

    test("admin panel close button works (registered)", async ({ page }) => {
      const loggedIn = await loginAsRegistered(page);

      if (!loggedIn) {
        test.skip(
          true,
          "Skipped: set E2E_TEST_USER and E2E_TEST_PASS env vars to run",
        );
        return;
      }

      const adminBtn = page.getByRole("button", { name: "管理面板" });
      await expect(adminBtn).toBeVisible({ timeout: 10000 });
      await adminBtn.click();

      const heading = page.getByText("管理面板").first();
      await expect(heading).toBeVisible({ timeout: 10000 });

      // Close via X button.
      const closeBtn = page.getByRole("button", { name: "关闭" });
      await expect(closeBtn).toBeVisible({ timeout: 5000 });
      await closeBtn.click();

      await expect(heading).not.toBeVisible({ timeout: 5000 });
    });

    test("clicking backdrop closes admin panel (registered)", async ({
      page,
    }) => {
      const loggedIn = await loginAsRegistered(page);

      if (!loggedIn) {
        test.skip(
          true,
          "Skipped: set E2E_TEST_USER and E2E_TEST_PASS env vars to run",
        );
        return;
      }

      const adminBtn = page.getByRole("button", { name: "管理面板" });
      await expect(adminBtn).toBeVisible({ timeout: 10000 });
      await adminBtn.click();

      const heading = page.getByText("管理面板").first();
      await expect(heading).toBeVisible({ timeout: 10000 });

      // Click the backdrop (the fixed inset-0 overlay).
      // The panel card itself is inside the overlay, so we click the overlay.
      const backdrop = page.locator(".fixed.inset-0.z-\\[160\\]");
      await expect(backdrop).toBeVisible({ timeout: 5000 });

      // Click the backdrop area outside the card (top-left corner).
      await backdrop.click({ position: { x: 10, y: 10 } });

      // Panel should close.
      await expect(heading).not.toBeVisible({ timeout: 5000 });
    });

    test("admin panel reopens after close (registered)", async ({ page }) => {
      const loggedIn = await loginAsRegistered(page);

      if (!loggedIn) {
        test.skip(
          true,
          "Skipped: set E2E_TEST_USER and E2E_TEST_PASS env vars to run",
        );
        return;
      }

      const adminBtn = page.getByRole("button", { name: "管理面板" });
      await expect(adminBtn).toBeVisible({ timeout: 10000 });

      // Open, close, reopen.
      await adminBtn.click();
      const heading = page.getByText("管理面板").first();
      await expect(heading).toBeVisible({ timeout: 10000 });

      const closeBtn = page.getByRole("button", { name: "关闭" });
      await closeBtn.click();
      await expect(heading).not.toBeVisible({ timeout: 5000 });

      // Reopen.
      await adminBtn.click();
      await expect(heading).toBeVisible({ timeout: 10000 });

      // Stats should load again (refetched on open).
      await expect(page.getByText("消息总数")).toBeVisible({ timeout: 10000 });
    });
  });
});
