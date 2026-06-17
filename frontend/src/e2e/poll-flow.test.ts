import { test, expect } from "@playwright/test";
import { joinGuestFromPreview } from "./helpers";

/**
 * TokenDanceChat Poll E2E Tests.
 *
 * Run:
 *   E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/poll-flow.test.ts --project=chromium
 *
 * Coverage:
 *   1. Poll creation renders question and options in chat
 *   2. Poll shows question text and option buttons
 *   3. Guest can vote on a poll
 *   4. Vote count updates after voting
 *   5. Cannot vote twice in single-choice poll
 *   6. Poll creator can close the poll
 *   7. Closed poll shows final results badge
 *   8. Multiple-choice poll supports selecting multiple options
 *
 * NOTE: Poll creation has no UI yet (no button, dialog, or slash command).
 * Tests use a helper that opens a temporary WebSocket to create polls
 * programmatically. Once the poll-creation UI is built, tests 1 and 2
 * should be updated to use UI-driven creation instead.
 *
 * NOTE: PollMessage is now wired into MessageBubble, and the WebSocket
 * router handles poll_created / poll_vote_update / poll_closed events,
 * so the rendering and voting tests are active.
 */

// ── Helpers (mirror dm-flow.test.ts patterns) ──

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
 *
 * Pass `username` to create the poll under a specific identity (e.g.
 * for testing the close-poll flow as the poll creator).
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

            // Wait for join confirmation, then send poll_create.
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

            // The server broadcasts poll_created to the room after persisting.
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

/**
 * Create a poll through the page's existing WebSocket connection
 * (window.__chatAPI).  Use this when the poll creator must match the
 * page user — it avoids the kick mechanism that would disconnect the
 * page if we opened a second WS with the same username.
 */
async function createPollViaPage(
  page: import("@playwright/test").Page,
  question: string,
  options: string[],
  opts?: { multipleChoice?: boolean; isAnonymous?: boolean },
): Promise<string> {
  return page.evaluate(
    ({ question, options, multipleChoice, isAnonymous }) => {
      return new Promise<string>((resolve, reject) => {
        const api = (window as any).__chatAPI;
        if (!api) return reject(new Error("__chatAPI not on window"));

        const timeout = setTimeout(() => {
          unsub();
          reject(new Error("Poll create via page WS timed out after 15s"));
        }, 15000);

        function handler(msg: any) {
          if (msg.poll && (msg.poll.question === question)) {
            clearTimeout(timeout);
            unsub();
            resolve(msg.id || msg.poll.id);
          }
        }

        const unsub = api.on("poll_created", handler);
        api.sendPollCreate(question, options, multipleChoice ?? false, isAnonymous ?? false);
      });
    },
    {
      question,
      options,
      multipleChoice: opts?.multipleChoice ?? false,
      isAnonymous: opts?.isAnonymous ?? false,
    },
  );
}

/**
 * Close a poll through the page's existing WebSocket connection.
 * Use when the page user is the poll creator (avoids kick).
 */
async function closePollViaPage(
  page: import("@playwright/test").Page,
  pollId: string,
): Promise<void> {
  return page.evaluate(
    (pollId) => {
      return new Promise<void>((resolve, reject) => {
        const api = (window as any).__chatAPI;
        if (!api) return reject(new Error("__chatAPI not on window"));

        const timeout = setTimeout(() => {
          unsub();
          reject(new Error("Poll close via page WS timed out after 10s"));
        }, 10000);

        function handler(msg: any) {
          if (msg.id === pollId) {
            clearTimeout(timeout);
            unsub();
            resolve();
          }
        }

        const unsub = api.on("poll_closed", handler);
        api.sendPollClose(pollId);
      });
    },
    pollId,
  );
}

// ── Tests ──

