import { expect, test } from "@playwright/test";

const joinChat = async (page: import("@playwright/test").Page, username: string) => {
  await page.goto("/");
  await page.getByPlaceholder("你的用户名...").fill(username);
  await page.keyboard.press("Enter");
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
    await expect(page.getByText("请立即复制，密钥只显示一次")).toBeVisible();

    const webhookButton = webhookSection.locator("button[title*='/api/webhook/']").first();
    await expect(webhookButton).toBeVisible();
    const webhookURL = await webhookButton.getAttribute("title");
    expect(webhookURL).toContain("/api/webhook/");
    expect(webhookURL).toContain("secret=");

    const response = await page.request.post(new URL(webhookURL!, baseURL).toString(), {
      data: {
        content: ingressMessage,
        username: "ci-webhook",
      },
    });

    expect(response.status()).toBe(200);
    await expect(response).toBeOK();
    await expect(page.getByText(ingressMessage)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("ci-webhook")).toBeVisible();
  });
});
