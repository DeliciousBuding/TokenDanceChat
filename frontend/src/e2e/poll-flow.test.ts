import { test, expect } from "@playwright/test";

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
 * NOTE: The PollMessage component is not yet wired into the message
 * rendering pipeline (MessageBubble/MessageTranscript). Until
 * poll_created / poll_vote_update / poll_closed events are handled
 * in the WebSocket message router and the PollMessage component is
 * rendered when a message carries poll data, these tests will be
 * skipped with descriptive reasons.
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

/**
 * Create a poll in the current public room by opening a temporary
 * WebSocket connection as a bot user.  The bot joins, sends poll_create,
 * waits for the broadcast confirmation, then disconnects.
 *
 * Once the poll_created event is handled by the frontend and PollMessage
 * is wired into the message pipeline, the poll should appear in the chat
 * transcript automatically.
 */
async function createPollViaWS(
  page: import("@playwright/test").Page,
  question: string,
  options: string[],
  opts?: { multipleChoice?: boolean; isAnonymous?: boolean },
): Promise<{ pollId: string }> {
  return page.evaluate(
    ({ question, options, multipleChoice, isAnonymous }) => {
      return new Promise<{ pollId: string }>((resolve, reject) => {
        const protocol =
          window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const ws = new WebSocket(wsUrl);
        const botName = `pollbot_${Date.now()}`;

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
          if (!joined && (msg.type === "joined" || msg.type === "users")) {
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
            resolve({ pollId });
          }
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("WebSocket error during poll creation"));
        };
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
 * Close a poll by opening a temporary WebSocket as the poll creator.
 * In production the original creator username must match — here we use
 * the bot name from createPollViaWS.
 */
async function closePollViaWS(
  page: import("@playwright/test").Page,
  pollId: string,
  creatorName: string,
): Promise<void> {
  return page.evaluate(
    ({ pollId, creatorName }) => {
      return new Promise<void>((resolve, reject) => {
        const protocol =
          window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const ws = new WebSocket(wsUrl);

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Poll close via WS timed out after 10s"));
        }, 10000);

        let joined = false;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "join", username: creatorName }));
        };

        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data as string);

          if (!joined && (msg.type === "joined" || msg.type === "users")) {
            joined = true;
            ws.send(JSON.stringify({ type: "poll_close", id: pollId }));
            return;
          }

          if (msg.type === "poll_closed") {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("WebSocket error during poll close"));
        };
      });
    },
    { pollId, creatorName },
  );
}

// ── Tests ──