test.describe("Poll Creation & Voting Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test.describe("Poll creation", () => {
    test("can create a poll in public chat", async ({ page }) => {
      await joinChat(page);

      // Poll creation has no UI yet — use programmatic WS path.
      // TODO: when UI exists, update this test to click through the
      // poll-creation dialog.
      const question = `E2E poll ${Math.random().toString(36).slice(2, 6)}`;
      const options = ["Option A", "Option B", "Option C"];

      const { pollId } = await createPollViaWS(page, question, options);
      expect(pollId).toBeTruthy();

      // PollMessage is now wired into MessageBubble, so the poll
      // should render in the chat transcript.
      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });
    });

    test("poll shows question and options in the chat", async ({ page }) => {
      await joinChat(page);

      const question = `Q_${Math.random().toString(36).slice(2, 6)}`;
      const options = ["Alpha", "Beta", "Gamma"];

      await createPollViaWS(page, question, options);

      // The poll question is rendered as a <span> inside PollMessage header.
      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });

      // Each option is rendered as a <button> containing the option text.
      for (const option of options) {
        await expect(
          page.locator("button").filter({ hasText: option }).first(),
        ).toBeVisible({ timeout: 5000 });
      }

      // The vote button ("投票" in zh-CN) should NOT be visible yet
      // because no option is selected.
      await expect(
        page.getByRole("button", { name: "投票" }),
      ).not.toBeVisible();
    });
  });

  test.describe("Voting", () => {
    test("can vote on a poll", async ({ page }) => {
      await joinChat(page);

      const question = `VoteTest_${Math.random().toString(36).slice(2, 6)}`;
      const options = ["Red", "Green", "Blue"];

      await createPollViaWS(page, question, options);

      // Wait for the poll to render.
      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });

      // Click an option button (the second one: "Green").
      const optionBtn = page
        .locator("button")
        .filter({ hasText: "Green" })
        .first();
      await expect(optionBtn).toBeVisible({ timeout: 5000 });
      await optionBtn.click();

      // After selecting, the Vote button ("投票") should appear.
      const voteBtn = page.getByRole("button", { name: "投票" });
      await expect(voteBtn).toBeVisible({ timeout: 3000 });
      await voteBtn.click();

      // After successful vote, a checkmark SVG should appear on the voted option.
      // The PollMessage renders a checkmark <svg> inside the voted option button.
      await expect(optionBtn.locator("svg").first()).toBeVisible({
        timeout: 5000,
      });

      // The Vote button should disappear after voting.
      await expect(voteBtn).not.toBeVisible({ timeout: 3000 });
    });

    test("vote count updates after voting", async ({ page }) => {
      await joinChat(page);

      const question = `CountTest_${Math.random().toString(36).slice(2, 6)}`;
      const options = ["Yes", "No"];

      await createPollViaWS(page, question, options);

      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });

      // Click "Yes", then vote.
      await page
        .locator("button")
        .filter({ hasText: "Yes" })
        .first()
        .click();
      await page.getByRole("button", { name: "投票" }).click();

      // The vote count text should show "1 票" (zh-CN) or "1 vote".
      // PollMessage renders: t("poll.votes", { count: totalVotes })
      await expect(page.getByText(/1\s*(票|vote)/).first()).toBeVisible({
        timeout: 5000,
      });
    });

    test("cannot vote twice in a single-choice poll", async ({ page }) => {
      await joinChat(page);

      const question = `SingleVote_${Math.random().toString(36).slice(2, 6)}`;
      const options = ["Pizza", "Sushi", "Tacos"];

      await createPollViaWS(page, question, options);

      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });

      // Vote for "Sushi".
      const sushiBtn = page
        .locator("button")
        .filter({ hasText: "Sushi" })
        .first();
      await sushiBtn.click();
      await page.getByRole("button", { name: "投票" }).click();

      // Wait for checkmark to confirm vote registered.
      await expect(sushiBtn.locator("svg").first()).toBeVisible({
        timeout: 5000,
      });

      // After voting single-choice, the option buttons are disabled
      // (disabled={hasVoted && !poll.multiple_choice}).
      const pizzaBtn = page
        .locator("button")
        .filter({ hasText: "Pizza" })
        .first();
      await expect(pizzaBtn).toBeDisabled({ timeout: 3000 });

      // The Vote button should no longer be visible.
      await expect(
        page.getByRole("button", { name: "投票" }),
      ).not.toBeVisible({ timeout: 3000 });
    });

    test("multiple-choice poll allows selecting multiple options", async ({
      page,
    }) => {
      await joinChat(page);

      const question = `MultiVote_${Math.random().toString(36).slice(2, 6)}`;
      const options = ["React", "Vue", "Svelte"];

      await createPollViaWS(page, question, options, {
        multipleChoice: true,
      });

      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });

      // Select two options.
      const reactBtn = page
        .locator("button")
        .filter({ hasText: "React" })
        .first();
      const vueBtn = page
        .locator("button")
        .filter({ hasText: "Vue" })
        .first();

      await reactBtn.click();
      await vueBtn.click();

      // Both should show selection indicator (filled circle for selected).
      // In multi-choice mode the Vote button should appear.
      const voteBtn = page.getByRole("button", { name: "投票" });
      await expect(voteBtn).toBeVisible({ timeout: 3000 });
      await voteBtn.click();

      // After voting, both options should show checkmarks.
      await expect(reactBtn.locator("svg").first()).toBeVisible({
        timeout: 5000,
      });
      await expect(vueBtn.locator("svg").first()).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe("Poll closing", () => {
    test("poll creator can close the poll", async ({ page }) => {
      const creatorName = `creator_${Math.random().toString(36).slice(2, 6)}`;

      // Join as the poll creator (with ?e2e to expose __chatAPI).
      await page.goto("/?e2e");
      await joinGuestFromPreview(page, creatorName);
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Create the poll via the page's own WebSocket so isOwnPoll is true
      // and the close button renders.  (Using createPollViaWS would open a
      // second WS with the same username and kick the page.)
      const question = `CloseTest_${Math.random().toString(36).slice(2, 6)}`;
      const options = ["Keep", "Archive", "Delete"];
      await createPollViaPage(page, question, options);

      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });

      // The close button renders when !isClosed && isOwnPoll.
      const closeBtn = page.getByRole("button", { name: "投票已关闭" });
      await expect(closeBtn).toBeVisible({ timeout: 5000 });
      await closeBtn.click();

      // After closing, the "最终结果" badge should appear.
      await expect(page.getByText("最终结果").first()).toBeVisible({ timeout: 5000 });

      // The close button should disappear.
      await expect(closeBtn).not.toBeVisible({ timeout: 3000 });
    });

    test("closed poll shows final results", async ({ page }) => {
      await joinChat(page, undefined, "/?e2e");

      const question = `FinalResult_${Math.random().toString(36).slice(2, 6)}`;
      const options = ["Up", "Down", "Strange", "Charm"];

      // Create the poll via the page's own WebSocket (avoids kick).
      const pollId = await createPollViaPage(page, question, options);
      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });

      // Vote for "Charm" to generate some data.
      await page
        .locator("button")
        .filter({ hasText: "Charm" })
        .first()
        .click();
      await page.getByRole("button", { name: "投票" }).first().click();
      await expect(page.getByText(/1\s*(票|vote)/).first()).toBeVisible({
        timeout: 5000,
      });

      // Close the poll via the page's own WebSocket.
      await closePollViaPage(page, pollId);

      // After poll_closed broadcast, the PollMessage should show:
      // - "最终结果" badge (t("poll.finalResults"))
      // - Percentage bars on each option
      // - Options should be disabled
      await expect(page.getByText("最终结果").first()).toBeVisible({ timeout: 10000 });

      // Percentage text should be visible on the options.
      // The winning option shows 100%, others show 0% (or 2% minimum bar).
      await expect(page.getByText(/100%/).first()).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(/0%/).first()).toBeVisible({ timeout: 5000 });

      // All option buttons should be disabled in closed state.
      const optionButtons = page
        .locator("button")
        .filter({ hasText: /Up|Down|Strange|Charm/ });
      const count = await optionButtons.count();
      for (let i = 0; i < count; i++) {
        await expect(optionButtons.nth(i)).toBeDisabled({ timeout: 3000 });
      }

      // Vote button should NOT be visible on a closed poll.
      await expect(
        page.getByRole("button", { name: "投票" }),
      ).not.toBeVisible({ timeout: 3000 });
    });
  });

  // Polls remain scoped to the public-room contract. Historical group-poll
  // coverage was removed with the rich IM UI.
});
