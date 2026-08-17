import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PRODUCTION_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:8080';

export default defineConfig({
  testDir: './tests/browser-runtime-production',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['html', { outputFolder: 'artifacts/release-candidate/browser-report', open: 'never' }],
    ['json', { outputFile: 'artifacts/release-candidate/production-browser-results.json' }],
    ['list']
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on',
    screenshot: 'on',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium-production',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox-production',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});
