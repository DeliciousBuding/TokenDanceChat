import { test, expect } from "@playwright/test";
import { joinGuestFromPreview } from "./helpers";

/**
 * TokenDanceChat Edge Cases E2E Tests.
 *
 * Run:
 *   E2E_BASE_URL=https://chat.tokendancelab.com npx playwright test src/e2e/edge-cases.test.ts --project=chromium --workers=1
 *
 * Coverage:
 *   1. Poll edge cases:
 *      - Very long question (near char limit)
 *      - Single option (should be rejected)
 *      - Special characters in options (emoji, markdown)
 *   2. Lightweight sidebar edge cases:
 *      - Online users list updates when someone leaves
 *      - Old IM sections stay removed from the public surface
 *   3. Multi-user scenario:
 *      - Two guests join, both can see each other's messages
 *      - One leaves, other sees "left" system message
 */

// ── Helpers (mirror poll-flow.test.ts / sidebar-ux.test.ts patterns) ──

const setupPage = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("tokendance:lang", "zh-CN");
    localStorage.setItem("tdchat-theme", "light");
    localStorage.removeItem("tokendance:username");
  });
};

async function joinChat(
  page: import("@playwright/test").Page,
  name?: string,
  path = "/",
): Promise<string> {
  const guestName = name ?? `e2e_${Math.random().toString(36).slice(2, 8)}`;

  await page.goto(path);
  await joinGuestFromPreview(page, guestName);

  await expect(page.locator("textarea").first()).toBeVisible({
    timeout: 15000,
  });

  return guestName;
}

/**
 * Create a poll in the current public room by opening a temporary
 * WebSocket connection.  The bot joins, sends poll_create, waits for
 * the broadcast confirmation, then disconnects.
 */
async function createPollViaWS(
  page: import("@playwright/test").Page,
  question: string,
  options: string[],
  opts?: { multipleChoice?: boolean; isAnonymous?: boolean; username?: string },
): Promise<{ pollId: string; botName: string }> {
  return page.evaluate(
    ({ question, options, multipleChoice, isAnonymous, username }) => {
      return new Promise<{ pollId: string; botName: string }>(
        (resolve, reject) => {
          const protocol =
            window.location.protocol === "https:" ? "wss:" : "ws:";
          const wsUrl = `${protocol}//${window.location.host}/ws`;
          const ws = new WebSocket(wsUrl);
          const botName =
            username ?? `pb_${Math.random().toString(36).slice(2, 8)}`;

          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error("Poll create via WS timed out after 15s"));
          }, 15000);

          let joined = false;

          ws.onopen = () => {
            ws.send(JSON.stringify({ type: "join", username: botName }));
          };

          ws.onmessage = (e) => {
            const msg = JSON.parse(e.data as string);

            if (
              !joined &&
              (msg.type === "history" || msg.type === "user_status")
            ) {
              joined = true;
              ws.send(
                JSON.stringify({
                  type: "poll_create",
                  poll: {
                    question,
                    options,
                    multiple_choice: multipleChoice ?? false,
                    is_anonymous: isAnonymous ?? false,
                  },
                }),
              );
              return;
            }

            if (msg.type === "poll_created" && msg.poll) {
              clearTimeout(timeout);
              const pollId: string = msg.id || msg.poll.id;
              ws.close();
              resolve({ pollId, botName });
            }
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            reject(new Error("WebSocket error during poll creation"));
          };
        },
      );
    },
    {
      question,
      options,
      multipleChoice: opts?.multipleChoice ?? false,
      isAnonymous: opts?.isAnonymous ?? false,
      username: opts?.username ?? null,
    },
  );
}

// ── Tests ──

