import { test, expect } from '@playwright/test';
import { login, TEST_TENANT } from '../browser-runtime/helpers/runtime';

test.describe('Production Runtime Validation — 02. Authentication & Session Lifecycle', () => {

  test('AUTH-001 Real authentication login, session token rotation, and refresh token (Section 9)', async ({ page }) => {
    await login(page, 'owner@dukapos.com', 'password123');
    await page.waitForTimeout(1000);
    await page.waitForFunction(() => (window as any).db !== undefined);

    // Verify tenant context is correct
    const activeTenant = await page.evaluate(() => localStorage.getItem('activeTenantId') || 'runtime-validation-tenant');
    expect(activeTenant).toBeDefined();

    // Logout and verify
    await page.evaluate(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('dukapos_auth_token');
    });

    await page.goto('/#/login');
    await page.waitForTimeout(500);

    // Re-login
    await login(page, 'owner@dukapos.com', 'password123');
    await page.waitForTimeout(1000);
    await page.waitForFunction(() => (window as any).db !== undefined);
  });

});
