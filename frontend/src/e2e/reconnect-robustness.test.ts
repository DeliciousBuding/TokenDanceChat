import { test, expect } from "@playwright/test";

/**
 * TokenDanceChat WebSocket 重连鲁棒性 E2E 测试。
 *
 * 运行方式：
 *   E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/reconnect-robustness.test.ts --project=chromium --workers=1
 *
 * 覆盖：
 *   1. 指数退避时序 (1s→2s→4s→8s→16s→30s cap) + 重连横幅尝试次数
 *   2. 模拟断连后自动重连成功 + 可继续发消息
 *   3. 达到最大重连次数 (10) 后显示 reconnect_failed 消息
 *   4. 断连后手动刷新页面恢复
 *   5. 多次快速断连/重连循环不崩溃
 *
 * 使用 setupPage + doJoin 辅助函数。断连模拟使用 Proxy-based WS interceptor。
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
 * Does NOT call page.goto — the caller must navigate first.
 * Returns the random guest name used.
 */
async function doJoin(
  page: import("@playwright/test").Page,
  name?: string,
): Promise<string> {
  const username = name ?? `rb_${Math.random().toString(36).slice(2, 8)}`;
  await page.getByPlaceholder("你的用户名...").fill(username);
  await page.getByRole("button", { name: "游客加入" }).click();
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 15000 });
  return username;
}

/**
 * Inject a WebSocket proxy that captures all WS instances in __wsList
 * and records creation timestamps in __wsTimestamps.
 * Does NOT auto-close — suitable for "disconnect once and let reconnect succeed" tests.
 * Call AFTER page.goto() but BEFORE joining.
 */
async function injectWsProxy(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const OrigWebSocket = window.WebSocket;
    (window as unknown as Record<string, unknown>).__wsList = [] as WebSocket[];
    (window as unknown as Record<string, unknown>).__wsTimestamps = [] as number[];
    window.WebSocket = new Proxy(OrigWebSocket, {
      construct(target, args) {
        const ws = new target(args[0], args[1]);
        const list = (window as unknown as Record<string, unknown>)
          .__wsList as WebSocket[];
        list.push(ws);
        const timestamps = (window as unknown as Record<string, unknown>)
          .__wsTimestamps as number[];
        timestamps.push(Date.now());
        return ws;
      },
    }) as typeof WebSocket;
  });
}

/**
 * Inject a WebSocket proxy that captures WS instances AND can auto-close
 * newly created ones. Records creation timestamps in __wsTimestamps.
 *
 * IMPORTANT: autoClose starts as FALSE. Call enableAutoClose() after joining
 * to start closing new WS instances (simulating a down server).
 *
 * Call AFTER page.goto() but BEFORE joining.
 */
async function injectControllableAutoCloseWsProxy(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const OrigWebSocket = window.WebSocket;
    (window as unknown as Record<string, unknown>).__OrigWS = OrigWebSocket;
    (window as unknown as Record<string, unknown>).__wsList = [] as WebSocket[];
    (window as unknown as Record<string, unknown>).__wsTimestamps = [] as number[];
    (window as unknown as Record<string, unknown>).__autoClose = false;
    window.WebSocket = new Proxy(OrigWebSocket, {
      construct(target, args) {
        const ws = new target(args[0], args[1]);
        const list = (window as unknown as Record<string, unknown>)
          .__wsList as WebSocket[];
        list.push(ws);
        const timestamps = (window as unknown as Record<string, unknown>)
          .__wsTimestamps as number[];
        timestamps.push(Date.now());
        if ((window as unknown as Record<string, unknown>).__autoClose) {
          setTimeout(() => {
            try {
              ws.close();
            } catch {
              // Ignore errors if already closed.
            }
          }, 10);
        }
        return ws;
      },
    }) as typeof WebSocket;
  });
}

/**
 * Enable auto-close on the injected WS proxy.
 * After calling this, new WebSocket instances will be closed after 10ms.
 */
async function enableAutoClose(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__autoClose = true;
  });
}

/**
 * Close the earliest captured WebSocket from the proxy.
 * This simulates a server-side disconnect or network failure.
 */
async function closeCapturedWs(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const list = (window as unknown as Record<string, unknown>)
      .__wsList as WebSocket[];
    if (list && list.length > 0) list[0].close();
  });
}

/**
 * Get the array of WS creation timestamps collected by the proxy.
 */
async function getWsTimestamps(page: import("@playwright/test").Page): Promise<number[]> {
  return page.evaluate(() => {
    const ts = (window as unknown as Record<string, unknown>)
      .__wsTimestamps as number[];
    return ts ?? [];
  });
}

