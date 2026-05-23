import { test, expect } from "@playwright/test";

/**
 * TokenDanceChat 认证流程 E2E 测试。
 *
 * 运行方式：
 *   E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/auth-flow.test.ts --project=chromium
 *
 * 全链路注册/登录测试需要环境变量：
 *   E2E_TEST_USER / E2E_TEST_PASS — 已有测试账号（用于登录流程）
 *   E2E_TEST_INVITE_CODE — 有效邀请码（用于注册流程）
 */

const setupPage = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("tokendance:lang", "zh-CN");
    localStorage.setItem("tdchat-theme", "light");
    localStorage.removeItem("tokendance:username");
  });
};

/** Read an environment variable at runtime without triggering TS "process" errors. */
function readEnv(name: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).process?.env?.[name];
}

test.describe("Auth flow", () => {
  test.describe("Register screen", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("navigates to register screen from join screen", async ({ page }) => {
      await page.goto("/");

      // Click "注册" on the join screen.
      await page.getByRole("button", { name: "注册" }).click();

      // Should see register form heading.
      await expect(page.getByRole("heading", { name: "注册账号" })).toBeVisible({
        timeout: 15000,
      });

      // Form fields should be present.
      await expect(page.getByLabel("用户名")).toBeVisible({ timeout: 15000 });
      await expect(page.getByLabel("密码", { exact: true })).toBeVisible({ timeout: 15000 });
      await expect(page.getByLabel("确认密码")).toBeVisible({ timeout: 15000 });
      await expect(page.getByLabel("邀请码")).toBeVisible({ timeout: 15000 });
    });

    test("back button returns to guest join screen", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "注册" }).click();

      await expect(page.getByRole("heading", { name: "注册账号" })).toBeVisible({
        timeout: 15000,
      });

      // Click back → should return to guest join view.
      await page.getByLabel("Back").click();

      await expect(page.getByPlaceholder("你的用户名...")).toBeVisible({
        timeout: 15000,
      });
      await expect(
        page.getByRole("heading", { name: "TokenDance Chat" }),
      ).toBeVisible({ timeout: 15000 });
    });

    test("switch to login link works", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "注册" }).click();

      await expect(page.getByRole("heading", { name: "注册账号" })).toBeVisible({
        timeout: 15000,
      });

      // Click "已有账号？去登录".
      await page.getByText("已有账号？去登录").click();

      await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({
        timeout: 15000,
      });
    });

    test("shows validation error for empty submit", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "注册" }).click();

      await expect(page.getByRole("heading", { name: "注册账号" })).toBeVisible({
        timeout: 15000,
      });

      // Submit empty form — button should be disabled, but try Enter on first field.
      await page.getByLabel("用户名").press("Enter");

      // Should see error alert for empty username.
      const error = page.getByRole("alert");
      await expect(error).toBeVisible({ timeout: 15000 });
      await expect(error).toContainText("请输入用户名");
    });

    test("shows validation error for short username", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "注册" }).click();

      await expect(page.getByRole("heading", { name: "注册账号" })).toBeVisible({
        timeout: 15000,
      });

      await page.getByLabel("用户名").fill("a");
      await page.getByLabel("用户名").press("Enter");

      const error = page.getByRole("alert");
      await expect(error).toBeVisible({ timeout: 15000 });
      await expect(error).toContainText("至少需要2个字符");
    });

    test("shows validation error for password too short", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "注册" }).click();

      await expect(page.getByRole("heading", { name: "注册账号" })).toBeVisible({
        timeout: 15000,
      });

      await page.getByLabel("用户名").fill("testuser");
      await page.getByLabel("密码", { exact: true }).fill("12345");
      await page.getByLabel("用户名").press("Enter");

      const error = page.getByRole("alert");
      await expect(error).toBeVisible({ timeout: 15000 });
      await expect(error).toContainText("密码至少需要6个字符");
    });

    test("shows validation error for mismatched passwords", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "注册" }).click();

      await expect(page.getByRole("heading", { name: "注册账号" })).toBeVisible({
        timeout: 15000,
      });

      await page.getByLabel("用户名").fill("testuser");
      await page.getByLabel("密码", { exact: true }).fill("123456");
      await page.getByLabel("确认密码").fill("different");
      await page.getByLabel("用户名").press("Enter");

      const error = page.getByRole("alert");
      await expect(error).toBeVisible({ timeout: 15000 });
      await expect(error).toContainText("不一致");
    });

    test("shows validation error for missing invite code", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "注册" }).click();

      await expect(page.getByRole("heading", { name: "注册账号" })).toBeVisible({
        timeout: 15000,
      });

      await page.getByLabel("用户名").fill("testuser");
      await page.getByLabel("密码", { exact: true }).fill("123456");
      await page.getByLabel("确认密码").fill("123456");
      // Leave invite code empty.
      await page.getByLabel("用户名").press("Enter");

      const error = page.getByRole("alert");
      await expect(error).toBeVisible({ timeout: 15000 });
      await expect(error).toContainText("无效");
    });
  });

  test.describe("Login screen", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("navigates to login screen from join screen", async ({ page }) => {
      await page.goto("/");

      await page.getByRole("button", { name: "登录" }).click();

      // Should see login form heading.
      await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({
        timeout: 15000,
      });

      // Form fields should be present.
      await expect(page.getByLabel("用户名")).toBeVisible({ timeout: 15000 });
      await expect(page.getByLabel("密码", { exact: true })).toBeVisible({ timeout: 15000 });
    });

    test("back button returns to guest join screen", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "登录" }).click();

      await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({
        timeout: 15000,
      });

      await page.getByLabel("Back").click();

      await expect(page.getByPlaceholder("你的用户名...")).toBeVisible({
        timeout: 15000,
      });
    });

    test("switch to register link works", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "登录" }).click();

      await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({
        timeout: 15000,
      });

      // Click "还没有账号？去注册".
      await page.getByText("还没有账号？去注册").click();

      await expect(
        page.getByRole("heading", { name: "注册账号" }),
      ).toBeVisible({ timeout: 15000 });
    });

    test("shows validation error for empty submit", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "登录" }).click();

      await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({
        timeout: 15000,
      });

      // Submit empty form via Enter.
      await page.getByLabel("用户名").press("Enter");

      const error = page.getByRole("alert");
      await expect(error).toBeVisible({ timeout: 15000 });
      await expect(error).toContainText("请输入用户名");
    });

    test("shows validation error for empty password", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "登录" }).click();

      await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({
        timeout: 15000,
      });

      await page.getByLabel("用户名").fill("someuser");
      await page.getByLabel("用户名").press("Enter");

      const error = page.getByRole("alert");
      await expect(error).toBeVisible({ timeout: 15000 });
      await expect(error).toContainText("密码至少需要6个字符");
    });
  });

  test.describe("Guest join", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("guest can join chat and see textarea", async ({ page }) => {
      const name = `guest_${Math.random().toString(36).slice(2, 8)}`;

      await page.goto("/");
      await page.getByPlaceholder("你的用户名...").fill(name);
      await page.getByRole("button", { name: "游客加入" }).click();

      // Should auto-join and see chat textarea.
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });
    });

    test("guest can send a message after joining", async ({ page }) => {
      const name = `sender_${Math.random().toString(36).slice(2, 8)}`;

      await page.goto("/");
      await page.getByPlaceholder("你的用户名...").fill(name);
      await page.getByRole("button", { name: "游客加入" }).click();
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      const msg = `e2e_auth_${Math.random().toString(36).slice(2, 6)}`;
      await page.locator("textarea").first().fill(msg);
      await page.keyboard.press("Enter");

      await expect(page.getByText(msg).first()).toBeVisible({
        timeout: 15000,
      });
    });

    test("guest join screen not visible after successful join", async ({ page }) => {
      const name = `joined_${Math.random().toString(36).slice(2, 8)}`;

      await page.goto("/");
      await page.getByPlaceholder("你的用户名...").fill(name);
      await page.getByRole("button", { name: "游客加入" }).click();

      // After join, the join screen buttons should be gone.
      await expect(
        page.getByRole("button", { name: "游客加入" }),
      ).not.toBeVisible({ timeout: 15000 });
    });
  });

  test.describe("Language toggle", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("language toggle switches UI text on join screen", async ({ page }) => {
      await page.goto("/");

      // Initial state: Chinese.
      await expect(
        page.getByRole("button", { name: "游客加入" }),
      ).toBeVisible({ timeout: 15000 });

      // Toggle to English.
      const langButton = page.getByLabel("切换语言");
      await langButton.click();

      // UI should change to English.
      await expect(
        page.getByRole("button", { name: "Join as Guest" }),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByPlaceholder("Your username..."),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByRole("button", { name: "Login" }),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByRole("button", { name: "Register" }),
      ).toBeVisible({ timeout: 15000 });

      // Toggle back to Chinese.
      await page.getByLabel("Switch language").click();

      await expect(
        page.getByRole("button", { name: "游客加入" }),
      ).toBeVisible({ timeout: 15000 });
      await expect(page.getByPlaceholder("你的用户名...")).toBeVisible({
        timeout: 15000,
      });
    });

    test("register screen respects language set on guest screen", async ({ page }) => {
      await page.goto("/");

      // Toggle language to English on the guest/join screen.
      const langButton = page.getByLabel("切换语言");
      await langButton.click();

      // Navigate to register screen.
      await page.getByRole("button", { name: "Register" }).click();

      await expect(
        page.getByRole("heading", { name: "Register Account" }),
      ).toBeVisible({ timeout: 15000 });

      // Fields should show English labels.
      await expect(page.getByLabel("Username")).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByLabel("Password", { exact: true })).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByLabel("Confirm Password")).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByLabel("Invite Code")).toBeVisible({
        timeout: 15000,
      });

      // Back to guest screen, toggle back to Chinese.
      await page.getByLabel("Back").click();
      await page.getByLabel("Switch language").click();

      // Navigate back to register and verify Chinese labels.
      await page.getByRole("button", { name: "注册" }).click();

      await expect(
        page.getByRole("heading", { name: "注册账号" }),
      ).toBeVisible({ timeout: 15000 });

      await expect(page.getByLabel("用户名")).toBeVisible({ timeout: 15000 });
      await expect(page.getByLabel("密码", { exact: true })).toBeVisible({ timeout: 15000 });
      await expect(page.getByLabel("确认密码")).toBeVisible({ timeout: 15000 });
      await expect(page.getByLabel("邀请码")).toBeVisible({ timeout: 15000 });
    });

    test("login screen respects language set on guest screen", async ({ page }) => {
      await page.goto("/");

      // Toggle language to English on the guest/join screen.
      const langButton = page.getByLabel("切换语言");
      await langButton.click();

      // Navigate to login screen.
      await page.getByRole("button", { name: "Login" }).click();

      await expect(page.getByRole("heading", { name: "Login" })).toBeVisible({
        timeout: 15000,
      });

      await expect(page.getByLabel("Username")).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByLabel("Password", { exact: true })).toBeVisible({
        timeout: 15000,
      });

      // Back to guest screen, toggle back to Chinese.
      await page.getByLabel("Back").click();
      await page.getByLabel("Switch language").click();

      // Navigate back to login and verify Chinese labels.
      await page.getByRole("button", { name: "登录" }).click();

      await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({
        timeout: 15000,
      });

      await expect(page.getByLabel("用户名")).toBeVisible({ timeout: 15000 });
      await expect(page.getByLabel("密码", { exact: true })).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe("Logout / disconnect", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("disconnect button returns to join screen", async ({ page }) => {
      const name = `logout_${Math.random().toString(36).slice(2, 8)}`;

      // Join as guest first.
      await page.goto("/");
      await page.getByPlaceholder("你的用户名...").fill(name);
      await page.getByRole("button", { name: "游客加入" }).click();
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Click the disconnect/leave button on desktop.
      const leaveBtn = page.getByRole("button", { name: "断开连接" });
      await expect(leaveBtn).toBeVisible({ timeout: 15000 });
      await leaveBtn.click();

      // Should be back at the join screen.
      await expect(page.getByPlaceholder("你的用户名...")).toBeVisible({
        timeout: 15000,
      });
      await expect(
        page.getByRole("heading", { name: "TokenDance Chat" }),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByRole("button", { name: "游客加入" }),
      ).toBeVisible({ timeout: 15000 });
    });

    test("can rejoin after disconnect", async ({ page }) => {
      const name = `rejoin_${Math.random().toString(36).slice(2, 8)}`;

      // Join.
      await page.goto("/");
      await page.getByPlaceholder("你的用户名...").fill(name);
      await page.getByRole("button", { name: "游客加入" }).click();
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Disconnect.
      await page.getByRole("button", { name: "断开连接" }).click();
      await expect(page.getByPlaceholder("你的用户名...")).toBeVisible({
        timeout: 15000,
      });

      // Wait for server to release the old WebSocket session before reconnecting.
      await page.waitForTimeout(1000);

      // Rejoin with same name.
      await page.getByPlaceholder("你的用户名...").fill(name);
      await page.getByRole("button", { name: "游客加入" }).click();
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Can still send messages.
      const msg = `rejoin_auth_${Math.random().toString(36).slice(2, 6)}`;
      await page.locator("textarea").first().fill(msg);
      await page.keyboard.press("Enter");
      await expect(page.getByText(msg).first()).toBeVisible({
        timeout: 15000,
      });
    });

    test("user saved in localStorage persists after disconnect", async ({ page }) => {
      const name = `persist_${Math.random().toString(36).slice(2, 8)}`;

      // Join.
      await page.goto("/");
      await page.getByPlaceholder("你的用户名...").fill(name);
      await page.getByRole("button", { name: "游客加入" }).click();
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Verify localStorage has the username.
      const saved = await page.evaluate(() =>
        localStorage.getItem("tokendance:username"),
      );
      expect(saved).toBe(name);

      // Disconnect.
      await page.getByRole("button", { name: "断开连接" }).click();
      await expect(page.getByPlaceholder("你的用户名...")).toBeVisible({
        timeout: 15000,
      });

      // The input should be pre-filled with the saved username.
      await expect(page.getByPlaceholder("你的用户名...")).toHaveValue(name, {
        timeout: 5000,
      });

      // Clear for cleanup.
      await page.evaluate(() =>
        localStorage.removeItem("tokendance:username"),
      );
    });
  });

  test.describe("Full login flow (requires credentials)", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("login with valid credentials auto-joins chat", async ({ page }) => {
      const username = readEnv("E2E_TEST_USER");
      const password = readEnv("E2E_TEST_PASS");

      if (!username || !password) {
        test.skip(
          true,
          "Skipped: set E2E_TEST_USER and E2E_TEST_PASS env vars to run",
        );
        return;
      }

      await page.goto("/");
      await page.getByRole("button", { name: "登录" }).click();

      await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({
        timeout: 15000,
      });

      // Fill credentials.
      await page.getByLabel("用户名").fill(username);
      await page.getByLabel("密码", { exact: true }).fill(password);

      // Submit.
      await page.getByRole("button", { name: "登录" }).click();

      // Should auto-join chat.
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Cleanup: disconnect.
      await page.getByRole("button", { name: "断开连接" }).click();
      await expect(page.getByPlaceholder("你的用户名...")).toBeVisible({
        timeout: 15000,
      });
    });

    test("login with invalid credentials shows error", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "登录" }).click();

      await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({
        timeout: 15000,
      });

      await page.getByLabel("用户名").fill("nonexistent_user_xyz");
      await page.getByLabel("密码", { exact: true }).fill("wrongpassword");
      await page.getByRole("button", { name: "登录" }).click();

      // Should see an error message (not auto-join).
      const error = page.getByRole("alert");
      await expect(error).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe("Full register flow (requires invite code)", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("register with valid invite code auto-joins chat", async ({
      page,
    }) => {
      const inviteCode = readEnv("E2E_TEST_INVITE_CODE");

      if (!inviteCode) {
        test.skip(
          true,
          "Skipped: set E2E_TEST_INVITE_CODE env var to run",
        );
        return;
      }

      const username = `e2ereg_${Math.random().toString(36).slice(2, 8)}`;
      const password = "e2etest123";

      await page.goto("/");
      await page.getByRole("button", { name: "注册" }).click();

      await expect(
        page.getByRole("heading", { name: "注册账号" }),
      ).toBeVisible({ timeout: 15000 });

      // Fill the registration form.
      await page.getByLabel("用户名").fill(username);
      await page.getByLabel("密码", { exact: true }).fill(password);
      await page.getByLabel("确认密码").fill(password);
      await page.getByLabel("邀请码").fill(inviteCode);

      // Submit.
      await page.getByRole("button", { name: "注册" }).click();

      // Should auto-join chat on success.
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Cleanup: disconnect.
      await page.getByRole("button", { name: "断开连接" }).click();
      await expect(page.getByPlaceholder("你的用户名...")).toBeVisible({
        timeout: 15000,
      });
    });

    test("register with invalid invite code shows error", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "注册" }).click();

      await expect(
        page.getByRole("heading", { name: "注册账号" }),
      ).toBeVisible({ timeout: 15000 });

      await page.getByLabel("用户名").fill("testuser");
      await page.getByLabel("密码", { exact: true }).fill("123456");
      await page.getByLabel("确认密码").fill("123456");
      await page.getByLabel("邀请码").fill("INVALID_CODE_XYZ");

      await page.getByRole("button", { name: "注册" }).click();

      // Should see error alert.
      const error = page.getByRole("alert");
      await expect(error).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe("Multi-tab auth", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("guest join in two tabs with different names", async ({ page }) => {
      const name1 = `mt1_${Math.random().toString(36).slice(2, 6)}`;
      const name2 = `mt2_${Math.random().toString(36).slice(2, 6)}`;

      // Tab 1 joins.
      await page.goto("/");
      await page.getByPlaceholder("你的用户名...").fill(name1);
      await page.getByRole("button", { name: "游客加入" }).click();
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Tab 2 joins with a different name.
      const page2 = await page.context().newPage();
      await setupPage(page2);
      await page2.goto("/");
      await page2.getByPlaceholder("你的用户名...").fill(name2);
      await page2.getByRole("button", { name: "游客加入" }).click();
      await expect(page2.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Both tabs show the disconnect button.
      await expect(
        page.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });
      await expect(
        page2.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });

      await page2.close();
    });

    test("duplicate username kicks old tab", async ({ page }) => {
      const name = `kick_${Math.random().toString(36).slice(2, 6)}`;

      // Tab 1 joins.
      await page.goto("/");
      await page.getByPlaceholder("你的用户名...").fill(name);
      await page.getByRole("button", { name: "游客加入" }).click();
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Tab 2 joins with same name → kicks tab 1.
      const page2 = await page.context().newPage();
      await setupPage(page2);
      await page2.goto("/");
      await page2.getByPlaceholder("你的用户名...").fill(name);
      await page2.getByRole("button", { name: "游客加入" }).click();
      await expect(page2.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Tab 2 connected successfully.
      await expect(
        page2.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });

      await page2.close();
    });
  });
});
