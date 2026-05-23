import { test, expect } from '@playwright/test';

/**
 * TokenDanceChat 前端 E2E 测试。
 *
 * 运行方式：
 *   1. 编译并启动后端：cd backend && go run .
 *   2. 编译前端：cd frontend && npm run build
 *   3. 运行测试：npx playwright test
 */

const setupPage = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("tokendance:lang", "zh-CN");
    localStorage.setItem("tdchat-theme", "light");
    localStorage.removeItem("tokendance:username");
  });
};

test.describe('页面加载', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('首页正确加载', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('TokenDance Chat');

    // Heading visible
    await expect(page.getByRole('heading', { name: 'TokenDance Chat' })).toBeVisible();

    // Username input with i18n placeholder
    const input = page.getByPlaceholder('你的用户名...');
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();

    // Guest join button (replaced old "加入聊天")
    await expect(page.getByRole('button', { name: '游客加入' })).toBeVisible();

    // Login and Register buttons
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible();
    await expect(page.getByRole('button', { name: '注册' })).toBeVisible();
  });

  test('英文切换后页面正常', async ({ page }) => {
    await page.goto('/');

    // Click language toggle (shows opposite language)
    const langButton = page.getByLabel('切换语言');
    await langButton.click();

    await expect(page.getByRole('heading', { name: 'TokenDance Chat' })).toBeVisible();
    await expect(page.getByPlaceholder('Your username...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join as Guest' })).toBeVisible();
  });
});

test.describe('加入流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('空用户名显示错误提示', async ({ page }) => {
    await page.goto('/');

    // Button is disabled when empty, so use Enter to trigger form submit
    const input = page.getByPlaceholder('你的用户名...');
    await input.fill('');
    await input.press('Enter');

    const error = page.getByRole('alert');
    await expect(error).toBeVisible();
    await expect(error).toContainText('请输入用户名');
  });

  test('用户名过短显示错误提示', async ({ page }) => {
    await page.goto('/');

    const input = page.getByPlaceholder('你的用户名...');
    await input.fill('a');
    await page.getByRole('button', { name: '游客加入' }).click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible();
    await expect(error).toContainText('至少需要2个字符');
  });

  test('用户名过长显示错误提示', async ({ page }) => {
    await page.goto('/');

    const input = page.getByPlaceholder('你的用户名...');
    // maxLength=20 truncates fill(), use native setter to bypass
    await input.evaluate((el: HTMLInputElement, val: string) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )!.set!;
      nativeSetter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, 'a'.repeat(21));
    await page.getByRole('button', { name: '游客加入' }).click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible();
    await expect(error).toContainText('超过');
  });

  test('非法字符显示错误提示', async ({ page }) => {
    await page.goto('/');

    const input = page.getByPlaceholder('你的用户名...');
    await input.fill('hello world');
    await page.getByRole('button', { name: '游客加入' }).click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible();
    await expect(error).toContainText('中文、英文、数字和下划线');
  });

  test('Enter 键提交加入', async ({ page }) => {
    await page.goto('/');

    const input = page.getByPlaceholder('你的用户名...');
    await input.fill('');
    await input.press('Enter');

    const error = page.getByRole('alert');
    await expect(error).toBeVisible();
    await expect(error).toContainText('请输入用户名');
  });

  test('导航到登录界面', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: '登录' }).click();

    // LoginScreen should be visible
    await expect(page.getByPlaceholder('用户名')).toBeVisible();
    await expect(page.getByLabel('密码')).toBeVisible();

    // Back button returns to guest join
    await page.getByLabel('Back').click();
    await expect(page.getByPlaceholder('你的用户名...')).toBeVisible();
  });
});

test.describe('游客加入聊天（需要后端）', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('成功以游客身份加入聊天室', async ({ page }) => {
    await page.goto('/');

    const input = page.getByPlaceholder('你的用户名...');
    await input.fill('e2e_test_user');
    await page.getByRole('button', { name: '游客加入' }).click();

    // Should navigate to chat view
    await expect(page.getByRole('button', { name: '游客加入' })).not.toBeVisible({ timeout: 10000 });

    // Textarea should appear
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 10000 });
  });

  test('重复用户名被拒绝', async ({ page }) => {
    const dupName = `e2e_dup_${Math.random().toString(36).slice(2, 6)}`;

    const page1 = await page.context().newPage();
    await setupPage(page1);
    await page1.goto('/');
    await page1.getByPlaceholder('你的用户名...').fill(dupName);
    await page1.getByRole('button', { name: '游客加入' }).click();
    await expect(page1.locator('textarea').first()).toBeVisible({ timeout: 10000 });

    await page.goto('/');
    await page.getByPlaceholder('你的用户名...').fill(dupName);
    await page.getByRole('button', { name: '游客加入' }).click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible({ timeout: 10000 });

    await page1.close();
  });

  test('消息发送后出现在聊天区域', async ({ page }) => {
    await page.goto('/');

    await page.getByPlaceholder('你的用户名...').fill('e2e_msg_test');
    await page.getByRole('button', { name: '游客加入' }).click();
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 10000 });

    const uniqueMsg = `E2E_${Math.random().toString(36).slice(2, 8)}`;
    const msgInput = page.getByPlaceholder('输入消息... (Shift+Enter 换行)');
    await msgInput.fill(uniqueMsg);
    await page.keyboard.press('Enter');

    await expect(page.getByText(uniqueMsg).first()).toBeVisible({ timeout: 10000 });
  });
});
