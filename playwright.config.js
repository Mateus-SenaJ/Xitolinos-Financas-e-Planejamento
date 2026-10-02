import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/dev.js',
    url: 'http://127.0.0.1:1337/admin',
    reuseExistingServer: false,
    timeout: 180000,
    stdout: 'pipe',
    stderr: 'pipe'
  }
});
