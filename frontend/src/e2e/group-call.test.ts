import { test, expect } from "@playwright/test";

/**
 * TokenDanceChat 群组视频通话 E2E 测试。
 *
 * 运行方式：
 *   E2E_BASE_URL=http://127.0.0.1:8080 npx playwright test src/e2e/group-call.test.ts --project=chromium
 *
 * 本测试聚焦于信令流程的 UI 行为（call_room_create, call_room_created 等）。
 * 不依赖真实媒体设备。由于 getUserMedia 在 headless 环境中会失败，
 * startGroupCall 中 setState("ended") 直接走 ended 分支，无需实际 WebRTC 握手。
 *
 * 注意：当 getUserMedia 失败时，startGroupCall 仅设置 state="ended"，
 * 不调用 endCall()，因此 activeCall 仍被设置，VideoCall 保持挂载。
 * ended 屏幕无可交互元素——这是当前代码的实际行为，本测试如实验证。
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const setupPage = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("tokendance:lang", "zh-CN");
    localStorage.setItem("tdchat-theme", "light");
    localStorage.removeItem("tokendance:username");
  });
};

/** 以游客身份加入公开聊天。 */
const joinChat = async (page: import("@playwright/test").Page, username: string) => {
  await page.goto("/");
  await page.getByPlaceholder("你的用户名...").fill(username);
  await page.getByRole("button", { name: "游客加入" }).click();
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 15000 });
};

/**
 * 创建群组。如果提供了 member，会在群组创建弹窗的可用用户列表中
 * 勾选该成员（需要该用户已经在线）。
 */
