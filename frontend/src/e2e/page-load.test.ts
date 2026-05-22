import { test, expect } from '@playwright/test';

/**
 * TokenDanceChat 前端 E2E 测试。
 *
 * 运行方式：
 *   1. 编译并启动后端：cd backend && go run .
 *   2. 编译前端：cd frontend && npm run build
 *   3. 运行测试：npx playwright test
 *
 * 或指定后端地址：
 *   E2E_BASE_URL=http://127.0.0.1:8080 npx playwright test
 */

test.describe('页面加载', () => {
  test('首页正确加载', async ({ page }) => {
    await page.goto('/');

    // 验证页面标题。
    await expect(page).toHaveTitle('TokenDance Chat');

    // 验证加入表单可见。
    const heading = page.getByRole('heading', { name: 'TokenDance Chat' });
    await expect(heading).toBeVisible();

    // 验证输入框存在。
    const input = page.getByPlaceholder('你的用户名...');
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();

    // 验证加入按钮存在。
    const button = page.getByRole('button', { name: '加入聊天' });
    await expect(button).toBeVisible();
  });

  test('英文切换后页面正常', async ({ page }) => {
    await page.goto('/');

    // 点击语言切换按钮。
    const langButton = page.getByLabel('Switch to English');
    await langButton.click();

    // 验证英文界面。
    const heading = page.getByRole('heading', { name: 'TokenDance Chat' });
    await expect(heading).toBeVisible();
  });
});

test.describe('加入流程', () => {
  test('空用户名显示错误提示', async ({ page }) => {
    await page.goto('/');

    const button = page.getByRole('button', { name: '加入聊天' });
    await button.click();

    // 应显示空用户名错误。
    const error = page.getByRole('alert');
    await expect(error).toBeVisible();
    await expect(error).toContainText('请输入用户名');
  });

  test('用户名过短显示错误提示', async ({ page }) => {
    await page.goto('/');

    const input = page.getByPlaceholder('你的用户名...');
    await input.fill('a');

    const button = page.getByRole('button', { name: '加入聊天' });
    await button.click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible();
    await expect(error).toContainText('至少需要2个字符');
  });

  test('用户名过长显示错误提示', async ({ page }) => {
    await page.goto('/');

    const input = page.getByPlaceholder('你的用户名...');
    await input.fill('a'.repeat(21));

    const button = page.getByRole('button', { name: '加入聊天' });
    await button.click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible();
    await expect(error).toContainText('超过');
  });

  test('非法字符显示错误提示', async ({ page }) => {
    await page.goto('/');

    const input = page.getByPlaceholder('你的用户名...');
    await input.fill('hello world');

    const button = page.getByRole('button', { name: '加入聊天' });
    await button.click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible();
    await expect(error).toContainText('中文、英文、数字和下划线');
  });

  test('Enter 键提交加入', async ({ page }) => {
    await page.goto('/');

    const input = page.getByPlaceholder('你的用户名...');
    await input.fill('');

    // 空用户名 + Enter 应显示错误（而非提交）。
    await input.press('Enter');
    const error = page.getByRole('alert');
    await expect(error).toBeVisible();
    await expect(error).toContainText('请输入用户名');
  });
});

test.describe.skip('需要后端服务器', () => {
  test('成功加入聊天室', async ({ page }) => {
    await page.goto('/');

    // 输入有效用户名并点击加入。
    const input = page.getByPlaceholder('你的用户名...');
    await input.fill('testuser');

    const button = page.getByRole('button', { name: '加入聊天' });
    await button.click();

    // 应导航到聊天视图。
    // 等待连接成功——聊天界面应出现。
    await expect(button).not.toBeVisible();

    // 侧边栏应显示用户名。
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('重复用户名被拒绝', async ({ page }) => {
    // 第一个用户加入。
    const page1 = await page.context().newPage();
    await page1.goto('/');
    await page1.getByPlaceholder('你的用户名...').fill('duplicate_test');
    await page1.getByRole('button', { name: '加入聊天' }).click();
    // 等待第一个用户成功加入。
    await expect(page1.getByRole('button', { name: '加入聊天' })).not.toBeVisible({ timeout: 10000 });

    // 第二个页面尝试相同用户名。
    await page.goto('/');
    await page.getByPlaceholder('你的用户名...').fill('duplicate_test');
    await page.getByRole('button', { name: '加入聊天' }).click();

    // 应显示错误提示。
    const error = page.getByRole('alert');
    await expect(error).toBeVisible({ timeout: 10000 });

    await page1.close();
  });

  test('消息发送后出现在聊天区域', async ({ page }) => {
    await page.goto('/');

    // 加入聊天。
    await page.getByPlaceholder('你的用户名...').fill('msg_test');
    await page.getByRole('button', { name: '加入聊天' }).click();
    await expect(page.getByRole('button', { name: '加入聊天' })).not.toBeVisible({ timeout: 10000 });

    // 发送消息。
    const msgInput = page.getByPlaceholder('输入你的消息...');
    await msgInput.fill('Hello from Playwright');
    // 查找发送按钮 — ChatInput 组件。
    await page.keyboard.press('Enter');

    // 消息应出现在聊天区域。
    const message = page.locator('[data-testid="message-bubble"]').filter({ hasText: 'Hello from Playwright' });
    await expect(message.first()).toBeVisible({ timeout: 10000 });
  });
});
