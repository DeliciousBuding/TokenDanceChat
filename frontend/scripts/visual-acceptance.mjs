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
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, theme: "dark" },
  { name: "tablet-light", viewport: { width: 768, height: 1024 }, theme: "light" },
  { name: "mobile-light", viewport: { width: 390, height: 844 }, theme: "light" },
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
  const actorA = await newScenarioPage(browser, scenarios[0], `视觉验收_${id}`);
  const actorB = await newScenarioPage(browser, scenarios[0], `AgentHub_${id}`);

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
        visibleMessages,
        consoleErrors,
      };
    },
    { scenarioName: scenario.name, viewport: scenario.viewport, consoleErrors: errors },
  );
}

function scenarioIssues(metrics) {
  const issues = [];
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
    !metrics.scenarioName.includes("format") &&
    metrics.composer &&
    metrics.composer.viewportRatio > 0.24
  ) {
    issues.push(`collapsed mobile composer too tall (${metrics.composer.viewportRatio})`);
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
  if (metrics.viewport.width < 768 && !metrics.scenarioName.includes("format") && metrics.visibleMessages < 4) {
    issues.push(`mobile visible message density too low (${metrics.visibleMessages})`);
  }
  if (metrics.viewport.width >= 768 && metrics.viewport.width < 1024 && metrics.visibleMessages < 4) {
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
  return issues;
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    await seedChat(browser);
    await wait(10500);
    for (const scenario of scenarios) {
      if (results.length > 0 && results.length % 4 === 0) {
        await wait(10500);
      }
      const id = runId();
      const { context, page, errors } = await newScenarioPage(browser, scenario, `Reviewer_${id}`);

      if (scenario.formatOpen) {
        await page.getByLabel(/^(Markdown 格式|Markdown formatting|Toggle formatting toolbar)$/).click();
        await page.getByLabel("加粗").waitFor({ state: "visible", timeout: 5000 });
      }
      if (scenario.groupInfoOpen) {
        await openGroupInfoPanel(page);
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
        `title=${result.mobileTitle?.width ?? "n/a"}px desktopTitle=${result.desktopTitle?.width ?? "n/a"}x${result.desktopTitle?.height ?? "n/a"} ` +
        `msgFont=${result.messageText?.maxFontSize ?? "n/a"}px ` +
        `smallControls=${result.smallControls.length} sidebarModels=${result.sidebar?.modelCards ?? "n/a"} ` +
        `sidebarOnlineTop=${result.sidebar?.onlineUsersTop ?? "n/a"} ` +
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
