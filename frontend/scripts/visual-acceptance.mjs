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
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, theme: "dark" },
  { name: "desktop-light-tokenbot", viewport: { width: 1440, height: 900 }, theme: "light", assistant: "TokenBot" },
  { name: "tablet-light", viewport: { width: 768, height: 1024 }, theme: "light" },
  { name: "mobile-light", viewport: { width: 390, height: 844 }, theme: "light" },
  { name: "mobile-dark", viewport: { width: 390, height: 844 }, theme: "dark" },
  { name: "mobile-light-tokenbot", viewport: { width: 390, height: 844 }, theme: "light", assistant: "TokenBot" },
  { name: "mobile-light-sidebar-open", viewport: { width: 390, height: 844 }, theme: "light", sidebarOpen: true },
  { name: "desktop-light-settings", viewport: { width: 1440, height: 900 }, theme: "light", settingsOpen: true },
  { name: "mobile-light-settings", viewport: { width: 390, height: 844 }, theme: "light", settingsOpen: true },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runId() {
  return Math.random().toString(36).slice(2, 8);
}

async function newContext(browser, scenario, username = "") {
  const context = await browser.newContext({
    viewport: scenario.viewport,
    colorScheme: scenario.theme,
    deviceScaleFactor: scenario.viewport.width < 768 ? 2 : 1,
    isMobile: scenario.viewport.width < 768,
    hasTouch: scenario.viewport.width < 768,
  });
  await context.addInitScript(
    ({ theme, username }) => {
      localStorage.setItem("tdchat-theme", theme);
      localStorage.setItem("tokendance:lang", "zh-CN");
      localStorage.removeItem("tokendance:auth");
      if (username) {
        localStorage.setItem("tokendance:username", username);
      } else {
        localStorage.removeItem("tokendance:username");
      }
    },
    { theme: scenario.theme, username },
  );
  return context;
}

async function newScenarioPage(browser, scenario, label) {
  const errors = [];
  const context = await newContext(browser, scenario, label);
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator("[data-visual='composer-textarea']").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("[data-visual='composer-textarea']").waitFor({ state: "attached", timeout: 15000 });
  await page.waitForFunction(() => {
    const textarea = document.querySelector("[data-visual='composer-textarea']");
    return textarea && !textarea.hasAttribute("disabled");
  }, undefined, { timeout: 15000 });
  await dismissAuthModal(page);
  return { context, page, errors };
}

async function newPublicScenarioPage(browser, scenario) {
  const errors = [];
  const context = await newContext(browser, scenario);
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
  await dismissAuthModal(page);
  const textarea = page.locator("[data-visual='composer-textarea']");
  await textarea.fill(text);
  await page.keyboard.press("Enter");
  const visibleText = text.replace(/^@[\p{L}\p{N}_]+\s+/u, "");
  await page.getByText(visibleText, { exact: false }).first().waitFor({ state: "visible", timeout: 10000 });
  await wait(350);
}

async function dismissAuthModal(page) {
  const close = page.locator("[data-visual='auth-modal-close']");
  if (await close.isVisible({ timeout: 1000 }).catch(() => false)) {
    await close.click();
    await page.locator("[data-visual='auth-modal-root']").waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
  }
}

