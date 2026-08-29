import { expect, test, type Page } from "@playwright/test";
import { waitForLightChatReady } from "./helpers";

const setupPage = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("tokendance:lang", "zh-CN");
    localStorage.setItem("tdchat-theme", "light");
    localStorage.removeItem("tokendance:auth");
    localStorage.removeItem("tokendance:username");
  });
};

test.describe("页面加载", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("首页自动进入轻量公共聊天室", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("TokenDanceChat");
    await expect(page.getByRole("heading", { name: "公共聊天" }).first()).toBeVisible();
    await expect(page.getByText("TokenDanceChat").first()).toBeVisible();
    await expect(page.getByText("TokenBot").first()).toBeVisible();
    await waitForLightChatReady(page);

    await expect(page.getByText(/好友|Friends/)).toHaveCount(0);
    await expect(page.getByText(/群组|Groups/)).toHaveCount(0);
    await expect(page.getByText(/私信|Direct Message|DM/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /语音通话|Voice Call/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /视频通话|Video Call/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /定时发送消息|Schedule Message/ })).toHaveCount(0);
  });

  test("英文切换后仍保持当前轻量聊天入口", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "更多" }).click();
    await page.getByText("English", { exact: true }).click();

    await expect(page.getByRole("button", { name: /Public Chat/ }).first()).toBeVisible();
    await expect(page.getByText("TokenBot").first()).toBeVisible();
    await waitForLightChatReady(page);
    await expect(page.getByRole("button", { name: /Join Chat|Join as Guest/ })).toHaveCount(0);
  });
});

test.describe("自动 guest 聊天（需要后端）", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("消息发送后立即出现在聊天区域并在刷新后保留", async ({ page }) => {
    await page.goto("/");
    const composer = await waitForLightChatReady(page);

    const uniqueMsg = `E2E_${Math.random().toString(36).slice(2, 8)}`;
    await composer.fill(uniqueMsg);
    await page.locator("[data-visual='composer-send']").click();

    await expect(page.getByText(uniqueMsg).first()).toBeVisible({ timeout: 10000 });
    await page.reload();
    await expect(page.getByText(uniqueMsg).first()).toBeVisible({ timeout: 10000 });
  });

  test("TokenBot 助手入口展示 composer 上下文并复用公共 composer", async ({ page }) => {
    await page.goto("/");
    await waitForLightChatReady(page);

    await page.locator("[data-visual='light-chat-sidebar']").getByRole("button", { name: /TokenBot/ }).click();

    await expect(page.locator("[data-visual='ai-chat-workbench']")).toHaveCount(0);
    await expect(page.locator("[data-visual='composer-ai-context']")).toContainText("TokenBot");
    await expect(page.locator("[data-visual='composer-textarea']")).toBeEnabled();
  });
});
