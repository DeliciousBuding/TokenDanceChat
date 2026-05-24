import { expect, test } from "@playwright/test";

const setupPage = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("tokendance:lang", "zh-CN");
    localStorage.setItem("tdchat-theme", "light");
    localStorage.removeItem("tokendance:auth");
    localStorage.removeItem("tokendance:username");
  });
};

test.describe("Public preview smoke", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("unauthenticated preview loads public history and keeps guest join working", async ({ page }) => {
    const messagesResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/messages" && url.searchParams.get("limit") === "100";
    });

    await page.goto("/");

    const response = await messagesResponse;
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { messages?: Array<{ content: string }> };

    if (body.messages?.length) {
      await expect(page.getByRole("log", { name: "公共聊天" })).toContainText(
        body.messages[0].content,
      );
    } else {
      await expect(page.getByText("暂无消息")).toBeVisible();
    }
    await expect(page.getByRole("status", { name: "加载消息中..." })).toHaveCount(0);

    await page.getByRole("button", { name: "加入聊天" }).first().click();
    const guestInput = page.getByPlaceholder("你的用户名...");
    await expect(guestInput).toBeVisible();
    await guestInput.fill(`preview_${Math.random().toString(36).slice(2, 8)}`);
    const guestForm = page.locator("form").filter({ has: guestInput });
    await guestForm.getByRole("button", { name: "加入聊天" }).click();

    await expect(page.locator("textarea").first()).toBeVisible({ timeout: 15000 });
  });
});
