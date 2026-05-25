import { expect, test } from "@playwright/test";

const joinChat = async (page: import("@playwright/test").Page, username: string) => {
  await page.goto("/");
  await page.getByRole("button", { name: "加入聊天" }).first().click();
  const guestInput = page.getByPlaceholder("你的用户名...");
  await expect(guestInput).toBeVisible();
  await guestInput.fill(username);
  const guestForm = page.locator("form").filter({ has: guestInput });
  await guestForm.getByRole("button", { name: "加入聊天" }).click();
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 15000 });
};

const createGroup = async (page: import("@playwright/test").Page, groupName: string) => {
  await page.getByLabel("创建群组").click();
  await page.getByPlaceholder("群组名称...").fill(groupName);
  await page.getByRole("button", { name: /^创建$/ }).click();
  await page.getByRole("button", { name: new RegExp(groupName) }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await expect(page.getByRole("heading", { name: `群聊: ${groupName}` })).toBeVisible();
};

test.describe("Webhook ingress", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("tokendance:lang", "zh-CN");
      localStorage.setItem("tdchat-theme", "light");
      localStorage.removeItem("tokendance:username");
    });
  });

  test("group admin creates a webhook and an HTTP POST appears as a group message", async ({
    page,
    baseURL,
  }) => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const owner = `HookOwner_${suffix}`;
    const groupName = `Webhook群组_${suffix}`;
    const ingressMessage = `AgentHub webhook ingress ${suffix}`;

    await joinChat(page, owner);
    await createGroup(page, groupName);

    await page.getByRole("button", { name: "群组信息" }).last().click();
    const webhookSection = page.locator("[data-visual='group-info-webhooks']");
    await expect(webhookSection).toBeVisible();

    await webhookSection.getByRole("button", { name: /新建/ }).click();
    await expect(page.getByText("请立即复制 URL 和 Authorization header，密钥只显示一次")).toBeVisible();

    const webhookButton = webhookSection.locator("button[title*='/api/webhook/']").first();
    await expect(webhookButton).toBeVisible();
    const webhookURL = await webhookButton.getAttribute("title");
    expect(webhookURL).toContain("/api/webhook/");
    expect(webhookURL).not.toContain("secret=");

    const authButton = webhookSection.locator("button[title^='Authorization: Bearer ']").first();
    await expect(authButton).toBeVisible();
    const webhookAuthorization = await authButton.getAttribute("title");
    expect(webhookAuthorization).toMatch(/^Authorization: Bearer \S+/);
    const authorizationValue = webhookAuthorization!.replace(/^Authorization: /, "");

    const response = await page.request.post(new URL(webhookURL!, baseURL).toString(), {
      headers: {
        Authorization: authorizationValue,
      },
      data: {
        content: ingressMessage,
        username: "ci-webhook",
      },
    });

    expect(response.status()).toBe(200);
    await expect(response).toBeOK();
    const messageLog = page.getByRole("log").first();
    await expect(messageLog.getByText(ingressMessage, { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(messageLog.getByText(ingressMessage, { exact: true })).toHaveCount(1);
    await expect(messageLog.getByText("webhook", { exact: true })).toBeVisible();
  });
});
