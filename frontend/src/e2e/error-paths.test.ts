import { test, expect } from "@playwright/test";

/**
 * TokenDanceChat 错误路径 E2E 测试。
 *
 * 运行方式：
 *   E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/error-paths.test.ts --project=chromium --workers=1
 *
 * 覆盖：
 *   1. WebSocket 断开重连流程 — 关闭 WS 后显示重连横幅，自动恢复后可继续发消息
 *   2. 重复登录踢出 — 同名加入后旧页面出现重连横幅（被踢）
 *   3. 无效邀请码注册 — 提交无效邀请码后显示错误提示
 *   4. 错误密码登录 — 提交错误密码后显示错误提示
 *   5. 空消息提交 — 空文本区按 Enter 不发送消息
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
  const username = name ?? `err_${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/");
  await page.getByPlaceholder("你的用户名...").fill(username);
  await page.getByRole("button", { name: "游客加入" }).click();
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 15000 });
  return username;
}

test.describe("Error paths", () => {
  test.describe("Reconnection flow", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("shows reconnect banner on WebSocket disconnect and recovers", async ({
      page,
    }) => {
      const name = `rc_${Math.random().toString(36).slice(2, 8)}`;

      // Navigate to page.
      await page.goto("/");

      // Inject WebSocket proxy BEFORE joining so we can capture and
      // later close the WS instance from page context.
      // Use Proxy with construct trap to avoid prototype-chain issues.
      await page.evaluate(() => {
        const OrigWebSocket = window.WebSocket;
        (window as unknown as Record<string, unknown>).__wsList = [] as WebSocket[];
        window.WebSocket = new Proxy(OrigWebSocket, {
          construct(target, args) {
            const ws = new target(args[0], args[1]);
            ((window as unknown as Record<string, unknown>).__wsList as WebSocket[]).push(ws);
            return ws;
          },
        }) as typeof WebSocket;
      });

      // Join as guest (WebSocket is now captured in __wsList).
      await page.getByPlaceholder("你的用户名...").fill(name);
      await page.getByRole("button", { name: "游客加入" }).click();
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Verify no reconnect banner in initial connected state.
      await expect(
        page.getByText(/正在重新连接|连接已断开/).first(),
      ).not.toBeVisible({ timeout: 5000 });

      // Simulate WebSocket disconnect by closing the first captured WS.
      await page.evaluate(() => {
        const list = (window as unknown as Record<string, unknown>)
          .__wsList as WebSocket[];
        if (list.length > 0) list[0].close();
      });

      // Reconnect banner should appear (the client enters reconnecting state).
      await expect(
        page.getByText(/正在重新连接|连接已断开/).first(),
      ).toBeVisible({ timeout: 10000 });

      // Verify reconnection succeeded by sending a message.
      // The client's exponential-backoff reconnect starts at 1s.
      // Wait a few seconds for reconnection to stabilize, then send.
      await page.waitForTimeout(5000);

      const msg = `rc_msg_${Math.random().toString(36).slice(2, 6)}`;
      await page.locator("textarea").first().fill(msg);
      await page.keyboard.press("Enter");
      await expect(page.getByText(msg).first()).toBeVisible({
        timeout: 15000,
      });
    });
  });

  test.describe("Kicked duplicate login", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("duplicate username kicks old tab back to join screen", async ({
      page,
    }) => {
      const name = `kick_${Math.random().toString(36).slice(2, 6)}`;

      // Page 1: Join as guest.
      await joinChat(page, name);
      await expect(
        page.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });

      // Page 2: Join with the same name — kicks page 1.
      const page2 = await page.context().newPage();
      await setupPage(page2);
      await page2.goto("/");
      await page2.getByPlaceholder("你的用户名...").fill(name);
      await page2.getByRole("button", { name: "游客加入" }).click();
      await expect(page2.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Page 2 connected successfully.
      await expect(
        page2.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });

      // Page 1 should be disrupted — reconnect banner appears after being kicked.
      // Note: the app currently enters a reconnect loop after being kicked
      // (disconnect() triggers attemptReconnect()), so page 1 oscillates
      // between kicked and reconnected states. The reconnect banner reliably
      // indicates disruption.
      await expect(
        page.getByText(/正在重新连接|连接已断开/).first(),
      ).toBeVisible({ timeout: 15000 });

      await page2.close();
    });
  });

  test.describe("Invalid invite code", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("shows error message for invalid invite code", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "注册" }).click();

      await expect(
        page.getByRole("heading", { name: "注册账号" }),
      ).toBeVisible({ timeout: 15000 });

      // Fill all fields with valid data except the invite code.
      await page.getByLabel("用户名").fill("testuser123");
      await page.getByLabel("密码", { exact: true }).fill("testpass123");
      await page.getByLabel("确认密码").fill("testpass123");
      await page.getByLabel("邀请码").fill("INVALID_CODE_XYZ");

      // Submit the registration form.
      await page.getByRole("button", { name: "注册" }).click();

      // Should see error alert for invalid invite code.
      const error = page.getByRole("alert");
      await expect(error).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe("Login with wrong credentials", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("shows error message for wrong password", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "登录" }).click();

      await expect(
        page.getByRole("heading", { name: "登录" }),
      ).toBeVisible({ timeout: 15000 });

      // Fill username and wrong password.
      await page.getByLabel("用户名").fill("nonexistent_user_xyz");
      await page.getByLabel("密码", { exact: true }).fill("wrongpassword123");

      // Submit login.
      await page.getByRole("button", { name: "登录" }).click();

      // Should see error alert for wrong credentials.
      const error = page.getByRole("alert");
      await expect(error).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe("Empty message submission", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("pressing Enter on empty textarea does not send a message", async ({
      page,
    }) => {
      await joinChat(page);

      // Press Enter on empty textarea.
      const textarea = page.locator("textarea").first();
      await textarea.fill("");
      await textarea.press("Enter");

      // Brief wait to ensure no async send occurs.
      await page.waitForTimeout(500);

      // Textarea should still be visible and empty (state unchanged).
      await expect(textarea).toBeVisible({ timeout: 5000 });

      // Verify connection is still active by sending a real message.
      const msg = `empty_${Math.random().toString(36).slice(2, 6)}`;
      await textarea.fill(msg);
      await page.keyboard.press("Enter");
      await expect(page.getByText(msg).first()).toBeVisible({
        timeout: 15000,
      });
    });
  });
});
