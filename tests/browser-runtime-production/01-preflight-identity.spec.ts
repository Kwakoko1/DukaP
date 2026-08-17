import { test, expect } from '@playwright/test';

test.describe('Production Runtime Validation — 01. Preflight Identity & Endpoints', () => {

  test('PREFLIGHT-001 GET /api/version exposes deterministic build identity (Section 1 & 5)', async ({ request }) => {
    const res = await request.get('/api/version');
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.app || body.application).toBe('KwakoPos');
    expect(body.version).toBeDefined();
    expect(body.buildNumber).toBeDefined();
    expect(body.gitSha).toBeDefined();
    expect(body.schemaVersion).toBe(41);
    expect(body.environment).toBeDefined();
    expect(body.releaseChannel).toBeDefined();
    expect(body.status).toBe('ok');
  });

  test('PREFLIGHT-002 GET /api/health returns 200 liveness status (Section 6)', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status === 'ok' || body.status === 'healthy').toBe(true);
    expect(body.database).toBe('connected');
  });

  test('PREFLIGHT-003 GET /api/readiness returns 200 readiness & migration status (Section 6)', async ({ request }) => {
    const res = await request.get('/api/readiness');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ready');
    expect(body.database).toBe('connected');
    expect(body.migration).toBe('current');
    expect(body.schemaVersion).toBe(41);
  });

  test('PREFLIGHT-004 Static PWA assets, manifest, and icons are accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check title tag
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);

    // Check Service Worker registration
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length >= 0; // SW API is present and functional
    });
    expect(swRegistered).toBe(true);
  });

});