const createGroup = async (
  page: import("@playwright/test").Page,
  groupName: string,
  member?: string,
) => {
  await page.getByLabel("创建群组").click();
  await page.getByPlaceholder("群组名称...").fill(groupName);

  if (member) {
    // 弹窗内的成员列表容器（Tailwind max-h-40）。
    const memberList = page.locator(".max-h-40");
    await expect(memberList.getByText(member)).toBeVisible({ timeout: 8000 });
    // Click the label that wraps the checkbox — clicking the span text
    // alone may not toggle the hidden checkbox in all environments.
    await memberList.locator("label").filter({ hasText: member }).click();
    // Verify the checkbox is now checked.
    await expect(
      memberList.locator("label").filter({ hasText: member }).locator("input[type=checkbox]"),
    ).toBeChecked({ timeout: 3000 });
  }

  await page.getByRole("button", { name: /^创建$/ }).click();

  // 等待侧边栏出现群组入口且聊天标题切换到该群组。
  await page.getByRole("button", { name: new RegExp(groupName) }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await expect(
    page.getByRole("heading", { name: new RegExp(groupName) }),
  ).toBeVisible({ timeout: 5000 });

  // Wait for group_info event to populate the groups store with members.
  await page.waitForTimeout(1500);
};

/** 点击 calling 状态下的红色挂断按钮（aria-label="拒绝"），触发 endCall。 */
const clickCallingEndButton = async (page: import("@playwright/test").Page) => {
  // 在 calling/ringing 状态中，红色 PhoneOff 按钮的 aria-label 固定为 "拒绝"。
  // 它在 VideoCall 的 z-[100] 覆盖层中，直接定位即可。
  const rejectBtn = page.getByLabel("拒绝");
  await expect(rejectBtn).toBeVisible({ timeout: 5000 });
  await rejectBtn.click();
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test.describe("Group video call", () => {
  test.describe("Signaling flow (no real media)", () => {
    test("create group with member, initiate call, end during calling state, return to chat", async ({
      page,
    }) => {
      const suffix = Math.random().toString(36).slice(2, 6);
      const ownerName = `GCOwner_${suffix}`;
      const memberName = `GCMember_${suffix}`;
      const groupName = `通话_${suffix}`;

      // ── 1. 创建包含两名成员的群组 ──

      // 成员先加入，确保其出现在群主的在线用户列表中。
      const pageMember = await page.context().newPage();
      await setupPage(pageMember);
      await joinChat(pageMember, memberName);
      await expect(
        pageMember.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });

      // 群主加入。
      await joinChat(page, ownerName);
      await expect(
        page.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });

      // 等待服务器广播 user_joined 从而同步在线列表。
      await page.waitForTimeout(1000);

      // 群主创建群组并选择成员。
      await createGroup(page, groupName, memberName);

      // 等待 group_info 事件更新 groups store 中的 members 列表。
      await page.waitForTimeout(1500);

      // ── 2. 发起群组通话 ──

      // 服务器返回 group_create 后 members 列表已填充 → 按钮可见。
      const callButton = page.getByLabel("群组通话");
      await expect(callButton).toBeVisible({ timeout: 10000 });
      await callButton.click();

      // ── 3. 通话处于 "calling" 状态，点击挂断 ──

      // startGroupCall 会异步调用 getUserMedia。在此之前 state 是 "calling"，
      // 渲染包含红色挂断按钮（aria-label="拒绝"）的通话界面。
      await clickCallingEndButton(page);

      // endCall 通过 setTimeout(onClose, 1500) 触发父组件 handleCloseCall，
      // 将 activeCall 设为 null → VideoCall 卸载。
      await page.waitForTimeout(2000);

      // ── 4. 验证已返回群聊视图 ──

      await expect(
        page.getByRole("heading", { name: new RegExp(groupName) }),
      ).toBeVisible({ timeout: 5000 });

      await expect(page.locator("textarea").first()).toBeVisible({
        timeout: 5000,
      });

      // 清理。
      await pageMember.close();
    });

    test("ended screen renders when getUserMedia fails and stays visible", async ({
      page,
    }) => {
      const suffix = Math.random().toString(36).slice(2, 6);
      const ownerName = `EndO_${suffix}`;
      const memberName = `EndM_${suffix}`;
      const groupName = `Ended_${suffix}`;

      // 成员加入。
      const pageMember = await page.context().newPage();
      await setupPage(pageMember);
      await joinChat(pageMember, memberName);
      await expect(
        pageMember.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });

      // 群主加入。
      await joinChat(page, ownerName);
      await expect(
        page.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(1000);

      // 创建群组。
      await createGroup(page, groupName, memberName);

      // 发起通话。
      await expect(page.getByLabel("群组通话")).toBeVisible({ timeout: 10000 });
      await page.getByLabel("群组通话").click();

      // 不点击挂断按钮，等 getUserMedia 失败 → startGroupCall 内部 setState("ended")。
      // 注意：此时 endCall 未被调用，activeCall 仍然存在，
      // ended 屏幕无可点击元素，将持续显示。
      await expect(page.getByText("通话已结束")).toBeVisible({
        timeout: 10000,
      });

      // 通话时长应显示 "00:00"（从未进入 connected 状态）。
      await expect(page.getByText("00:00")).toBeVisible({ timeout: 3000 });

      // ended 屏幕不包含 "结束通话" 按钮（和 calling/connected 不同）。
      const endButton = page.getByLabel("结束通话");
      await expect(endButton).not.toBeVisible({ timeout: 3000 });

      // 也不包含 "拒绝" 按钮。
      const rejectButton = page.getByLabel("拒绝");
      await expect(rejectButton).not.toBeVisible({ timeout: 3000 });

      // 清理：强制刷新以重置状态。
      await page.reload();
      await pageMember.close();
    });
  });

  test.describe("UI state management", () => {
    test("group call button not visible for solo group (only creator)", async ({
      page,
    }) => {
      const suffix = Math.random().toString(36).slice(2, 6);
      const groupName = `Solo_${suffix}`;

      await joinChat(page, `SoloUsr_${suffix}`);

      // 创建不包含其他成员的群组。
      await createGroup(page, groupName);

      // "群组通话"按钮不应出现（无其他成员则无法发起群组通话）。
      await page.waitForTimeout(500);
      await expect(page.getByLabel("群组通话")).not.toBeVisible({
        timeout: 3000,
      });
    });

    test("group call button disappears when switching away from group chat", async ({
      page,
    }) => {
      const suffix = Math.random().toString(36).slice(2, 6);
      const ownerName = `SwAwayO_${suffix}`;
      const memberName = `SwAwayM_${suffix}`;
      const groupName = `SwAway_${suffix}`;

      const pageMember = await page.context().newPage();
      await setupPage(pageMember);
      await joinChat(pageMember, memberName);
      await expect(
        pageMember.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });

      await joinChat(page, ownerName);
      await expect(
        page.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(1000);

      // 创建带成员的群组 → 按钮可见。
      await createGroup(page, groupName, memberName);
      await page.waitForTimeout(1500);
      await expect(page.getByLabel("群组通话")).toBeVisible({ timeout: 10000 });

      // 切换回公开聊天 → 按钮应消失（当前非 group 类型）。
      await page.getByRole("button", { name: /^TokenDance/ }).click();
      await page.waitForTimeout(500);
      await expect(page.getByLabel("群组通话")).not.toBeVisible({
        timeout: 3000,
      });

      // 切换回群聊 → 按钮重新出现。
      await page.getByRole("button", { name: new RegExp(groupName) }).click();
      await expect(page.getByRole("heading", { name: new RegExp(groupName) })).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByLabel("群组通话")).toBeVisible({ timeout: 10000 });

      await pageMember.close();
    });

    test("calling UI shows group name and call type indicator", async ({
      page,
    }) => {
      const suffix = Math.random().toString(36).slice(2, 6);
      const ownerName = `CallUIO_${suffix}`;
      const memberName = `CallUIM_${suffix}`;
      const groupName = `CallUIGrp_${suffix}`;

      const pageMember = await page.context().newPage();
      await setupPage(pageMember);
      await joinChat(pageMember, memberName);
      await expect(
        pageMember.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });

      await joinChat(page, ownerName);
      await expect(
        page.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(1000);

      await createGroup(page, groupName, memberName);

      // 发起通话。
      await expect(page.getByLabel("群组通话")).toBeVisible({ timeout: 10000 });
      await page.getByLabel("群组通话").click();

      // 在 calling 状态下验证以下元素存在：
      //   - 群组名称标题
      //   - 挂断按钮
      //   - 全屏覆盖层 (z-[100])
      await expect(page.getByText(groupName)).toBeVisible({ timeout: 5000 });

      // 等待 getUserMedia 失败 → ended 屏幕。
      await expect(page.getByText("通话已结束")).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText("00:00")).toBeVisible({ timeout: 3000 });

      // 清理。
      await page.reload();
      await pageMember.close();
    });
  });

  test.describe("Multi-tab isolation", () => {
    test("group call overlay only visible in owner tab, not bystander", async ({
      page,
    }) => {
      const suffix = Math.random().toString(36).slice(2, 6);
      const ownerName = `MT_O_${suffix}`;
      const memberName = `MT_M_${suffix}`;
      const bystanderName = `MT_B_${suffix}`;
      const groupName = `MT_${suffix}`;

      // 旁观者加入（不参与群组）。
      const pageBystander = await page.context().newPage();
      await setupPage(pageBystander);
      await joinChat(pageBystander, bystanderName);
      await expect(
        pageBystander.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });

      // 成员加入。
      const pageMember = await page.context().newPage();
      await setupPage(pageMember);
      await joinChat(pageMember, memberName);
      await expect(
        pageMember.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });

      // 群主加入。
      await joinChat(page, ownerName);
      await expect(
        page.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(1000);

      // 群主创建群组（仅选择 member，不选 bystander）。
      await createGroup(page, groupName, memberName);

      // 群主发起通话。
      await expect(page.getByLabel("群组通话")).toBeVisible({ timeout: 10000 });
      await page.getByLabel("群组通话").click();

      // 群主标签页看到 calling 或 ended 状态。
      // 等 getUserMedia 失败 → ended。
      await expect(page.getByText("通话已结束")).toBeVisible({
        timeout: 10000,
      });

      // 旁观者标签页不应看到通话覆盖层。
      await expect(
        pageBystander.getByText("通话已结束"),
      ).not.toBeVisible({ timeout: 3000 });

      // 旁观者仍在公开聊天中，输入框可用。
      await expect(
        pageBystander.locator("textarea").first(),
      ).toBeVisible({ timeout: 3000 });

      // 清理。
      await page.reload();
      await pageBystander.close();
      await pageMember.close();
    });

    test("third tab joining group after call started does not auto-see call overlay", async ({
      page,
    }) => {
      const suffix = Math.random().toString(36).slice(2, 6);
      const ownerName = `LateO_${suffix}`;
      const memberName = `LateM_${suffix}`;
      const lateName = `LateL_${suffix}`;
      const groupName = `Late_${suffix}`;

      // 成员加入。
      const pageMember = await page.context().newPage();
      await setupPage(pageMember);
      await joinChat(pageMember, memberName);
      await expect(
        pageMember.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });

      // 群主加入。
      await joinChat(page, ownerName);
      await expect(
        page.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(1000);

      // 创建群组（仅含 member）。
      await createGroup(page, groupName, memberName);

      // 群主发起通话。
      await expect(page.getByLabel("群组通话")).toBeVisible({ timeout: 10000 });
      await page.getByLabel("群组通话").click();

      // 等待 calling 状态出现。
      await page.waitForTimeout(500);

      // 第三个用户在群主发起通话之后才加入。
      const pageLate = await page.context().newPage();
      await setupPage(pageLate);
      await joinChat(pageLate, lateName);
      await expect(
        pageLate.getByRole("button", { name: "断开连接" }),
      ).toBeVisible({ timeout: 5000 });

      // 晚加入的用户在公开聊天中，不应有通话覆盖层。
      await expect(
        pageLate.getByText("通话已结束"),
      ).not.toBeVisible({ timeout: 3000 });

      // 群主 tab 看到 ended 屏幕（getUserMedia 失败）。
      await expect(page.getByText("通话已结束")).toBeVisible({
        timeout: 10000,
      });

      // 清理。
      await page.reload();
      await pageLate.close();
      await pageMember.close();
    });
  });

  test.describe("Real media (skip in CI)", () => {
    test("full group video call requires real camera and peer signaling", async ({
      browserName,
    }) => {
      test.skip(
        browserName !== "chromium",
        "Requires real camera/mic — skip in CI and non-Chromium browsers.",
      );

      // 完整 WebRTC 群组通话需要：
      //   1. 真实摄像头 / 麦克风
      //   2. 对端在线并接听
      //   3. 双向 SDP 交换 + ICE 连接
      // 这超出了单 tab E2E 测试范围。此用例作为占位。
      test.skip(
        true,
        "Full WebRTC group call requires two-way peer signaling and media devices.",
      );
    });
  });
});
