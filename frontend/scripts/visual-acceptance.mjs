#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const baseURL = process.env.VISUAL_BASE_URL || process.env.E2E_BASE_URL || "http://127.0.0.1:8080";
const outputDir =
  process.env.VISUAL_OUTPUT_DIR ||
  path.join(os.tmpdir(), `tdchat-visual-${new Date().toISOString().replace(/[:.]/g, "-")}`);

const localURL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/i.test(baseURL);
if (!localURL && process.env.VISUAL_ALLOW_NONLOCAL !== "1") {
  console.error(
    `Refusing to seed visual test messages against non-local URL: ${baseURL}\n` +
      "Set VISUAL_ALLOW_NONLOCAL=1 only for an intentional review target.",
  );
  process.exit(2);
}

const scenarios = [
  { name: "desktop-light", viewport: { width: 1440, height: 900 }, theme: "light" },
  { name: "desktop-light-group-info", viewport: { width: 1440, height: 900 }, theme: "light", groupInfoOpen: true },
  { name: "desktop-light-settings", viewport: { width: 1440, height: 900 }, theme: "light", settingsOpen: true },
  { name: "desktop-light-auth-login", viewport: { width: 1440, height: 900 }, theme: "light", authOpen: true, authTab: "login" },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, theme: "dark" },
  { name: "tablet-light", viewport: { width: 768, height: 1024 }, theme: "light" },
  { name: "mobile-light", viewport: { width: 390, height: 844 }, theme: "light" },
  { name: "mobile-light-sidebar-open", viewport: { width: 390, height: 844 }, theme: "light", sidebarOpen: true },
  { name: "mobile-light-settings", viewport: { width: 390, height: 844 }, theme: "light", settingsOpen: true },
  { name: "mobile-light-auth-register-error", viewport: { width: 390, height: 844 }, theme: "light", authOpen: true, authTab: "register", authError: true },
  { name: "mobile-dark", viewport: { width: 390, height: 844 }, theme: "dark" },
  { name: "mobile-light-format", viewport: { width: 390, height: 844 }, theme: "light", formatOpen: true },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runId() {
  return Math.random().toString(36).slice(2, 8);
}

async function newScenarioPage(browser, scenario, label) {
  const errors = [];
  const context = await browser.newContext({
    viewport: scenario.viewport,
    colorScheme: scenario.theme,
    deviceScaleFactor: scenario.viewport.width < 768 ? 2 : 1,
    isMobile: scenario.viewport.width < 768,
    hasTouch: scenario.viewport.width < 768,
  });
  await context.addInitScript(
    ({ theme }) => {
      localStorage.setItem("tdchat-theme", theme);
      localStorage.setItem("tokendance:lang", "zh-CN");
      localStorage.removeItem("tokendance:auth");
      localStorage.removeItem("tokendance:username");
    },
    { theme: scenario.theme },
  );

  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "加入聊天" }).first().click();
  const guestInput = page.getByPlaceholder("你的用户名...");
  await guestInput.fill(label);
  const guestForm = page.locator("form").filter({ has: guestInput });
  await guestForm.getByRole("button", { name: "加入聊天" }).click();
  await page.waitForFunction(
    (expected) => localStorage.getItem("tokendance:username") === expected,
    label,
    { timeout: 15000 },
  );
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 15000 });
  return { context, page, errors };
}

async function newPublicScenarioPage(browser, scenario) {
  const errors = [];
  const context = await browser.newContext({
    viewport: scenario.viewport,
    colorScheme: scenario.theme,
    deviceScaleFactor: scenario.viewport.width < 768 ? 2 : 1,
    isMobile: scenario.viewport.width < 768,
    hasTouch: scenario.viewport.width < 768,
  });
  await context.addInitScript(
    ({ theme }) => {
      localStorage.setItem("tdchat-theme", theme);
      localStorage.setItem("tokendance:lang", "zh-CN");
      localStorage.removeItem("tokendance:auth");
      localStorage.removeItem("tokendance:username");
    },
    { theme: scenario.theme },
  );

  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "加入聊天" }).first().waitFor({
    state: "visible",
    timeout: 15000,
  });
  return { context, page, errors };
}

async function sendMessage(page, text) {
  const textarea = page.locator("textarea").first();
  await textarea.fill(text);
  await page.keyboard.press("Enter");
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 10000 });
  await wait(600);
}

async function visibleSeedMessageCount(page) {
  return await page.evaluate(() =>
    Array.from(document.querySelectorAll("[id^='msg-'] .markdown-body")).filter((el) =>
      /AgentHub 验证项目|PicoClaw 旁路确认|这轮重点验收|收到。截图应检查/.test(el.textContent || ""),
    ).length,
  );
}

