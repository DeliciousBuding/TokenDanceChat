import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 测试配置 for TokenDanceChat 前端。
 *
 * 运行前需要先启动后端：
 *   cd backend && go run . -db ../data/chat.db
 *
 * 或使用 webServer 自动启动（见下方注释）。
 */
export default defineConfig({
  testDir: './src/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: Number(process.env.E2E_WORKERS ?? 1),
  reporter: 'html',
  timeout: 30000,
  expect: {
    timeout: 10000,
  },

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 可选：自动启动后端服务器。
  // 注意：需要先编译 Go 后端。取消注释以启用：
  //
  // webServer: {
  //   command: 'cd ../backend && go run .',
  //   url: 'http://127.0.0.1:8080/api/health',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 30000,
  //   cwd: '../..',
  // },
});
