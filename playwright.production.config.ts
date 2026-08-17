import { defineConfig, devices } from '@playwright/test';

const isDeployedMode = process.env.CERTIFICATION_MODE === 'deployed' || process.env.NODE_ENV === 'production';
const BASE_URL = process.env.PRODUCTION_BASE_URL || process.env.PRODUCTION_URL || (isDeployedMode ? '' : 'http://127.0.0.1:8080');

if (isDeployedMode && (!BASE_URL || BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1'))) {
  throw new Error(`[Playwright Config Error] Deployed certification mode forbids localhost/127.0.0.1! Target URL must be deployed environment: ${BASE_URL}`);
}

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
    baseURL: BASE_URL || 'http://127.0.0.1:8080',
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
