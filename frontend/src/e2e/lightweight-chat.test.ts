import { expect, test } from "@playwright/test";

test.describe("lightweight chat surface", () => {
  test("desktop keeps only public room and AI workspaces", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("TokenDanceChat")).toBeVisible();
    await expect(page.getByRole("button", { name: /Public Chat|公共聊天/ }).first()).toBeVisible();
    await expect(page.getByText("TokenBot").first()).toBeVisible();

    const text = `codex guest send ${Date.now()}`;
    const composer = page.getByRole("textbox");
    await expect(composer).toBeEnabled({ timeout: 15000 });
    await composer.fill(text);
    await page.locator("[data-visual='composer-send']").click();
    await expect(page.locator("[data-visual='composer-submit-state']")).toBeVisible({ timeout: 1000 });
    await expect(page.getByText(text)).toBeVisible({ timeout: 15000 });

    const aliasText = `codex legacy alias ${Date.now()} asks @webuibot for TokenBot`;
    await composer.fill(aliasText);
    await page.locator("[data-visual='composer-send']").click();
    await expect(page.getByText(/@TokenBot/).last()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/WebUIChat|WebUIBot|webuichat|webuibot/)).toHaveCount(0);

    await page.reload();
    await expect(page.getByText(text)).toBeVisible({ timeout: 15000 });

    await expect(page.getByText(/好友|Friends/)).toHaveCount(0);
    await expect(page.getByText(/群组|Groups/)).toHaveCount(0);
    await expect(page.getByText(/私信|Direct Message|DM/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /语音通话|Voice Call/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /视频通话|Video Call/ })).toHaveCount(0);

    const sidebar = page.locator("[data-visual='light-chat-sidebar']");

    await sidebar.getByRole("button", { name: /TokenBot/ }).click();
    await expect(page.locator("[data-visual='ai-chat-workbench']")).toHaveCount(0);
    await expect(page.locator("[data-visual='assistant-switch']")).toHaveCount(0);
    const composerContext = page.locator("[data-visual='composer-ai-context']");
    await expect(composerContext).toBeVisible();
    await expect(composerContext.getByText("TokenBot")).toBeVisible();
    await expect(page.getByText(/Knowledge|Tools|Prompts/)).toHaveCount(0);
    const tokenBotText = `tokenbot route ${Date.now()}`;
    await composer.fill(tokenBotText);
    await page.locator("[data-visual='composer-send']").click();
    await expect(page.getByText(tokenBotText).first()).toBeVisible({ timeout: 15000 });
    // Private 1:1: the message is sent as a direct message (to: TokenBot) and is
    // NOT prefixed with an @mention.
    await expect(page.getByText(/@TokenBot/)).toHaveCount(0);
  });

  test("mobile sidebar and composer stay compact", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByLabel(/Open sidebar|打开侧边栏/).click();
    await expect(page.locator("[data-visual='light-chat-sidebar']")).toBeVisible();
    await expect(page.getByText("TokenBot").first()).toBeVisible();

    await page.locator("[data-visual='light-chat-sidebar']").getByRole("button", { name: /TokenBot/ }).click();
    await expect(page.locator("[data-visual='ai-chat-workbench']")).toHaveCount(0);
    await expect(page.locator("[data-visual='composer-ai-context']")).toContainText("TokenBot");
    await expect(page.locator("[data-visual='composer-card']")).toBeVisible();
    await expect(page.getByRole("button", { name: /录制语音|Record voice/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /定时发送消息|Schedule Message/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "GIF" })).toHaveCount(0);
  });
});