async function seedChat(browser) {
  const id = runId();
  const labels = {
    actorA: `视觉验收_${id}`,
    actorB: `AgentHub_${id}`,
  };
  const actorA = await newScenarioPage(browser, scenarios[0], labels.actorA);
  const actorB = await newScenarioPage(browser, scenarios[0], labels.actorB);

  await sendMessage(actorA.page, "AgentHub 验证项目：Hub/IM 实时事件、SQLite 状态和 React 客户端已联通。");
  await sendMessage(actorB.page, "PicoClaw 旁路确认：群聊、DM、附件、WebHook 和媒体存储都要沉淀为 AgentHub 经验。");
  await sendMessage(actorA.page, "这轮重点验收移动端输入区、触控尺寸、信息密度和 light/dark 两套视觉稳定性。");
  await sendMessage(actorB.page, "收到。截图应检查 44px 触控、横向滚动、输入框宽度、按钮层级和空白密度。");

  const seededCount = await visibleSeedMessageCount(actorA.page);
  if (seededCount < 4) {
    throw new Error(`visual seed expected 4 messages, saw ${seededCount}`);
  }

  await actorA.context.close();
  await actorB.context.close();
  return labels;
}

async function openGroupInfoPanel(page) {
  const groupName = `视觉群组_${runId()}`;
  await page.getByLabel("创建群组").click();
  await page.getByPlaceholder("群组名称...").fill(groupName);
  await page.getByRole("button", { name: /^创建$/ }).click();
  await page.getByRole("button", { name: new RegExp(groupName) }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.getByRole("button", { name: "群组信息" }).last().click();
  await page.locator("[data-visual='group-info-panel']").waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.locator("[data-visual='group-info-panel'] h2").filter({ hasText: groupName }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.locator("[data-visual='group-info-webhooks']").waitFor({
    state: "visible",
    timeout: 10000,
  });
  // Create a webhook so the rotation button and audit row become visible.
  const createBtn = page.locator("[data-visual='group-info-webhook-create']");
  if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createBtn.click();
    await page.locator("[data-visual='group-info-webhook-created-secret']").waitFor({
      state: "visible",
      timeout: 10000,
    });
  }
  await page.waitForTimeout(500);
}

async function openMobileSidebar(page) {
  await page.getByRole("button", { name: /^(打开侧边栏|Open sidebar)$/ }).click();
  await page.waitForFunction(() => {
    const sidebar = document.querySelector("aside");
    if (!sidebar) return false;
    const rect = sidebar.getBoundingClientRect();
    return rect.left >= -1 && rect.right > 300;
  });
  await page.waitForTimeout(350);
}

async function openSettingsModal(page, scenario) {
  if (scenario.viewport.width < 768) {
    await openMobileSidebar(page);
  }
  await page.getByLabel(/^(打开设置|Open Settings)$/).first().click();
  await page.locator("[data-visual='settings-modal']").waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.waitForTimeout(350);
}

async function openAuthModal(page, scenario) {
  await page.getByRole("button", { name: "加入聊天" }).first().click();
  const modal = page.locator("[data-visual='auth-modal']");
  await modal.waitFor({
    state: "visible",
    timeout: 10000,
  });
  if (scenario.authTab === "login") {
    await modal.locator("[data-visual='auth-modal-tab']").filter({ hasText: /^登录$/ }).click();
  } else if (scenario.authTab === "register") {
    await modal.locator("[data-visual='auth-modal-tab']").filter({ hasText: "注册账号" }).click();
  }
  if (scenario.authError) {
    await modal.getByLabel("用户名").fill(`visual_${runId()}`);
    await modal.getByLabel("密码", { exact: true }).fill("secret1");
    await modal.getByLabel("确认密码").fill("secret2");
    await modal.getByRole("textbox", { name: "邀请码" }).fill("VISUAL");
    await modal.locator("[data-visual='auth-modal-primary']").click();
    await modal.getByRole("alert").waitFor({ state: "visible", timeout: 5000 });
  }
  await page.waitForTimeout(350);
}

async function collectMetrics(page, scenario, errors) {
  return await page.evaluate(
    ({ scenarioName, viewport, consoleErrors }) => {
      function isVisible(el) {
        const rect = el.getBoundingClientRect();
        for (let node = el; node instanceof Element; node = node.parentElement) {
          const style = window.getComputedStyle(node);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity) === 0
          ) {
            return false;
          }
        }
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.top < window.innerHeight
        );
      }

      function labelFor(el) {
        return (
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          el.textContent?.replace(/\s+/g, " ").trim().slice(0, 48) ||
          el.tagName.toLowerCase()
        );
      }

      const controls = Array.from(
        document.querySelectorAll("button, [role='button'], textarea, input:not([type='hidden']), select"),
      ).filter(isVisible);
      const smallControls = controls
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            label: labelFor(el),
            tag: el.tagName.toLowerCase(),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
          };
        })
        .filter((item) => item.width < 44 || item.height < 44);

      const textarea = document.querySelector("textarea");
      const textareaRect = textarea?.getBoundingClientRect();
      const composer = textarea?.closest("[data-testid='chat-input']") || textarea?.closest(".relative.border-t");
      const composerRect = composer?.getBoundingClientRect();
      const composerBottomRow = composer?.querySelector("[data-visual='composer-bottom-row']");
      const composerBottomRowRect = composerBottomRow && isVisible(composerBottomRow)
        ? composerBottomRow.getBoundingClientRect()
        : null;
      const composerToolbar = composer?.querySelector("[data-visual='composer-toolbar']");
      const composerToolbarRect = composerToolbar && isVisible(composerToolbar)
        ? composerToolbar.getBoundingClientRect()
        : null;
      const composerTools = composer
        ? Array.from(composer.querySelectorAll("[data-visual='composer-tool']"))
        : [];
      const composerVisibleTools = composerTools.filter(isVisible);
      const composerControls = composer && isVisible(composer)
        ? Array.from(composer.querySelectorAll("button, [role='button'], a[href], select")).filter(isVisible)
        : [];
      const composerSmallControls = composerControls
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            label: labelFor(el),
            tag: el.tagName.toLowerCase(),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
          };
        })
        .filter((item) => item.width < 44 || item.height < 44);
      const log = document.querySelector("[role='log']");
      const logRect = log?.getBoundingClientRect();
      const mobileTitle = document.querySelector("[data-visual='mobile-chat-title']");
      const mobileTitleRect = mobileTitle?.getBoundingClientRect();
      const desktopTitle = document.querySelector("[data-visual='desktop-chat-title']");
      const desktopTitleRect = desktopTitle && isVisible(desktopTitle)
        ? desktopTitle.getBoundingClientRect()
        : null;
      const desktopTitleStyle = desktopTitle ? window.getComputedStyle(desktopTitle) : null;
      const desktopTitleFontSize = desktopTitleStyle
        ? Number.parseFloat(desktopTitleStyle.fontSize)
        : 0;
      const rawDesktopTitleLineHeight = desktopTitleStyle
        ? Number.parseFloat(desktopTitleStyle.lineHeight)
        : 0;
      const desktopTitleLineHeight = Number.isFinite(rawDesktopTitleLineHeight)
        ? rawDesktopTitleLineHeight
        : desktopTitleFontSize * 1.25;
      const sidebar = document.querySelector("aside");
      const sidebarRect = sidebar && isVisible(sidebar) ? sidebar.getBoundingClientRect() : null;
      const sidebarModelCards = Array.from(document.querySelectorAll("[data-visual='sidebar-model-card']")).filter(isVisible);
      const sidebarOnline = document.querySelector("[data-visual='sidebar-online-users']");
      const sidebarOnlineRect = sidebarOnline && isVisible(sidebarOnline)
        ? sidebarOnline.getBoundingClientRect()
        : null;
      const sidebarControls = sidebar && isVisible(sidebar)
        ? Array.from(sidebar.querySelectorAll("button, [role='button'], textarea, input:not([type='hidden']), select")).filter(isVisible)
        : [];
      const sidebarSmallControls = sidebarControls
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            label: labelFor(el),
            tag: el.tagName.toLowerCase(),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
          };
        })
        .filter((item) => item.width < 44 || item.height < 44);
      const groupInfoPanel = document.querySelector("[data-visual='group-info-panel']");
      const groupInfoPanelRect = groupInfoPanel && isVisible(groupInfoPanel)
        ? groupInfoPanel.getBoundingClientRect()
        : null;
      const groupInfoHeading = groupInfoPanel?.querySelector("h2");
      const groupInfoWebhooks = groupInfoPanel?.querySelector("[data-visual='group-info-webhooks']");
      const groupInfoMembers = groupInfoPanel
        ? Array.from(groupInfoPanel.querySelectorAll("button[aria-label], button, input")).filter(isVisible)
        : [];
      const groupInfoSmallControls = groupInfoMembers
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            label: labelFor(el),
            tag: el.tagName.toLowerCase(),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
          };
        })
        .filter((item) => item.width < 44 || item.height < 44);
      const groupInfoMemberRows = groupInfoPanel
        ? Array.from(groupInfoPanel.querySelectorAll("[data-visual='group-info-member']")).filter(isVisible)
        : [];
      const groupInfoWebhookRows = groupInfoPanel
        ? Array.from(groupInfoPanel.querySelectorAll("[data-visual='group-info-webhook-row']")).filter(isVisible)
        : [];
      const groupInfoWebhookCreatedSecret = groupInfoPanel
        ? Boolean(groupInfoPanel.querySelector("[data-visual='group-info-webhook-created-secret']"))
        : false;
      const groupInfoWebhookRotate = groupInfoPanel
        ? Array.from(groupInfoPanel.querySelectorAll("[data-visual='group-info-webhook-rotate']")).filter(isVisible)
        : [];
      const groupInfoWebhookAudit = groupInfoPanel
        ? Boolean(groupInfoPanel.querySelector("[data-visual='group-info-webhook-audit']"))
        : false;
      const groupInfoWebhookAuditLogs = groupInfoPanel
        ? Array.from(groupInfoPanel.querySelectorAll("[data-visual='group-info-webhook-audit-log']")).filter(isVisible)
        : [];
      const groupEmptyState = document.querySelector("[data-visual='group-empty-state']");
      const groupEmptyStateRect = groupEmptyState && isVisible(groupEmptyState)
        ? groupEmptyState.getBoundingClientRect()
        : null;
      const settingsModal = document.querySelector("[data-visual='settings-modal']");
      const settingsModalRect = settingsModal && isVisible(settingsModal)
        ? settingsModal.getBoundingClientRect()
        : null;
      const settingsContent = settingsModal?.querySelector("[data-visual='settings-content']");
      const settingsTabs = settingsModal
        ? Array.from(settingsModal.querySelectorAll("[data-visual='settings-tab']")).filter(isVisible)
        : [];
      const settingsTabLabels = settingsTabs.map((el) => {
        const label = el.querySelector("span") || el;
        const rect = label.getBoundingClientRect();
        return {
          text: label.textContent?.replace(/\s+/g, " ").trim() || "",
          width: Math.round(rect.width),
          scrollWidth: label.scrollWidth,
          clientWidth: label.clientWidth,
          clipped: label.scrollWidth > label.clientWidth + 1,
        };
      });
      const settingsControls = settingsModal && isVisible(settingsModal)
        ? Array.from(settingsModal.querySelectorAll("button, [role='button'], textarea, input:not([type='hidden']), select")).filter(isVisible)
        : [];
      const settingsSmallControls = settingsControls
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            label: labelFor(el),
            tag: el.tagName.toLowerCase(),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
          };
        })
        .filter((item) => item.width < 44 || item.height < 44);
      const authModal = document.querySelector("[data-visual='auth-modal']");
      const authModalRect = authModal && isVisible(authModal)
        ? authModal.getBoundingClientRect()
        : null;
      const authContent = authModal?.querySelector("[data-visual='auth-modal-content']");
      const authTabs = authModal
        ? Array.from(authModal.querySelectorAll("[data-visual='auth-modal-tab']")).filter(isVisible)
        : [];
      const authTabLabels = authTabs.map((el) => ({
        text: el.textContent?.replace(/\s+/g, " ").trim() || "",
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        clipped: el.scrollWidth > el.clientWidth + 1,
      }));
      const authControls = authModal && isVisible(authModal)
        ? Array.from(authModal.querySelectorAll("button, [role='button'], a[href], textarea, input:not([type='hidden']), select")).filter(isVisible)
        : [];
      const authSmallControls = authControls
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            label: labelFor(el),
            tag: el.tagName.toLowerCase(),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
          };
        })
        .filter((item) => item.width < 44 || item.height < 44);
      const authError = authModal?.querySelector("[role='alert']");
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const visibleMessages = Array.from(document.querySelectorAll("[id^='msg-']")).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < viewportHeight;
      }).length;
      const visibleMarkdownBodies = Array.from(document.querySelectorAll("[id^='msg-'] .markdown-body")).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < viewportHeight;
      });
      const messageFontSizes = visibleMarkdownBodies.map((el) =>
        Number.parseFloat(window.getComputedStyle(el).fontSize),
      ).filter(Number.isFinite);
      const visibleMessageBubbles = Array.from(document.querySelectorAll("[data-visual='message-bubble']")).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth;
      });
      const visibleBubbleSurfaces = visibleMessageBubbles
        .map((el) => el.querySelector("[data-visual='message-bubble-surface']"))
        .filter(Boolean);
      const bubbleSurfaceRects = visibleBubbleSurfaces.map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      });
      const bubbleMenuButtons = visibleMessageBubbles
        .map((el) => el.querySelector("[data-visual='message-bubble-menu']"))
        .filter(Boolean)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            label: labelFor(el),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
          };
        })
        .filter((item) => item.width > 0 && item.height > 0);
      const bubbleSmallMenus = bubbleMenuButtons.filter((item) => item.width < 44 || item.height < 44);
      const maxBubbleSurfaceWidth = bubbleSurfaceRects.length
        ? Math.max(...bubbleSurfaceRects.map((item) => item.width))
        : 0;

      const horizontalOverflow =
        document.documentElement.scrollWidth > viewportWidth + 1 ||
        document.body.scrollWidth > viewportWidth + 1;

      return {
        scenarioName,
        viewport,
        url: location.href,
        documentWidth: document.documentElement.scrollWidth,
        horizontalOverflow,
        controls: controls.length,
        smallControls,
        textarea: textareaRect
          ? {
              width: Math.round(textareaRect.width),
              height: Math.round(textareaRect.height),
              fontSize: window.getComputedStyle(textarea).fontSize,
            }
          : null,
        composer: composerRect
          ? {
              height: Math.round(composerRect.height),
              viewportRatio: Number((composerRect.height / viewportHeight).toFixed(3)),
              toolbarVisible: Boolean(composerToolbarRect),
              toolCount: composerTools.length,
              visibleTools: composerVisibleTools.length,
              toolbarScrollable: composerToolbar
                ? composerToolbar.scrollWidth > composerToolbar.clientWidth + 1
                : false,
              toolbarWidth: composerToolbarRect ? Math.round(composerToolbarRect.width) : 0,
              bottomRowVisible: Boolean(composerBottomRowRect),
              bottomRowWidth: composerBottomRowRect ? Math.round(composerBottomRowRect.width) : 0,
              smallControls: composerSmallControls,
            }
          : null,
        mobileTitle: mobileTitleRect
          ? {
              width: Math.round(mobileTitleRect.width),
              scrollWidth: mobileTitle.scrollWidth,
              clientWidth: mobileTitle.clientWidth,
              fontSize: window.getComputedStyle(mobileTitle).fontSize,
              clipped: mobileTitle.scrollWidth > mobileTitle.clientWidth + 1,
              text: mobileTitle.textContent?.trim() || "",
            }
          : null,
        desktopTitle: desktopTitleRect
          ? {
              width: Math.round(desktopTitleRect.width),
              height: Math.round(desktopTitleRect.height),
              scrollWidth: desktopTitle.scrollWidth,
              clientWidth: desktopTitle.clientWidth,
              lineHeight: Number(desktopTitleLineHeight.toFixed(2)),
              multiline: desktopTitleRect.height > desktopTitleLineHeight * 1.35,
              text: desktopTitle.textContent?.trim() || "",
            }
          : null,
        messageText: messageFontSizes.length
          ? {
              minFontSize: Math.min(...messageFontSizes),
              maxFontSize: Math.max(...messageFontSizes),
            }
          : null,
        messageBubbles: {
          total: visibleMessageBubbles.length,
          own: visibleMessageBubbles.filter((el) => el.getAttribute("data-message-own") === "true").length,
          other: visibleMessageBubbles.filter((el) => el.getAttribute("data-message-own") !== "true").length,
          surfaces: visibleBubbleSurfaces.length,
          maxSurfaceWidth: maxBubbleSurfaceWidth,
          maxSurfaceRatio: logRect && maxBubbleSurfaceWidth
            ? Number((maxBubbleSurfaceWidth / logRect.width).toFixed(3))
            : 0,
          menuButtons: bubbleMenuButtons.length,
          menuSmallControls: bubbleSmallMenus,
        },
        transcript: logRect
          ? {
              width: Math.round(logRect.width),
              height: Math.round(logRect.height),
            }
          : null,
        sidebar: sidebarRect
          ? {
              width: Math.round(sidebarRect.width),
              modelCards: sidebarModelCards.length,
              onlineUsersTop: sidebarOnlineRect ? Math.round(sidebarOnlineRect.top) : null,
              smallControls: sidebarSmallControls,
            }
          : null,
        groupInfoPanel: groupInfoPanelRect
          ? {
              visible: true,
              width: Math.round(groupInfoPanelRect.width),
              height: Math.round(groupInfoPanelRect.height),
              right: Math.round(groupInfoPanelRect.right),
              rightAligned: Math.abs(groupInfoPanelRect.right - viewportWidth) <= 2,
              heading: groupInfoHeading
                ? {
                    text: groupInfoHeading.textContent?.trim() || "",
                    clipped: groupInfoHeading.scrollWidth > groupInfoHeading.clientWidth + 1,
                  }
                : null,
              webhookSectionVisible: Boolean(groupInfoWebhooks && isVisible(groupInfoWebhooks)),
              webhookRows: groupInfoWebhookRows.length,
              webhookCreatedSecretVisible: groupInfoWebhookCreatedSecret,
              webhookRotateButtons: groupInfoWebhookRotate.length,
              webhookAuditVisible: groupInfoWebhookAudit,
              webhookAuditLogs: groupInfoWebhookAuditLogs.length,
              memberRows: groupInfoMemberRows.length,
              smallControls: groupInfoSmallControls,
            }
          : null,
        groupEmptyState: groupEmptyStateRect
          ? {
              visible: true,
              width: Math.round(groupEmptyStateRect.width),
              height: Math.round(groupEmptyStateRect.height),
              text: groupEmptyState.textContent?.replace(/\s+/g, " ").trim() || "",
            }
          : null,
        settingsModal: settingsModalRect
          ? {
              visible: true,
              width: Math.round(settingsModalRect.width),
              height: Math.round(settingsModalRect.height),
              left: Math.round(settingsModalRect.left),
              right: Math.round(settingsModalRect.right),
              top: Math.round(settingsModalRect.top),
              bottom: Math.round(settingsModalRect.bottom),
              tabs: settingsTabs.length,
              tabLabels: settingsTabLabels,
              contentVisible: Boolean(settingsContent && isVisible(settingsContent)),
              smallControls: settingsSmallControls,
            }
          : null,
        authModal: authModalRect
          ? {
              visible: true,
              width: Math.round(authModalRect.width),
              height: Math.round(authModalRect.height),
              left: Math.round(authModalRect.left),
              right: Math.round(authModalRect.right),
              top: Math.round(authModalRect.top),
              bottom: Math.round(authModalRect.bottom),
              tabs: authTabs.length,
              tabLabels: authTabLabels,
              contentVisible: Boolean(authContent && isVisible(authContent)),
              errorVisible: Boolean(authError && isVisible(authError)),
              smallControls: authSmallControls,
            }
          : null,
        visibleMessages,
        consoleErrors,
      };
    },
    { scenarioName: scenario.name, viewport: scenario.viewport, consoleErrors: errors },
  );
}

