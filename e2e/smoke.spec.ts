/**
 * Production Smoke Tests — Playwright
 *
 * Verifies the deployed app at suf-agent-2026.vercel.app works as a real
 * user/agent would experience it. Tests rendered UI, not just HTTP responses.
 *
 * Run: npx playwright test
 * Override URL: SMOKE_TEST_URL=https://custom.domain npx playwright test
 */
import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('renders with correct title and hero content', async ({ page }) => {
    await page.goto('/');

    // Browser tab title
    await expect(page).toHaveTitle(/Startupfest 2026/);

    // Hero section renders
    await expect(page.locator('h1')).toContainText('Startupfest 2026');
    await expect(page.locator('.landing-subtitle')).toContainText('agentic co-founder');
    await expect(page.locator('.landing-dates')).toContainText('July 8-10, 2026');
  });

  test('three onboarding path cards render', async ({ page }) => {
    await page.goto('/');

    const cards = page.locator('.path-card');
    await expect(cards).toHaveCount(3);

    // Check each card has a heading
    await expect(cards.nth(0).locator('h3')).toContainText('Already Agentic');
    await expect(cards.nth(1).locator('h3')).toContainText('Have AI but New to Skills');
    await expect(cards.nth(2).locator('h3')).toContainText('No AI Yet');
  });

  test('GitHub repo link points to skill repo', async ({ page }) => {
    await page.goto('/');

    const repoLink = page.locator('a.path-cta[href*="embrase/SUF-agent-2026"]');
    await expect(repoLink).toBeVisible();
    await expect(repoLink).toContainText('Go to GitHub Repo');
  });

  test('platform guide accordions expand', async ({ page }) => {
    await page.goto('/');

    // Click "Claude Code (CLI)" details/summary
    const claudeDetails = page.locator('details:has(summary:text("Claude Code"))');
    await claudeDetails.locator('summary').click();

    // Content should be visible after expanding
    await expect(claudeDetails.locator('ol')).toBeVisible();
    await expect(claudeDetails).toContainText('npm install -g @anthropic-ai/claude-code');
  });

  test('LiveStats component renders with counters', async ({ page }) => {
    await page.goto('/');

    // LiveStats fetches /api/public/stats and renders counters
    // Wait for the stats to load (they come from the API)
    const statsSection = page.locator('.live-stats, [class*="stats"], [class*="Stats"]');

    // The component should exist even if numbers are 0
    // If the API is down, this will fail — which is correct behavior for a smoke test
    await expect(statsSection.first()).toBeVisible({ timeout: 10_000 });
  });

  test('browse links to agents, talks, booths', async ({ page }) => {
    await page.goto('/');

    const browseLinks = page.locator('.browse-links .browse-link');
    await expect(browseLinks).toHaveCount(3);

    // Verify they point to the right routes
    await expect(browseLinks.nth(0)).toHaveAttribute('href', '/agents');
    await expect(browseLinks.nth(1)).toHaveAttribute('href', '/talks');
    await expect(browseLinks.nth(2)).toHaveAttribute('href', '/booths');
  });

  test('footer with disclaimer renders', async ({ page }) => {
    await page.goto('/');

    const footer = page.locator('.landing-footer');
    await expect(footer).toBeVisible();
    await expect(footer.locator('.disclaimer')).toContainText('Disclaimer');
    await expect(footer).toContainText('startupfest.com');
  });

  test('no console errors on landing page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known acceptable errors (e.g., Firebase auth not configured)
    const realErrors = errors.filter(e =>
      !e.includes('Firebase') && !e.includes('auth/') && !e.includes('favicon')
    );
    expect(realErrors).toEqual([]);
  });
});

test.describe('SPA Routing', () => {
  test('deep link to /booths serves the app (not 404)', async ({ page }) => {
    await page.goto('/booths');
    // Should render the React app, not a Vercel 404
    await expect(page.locator('#root')).toBeAttached();
    // Should NOT show a Vercel error page
    await expect(page.locator('body')).not.toContainText('404');
  });

  test('deep link to /talks serves the app', async ({ page }) => {
    await page.goto('/talks');
    await expect(page.locator('#root')).toBeAttached();
  });

  test('deep link to /register serves the app', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('#root')).toBeAttached();
  });
});

test.describe('API Endpoints (from browser context)', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  test('status endpoint returns phase data from Firestore', async ({ request }) => {
    const res = await request.get('/api/status');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.active).toBeInstanceOf(Array);
    expect(body.upcoming).toBeInstanceOf(Array);
    expect(body.completed).toBeInstanceOf(Array);
    expect(typeof body.locked).toBe('boolean');
    // All 9 phases should appear somewhere
    const allPhases = [...body.active, ...body.upcoming.map((u: any) => u.phase), ...body.completed];
    expect(allPhases).toContain('registration');
    expect(allPhases).toContain('yearbook');
  });

  test('public stats returns counters', async ({ request }) => {
    const res = await request.get('/api/public/stats');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.agents_registered).toBe('number');
    expect(typeof body.talks_proposed).toBe('number');
    expect(typeof body.booths_created).toBe('number');
  });

  test('authenticated endpoint rejects without API key', async ({ request }) => {
    const res = await request.get('/api/me');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthorized');
  });

  test('security headers are present on API responses', async ({ request }) => {
    const res = await request.get('/api/health');
    const headers = res.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });
});

test.describe('CSS and Assets', () => {
  test('stylesheet loads successfully', async ({ page }) => {
    const cssResponses: number[] = [];
    page.on('response', res => {
      if (res.url().includes('.css')) cssResponses.push(res.status());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(cssResponses.length).toBeGreaterThan(0);
    for (const status of cssResponses) {
      expect(status).toBe(200);
    }
  });

  test('Material Icons font loads', async ({ page }) => {
    const fontResponses: number[] = [];
    page.on('response', res => {
      if (res.url().includes('fonts.googleapis.com') || res.url().includes('fonts.gstatic.com')) {
        fontResponses.push(res.status());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // At least the CSS for Material Icons should load
    expect(fontResponses.length).toBeGreaterThan(0);
  });
});