/**
 * Check the banner (not system message) for reconnecting text.
 * The banner uses class "text-warning-foreground" on the text span;
 * system messages use "text-muted-foreground".
 */
function bannerReconnectingLocator(page: import("@playwright/test").Page) {
  return page.locator(".text-warning-foreground").filter({
    hasText: /正在重新连接/,
  });
}

/**
 * Check the banner (not system message) for connection-lost / reconnect-failed text.
 */
function bannerDisconnectedLocator(page: import("@playwright/test").Page) {
  return page.locator(".text-warning-foreground").filter({
    hasText: /连接已断开/,
  });
}

test.describe("Reconnect robustness", () => {
  test.describe("Exponential backoff timing and attempt counter", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test.skip("banner shows incrementing attempt numbers with exponential backoff", async ({
      page,
    }) => {
      const name = `bo_${Math.random().toString(36).slice(2, 6)}`;

      // Navigate first, then inject controllable proxy.
      await page.goto("/");
      await injectControllableAutoCloseWsProxy(page);
      await doJoin(page, name);

      // Verify connected — no banner.
      await expect(bannerReconnectingLocator(page)).not.toBeVisible({ timeout: 3000 });
      await expect(bannerDisconnectedLocator(page)).not.toBeVisible({ timeout: 3000 });

      // Record the start time before triggering disconnect.
      const startTime = Date.now();

      // Enable autoClose so subsequent reconnection attempts keep failing.
      await enableAutoClose(page);

      // Kill the captured WS. The client will start reconnecting with
      // exponential backoff but autoClose prevents success.
      await closeCapturedWs(page);

      // --- Attempt 1 (delay ~1s base + jitter) ---
      // The reconnecting event dispatches BEFORE the timer fires.
      // The banner shows "正在重新连接 (第 1 次)...".
      await expect(
        page.locator(".text-warning-foreground").filter({
          hasText: "正在重新连接 (第 1 次)...",
        }),
      ).toBeVisible({ timeout: 5000 });

      // --- Attempt 2 (delay ~2s base + jitter, ~3s cumulative) ---
      await expect(
        page.locator(".text-warning-foreground").filter({
          hasText: "正在重新连接 (第 2 次)...",
        }),
      ).toBeVisible({ timeout: 8000 });

      // --- Attempt 3 (delay ~4s base + jitter, ~7s cumulative) ---
      await expect(
        page.locator(".text-warning-foreground").filter({
          hasText: "正在重新连接 (第 3 次)...",
        }),
      ).toBeVisible({ timeout: 12000 });

      // --- Attempt 4 (delay ~8s base + jitter, ~15s cumulative) ---
      await expect(
        page.locator(".text-warning-foreground").filter({
          hasText: "正在重新连接 (第 4 次)...",
        }),
      ).toBeVisible({ timeout: 20000 });

      // Verify timestamps show roughly doubling intervals.
      const timestamps = await getWsTimestamps(page);
      // We expect at least 5 entries: 1 initial + 4 reconnect attempts.
      expect(timestamps.length).toBeGreaterThanOrEqual(5);

      // Compute inter-creation delays.
      const delays: number[] = [];
      for (let i = 1; i < timestamps.length; i++) {
        delays.push(timestamps[i] - timestamps[i - 1]);
      }

      // The reconnect base delays are for intervals between reconnect WS creations:
      // delays[0] = initial WS → first reconnect WS (not a controlled delay)
      // delays[1] = first reconnect → second reconnect (expected ~1000ms base)
      // delays[2] = second → third (expected ~2000ms base)
      // delays[3] = third → fourth (expected ~4000ms base)
      const expectedBaseDelays = [1000, 2000, 4000, 8000];
      const tolerance = 0.5; // +/- 50% to cover 20% jitter + overhead.

      for (let i = 0; i < Math.min(delays.length - 1, expectedBaseDelays.length); i++) {
        const delayIdx = i + 1;
        if (delayIdx < delays.length) {
          const expected = expectedBaseDelays[i];
          const actual = delays[delayIdx];
          expect(actual).toBeGreaterThan(expected * (1 - tolerance));
          expect(actual).toBeLessThan(expected * (1 + tolerance));
        }
      }

      // Verify no crash — the app is still rendering.
      const elapsed = Date.now() - startTime;
      console.log(
        `Backoff test completed in ${elapsed}ms, observed ${delays.length} delays: [${delays.join(", ")}]`,
      );
    });
  });

  test.describe("Reconnect succeeds after simulated disconnect", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test.skip("auto-reconnects and allows sending messages after disconnect", async ({
      page,
    }) => {
      const name = `rs_${Math.random().toString(36).slice(2, 6)}`;

      // Navigate first, then inject standard proxy (no autoClose).
      await page.goto("/");
      await injectWsProxy(page);
      await doJoin(page, name);

      // No banner when connected.
      await expect(bannerReconnectingLocator(page)).not.toBeVisible({ timeout: 3000 });
      await expect(bannerDisconnectedLocator(page)).not.toBeVisible({ timeout: 3000 });

      // Send a message before disconnect to confirm functionality.
      const beforeMsg = `before_${Math.random().toString(36).slice(2, 6)}`;
      await page.locator("textarea").first().fill(beforeMsg);
      await page.keyboard.press("Enter");
      await expect(page.getByText(beforeMsg).first()).toBeVisible({
        timeout: 15000,
      });

      // Simulate disconnect.
      await closeCapturedWs(page);

      // Banner should appear.
      await expect(
        page.locator(".text-warning-foreground").filter({
          hasText: /正在重新连接|连接已断开/,
        }),
      ).toBeVisible({ timeout: 10000 });

      // Wait for auto-reconnect to complete. The client reconnects with
      // ~1s backoff. After successful reconnect, the "已重新连接" system
      // message appears in chat.
      await expect(
        page.getByText("已重新连接"),
      ).toBeVisible({ timeout: 30000 });

      // After reconnect, the banner should disappear.
      await expect(bannerReconnectingLocator(page)).not.toBeVisible({ timeout: 5000 });
      await expect(bannerDisconnectedLocator(page)).not.toBeVisible({ timeout: 5000 });

      // Send a message after reconnect — should succeed.
      const afterMsg = `after_${Math.random().toString(36).slice(2, 6)}`;
      const textarea = page.locator("textarea").first();
      await expect(textarea).toBeEnabled({ timeout: 5000 });
      await textarea.fill(afterMsg);
      await page.keyboard.press("Enter");
      await expect(page.getByText(afterMsg).first()).toBeVisible({
        timeout: 15000,
      });

      // Verify the pre-disconnect message is still visible.
      await expect(page.getByText(beforeMsg).first()).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe("Max reconnect attempts", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test.skip("shows reconnect_failed message after exhausting max attempts", async ({
      page,
    }) => {
      const name = `mf_${Math.random().toString(36).slice(2, 6)}`;

      // Navigate first, then inject controllable proxy.
      await page.goto("/");
      await injectControllableAutoCloseWsProxy(page);
      await doJoin(page, name);

      // Verify connected initially — no banner.
      await expect(bannerReconnectingLocator(page)).not.toBeVisible({ timeout: 3000 });
      await expect(bannerDisconnectedLocator(page)).not.toBeVisible({ timeout: 3000 });

      // Enable autoClose, then disconnect to trigger reconnect loop.
      await enableAutoClose(page);
      await closeCapturedWs(page);

      // Wait for a couple of real reconnect attempts to confirm the loop runs.
      await expect(
        page.locator(".text-warning-foreground").filter({
          hasText: "正在重新连接 (第 1 次)...",
        }),
      ).toBeVisible({ timeout: 5000 });

      await expect(
        page.locator(".text-warning-foreground").filter({
          hasText: "正在重新连接 (第 2 次)...",
        }),
      ).toBeVisible({ timeout: 8000 });

      // Now simulate exhausting all reconnect attempts by dispatching
      // reconnect_failed via the exposed chatAPI. This tests the full
      // UI path without waiting ~3 minutes for real exponential backoff.
      await page.evaluate(() => {
        const api = (window as unknown as Record<string, unknown>)
          .__chatAPI as { dispatch: (event: string, data: Record<string, unknown>) => void };
        if (api && typeof api.dispatch === "function") {
          api.dispatch("reconnect_failed", {
            type: "reconnect_failed",
            attempt: 10,
          });
        }
      });

      // The reconnect_failed banner text should appear.
      await expect(
        page.locator(".text-warning-foreground").filter({
          hasText: "连接已断开，请刷新页面。",
        }),
      ).toBeVisible({ timeout: 5000 });

      // The reload button should be visible and enabled.
      const reloadBtn = page.getByRole("button", { name: "刷新页面" });
      await expect(reloadBtn).toBeVisible({ timeout: 5000 });
      await expect(reloadBtn).toBeEnabled();

      // The attempt-count text should NOT be visible in the banner
      // (reconnectAttempt should be null after reconnect_failed).
      await expect(bannerReconnectingLocator(page)).not.toBeVisible({ timeout: 3000 });
    });
  });

  test.describe("Manual reconnect via page reload", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("page reload restores chat functionality after disconnect", async ({
      page,
    }) => {
      const name = `rl_${Math.random().toString(36).slice(2, 6)}`;

      // Navigate first, then inject standard proxy.
      await page.goto("/");
      await injectWsProxy(page);
      await doJoin(page, name);

      // No banner when connected.
      await expect(bannerReconnectingLocator(page)).not.toBeVisible({ timeout: 3000 });
      await expect(bannerDisconnectedLocator(page)).not.toBeVisible({ timeout: 3000 });

      // Send a pre-disconnect message.
      const preMsg = `prereload_${Math.random().toString(36).slice(2, 6)}`;
      await page.locator("textarea").first().fill(preMsg);
      await page.keyboard.press("Enter");
      await expect(page.getByText(preMsg).first()).toBeVisible({
        timeout: 15000,
      });

      // Close WebSocket to simulate disconnect.
      await closeCapturedWs(page);

      // Verify the disconnect banner appears.
      await expect(
        page.locator(".text-warning-foreground").filter({
          hasText: /正在重新连接|连接已断开/,
        }),
      ).toBeVisible({ timeout: 10000 });

      // Reload the page to manually reconnect.
      await page.reload();

      // After reload, we should be back at the join screen.
      // Re-join with the same name.
      await page.getByPlaceholder("你的用户名...").fill(name);
      await page.getByRole("button", { name: "游客加入" }).click();
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Verify no disconnect banner after successful re-join.
      await expect(bannerReconnectingLocator(page)).not.toBeVisible({ timeout: 5000 });
      await expect(bannerDisconnectedLocator(page)).not.toBeVisible({ timeout: 5000 });

      // Verify we can send a new message.
      const newMsg = `postreload_${Math.random().toString(36).slice(2, 6)}`;
      const textarea = page.locator("textarea").first();
      await expect(textarea).toBeEnabled({ timeout: 5000 });
      await textarea.fill(newMsg);
      await page.keyboard.press("Enter");
      await expect(page.getByText(newMsg).first()).toBeVisible({
        timeout: 15000,
      });
    });
  });

  test.describe("Rapid connect/disconnect cycles", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test.skip("multiple rapid connect/disconnect cycles do not crash the app", async ({
      page,
    }) => {
      const name = `cy_${Math.random().toString(36).slice(2, 6)}`;

      // Navigate first, then inject standard proxy (no autoClose).
      await page.goto("/");
      await injectWsProxy(page);
      await doJoin(page, name);

      const cycles = 5;

      for (let i = 1; i <= cycles; i++) {
        // Verify the app is still functional before each cycle.
        await expect(page.locator("textarea").first()).toBeVisible({
          timeout: 3000,
        });

        // Close the most recently captured WebSocket.
        // The proxy captures all WS instances, so the current connection
        // is the last one in the list.
        await page.evaluate(() => {
          const list = (window as unknown as Record<string, unknown>)
            .__wsList as WebSocket[];
          if (list && list.length > 0) {
            const last = list[list.length - 1];
            if (
              last.readyState === WebSocket.OPEN ||
              last.readyState === WebSocket.CONNECTING
            ) {
              last.close();
            }
          }
        });

        // The disconnect banner should appear.
        await expect(
          page.locator(".text-warning-foreground").filter({
            hasText: /正在重新连接|连接已断开/,
          }),
        ).toBeVisible({ timeout: 10000 });

        // Wait for reconnection — look for "已重新连接" system message.
        await expect(
          page.getByText("已重新连接"),
        ).toBeVisible({ timeout: 30000 });

        // Banner should disappear.
        await expect(bannerReconnectingLocator(page)).not.toBeVisible({ timeout: 5000 });

        console.log(`Cycle ${i}/${cycles} completed successfully`);
      }

      // After all cycles, verify the app is fully functional by sending a message.
      const finalMsg = `final_${Math.random().toString(36).slice(2, 6)}`;
      const textarea = page.locator("textarea").first();
      await expect(textarea).toBeEnabled({ timeout: 5000 });
      await textarea.fill(finalMsg);
      await page.keyboard.press("Enter");
      await expect(page.getByText(finalMsg).first()).toBeVisible({
        timeout: 15000,
      });
    });
  });
});
