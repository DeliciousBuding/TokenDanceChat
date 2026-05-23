import { test, expect } from "@playwright/test";

/**
 * TokenDanceChat Edge Cases E2E Tests.
 *
 * Run:
 *   E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/edge-cases.test.ts --project=chromium --workers=1
 *
 * Coverage:
 *   1. Poll edge cases:
 *      - Very long question (near char limit)
 *      - Single option (should be rejected)
 *      - Special characters in options (emoji, markdown)
 *   2. Sidebar edge cases:
 *      - Multiple DMs from same user only show once
 *      - Online users list updates when someone leaves
 *      - Search clear button resets search
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
  await page.getByPlaceholder("你的用户名...").fill(guestName);
  await page.getByRole("button", { name: "游客加入" }).click();

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
  // 2. Sidebar Edge Cases
  // ═══════════════════════════════════════════════════
  test.describe("Sidebar edge cases", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("multiple DMs from same user only show once in sidebar", async ({
      page,
    }) => {
      const name1 = await joinChat(page);

      // Second user joins in a new tab.
      const page2 = await page.context().newPage();
      await setupPage(page2);
      const name2 = await joinChat(page2);

      // Verify user2 appears in page1's online users sidebar.
      const sidebar = page.locator("aside");
      await expect(sidebar.getByText(name2).first()).toBeVisible({
        timeout: 15000,
      });

      // Start a DM from page1 to user2 via the context menu.
      await page.evaluate(
        async (targetName: string) => {
          const buttons = Array.from(
            document.querySelectorAll("aside button"),
          );
          const userBtn = buttons.find(
            (b) => b.getAttribute("aria-label")?.trim() === targetName,
          );
          if (!userBtn) throw new Error(`User button not found: ${targetName}`);

          (userBtn as HTMLElement).click();
          await new Promise((r) => setTimeout(r, 800));

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

      // Send 3 DM messages from page1 to user2.
      for (let i = 0; i < 3; i++) {
        const dmMsg = `dedup_${i}_${Math.random().toString(36).slice(2, 4)}`;
        await page.locator("textarea").first().fill(dmMsg);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(200);
      }

      // Navigate back to public chat via sidebar so we can inspect the
      // full DM list without the DM chat view active.
      const publicChatBtn = page.getByRole("button", { name: "公共聊天" });
      if (await publicChatBtn.isVisible().catch(() => false)) {
        await publicChatBtn.click();
        await page.waitForTimeout(500);
      }

      // Verify the DM section exists in the sidebar.
      // Scope the locator to the <aside> to avoid matching the DM chat header.
      const dmSectionHeader = sidebar.getByText("私信", { exact: true });
      await expect(dmSectionHeader.first()).toBeVisible({ timeout: 10000 });

      // The dmPartners list is derived from a Set, so each user appears at
      // most once as a DM entry.  Find the DM section (headed by "私信") and
      // count occurrences of name2 among DM partner buttons only — excluding
      // the online users section which also lists the same user.
      const dmOccurrences = await page.evaluate((target: string) => {
        const aside = document.querySelector("aside");
        if (!aside) return -1;

        // Locate the DM section: find the "私信" header span, then its parent div.
        const allSpans = aside.querySelectorAll("span");
        let dmContainer: Element | null = null;
        for (const span of allSpans) {
          if (span.textContent?.trim() === "私信") {
            dmContainer = span.parentElement;
            break;
          }
        }
        if (!dmContainer) return -1;

        // Within the DM container, find all truncate spans and check for target.
        const truncates = dmContainer.querySelectorAll("span.block.truncate");
        let count = 0;
        for (const t of truncates) {
          if ((t.textContent || "").trim() === target) count++;
        }
        return count;
      }, name2);

      // The partner should appear once in the DM list.
      expect(dmOccurrences).toBe(1);

      await page2.close();
    });

    test("online users list removes user after they disconnect", async ({
      page,
    }) => {
      await joinChat(page);

      // Second user joins.
      const page2 = await page.context().newPage();
      await setupPage(page2);
      const name2 = await joinChat(page2);

      // Verify user2 appears in page1's online users sidebar.
      const sidebar = page.locator("aside");
      await expect(sidebar.getByText(name2).first()).toBeVisible({
        timeout: 15000,
      });

      // Disconnect page2 by clicking the "断开连接" button.
      // Desktop header has aria-label="断开连接" (t("chat.disconnect")).
      const disconnectBtn = page2.getByRole("button", {
        name: "断开连接",
      });
      await expect(disconnectBtn).toBeVisible({ timeout: 10000 });
      await disconnectBtn.click();

      // After disconnect, page1's online users sidebar should no longer
      // show user2 (they left via clean disconnect).
      // The user_left event removes them from the onlineUsers store.
      await expect(sidebar.getByText(name2).first()).not.toBeVisible({
        timeout: 10000,
      });

      await page2.close();
    });

    test("search clear button resets search state", async ({ page }) => {
      await joinChat(page);

      const searchInput = page.getByPlaceholder("搜索对话...");
      await expect(searchInput).toBeVisible({ timeout: 10000 });

      // Type a search query to enter search mode.
      await searchInput.fill("test_query_to_clear");

      // Verify search mode is active: "搜索结果" header appears.
      await expect(page.getByText("搜索结果", { exact: true })).toBeVisible({
        timeout: 10000,
      });

      // Click the clear button (aria-label="清除搜索").
      const clearBtn = page.locator('[aria-label="清除搜索"]');
      await expect(clearBtn).toBeVisible({ timeout: 5000 });
      await clearBtn.click();

      // After clearing:
      // 1. Search results header should be gone.
      await expect(
        page.getByText("搜索结果", { exact: true }),
      ).not.toBeVisible({ timeout: 5000 });

      // 2. The search input should be empty.
      await expect(searchInput).toHaveValue("", { timeout: 5000 });

      // 3. Normal sidebar sections should be visible again.
      await expect(page.getByText("在线用户", { exact: true })).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText("AI 助手", { exact: true })).toBeVisible({
        timeout: 5000,
      });
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

      // Both should appear in each other's online users sidebar.
      const sidebar1 = page.locator("aside");
      const sidebar2 = page2.locator("aside");

      await expect(sidebar1.getByText(name2).first()).toBeVisible({
        timeout: 10000,
      });
      await expect(sidebar2.getByText(name1).first()).toBeVisible({
        timeout: 10000,
      });

      await page2.close();
    });

    test("disconnecting user triggers 'left' system message for remaining user", async ({
      page,
    }) => {
      await joinChat(page);

      // Second user joins.
      const page2 = await page.context().newPage();
      await setupPage(page2);
      const name2 = await joinChat(page2);

      // Verify both users see each other online.
      const sidebar = page.locator("aside");
      await expect(sidebar.getByText(name2).first()).toBeVisible({
        timeout: 15000,
      });

      // Disconnect page2 cleanly via the "断开连接" button.
      const disconnectBtn = page2.getByRole("button", {
        name: "断开连接",
      });
      await expect(disconnectBtn).toBeVisible({ timeout: 10000 });
      await disconnectBtn.click();

      // Page1 should see a system message: "{{username}} 离开了聊天室"
      // The system.userLeft translation renders as "name2 离开了聊天室".
      const leaveMessage = page.getByText(
        `${name2} 离开了聊天室`,
      );
      await expect(leaveMessage.first()).toBeVisible({
        timeout: 10000,
      });

      // The disconnected user should no longer appear in online users.
      await expect(sidebar.getByText(name2).first()).not.toBeVisible({
        timeout: 10000,
      });

      await page2.close();
    });
  });
});
