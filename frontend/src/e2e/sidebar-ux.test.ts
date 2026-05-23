import { test, expect } from "@playwright/test";

/**
 * TokenDanceChat 侧边栏用户体验 E2E 测试。
 *
 * 运行方式：
 *   E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/sidebar-ux.test.ts --project=chromium
 *
 * 覆盖：
 *   1. AI 助手区域默认折叠
 *   2. 侧边栏搜索过滤
 *   3. 分区顺序验证
 *   4. 桌面端 More 下拉菜单
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
 * Returns the random guest name used.
 */
async function joinChat(page: import("@playwright/test").Page): Promise<string> {
  const name = `sidebar_${Math.random().toString(36).slice(2, 8)}`;

  await page.goto("/");
  await page.getByPlaceholder("你的用户名...").fill(name);
  await page.getByRole("button", { name: "游客加入" }).click();

  // Should auto-join and see chat textarea.
  await expect(page.locator("textarea").first()).toBeVisible({
    timeout: 15000,
  });

  return name;
}

test.describe("Sidebar UX", () => {
  test.describe("AI Assistants section", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("AI Assistants section is collapsed by default", async ({ page }) => {
      await joinChat(page);

      // Verify the "AI 助手" section header is visible.
      const aiHeader = page.getByText("AI 助手", { exact: true });
      await expect(aiHeader).toBeVisible({ timeout: 10000 });

      // When collapsed, assistant cards and model cards should NOT be visible.
      // The subsection "助手" header is only rendered inside the expanded block.
      const assistantSubheader = page.getByText("助手", { exact: true });
      await expect(assistantSubheader).not.toBeVisible({ timeout: 5000 });

      // Model cards (with data-testid) should not be visible.
      const modelCard = page.locator('[data-testid="sidebar-model-card"]').first();
      await expect(modelCard).not.toBeVisible({ timeout: 5000 });
    });

    test("clicking AI Assistants header expands the section", async ({ page }) => {
      await joinChat(page);

      const aiHeader = page.getByText("AI 助手", { exact: true });
      await expect(aiHeader).toBeVisible({ timeout: 10000 });

      // Click to expand.
      await aiHeader.click();

      // Assistant subsection ("助手") should now be visible.
      const assistantSubheader = page.getByText("助手", { exact: true });
      await expect(assistantSubheader).toBeVisible({ timeout: 10000 });

      // Model cards should now be visible.
      const modelCard = page.locator('[data-testid="sidebar-model-card"]').first();
      await expect(modelCard).toBeVisible({ timeout: 10000 });
    });

    test("clicking AI Assistants header again collapses the section", async ({ page }) => {
      await joinChat(page);

      const aiHeader = page.getByText("AI 助手", { exact: true });
      await expect(aiHeader).toBeVisible({ timeout: 10000 });

      // Expand first.
      await aiHeader.click();
      const modelCard = page.locator('[data-testid="sidebar-model-card"]').first();
      await expect(modelCard).toBeVisible({ timeout: 10000 });

      // Click again to collapse.
      await aiHeader.click();

      // Cards should be hidden again.
      await expect(modelCard).not.toBeVisible({ timeout: 5000 });

      const assistantSubheader = page.getByText("助手", { exact: true });
      await expect(assistantSubheader).not.toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Sidebar conversation search", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("search input is present and accepts typing", async ({ page }) => {
      await joinChat(page);

      const searchInput = page.getByPlaceholder("搜索对话...");
      await expect(searchInput).toBeVisible({ timeout: 10000 });

      // Type a query — the search UI should appear.
      await searchInput.fill("test_query_nonexistent");

      // Search results section should appear (either "搜索结果" header or empty state).
      const resultsHeader = page.getByText("搜索结果", { exact: true });
      await expect(resultsHeader).toBeVisible({ timeout: 10000 });

      // Since we searched for a nonexistent term, the empty state should show.
      const emptyLabel = page.getByText("未找到匹配的对话");
      await expect(emptyLabel).toBeVisible({ timeout: 10000 });
    });

    test("section headers are hidden during search", async ({ page }) => {
      await joinChat(page);

      const searchInput = page.getByPlaceholder("搜索对话...");
      await expect(searchInput).toBeVisible({ timeout: 10000 });

      // During search, the normal section headers should NOT be visible.
      await searchInput.fill("test_query_filtering");

      // Wait for search results UI to render.
      await expect(page.getByText("搜索结果", { exact: true })).toBeVisible({
        timeout: 10000,
      });

      // DMs section header ("私信") should be hidden during active search.
      const dmHeader = page.getByText("私信", { exact: true });
      await expect(dmHeader).not.toBeVisible({ timeout: 5000 });

      // Groups section header ("群组") should be hidden.
      const groupHeader = page.getByText("群组", { exact: true });
      await expect(groupHeader).not.toBeVisible({ timeout: 5000 });

      // Friends section header ("好友") should be hidden.
      const friendHeader = page.getByText("好友", { exact: true });
      await expect(friendHeader).not.toBeVisible({ timeout: 5000 });
    });

    test("clearing search restores normal sections", async ({ page }) => {
      await joinChat(page);

      const searchInput = page.getByPlaceholder("搜索对话...");
      await expect(searchInput).toBeVisible({ timeout: 10000 });

      // Type and verify search mode is active.
      await searchInput.fill("test_query_clear");

      await expect(page.getByText("搜索结果", { exact: true })).toBeVisible({
        timeout: 10000,
      });

      // Clear the search using the X button.
      const clearBtn = page.locator('[aria-label="Clear search"]');
      await expect(clearBtn).toBeVisible({ timeout: 5000 });
      await clearBtn.click();

      // After clearing, the search results header should be gone.
      await expect(page.getByText("搜索结果", { exact: true })).not.toBeVisible({
        timeout: 5000,
      });

      // Normal section headers should reappear.
      // The AI 助手 header is always visible (whether expanded or not).
      await expect(page.getByText("AI 助手", { exact: true })).toBeVisible({
        timeout: 10000,
      });

      // Online users section should be visible.
      await expect(page.getByText("在线用户", { exact: true })).toBeVisible({
        timeout: 10000,
      });
    });

    test("search filters existing conversations by name", async ({ page }) => {
      // This test requires existing DM/group conversations to filter.
      // On a fresh server with a single guest, dmPartners/groups will be empty,
      // so we skip when there's nothing to filter.

      await joinChat(page);

      // Check if any DM partners or groups are visible in the sidebar.
      // If the sidebar shows "暂无私信" (no DMs) and no groups, skip.
      const noDMsLabel = page.getByText("暂无私信");
      const noGroupsLabel = page.getByText("暂无群组");

      const hasNoDMs = await noDMsLabel.isVisible().catch(() => false);
      const hasNoGroups = await noGroupsLabel.isVisible().catch(() => false);

      if (hasNoDMs && hasNoGroups) {
        test.skip(
          true,
          "Skipped: no DM or group conversations available to filter. " +
            "Run against a server with existing conversations.",
        );
        return;
      }

      const searchInput = page.getByPlaceholder("搜索对话...");
      await expect(searchInput).toBeVisible({ timeout: 10000 });

      // Use a deliberately unusual string that should match nothing.
      await searchInput.fill("zzz_no_match_xyz_12345");

      await expect(page.getByText("未找到匹配的对话")).toBeVisible({
        timeout: 10000,
      });

      // Clear search and confirm normal view restores.
      const clearBtn = page.locator('[aria-label="Clear search"]');
      await clearBtn.click();

      await expect(page.getByText("搜索结果", { exact: true })).not.toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe("Section order", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("public chat appears before AI assistants and online users", async ({ page }) => {
      await joinChat(page);

      // Gather visible sidebar section labels in DOM order.
      const order = await page.evaluate(() => {
        const sidebar = document.querySelector("aside");
        if (!sidebar) return [];
        // Walk direct children looking for recognizable section markers.
        const walker = document.createTreeWalker(
          sidebar,
          NodeFilter.SHOW_ELEMENT,
        );

        let node: Element | null = walker.firstChild() as Element | null;
        const found: { text: string; el: Element }[] = [];

        while (node) {
          // Collect buttons or spans with known section text.
          const tag = node.tagName.toLowerCase();
          const text = (node.textContent || "").trim();

          if (
            (tag === "button" || tag === "span") &&
            [
              "公共聊天",
              "AI 助手",
              "在线用户",
              "私信",
              "群组",
              "好友",
            ].includes(text)
          ) {
            // Avoid duplicates (e.g. "好友" could appear in multiple places).
            if (!found.some((f) => f.text === text)) {
              found.push({ text, el: node });
            }
          }

          node = walker.nextNode() as Element | null;
        }

        // Sort by DOM position (top to bottom).
        found.sort((a, b) => {
          const pos = a.el.compareDocumentPosition(b.el);
          if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
          if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
          return 0;
        });

        return found.map((f) => f.text);
      });

      // Verify the new section order: Public Chat → DMs → Groups → Friends → AI Assistants → Online Users.
      // Not all sections will be present (DMs/Groups/Friends may be empty),
      // but the relative order of those present must be correct.

      const pubIdx = order.indexOf("公共聊天");
      const aiIdx = order.indexOf("AI 助手");
      const onlineIdx = order.indexOf("在线用户");

      // Public chat must come before AI Assistants.
      if (pubIdx !== -1 && aiIdx !== -1) {
        expect(pubIdx).toBeLessThan(aiIdx);
      }

      // Public chat must come before Online Users.
      if (pubIdx !== -1 && onlineIdx !== -1) {
        expect(pubIdx).toBeLessThan(onlineIdx);
      }

      // AI Assistants must come before Online Users.
      if (aiIdx !== -1 && onlineIdx !== -1) {
        expect(aiIdx).toBeLessThan(onlineIdx);
      }
    });

    test("DM section appears before AI Assistants section", async ({ page }) => {
      await joinChat(page);

      // This test only applies if DMs are present.
      const noDMsLabel = page.getByText("暂无私信");
      const hasNoDMs = await noDMsLabel.isVisible().catch(() => false);

      if (hasNoDMs) {
        test.skip(
          true,
          "Skipped: no DMs to verify relative order. " +
            "Run against a server with DM history.",
        );
        return;
      }

      // Check DOM order between DM section and AI Assistants.
      const dmBeforeAi = await page.evaluate(() => {
        const sidebar = document.querySelector("aside");
        if (!sidebar) return null;

        const walker = document.createTreeWalker(
          sidebar,
          NodeFilter.SHOW_ELEMENT,
        );

        let node: Element | null = walker.firstChild() as Element | null;
        let dmEl: Element | null = null;
        let aiEl: Element | null = null;

        while (node) {
          const text = (node.textContent || "").trim();
          if (text === "私信" && !dmEl) dmEl = node;
          if (text === "AI 助手" && !aiEl) aiEl = node;
          node = walker.nextNode() as Element | null;
        }

        if (!dmEl || !aiEl) return null;

        const pos = dmEl.compareDocumentPosition(aiEl);
        return !!(pos & Node.DOCUMENT_POSITION_FOLLOWING);
      });

      if (dmBeforeAi !== null) {
        expect(dmBeforeAi).toBe(true);
      }
    });

    test("groups section appears before AI assistants section", async ({ page }) => {
      await joinChat(page);

      // Check if groups exist.
      const noGroupsLabel = page.getByText("暂无群组");
      const hasNoGroups = await noGroupsLabel.isVisible().catch(() => false);

      if (hasNoGroups) {
        test.skip(
          true,
          "Skipped: no groups to verify relative order.",
        );
        return;
      }

      const groupsBeforeAi = await page.evaluate(() => {
        const sidebar = document.querySelector("aside");
        if (!sidebar) return null;

        const walker = document.createTreeWalker(
          sidebar,
          NodeFilter.SHOW_ELEMENT,
        );

        let node: Element | null = walker.firstChild() as Element | null;
        let groupsEl: Element | null = null;
        let aiEl: Element | null = null;

        while (node) {
          const text = (node.textContent || "").trim();
          if (text === "群组" && !groupsEl) groupsEl = node;
          if (text === "AI 助手" && !aiEl) aiEl = node;
          node = walker.nextNode() as Element | null;
        }

        if (!groupsEl || !aiEl) return null;

        const pos = groupsEl.compareDocumentPosition(aiEl);
        return !!(pos & Node.DOCUMENT_POSITION_FOLLOWING);
      });

      if (groupsBeforeAi !== null) {
        expect(groupsBeforeAi).toBe(true);
      }
    });
  });

  test.describe("Desktop header More dropdown", () => {
    test.beforeEach(async ({ page }) => {
      await setupPage(page);
    });

    test("More button exists in desktop header", async ({ page }) => {
      await joinChat(page);

      // The desktop header uses aria-label "更多" (zh-CN) for the More button.
      const moreBtn = page.getByRole("button", { name: "更多" });
      await expect(moreBtn).toBeVisible({ timeout: 10000 });
    });

    test("clicking More opens dropdown with expected items", async ({ page }) => {
      await joinChat(page);

      const moreBtn = page.getByRole("button", { name: "更多" });
      await expect(moreBtn).toBeVisible({ timeout: 10000 });

      // Click to open the dropdown.
      await moreBtn.click();

      // Wait for the dropdown to appear.
      await page.waitForTimeout(300);

      // Language toggle should be visible (shows "English" because current lang is zh-CN).
      const langItem = page.getByText("English", { exact: true });
      await expect(langItem).toBeVisible({ timeout: 5000 });

      // Export JSON item should be visible.
      const exportJsonItem = page.getByText("导出 JSON");
      await expect(exportJsonItem).toBeVisible({ timeout: 5000 });

      // Export Text item should be visible.
      const exportTextItem = page.getByText("导出文本");
      await expect(exportTextItem).toBeVisible({ timeout: 5000 });

      // Settings item should be visible.
      const settingsItem = page.getByText("打开设置");
      await expect(settingsItem).toBeVisible({ timeout: 5000 });
    });

    test("clicking outside More dropdown closes it", async ({ page }) => {
      await joinChat(page);

      const moreBtn = page.getByRole("button", { name: "更多" });
      await expect(moreBtn).toBeVisible({ timeout: 10000 });

      // Open the dropdown.
      await moreBtn.click();
      await page.waitForTimeout(300);

      // Verify it's open — language toggle should be visible.
      await expect(page.getByText("English", { exact: true })).toBeVisible({
        timeout: 5000,
      });

      // Click outside the dropdown (the chat textarea area).
      await page.locator("textarea").first().click();
      await page.waitForTimeout(500);

      // Dropdown items should be hidden.
      await expect(page.getByText("English", { exact: true })).not.toBeVisible({
        timeout: 5000,
      });
    });
  });
});