async function visibleSeedMessageCount(page) {
  return await page.evaluate(() =>
    Array.from(document.querySelectorAll("[id^='msg-'] .markdown-body")).filter((el) =>
      /AgentHub v4 transcript|TokenBot 只保留统一命名|AI 工作区继续复用公共聊天室消息流|composer 对齐 AgentHub Desktop|PicoClaw 私聊入口|长消息渲染检查/.test(el.textContent || ""),
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

  await sendMessage(actorA.page, "AgentHub v4 transcript：消息区使用 list/block 结构、受控圆角和低阴影。");
  await sendMessage(actorB.page, "TokenBot 只保留统一命名，历史别名只作为不可见兼容映射。");
  await sendMessage(actorA.page, "@TokenBot 视觉验收：AI 工作区继续复用公共聊天室消息流，不恢复独立私聊和复杂联系人。");
  await sendMessage(actorB.page, "@TokenBot composer 对齐 AgentHub Desktop：轻量输入、浅色气泡、低阴影和稳定高度。");
  await sendMessage(actorA.page, "PicoClaw 私聊入口保留为轻量 AI 工作区，不恢复复杂联系人或通话入口。");
  await sendMessage(
    actorB.page,
    "长消息渲染检查：这条消息用于确认桌面和移动端的气泡宽度、换行、metadata、hover 菜单和 composer 不会互相挤压，聊天流仍然保持紧凑可读。",
  );

  const seededCount = await visibleSeedMessageCount(actorA.page);
  if (seededCount < 6) {
    throw new Error(`visual seed expected 6 messages, saw ${seededCount}`);
  }

  await actorA.context.close();
  await actorB.context.close();
  return labels;
}

async function openMobileSidebar(page) {
  await page.getByRole("button", { name: /^(打开侧边栏|Open sidebar)$/ }).click();
  await page.waitForFunction(() => {
    const sidebar = document.querySelector("[data-visual='light-chat-sidebar']");
    if (!sidebar) return false;
    const rect = sidebar.getBoundingClientRect();
    return rect.left >= -1 && rect.right > 260;
  });
  await page.waitForTimeout(250);
}

async function openSettingsPanel(page, scenario) {
  if (scenario.viewport.width < 768) {
    await openMobileSidebar(page);
  }
  await page.locator("[data-visual='light-chat-sidebar']").getByRole("button", { name: /^(打开设置|Open Settings)$/ }).click();
  await page.locator("[data-visual='settings-modal']").waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.waitForTimeout(250);
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
  await page.waitForTimeout(250);
}

async function selectAssistant(page, scenario) {
  if (!scenario.assistant) return;
  if (scenario.viewport.width < 768) {
    await openMobileSidebar(page);
  }
  await page.locator("[data-visual='light-chat-sidebar']").getByRole("button", { name: new RegExp(scenario.assistant) }).click();
  await page.locator("[data-visual='composer-ai-context']").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("[data-visual='ai-chat-workbench']").waitFor({ state: "detached", timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(250);
}

async function collectMetrics(page, scenario, errors) {
  return await page.evaluate(
    ({ scenarioName, viewport, consoleErrors }) => {
      function isVisible(el) {
        const rect = el.getBoundingClientRect();
        for (let node = el; node instanceof Element; node = node.parentElement) {
          const style = window.getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
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

      function smallControlsIn(root) {
        if (!root || !isVisible(root)) return [];
        return Array.from(root.querySelectorAll("button, [role='button'], textarea, input:not([type='hidden']), select"))
          .filter(isVisible)
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
      }

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const rootText = document.body.textContent || "";
      const oldLabelMatches = rootText.match(/WebUIChat|WebUIBot|webuichat|webuibot|Knowledge|Tools|Prompts|好友|Friends|群组|Groups|私信|Direct Message|DM|语音通话|Voice Call|视频通话|Video Call|定时发送|Schedule Message|Webhook/g) || [];

      const textarea = document.querySelector("[data-visual='composer-textarea']");
      const textareaRect = textarea?.getBoundingClientRect();
      const composer = document.querySelector("[data-visual='composer-card']");
      const composerRect = composer?.getBoundingClientRect();
      const composerBody = document.querySelector(".td-chat-composer-body");
      const composerBodyRect = composerBody?.getBoundingClientRect();
      const composerBodyStyle = composerBody ? window.getComputedStyle(composerBody) : null;
      const sendButton = document.querySelector("[data-visual='composer-send']");
      const sendButtonRect = sendButton?.getBoundingClientRect();
      const composerAiContext = document.querySelector("[data-visual='composer-ai-context']");
      const aiWorkbench = document.querySelector("[data-visual='ai-chat-workbench']");
      const assistantSwitch = document.querySelector("[data-visual='assistant-switch']");
      const log = document.querySelector("[role='log']");
      const logRect = log?.getBoundingClientRect();
      const transcriptBlocks = Array.from(document.querySelectorAll(".td-ah-transcript-block")).filter(isVisible);
      const mobileTitle = document.querySelector("[data-visual='mobile-chat-title']");
      const mobileTitleRect = mobileTitle?.getBoundingClientRect();
      const desktopTitle = document.querySelector("[data-visual='desktop-chat-title']");
      const desktopTitleRect = desktopTitle && isVisible(desktopTitle) ? desktopTitle.getBoundingClientRect() : null;
      const sidebar = document.querySelector("[data-visual='light-chat-sidebar']");
      const sidebarRect = sidebar && isVisible(sidebar) ? sidebar.getBoundingClientRect() : null;

      const visibleMessages = Array.from(document.querySelectorAll("[id^='msg-']")).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < viewportHeight;
      }).length;
      const visibleMarkdownBodies = Array.from(document.querySelectorAll("[id^='msg-'] .markdown-body")).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < viewportHeight;
      });
      const messageFontSizes = visibleMarkdownBodies
        .map((el) => Number.parseFloat(window.getComputedStyle(el).fontSize))
        .filter(Number.isFinite);
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
      const maxBubbleSurfaceWidth = bubbleSurfaceRects.length
        ? Math.max(...bubbleSurfaceRects.map((item) => item.width))
        : 0;
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

      const settingsModal = document.querySelector("[data-visual='settings-modal']");
      const settingsModalRect = settingsModal && isVisible(settingsModal) ? settingsModal.getBoundingClientRect() : null;
      const settingsContent = settingsModal?.querySelector("[data-visual='settings-content']");
      const authModal = document.querySelector("[data-visual='auth-modal']");
      const authModalRect = authModal && isVisible(authModal) ? authModal.getBoundingClientRect() : null;
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
      const authError = authModal?.querySelector("[role='alert']");

      const horizontalOverflow =
        document.documentElement.scrollWidth > viewportWidth + 1 ||
        document.body.scrollWidth > viewportWidth + 1;

      return {
        scenarioName,
        viewport,
        url: location.href,
        documentWidth: document.documentElement.scrollWidth,
        horizontalOverflow,
        oldLabels: oldLabelMatches.length,
        oldLabelSamples: [...new Set(oldLabelMatches)].slice(0, 10),
        textarea: textareaRect
          ? {
              width: Math.round(textareaRect.width),
              height: Math.round(textareaRect.height),
              fontSize: window.getComputedStyle(textarea).fontSize,
            }
          : null,
        composer: composerRect
          ? {
              width: Math.round(composerRect.width),
              height: Math.round(composerRect.height),
              viewportRatio: Number((composerRect.height / viewportHeight).toFixed(3)),
              bodyWidth: composerBodyRect ? Math.round(composerBodyRect.width) : 0,
              bodyHeight: composerBodyRect ? Math.round(composerBodyRect.height) : 0,
              radius: composerBodyStyle?.borderRadius || "",
              sendWidth: sendButtonRect ? Math.round(sendButtonRect.width) : 0,
              sendHeight: sendButtonRect ? Math.round(sendButtonRect.height) : 0,
              aiContext: Boolean(composerAiContext && isVisible(composerAiContext)),
            }
          : null,
        transcript: logRect
          ? {
              width: Math.round(logRect.width),
              height: Math.round(logRect.height),
              blocks: transcriptBlocks.length,
            }
          : null,
        mobileTitle: mobileTitleRect
          ? {
              width: Math.round(mobileTitleRect.width),
              scrollWidth: mobileTitle.scrollWidth,
              clientWidth: mobileTitle.clientWidth,
              clipped: mobileTitle.scrollWidth > mobileTitle.clientWidth + 1,
              text: mobileTitle.textContent?.trim() || "",
            }
          : null,
        desktopTitle: desktopTitleRect
          ? {
              width: Math.round(desktopTitleRect.width),
              height: Math.round(desktopTitleRect.height),
              text: desktopTitle.textContent?.trim() || "",
            }
          : null,
        sidebar: sidebarRect
          ? {
              width: Math.round(sidebarRect.width),
              smallControls: smallControlsIn(sidebar),
            }
          : null,
        aiWorkbench: aiWorkbench && isVisible(aiWorkbench)
          ? {
              visible: true,
              assistantSwitch: Boolean(assistantSwitch && isVisible(assistantSwitch)),
              smallControls: smallControlsIn(aiWorkbench),
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
        },
        settingsModal: settingsModalRect
          ? {
              visible: true,
              width: Math.round(settingsModalRect.width),
              height: Math.round(settingsModalRect.height),
              left: Math.round(settingsModalRect.left),
              right: Math.round(settingsModalRect.right),
              top: Math.round(settingsModalRect.top),
              bottom: Math.round(settingsModalRect.bottom),
              contentVisible: Boolean(settingsContent && isVisible(settingsContent)),
              smallControls: smallControlsIn(settingsModal),
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
              smallControls: smallControlsIn(authModal),
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
  const isSettingsScenario = metrics.scenarioName.includes("settings");
  const isAssistantScenario = metrics.scenarioName.includes("tokenbot");
  const isSidebarScenario = metrics.scenarioName.includes("sidebar-open");
  const isPrimaryChatScenario = !isAuthScenario && !isSettingsScenario && !isSidebarScenario;

  if (metrics.horizontalOverflow) issues.push("horizontal overflow");
  if (metrics.consoleErrors.length > 0) issues.push("console/page errors");
  if (metrics.oldLabels > 0) issues.push(`old IM labels visible (${metrics.oldLabelSamples.join(", ")})`);

  if (!isAuthScenario) {
    if (!metrics.composer) {
      issues.push("composer missing");
    } else {
      if (metrics.composer.bodyHeight < 56 || metrics.composer.bodyHeight > 104) {
        issues.push(`composer body height out of range (${metrics.composer.bodyHeight}px)`);
      }
      if (metrics.composer.radius !== "16px") {
        issues.push(`composer radius is not AgentHub v4 16px (${metrics.composer.radius})`);
      }
      if (metrics.viewport.width < 768 && metrics.composer.bodyWidth < 320) {
        issues.push(`mobile composer body too narrow (${metrics.composer.bodyWidth}px)`);
      }
      if (metrics.viewport.width >= 1024 && metrics.composer.bodyWidth < 760) {
        issues.push(`desktop composer body too narrow (${metrics.composer.bodyWidth}px)`);
      }
      const maxMobileComposerRatio = isAssistantScenario ? 0.25 : 0.18;
      if (metrics.viewport.width < 768 && metrics.composer.viewportRatio > maxMobileComposerRatio) {
        issues.push(`mobile composer too tall (${metrics.composer.viewportRatio})`);
      }
    }
    if (!metrics.textarea) {
      issues.push("textarea missing");
    } else if (metrics.viewport.width < 768 && metrics.textarea.width < 180) {
      issues.push(`mobile textarea too narrow (${metrics.textarea.width}px)`);
    } else if (metrics.viewport.width >= 768 && metrics.viewport.width < 1024 && metrics.textarea.width < 360) {
      issues.push(`tablet textarea too narrow (${metrics.textarea.width}px)`);
    }
  }

  if (metrics.viewport.width < 768 && metrics.mobileTitle) {
    if (metrics.mobileTitle.width < 120) issues.push(`mobile title too narrow (${metrics.mobileTitle.width}px)`);
    if (metrics.mobileTitle.text === "公共聊天" && metrics.mobileTitle.clipped) {
      issues.push("mobile public title is clipped");
    }
  }
  if (metrics.viewport.width < 768 && metrics.messageText?.maxFontSize > 15) {
    issues.push(`mobile message text too large (${metrics.messageText.maxFontSize}px)`);
  }

  if (isPrimaryChatScenario) {
    if (!metrics.transcript || metrics.transcript.blocks < 4) {
      issues.push(`AgentHub transcript blocks too low (${metrics.transcript?.blocks ?? 0})`);
    }
    if (metrics.messageBubbles.total < 4) {
      issues.push(`message bubble density too low (${metrics.messageBubbles.total})`);
    }
    if (metrics.messageBubbles.own < 1 || metrics.messageBubbles.other < 1) {
      issues.push(`message bubble direction coverage missing (own=${metrics.messageBubbles.own}, other=${metrics.messageBubbles.other})`);
    }
    if (metrics.messageBubbles.surfaces < metrics.messageBubbles.total) {
      issues.push(`message bubble surfaces missing (${metrics.messageBubbles.surfaces}/${metrics.messageBubbles.total})`);
    }
    if (metrics.messageBubbles.maxSurfaceRatio > 0.88) {
      issues.push(`message bubble surface too wide (${metrics.messageBubbles.maxSurfaceRatio})`);
    }
  }

  if (isAssistantScenario) {
    if (metrics.aiWorkbench?.visible) issues.push("AI workbench should not reserve top transcript space");
    if (!metrics.composer?.aiContext) issues.push("assistant composer context not visible");
  }

  if (isSidebarScenario) {
    if (!metrics.sidebar) {
      issues.push("mobile sidebar not visible");
    } else if (metrics.sidebar.smallControls.length > 0) {
      issues.push(`mobile sidebar small controls (${metrics.sidebar.smallControls.length})`);
    }
  }

  if (isSettingsScenario) {
    if (!metrics.settingsModal?.visible) {
      issues.push("settings modal not visible");
    } else {
      if (metrics.settingsModal.left < 0 || metrics.settingsModal.right > metrics.viewport.width + 1) {
        issues.push(`settings modal horizontal fit failed (${metrics.settingsModal.left}-${metrics.settingsModal.right})`);
      }
      if (metrics.settingsModal.top < 0 || metrics.settingsModal.bottom > metrics.viewport.height + 1) {
        issues.push(`settings modal vertical fit failed (${metrics.settingsModal.top}-${metrics.settingsModal.bottom})`);
      }
      if (metrics.settingsModal.width < 320 || metrics.settingsModal.width > 420) {
        issues.push(`settings drawer width out of range (${metrics.settingsModal.width}px)`);
      }
      if (metrics.viewport.width < 768 && metrics.settingsModal.width > metrics.viewport.width) {
        issues.push(`mobile settings modal too wide (${metrics.settingsModal.width}px)`);
      }
      if (metrics.settingsModal.right < metrics.viewport.width - 2) {
        issues.push(`settings drawer is not right aligned (${metrics.settingsModal.right}px)`);
      }
      if (!metrics.settingsModal.contentVisible) issues.push("settings content not visible");
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
      const clippedTabs = metrics.authModal.tabLabels.filter((tab) => tab.clipped);
      if (clippedTabs.length > 0) {
        issues.push(`auth tab labels clipped (${clippedTabs.map((tab) => tab.text).join(", ")})`);
      }
      if (!metrics.authModal.contentVisible) issues.push("auth content not visible");
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
    await wait(1500);
    for (const scenario of scenarios) {
      const id = runId();
      const { context, page, errors } = scenario.authOpen
        ? await newPublicScenarioPage(browser, scenario)
        : await newScenarioPage(browser, scenario, seedLabels.actorA || `Reviewer_${id}`);

      await selectAssistant(page, scenario);
      if (!scenario.authOpen && !scenario.sidebarOpen && !scenario.settingsOpen) {
        await sendMessage(page, `当前用户气泡校验 ${scenario.name} ${id}`);
      }
      if (scenario.sidebarOpen) await openMobileSidebar(page);
      if (scenario.settingsOpen) await openSettingsPanel(page, scenario);
      if (scenario.authOpen) await openAuthModal(page, scenario);

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
        `composer=${result.composer?.bodyWidth ?? "n/a"}x${result.composer?.bodyHeight ?? "n/a"} radius=${result.composer?.radius ?? "n/a"} ` +
        `messages=${result.visibleMessages} blocks=${result.transcript?.blocks ?? "n/a"} ` +
        `bubbles=${result.messageBubbles?.own ?? "n/a"}/${result.messageBubbles?.other ?? "n/a"} ` +
        `bubbleMax=${result.messageBubbles?.maxSurfaceRatio ?? "n/a"} ` +
        `oldLabels=${result.oldLabels} ai=${result.aiWorkbench?.visible ?? false} ` +
        `settingsModal=${result.settingsModal?.width ?? "n/a"}x${result.settingsModal?.height ?? "n/a"} ` +
        `authModal=${result.authModal?.width ?? "n/a"}x${result.authModal?.height ?? "n/a"} ` +
        `authError=${result.authModal?.errorVisible ?? "n/a"}${issueText}`,
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