function scenarioIssues(metrics) {
  const issues = [];
  const isAuthScenario = metrics.scenarioName.includes("auth");
  const isPrimaryChatScenario =
    !isAuthScenario &&
    !metrics.scenarioName.includes("settings") &&
    !metrics.scenarioName.includes("group-info") &&
    !metrics.scenarioName.includes("sidebar-open");
  if (metrics.horizontalOverflow) issues.push("horizontal overflow");
  if (metrics.consoleErrors.length > 0) issues.push("console/page errors");
  if (metrics.viewport.width < 768 && metrics.textarea && metrics.textarea.width < 180) {
    issues.push(`mobile textarea too narrow (${metrics.textarea.width}px)`);
  }
  if (metrics.viewport.width >= 768 && metrics.viewport.width < 1024 && metrics.textarea && metrics.textarea.width < 360) {
    issues.push(`tablet textarea too narrow (${metrics.textarea.width}px)`);
  }
  if (
    metrics.viewport.width < 768 &&
    !isAuthScenario &&
    !metrics.scenarioName.includes("format") &&
    metrics.composer &&
    metrics.composer.viewportRatio > 0.24
  ) {
    issues.push(`collapsed mobile composer too tall (${metrics.composer.viewportRatio})`);
  }
  if (!isAuthScenario) {
    if (!metrics.composer) {
      issues.push("composer missing");
    } else {
      if (!metrics.composer.bottomRowVisible || !metrics.composer.toolbarVisible) {
        issues.push("composer toolbar not visible");
      }
      if (metrics.composer.toolCount < 7) {
        issues.push(`composer tool density too low (${metrics.composer.toolCount})`);
      }
      if (metrics.composer.visibleTools < 5) {
        issues.push(`composer visible tools too low (${metrics.composer.visibleTools})`);
      }
      if (metrics.composer.smallControls.length > 0) {
        issues.push(`composer small controls (${metrics.composer.smallControls.length})`);
      }
    }
  }
  if (metrics.viewport.width < 768 && metrics.mobileTitle) {
    if (metrics.mobileTitle.width < 120) {
      issues.push(`mobile title too narrow (${metrics.mobileTitle.width}px)`);
    }
    if (metrics.mobileTitle.text === "公共聊天" && metrics.mobileTitle.clipped) {
      issues.push("mobile public title is clipped");
    }
  }
  if (metrics.viewport.width < 768 && metrics.messageText?.maxFontSize > 15) {
    issues.push(`mobile message text too large (${metrics.messageText.maxFontSize}px)`);
  }
  if (isPrimaryChatScenario) {
    if (metrics.messageBubbles.total < 4) {
      issues.push(`message bubble density too low (${metrics.messageBubbles.total})`);
    }
    if (metrics.messageBubbles.own < 1 || metrics.messageBubbles.other < 1) {
      issues.push(`message bubble direction coverage missing (own=${metrics.messageBubbles.own}, other=${metrics.messageBubbles.other})`);
    }
    if (metrics.messageBubbles.surfaces < metrics.messageBubbles.total) {
      issues.push(`message bubble surfaces missing (${metrics.messageBubbles.surfaces}/${metrics.messageBubbles.total})`);
    }
    if (metrics.messageBubbles.maxSurfaceRatio > 0.78) {
      issues.push(`message bubble surface too wide (${metrics.messageBubbles.maxSurfaceRatio})`);
    }
    if (metrics.messageBubbles.menuButtons < metrics.messageBubbles.total) {
      issues.push(`message bubble menu buttons missing (${metrics.messageBubbles.menuButtons}/${metrics.messageBubbles.total})`);
    }
    if (metrics.messageBubbles.menuSmallControls.length > 0) {
      issues.push(`message bubble menu small controls (${metrics.messageBubbles.menuSmallControls.length})`);
    }
  }
  if (metrics.viewport.width < 768 && !isAuthScenario && !metrics.scenarioName.includes("format") && metrics.visibleMessages < 4) {
    issues.push(`mobile visible message density too low (${metrics.visibleMessages})`);
  }
  if (!isAuthScenario && metrics.viewport.width >= 768 && metrics.viewport.width < 1024 && metrics.visibleMessages < 4) {
    issues.push(`tablet visible message density too low (${metrics.visibleMessages})`);
  }
  if (metrics.viewport.width >= 1024 && metrics.sidebar) {
    if (metrics.sidebar.modelCards > 4) {
      issues.push(`desktop sidebar model preview too tall (${metrics.sidebar.modelCards} cards)`);
    }
    if (metrics.sidebar.onlineUsersTop !== null && metrics.sidebar.onlineUsersTop > 680) {
      issues.push(`desktop sidebar online users too low (${metrics.sidebar.onlineUsersTop}px)`);
    }
  }
  if (metrics.scenarioName.includes("sidebar-open")) {
    if (!metrics.sidebar) {
      issues.push("mobile sidebar not visible");
    } else if (metrics.sidebar.smallControls.length > 0) {
      issues.push(`mobile sidebar small controls (${metrics.sidebar.smallControls.length})`);
    }
  }
  if (metrics.scenarioName.includes("group-info")) {
    if (!metrics.desktopTitle || metrics.desktopTitle.multiline) {
      issues.push("desktop group title is multiline");
    }
    if (!metrics.groupEmptyState?.visible) {
      issues.push("group empty state not visible");
    }
    if (!metrics.groupInfoPanel?.visible) {
      issues.push("group info panel not visible");
    } else {
      if (metrics.groupInfoPanel.width < 320 || metrics.groupInfoPanel.width > 390) {
        issues.push(`group info panel width out of range (${metrics.groupInfoPanel.width}px)`);
      }
      if (!metrics.groupInfoPanel.rightAligned) {
        issues.push(`group info panel not right aligned (${metrics.groupInfoPanel.right}px)`);
      }
      if (metrics.groupInfoPanel.height < metrics.viewport.height - 2) {
        issues.push(`group info panel too short (${metrics.groupInfoPanel.height}px)`);
      }
      if (metrics.groupInfoPanel.heading?.clipped) {
        issues.push("group info panel heading clipped");
      }
      if (!metrics.groupInfoPanel.webhookSectionVisible) {
        issues.push("group info webhook section not visible");
      }
      if (metrics.groupInfoPanel.memberRows < 1) {
        issues.push(`group info member density missing (${metrics.groupInfoPanel.memberRows})`);
      }
      if (metrics.groupInfoPanel.smallControls.length > 0) {
        issues.push(`group info small controls (${metrics.groupInfoPanel.smallControls.length})`);
      }
      if (metrics.groupInfoPanel.webhookRows < 1) {
        issues.push('group info webhook row missing');
      }
      if (!metrics.groupInfoPanel.webhookCreatedSecretVisible) {
        issues.push('group info webhook created secret not visible');
      }
      if (metrics.groupInfoPanel.webhookRotateButtons < 1) {
        issues.push('group info webhook rotate button missing');
      }
      if (!metrics.groupInfoPanel.webhookAuditVisible) {
        issues.push('group info webhook audit section not visible');
      }
      if (metrics.groupInfoPanel.webhookAuditLogs < 1) {
        issues.push('group info webhook audit log missing');
      }
    }
  }
  if (metrics.scenarioName.includes("settings")) {
    if (!metrics.settingsModal?.visible) {
      issues.push("settings modal not visible");
    } else {
      if (metrics.settingsModal.left < 0 || metrics.settingsModal.right > metrics.viewport.width + 1) {
        issues.push(`settings modal horizontal fit failed (${metrics.settingsModal.left}-${metrics.settingsModal.right})`);
      }
      if (metrics.settingsModal.top < 0 || metrics.settingsModal.bottom > metrics.viewport.height + 1) {
        issues.push(`settings modal vertical fit failed (${metrics.settingsModal.top}-${metrics.settingsModal.bottom})`);
      }
      if (metrics.viewport.width >= 768 && (metrics.settingsModal.width < 560 || metrics.settingsModal.width > 760)) {
        issues.push(`desktop settings modal width out of range (${metrics.settingsModal.width}px)`);
      }
      if (metrics.viewport.width < 768 && metrics.settingsModal.width > metrics.viewport.width - 12) {
        issues.push(`mobile settings modal too wide (${metrics.settingsModal.width}px)`);
      }
      if (metrics.settingsModal.tabs !== 3) {
        issues.push(`settings tabs missing (${metrics.settingsModal.tabs})`);
      }
      const clippedTabs = metrics.settingsModal.tabLabels.filter((tab) => tab.clipped);
      if (clippedTabs.length > 0) {
        issues.push(`settings tab labels clipped (${clippedTabs.map((tab) => tab.text).join(", ")})`);
      }
      if (!metrics.settingsModal.contentVisible) {
        issues.push("settings content not visible");
      }
      if (metrics.settingsModal.smallControls.length > 0) {
        issues.push(`settings small controls (${metrics.settingsModal.smallControls.length})`);
      }
    }
  }
  if (isAuthScenario) {
    if (!metrics.authModal?.visible) {
      issues.push("auth modal not visible");
    } else {
      if (metrics.authModal.left < 0 || metrics.authModal.right > metrics.viewport.width + 1) {
        issues.push(`auth modal horizontal fit failed (${metrics.authModal.left}-${metrics.authModal.right})`);
      }
      if (metrics.authModal.top < 0 || metrics.authModal.bottom > metrics.viewport.height + 1) {
        issues.push(`auth modal vertical fit failed (${metrics.authModal.top}-${metrics.authModal.bottom})`);
      }
      if (metrics.viewport.width >= 768 && (metrics.authModal.width < 340 || metrics.authModal.width > 420)) {
        issues.push(`desktop auth modal width out of range (${metrics.authModal.width}px)`);
      }
      if (metrics.viewport.width < 768 && metrics.authModal.width > metrics.viewport.width - 12) {
        issues.push(`mobile auth modal too wide (${metrics.authModal.width}px)`);
      }
      if (metrics.authModal.tabs !== 3) {
        issues.push(`auth tabs missing (${metrics.authModal.tabs})`);
      }
      const clippedTabs = metrics.authModal.tabLabels.filter((tab) => tab.clipped);
      if (clippedTabs.length > 0) {
        issues.push(`auth tab labels clipped (${clippedTabs.map((tab) => tab.text).join(", ")})`);
      }
      if (!metrics.authModal.contentVisible) {
        issues.push("auth content not visible");
      }
      if (metrics.scenarioName.includes("error") && !metrics.authModal.errorVisible) {
        issues.push("auth error state not visible");
      }
      if (metrics.authModal.smallControls.length > 0) {
        issues.push(`auth small controls (${metrics.authModal.smallControls.length})`);
      }
    }
  }
  return issues;
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    const seedLabels = await seedChat(browser);
    await wait(10500);
    for (const scenario of scenarios) {
      if (results.length > 0 && results.length % 4 === 0) {
        await wait(10500);
      }
      const id = runId();
      const { context, page, errors } = scenario.authOpen
        ? await newPublicScenarioPage(browser, scenario)
        : await newScenarioPage(browser, scenario, seedLabels.actorA || `Reviewer_${id}`);

      if (scenario.formatOpen) {
        await page.getByLabel(/^(Markdown 格式|Markdown formatting|Toggle formatting toolbar)$/).click();
        await page.getByLabel("加粗").waitFor({ state: "visible", timeout: 5000 });
      }
      if (scenario.authOpen) {
        await openAuthModal(page, scenario);
      }
      if (scenario.groupInfoOpen) {
        await openGroupInfoPanel(page);
      }
      if (scenario.sidebarOpen) {
        await openMobileSidebar(page);
      }
      if (scenario.settingsOpen) {
        await openSettingsModal(page, scenario);
      }

      await page.waitForTimeout(350);
      const screenshot = path.join(outputDir, `${scenario.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      const metrics = await collectMetrics(page, scenario, errors);
      metrics.screenshot = screenshot;
      metrics.issues = scenarioIssues(metrics);
      results.push(metrics);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const reportPath = path.join(outputDir, "metrics.json");
  await writeFile(reportPath, JSON.stringify({ baseURL, outputDir, generatedAt: new Date().toISOString(), results }, null, 2));

  console.log(`Visual acceptance output: ${outputDir}`);
  for (const result of results) {
    const issueText = result.issues.length ? ` issues=${result.issues.join("; ")}` : "";
    console.log(
      `${result.scenarioName}: textarea=${result.textarea?.width ?? "n/a"}x${result.textarea?.height ?? "n/a"} ` +
        `composer=${result.composer?.height ?? "n/a"}px messages=${result.visibleMessages} ` +
        `composerTools=${result.composer?.visibleTools ?? "n/a"}/${result.composer?.toolCount ?? "n/a"} ` +
        `composerSmallControls=${result.composer?.smallControls?.length ?? "n/a"} ` +
        `bubbles=${result.messageBubbles?.own ?? "n/a"}/${result.messageBubbles?.other ?? "n/a"} ` +
        `bubbleMax=${result.messageBubbles?.maxSurfaceRatio ?? "n/a"} ` +
        `bubbleMenuSmall=${result.messageBubbles?.menuSmallControls?.length ?? "n/a"} ` +
        `title=${result.mobileTitle?.width ?? "n/a"}px desktopTitle=${result.desktopTitle?.width ?? "n/a"}x${result.desktopTitle?.height ?? "n/a"} ` +
        `msgFont=${result.messageText?.maxFontSize ?? "n/a"}px ` +
        `smallControls=${result.smallControls.length} sidebarModels=${result.sidebar?.modelCards ?? "n/a"} ` +
        `sidebarSmallControls=${result.sidebar?.smallControls?.length ?? "n/a"} ` +
        `sidebarOnlineTop=${result.sidebar?.onlineUsersTop ?? "n/a"} ` +
        `settingsModal=${result.settingsModal?.width ?? "n/a"}x${result.settingsModal?.height ?? "n/a"} ` +
        `settingsSmallControls=${result.settingsModal?.smallControls?.length ?? "n/a"} ` +
        `authModal=${result.authModal?.width ?? "n/a"}x${result.authModal?.height ?? "n/a"} ` +
        `authSmallControls=${result.authModal?.smallControls?.length ?? "n/a"} authError=${result.authModal?.errorVisible ?? "n/a"} ` +
        `groupPanel=${result.groupInfoPanel?.width ?? "n/a"}px ` +
        `groupSmallControls=${result.groupInfoPanel?.smallControls?.length ?? "n/a"} webhookRows=${result.groupInfoPanel?.webhookRows ?? "n/a"} webhookRotate=${result.groupInfoPanel?.webhookRotateButtons ?? "n/a"} auditLogs=${result.groupInfoPanel?.webhookAuditLogs ?? "n/a"}${issueText}`,
      );
  }
  console.log(`Metrics: ${reportPath}`);

  const hardFailures = results.flatMap((result) =>
    result.issues.map((issue) => `${result.scenarioName}: ${issue}`),
  );
  if (hardFailures.length > 0) {
    console.error(`Visual acceptance hard failures:\n${hardFailures.join("\n")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