test.describe("Poll Creation & Voting Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test.describe("Poll creation", () => {
    test("can create a poll in public chat", async ({ page }) => {
      test.skip(
        true,
        "Poll creation UI not yet built (no button, dialog, or /poll slash command). " +
          "Once the UI is added, update this test to click through the creation flow.",
      );

      await joinChat(page);

      // TODO: when UI exists, interact with poll-creation controls here.
      // For now, demonstrate the programmatic path:
      const question = `E2E poll ${Math.random().toString(36).slice(2, 6)}`;
      const options = ["Option A", "Option B", "Option C"];

      const { pollId } = await createPollViaWS(page, question, options);
      expect(pollId).toBeTruthy();

      // TODO: verify the PollMessage renders in chat.
      // await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });
    });

    test("poll shows question and options in the chat", async ({ page }) => {
      test.skip(
        true,
        "PollMessage component is not yet wired into MessageBubble/MessageTranscript. " +
          "The poll_created event has no frontend handler, so polls do not render in the chat. " +
          "Once poll event handlers and PollMessage integration are added, remove this skip.",
      );

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
      test.skip(
        true,
        "PollMessage not wired into message rendering pipeline. " +
          "Remove this skip after poll event handlers are added to the WebSocket router " +
          "and PollMessage is rendered inside MessageBubble for messages carrying poll data.",
      );

      await joinChat(page);

      const question = `VoteTest_${Math.random().toString(36).slice(2, 6)}`;
      const options = ["Red", "Green", "Blue"];

      await createPollViaWS(page, question, options);

      // Wait for the poll to render.
      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });

      // Click an option button (the second one: "Green").
      const optionBtn = page.locator("button").filter({ hasText: "Green" }).first();
      await expect(optionBtn).toBeVisible({ timeout: 5000 });
      await optionBtn.click();

      // After selecting, the Vote button ("投票") should appear.
      const voteBtn = page.getByRole("button", { name: "投票" });
      await expect(voteBtn).toBeVisible({ timeout: 3000 });
      await voteBtn.click();

      // After successful vote, a checkmark SVG should appear on the voted option.
      // The PollMessage renders a checkmark <svg> inside the voted option button.
      await expect(
        optionBtn.locator("svg").first(),
      ).toBeVisible({ timeout: 5000 });

      // The Vote button should disappear after voting.
      await expect(voteBtn).not.toBeVisible({ timeout: 3000 });
    });

    test("vote count updates after voting", async ({ page }) => {
      test.skip(
        true,
        "PollMessage not wired into message rendering pipeline. " +
          "Remove this skip after poll event handlers are added.",
      );

      await joinChat(page);

      const question = `CountTest_${Math.random().toString(36).slice(2, 6)}`;
      const options = ["Yes", "No"];

      await createPollViaWS(page, question, options);

      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });

      // Click "Yes", then vote.
      await page.locator("button").filter({ hasText: "Yes" }).first().click();
      await page.getByRole("button", { name: "投票" }).click();

      // The vote count text should show "1 票" (zh-CN) or "1 vote".
      // PollMessage renders: t("poll.votes", { count: totalVotes })
      await expect(page.getByText(/1\s*(票|vote)/)).toBeVisible({
        timeout: 5000,
      });
    });

    test("cannot vote twice in a single-choice poll", async ({ page }) => {
      test.skip(
        true,
        "PollMessage not wired into message rendering pipeline. " +
          "Remove this skip after poll event handlers are added.",
      );

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

      // After voting single-choice, the option buttons should be disabled
      // (they get disabled={hasVoted && !poll.multiple_choice}).
      // Try clicking another option — it should have no effect.
      const pizzaBtn = page
        .locator("button")
        .filter({ hasText: "Pizza" })
        .first();
      const isDisabled = await pizzaBtn.isDisabled();
      // Either the button is disabled, or clicking it does not re-enable
      // the Vote button (because hasVoted is true and poll is single-choice).
      expect(isDisabled || (await pizzaBtn.getAttribute("disabled")) !== null).toBe(true);

      // The Vote button should no longer be visible.
      await expect(
        page.getByRole("button", { name: "投票" }),
      ).not.toBeVisible({ timeout: 3000 });
    });

    test("multiple-choice poll allows selecting multiple options", async ({
      page,
    }) => {
      test.skip(
        true,
        "PollMessage not wired into message rendering pipeline. " +
          "Remove this skip after poll event handlers are added.",
      );

      await joinChat(page);

      const question = `MultiVote_${Math.random().toString(36).slice(2, 6)}`;
      const options = ["React", "Vue", "Svelte"];

      await createPollViaWS(page, question, options, { multipleChoice: true });

      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });

      // Select two options.
      const reactBtn = page
        .locator("button")
        .filter({ hasText: "React" })
        .first();
      const vueBtn = page.locator("button").filter({ hasText: "Vue" }).first();

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
      test.skip(
        true,
        "PollMessage not wired into message rendering pipeline. " +
          "The close button (poll.closed = '投票已关闭') is rendered inside PollMessage. " +
          "Remove this skip after poll event handlers and PollMessage integration are added.",
      );

      const creatorName = `creator_${Math.random().toString(36).slice(2, 6)}`;

      // Join as the poll creator (not a random guest).
      await page.goto("/");
      await page.getByPlaceholder("你的用户名...").fill(creatorName);
      await page.getByRole("button", { name: "游客加入" }).click();
      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 15000,
      });

      // Create poll as this user (via WS to have the creator match).
      const question = `CloseTest_${Math.random().toString(36).slice(2, 6)}`;
      const options = ["Keep", "Archive", "Delete"];
      const { pollId } = await createPollViaWS(page, question, options);

      // TODO: when poll creation UI exists, create the poll as `creatorName`
      // so the close button is visible. For now, the programmatic WS approach
      // creates the poll under a bot name, so isOwnPoll will be false.

      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });

      // The close button text = "投票已关闭" (zh-CN) or "Close Poll" (en).
      // It only renders when !isClosed && isOwnPoll (creator === username).
      const closeBtn = page.getByRole("button", { name: "投票已关闭" });
      await expect(closeBtn).toBeVisible({ timeout: 5000 });
      await closeBtn.click();

      // After closing, the "最终结果" badge should appear.
      await expect(page.getByText("最终结果")).toBeVisible({ timeout: 5000 });

      // The close button should disappear.
      await expect(closeBtn).not.toBeVisible({ timeout: 3000 });
    });

    test("closed poll shows final results", async ({ page }) => {
      test.skip(
        true,
        "PollMessage not wired into message rendering pipeline. " +
          "Remove this skip after poll event handlers are added.",
      );

      await joinChat(page);

      const question = `FinalResult_${Math.random().toString(36).slice(2, 6)}`;
      const options = ["Up", "Down", "Strange", "Charm"];

      const { pollId } = await createPollViaWS(page, question, options);
      await expect(page.getByText(question)).toBeVisible({ timeout: 10000 });

      // Vote for "Charm" to generate some data.
      await page.locator("button").filter({ hasText: "Charm" }).first().click();
      await page.getByRole("button", { name: "投票" }).click();
      await expect(page.getByText(/1\s*(票|vote)/)).toBeVisible({
        timeout: 5000,
      });

      // Close the poll via WS using the bot's identity.
      // (We don't store the bot name, so this is a simplified flow.)
      // In a real scenario, the poll creator would click "投票已关闭".
      await closePollViaWS(page, pollId, "");

      // After poll_closed broadcast, the PollMessage should show:
      // - "最终结果" badge (t("poll.finalResults"))
      // - Percentage bars on each option
      // - Options should be disabled
      await expect(page.getByText("最终结果")).toBeVisible({ timeout: 10000 });

      // Percentage text should be visible on the options.
      // The winning option shows 100%, others show 0% (or 2% minimum bar).
      await expect(page.getByText(/100%/)).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(/0%/)).toBeVisible({ timeout: 5000 });

      // All option buttons should be disabled in closed state.
      const optionButtons = page.locator("button").filter({ hasText: /Up|Down|Strange|Charm/ });
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

  test.describe("Group chat polls", () => {
    test("poll in group chat appears for group members", async ({ page }) => {
      test.skip(
        true,
        "Groups may not be accessible to guests. " +
          "Also PollMessage is not yet wired into the message pipeline. " +
          "Remove this skip after group access is confirmed and poll integration is complete.",
      );

      // This test requires a pre-existing group or group-creation capability.
      // Guests typically cannot create groups, so this test is gated on
      // either having group-creation UI for guests or using a pre-seeded group.
      //
      // When ready, the flow would be:
      // 1. Join as user with group access
      // 2. Navigate to the group chat
      // 3. Create a poll in the group
      // 4. Verify the poll appears
      // 5. Verify other group members can see and vote on it
    });
  });
});
