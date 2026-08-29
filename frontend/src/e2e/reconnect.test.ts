import { test, expect } from "@playwright/test";
import { joinGuestFromPreview } from "./helpers";

/**
 * TokenDanceChat WebSocket 自动重连 E2E 测试。
 *
 * 运行方式：
 *   E2E_BASE_URL=https://chat.tokendancelab.com npx playwright test src/e2e/reconnect.test.ts --project=chromium
 *
 * 注意：大多数重连场景需要控制服务端 WebSocket 生命周期（kill/restart），
 * 当前 E2E 环境不具备该能力。这些测试使用 test.skip() 标记，并注明所需前置条件。
 * 可以运行的测试主要验证正常连接态下的 UI 基线行为。
 */

const setupPage = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("tokendance:lang", "zh-CN");
    localStorage.setItem("tdchat-theme", "light");
    localStorage.removeItem("tokendance:username");
  });
};

async function joinChat(page: import("@playwright/test").Page, name?: string): Promise<string> {
  const username = name ?? `rc_${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/");
  await joinGuestFromPreview(page, username);
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 15000 });
  return username;
}

test.describe("WebSocket reconnect", () => {
  test.describe("Baseline — connected state", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("reconnect banner is NOT visible when connected", async ({ page }) => {
      await joinChat(page);

      // Verify the connection-lost banner text is absent from the DOM.
      // The banner only renders when connected===false.
      await expect(
        page.getByText("连接已断开，正在尝试重新连接..."),
      ).not.toBeVisible({ timeout: 5000 });

      // Also verify the reconnecting text is absent.
      await expect(
        page.getByText(/正在重新连接/),
      ).not.toBeVisible({ timeout: 5000 });
    });

    test("chat input textarea is enabled and functional when connected", async ({
      page,
    }) => {
      await joinChat(page);

      const textarea = page.locator("textarea").first();
      await expect(textarea).toBeVisible({ timeout: 5000 });
      await expect(textarea).toBeEnabled({ timeout: 5000 });

      // Verify we can type and send a message.
      const msg = `baseline_${Math.random().toString(36).slice(2, 6)}`;
      await textarea.fill(msg);
      await page.keyboard.press("Enter");

      await expect(page.getByText(msg).first()).toBeVisible({ timeout: 15000 });
    });

    test("disconnect feedback text is NOT visible when connected", async ({
      page,
    }) => {
      await joinChat(page);

      // The disconnect feedback ("未连接 — 重新连接后重试") only appears
      // when trying to send while disconnected. Verify it's absent.
      await expect(
        page.getByText("未连接 — 重新连接后重试"),
      ).not.toBeVisible({ timeout: 5000 });
    });

    test("lightweight sidebar shows current connection state when connected", async ({ page }) => {
      await joinChat(page);

      // The sidebar shows online users. On desktop the sidebar is always visible.
      // On mobile we need to open it first.
      const sidebarToggle = page.getByLabel("Open sidebar");
      if (await sidebarToggle.isVisible().catch(() => false)) {
        await sidebarToggle.click();
      }

      const sidebar = page.getByRole("complementary", { name: "公共聊天" });
      await expect(sidebar.getByRole("button", { name: /公共聊天|Public Chat/ })).toBeVisible({ timeout: 10000 });
      await expect(sidebar.getByRole("button", { name: /TokenBot/ })).toBeVisible({ timeout: 10000 });
      await expect(sidebar.getByText(/好友|Friends|群组|Groups|私信|Direct Messages|DM/)).toHaveCount(0);
    });
  });

  test.describe("Connection lost banner", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("banner appears on WebSocket disconnect", async ({ page }) => {
      test.skip(
        true,
        "Requires server control: must kill or suspend the WebSocket server " +
          "after the client has connected, then verify the banner renders. " +
          "Set up with: 1) start server, 2) join chat, 3) kill server process, " +
          "4) verify banner text appears within reconnect timeout window.",
      );

      // --- Test body (runs when skip is removed) ---
      await joinChat(page);

      // Verify no banner initially.
      await expect(
        page.getByText("连接已断开，正在尝试重新连接..."),
      ).not.toBeVisible({ timeout: 5000 });

      // TODO: kill server / close WebSocket here.
      // For example: await fetch("http://localhost:8080/api/__test/close-ws");

      // After disconnect, the banner should appear.
      await expect(
        page.getByText("连接已断开，正在尝试重新连接..."),
      ).toBeVisible({ timeout: 30000 });
    });

    test("reconnect banner shows attempt count during reconnection", async ({
      page,
    }) => {
      test.skip(
        true,
        "Requires server control: must kill the server and wait for the " +
          "client to enter reconnecting state. The banner shows " +
          "'正在重新连接 (第 N 次)...' where N increments with each attempt. " +
          "Requires keeping the server down for at least 2 reconnect cycles " +
          "(~3-5 seconds with exponential backoff starting at 1s).",
      );

      // --- Test body (runs when skip is removed) ---
      await joinChat(page);

      // TODO: kill server.
      // After the first reconnect attempt fires, the banner should update.
      await expect(
        page.getByText(/正在重新连接 \(第 \d+ 次\)\.\.\./),
      ).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe("Reconnect failure", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("reload button appears after max reconnect attempts", async ({
      page,
    }) => {
      test.skip(
        true,
        "Requires server control AND time: must keep the server down through " +
          "all 10 reconnect attempts (exponential backoff up to 30s, total ~3+ minutes). " +
          "After max attempts, the banner shows '连接已断开，请刷新页面。' and a " +
          "'刷新页面' reload button.",
      );

      // --- Test body (runs when skip is removed) ---
      await joinChat(page);

      // The reload button only renders when reconnectFailed is true,
      // which happens after maxReconnectAttempts (10) are exhausted.
      const reloadBtn = page.getByRole("button", { name: "刷新页面" });
      await expect(reloadBtn).toBeVisible({ timeout: 300000 });

      // Clicking the reload button should refresh the page.
      // We verify the button exists and is clickable.
      await expect(reloadBtn).toBeEnabled();
    });

    test("banner shows failure message after max attempts", async ({ page }) => {
      test.skip(
        true,
        "Requires server control: keep server down through all reconnect " +
          "attempts (~3+ minutes). After reconnect_failed event, banner text " +
          "changes to '连接已断开，请刷新页面。'",
      );

      // --- Test body (runs when skip is removed) ---
      await joinChat(page);

      await expect(
        page.getByText("连接已断开，请刷新页面。"),
      ).toBeVisible({ timeout: 300000 });
    });
  });

  test.describe("Disconnect feedback on send", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("shows feedback toast when sending while disconnected", async ({
      page,
    }) => {
      test.skip(
        true,
        "Requires ability to set chatStore.connected=false from the test. " +
          "Options: 1) expose store on window.__store in dev mode, " +
          "2) add a test-only WebSocket interceptor, or " +
          "3) use page.evaluate with React internals. " +
          "Once connected=false, fill textarea and press Enter — the toast " +
          "'未连接 — 重新连接后重试' should appear and auto-dismiss after 3s.",
      );

      // --- Test body (runs when skip is removed) ---
      await joinChat(page);

      // TODO: set connected=false, e.g.:
      // await page.evaluate(() => {
      //   (window as any).__chatStore.setState({ connected: false });
      // });

      const textarea = page.locator("textarea").first();
      await textarea.fill("test message while disconnected");
      await page.keyboard.press("Enter");

      // The feedback toast should appear immediately.
      await expect(
        page.getByText("未连接 — 重新连接后重试"),
      ).toBeVisible({ timeout: 5000 });

      // Verify it auto-dismisses after 3 seconds.
      await expect(
        page.getByText("未连接 — 重新连接后重试"),
      ).not.toBeVisible({ timeout: 8000 });
    });

    test("message content is preserved after failed send", async ({ page }) => {
      test.skip(
        true,
        "Requires ability to set chatStore.connected=false. " +
          "When sending fails due to disconnect, the input content should " +
          "remain in the textarea so the user can retry after reconnection.",
      );

      // --- Test body (runs when skip is removed) ---
      await joinChat(page);

      const textarea = page.locator("textarea").first();
      const msg = "preserved_content_test";
      await textarea.fill(msg);

      // TODO: set connected=false.
      await page.keyboard.press("Enter");

      // Content should still be in the input.
      await expect(textarea).toHaveValue(msg, { timeout: 5000 });
    });
  });

  test.describe("Online users loading state", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("shows skeleton placeholders when disconnected with empty users", async ({
      page,
    }) => {
      test.skip(
        true,
        "Requires ability to set chatStore.connected=false AND " +
          "onlineUsers=[] from the test. When both conditions are met, " +
          "the sidebar shows 3 animated skeleton rows and '连接中...' text " +
          "instead of the empty-state message.",
      );

      // --- Test body (runs when skip is removed) ---
      await joinChat(page);

      // Open sidebar on mobile if needed.
      const sidebarToggle = page.getByLabel("Open sidebar");
      if (await sidebarToggle.isVisible().catch(() => false)) {
        await sidebarToggle.click();
      }

      // TODO: set connected=false and onlineUsers=[].
      // await page.evaluate(() => {
      //   (window as any).__chatStore.setState({ connected: false, onlineUsers: [] });
      // });

      // Skeleton text should appear.
      await expect(page.getByText("连接中...")).toBeVisible({
        timeout: 5000,
      });
    });

    test("lightweight sidebar stays scoped to public room and assistants", async ({
      page,
    }) => {
      await joinChat(page);

      // Open sidebar on mobile.
      const sidebarToggle = page.getByLabel("Open sidebar");
      if (await sidebarToggle.isVisible().catch(() => false)) {
        await sidebarToggle.click();
      }

      const sidebar = page.getByRole("complementary", { name: "公共聊天" });
      await expect(sidebar.getByRole("button", { name: /公共聊天|Public Chat/ })).toBeVisible({ timeout: 10000 });
      await expect(sidebar.getByText(/在线用户|Online Users|好友|Friends|群组|Groups|私信|Direct Messages|DM/)).toHaveCount(0);
    });
  });

  test.describe("Message history preservation", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("messages sent before disconnect are visible after reconnection", async ({
      page,
    }) => {
      test.skip(
        true,
        "Requires server control: 1) join chat, 2) send messages, " +
          "3) kill server, 4) restart server, 5) wait for auto-reconnect, " +
          "6) verify pre-disconnect messages are still visible in transcript. " +
          "The backend must be configured to persist message history.",
      );

      // --- Test body (runs when skip is removed) ---
      await joinChat(page);

      // Send a message before disconnect.
      const msg = `pre_disconnect_${Math.random().toString(36).slice(2, 8)}`;
      const textarea = page.locator("textarea").first();
      await textarea.fill(msg);
      await page.keyboard.press("Enter");
      await expect(page.getByText(msg).first()).toBeVisible({
        timeout: 15000,
      });

      // TODO: kill and restart server.
      // Wait for reconnection to complete (watch for textarea to be enabled).

      // After reconnect, the pre-disconnect message should still be visible.
      await expect(page.getByText(msg).first()).toBeVisible({
        timeout: 30000,
      });
    });

    test("messages sent after reconnection appear in transcript", async ({
      page,
    }) => {
      test.skip(
        true,
        "Requires server control: join, kill server, restart server, " +
          "wait for auto-reconnect, then send a new message and verify it appears. " +
          "Validates end-to-end reconnect + send flow.",
      );

      // --- Test body (runs when skip is removed) ---
      await joinChat(page);

      // TODO: kill and restart server. Wait for reconnection.

      // Send a new message after reconnect.
      const msg = `post_reconnect_${Math.random().toString(36).slice(2, 8)}`;
      const textarea = page.locator("textarea").first();
      await expect(textarea).toBeEnabled({ timeout: 30000 });
      await textarea.fill(msg);
      await page.keyboard.press("Enter");

      await expect(page.getByText(msg).first()).toBeVisible({
        timeout: 15000,
      });
    });
  });
});