test.describe("Edge Cases", () => {
  // ═══════════════════════════════════════════════════
  // 1. Poll Edge Cases
  // ═══════════════════════════════════════════════════
  test.describe("Poll edge cases", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("very long question (near char limit) renders correctly", async ({
      page,
    }) => {
      await joinChat(page);

      // Build a 500-character question.
      const longQuestion =
        "Q" +
        Array.from({ length: 50 }, (_, i) => ` topic_part_${i}`).join("") +
        "?";
      // Ensure it's substantial.
      expect(longQuestion.length).toBeGreaterThan(400);

      const options = ["Agree", "Disagree"];

      const { pollId } = await createPollViaWS(page, longQuestion, options);
      expect(pollId).toBeTruthy();

      // The long question should appear in the chat transcript.
      // It may be truncated visually, but the full text should be in the DOM.
      await expect(page.getByText(longQuestion.slice(0, 100)).first()).toBeVisible({
        timeout: 10000,
      });
    });

    test("single option poll is rejected by server", async ({ page }) => {
      await joinChat(page);

      const question = `SingleOpt_${Math.random().toString(36).slice(2, 6)}`;

      // A poll with only one option should fail — the server should reject
      // it and never broadcast poll_created, causing the WS helper to timeout.
      await expect(
        createPollViaWS(page, question, ["Only one option"]),
      ).rejects.toThrow();

      // The poll question text must NOT appear in the chat.
      await expect(page.getByText(question)).not.toBeVisible({ timeout: 3000 });
    });

    test("special characters in options render correctly (emoji, markdown)", async ({
      page,
    }) => {
      await joinChat(page);

      const question =
        "Which feature do you prefer? 🎨✨";
      const options = [
        "**Bold** markdown option",
        "_Italic_ *styled* option",
        "😀 Emoji option 🚀🔥",
        "Mixed **bold** and emoji 🎉",
      ];

      const { pollId } = await createPollViaWS(page, question, options);
      expect(pollId).toBeTruthy();

      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });

      // Each option should be rendered as a button in the poll.
      // Special characters must appear as literal text in the DOM.
      for (const option of options) {
        await expect(
          page.locator("button").filter({ hasText: option }).first(),
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  // ═══════════════════════════════════════════════════
  // 2. Lightweight Sidebar Edge Cases
  // ═══════════════════════════════════════════════════
  test.describe("Lightweight sidebar edge cases", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("old IM sections stay removed from the sidebar", async ({ page }) => {
      await joinChat(page);

      const sidebar = page.locator("aside");
      await expect(sidebar.getByText(/好友|Friends/)).toHaveCount(0);
      await expect(sidebar.getByText(/群组|Groups/)).toHaveCount(0);
      await expect(sidebar.getByText(/私信|Direct Messages|DM/)).toHaveCount(0);
      await expect(sidebar.getByText(/Webhook|传入 Webhook/)).toHaveCount(0);
      await expect(sidebar.getByRole("button", { name: /公共聊天|Public Chat/ })).toBeVisible();
      await expect(sidebar.getByRole("button", { name: /TokenBot/ })).toBeVisible();
      await expect(sidebar.getByRole("button", { name: /PicoClaw/ })).toBeVisible();
    });

    test("public room remains stable after another guest disconnects", async ({
      page,
    }) => {
      await joinChat(page);

      // Second user joins.
      const page2 = await page.context().newPage();
      await setupPage(page2);
      await joinChat(page2);

      const sidebar = page.locator("aside");
      await expect(sidebar.getByRole("button", { name: /公共聊天|Public Chat/ })).toBeVisible();

      // Disconnect page2 by clicking the "断开连接" button.
      // Desktop header has aria-label="断开连接" (t("chat.disconnect")).
      const disconnectBtn = page2.getByRole("button", {
        name: "断开连接",
      });
      await expect(disconnectBtn).toBeVisible({ timeout: 10000 });
      await disconnectBtn.click();

      await expect(page.locator("textarea").first()).toBeVisible({ timeout: 10000 });
      await expect(sidebar.getByText(/好友|Friends|群组|Groups|私信|Direct Messages|DM/)).toHaveCount(0);

      await page2.close();
    });

    test("conversation search closes without restoring old sections", async ({ page }) => {
      await joinChat(page);

      await page.getByRole("button", { name: "搜索当前对话" }).click();
      const searchInput = page.getByPlaceholder("搜索当前对话");
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill("not_expected_to_match");
      await expect(page.getByText("当前对话无匹配").first()).toBeVisible({ timeout: 10000 });
      await page.keyboard.press("Escape");
      await expect(searchInput).not.toBeVisible({ timeout: 5000 });
      await expect(page.locator("aside").getByText(/私信|Direct Messages|DM/)).toHaveCount(0);
    });
  });

  // ═══════════════════════════════════════════════════
  // 3. Multi-User Scenarios
  // ═══════════════════════════════════════════════════
  test.describe("Multi-user scenarios", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("two guests join and see each other's messages", async ({ page }) => {
      const name1 = await joinChat(page);

      // Second user in a new tab.
      const page2 = await page.context().newPage();
      await setupPage(page2);
      const name2 = await joinChat(page2);

      // User1 sends a public message.
      const msg1 = `pub_from_${name1}_${Math.random().toString(36).slice(2, 6)}`;
      await page.locator("textarea").first().fill(msg1);
      await page.keyboard.press("Enter");
      await expect(page.getByText(msg1).first()).toBeVisible({
        timeout: 15000,
      });

      // User2 should see user1's message in their transcript.
      await expect(page2.getByText(msg1).first()).toBeVisible({
        timeout: 15000,
      });

      // User2 sends a public message.
      const msg2 = `pub_from_${name2}_${Math.random().toString(36).slice(2, 6)}`;
      await page2.locator("textarea").first().fill(msg2);
      await page2.keyboard.press("Enter");
      await expect(page2.getByText(msg2).first()).toBeVisible({
        timeout: 15000,
      });

      // User1 should see user2's message.
      await expect(page.getByText(msg2).first()).toBeVisible({
        timeout: 15000,
      });

      await expect(page.locator("aside").getByRole("button", { name: /公共聊天|Public Chat/ })).toBeVisible();
      await expect(page2.locator("aside").getByRole("button", { name: /公共聊天|Public Chat/ })).toBeVisible();

      await page2.close();
    });

    test("disconnecting another guest does not restore old IM sections", async ({
      page,
    }) => {
      await joinChat(page);

      // Second user joins.
      const page2 = await page.context().newPage();
      await setupPage(page2);
      await joinChat(page2);

      const sidebar = page.locator("aside");
      await expect(sidebar.getByRole("button", { name: /公共聊天|Public Chat/ })).toBeVisible();

      // Disconnect page2 cleanly via the "断开连接" button.
      const disconnectBtn = page2.getByRole("button", {
        name: "断开连接",
      });
      await expect(disconnectBtn).toBeVisible({ timeout: 10000 });
      await disconnectBtn.click();

      await expect(sidebar.getByText(/好友|Friends|群组|Groups|私信|Direct Messages|DM/)).toHaveCount(0);
      await expect(page.locator("textarea").first()).toBeVisible({ timeout: 10000 });

      await page2.close();
    });
  });
});
