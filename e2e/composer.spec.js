// Regression tests for the message-first help composer and draft restoration.
// These verify existing demo behavior before Supabase migration replaces
// the underlying persistence.
//
// NOTE: With Supabase auth enabled, tests sign in as a test user first.
// Set TEST_EMAIL/TEST_PASSWORD env vars, or tests will use demo mode.

import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

async function signInIfNeeded(page) {
  // Check if auth screen is showing
  const authScreen = page.locator('.nb-auth-screen');
  if (await authScreen.count() === 0) return; // demo mode, no auth needed
  
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    test.skip('Skipping: TEST_EMAIL/TEST_PASSWORD not set for auth-enabled tests');
    return;
  }
  
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
}

test.describe('Help composer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await signInIfNeeded(page);
    // Navigate to Post tab
    await page.click('.nb-tabbtn:has-text("Post")');
    // Select "Need a hand"
    await page.click('.nb-choice-title:has-text("Need a hand")');
  });

  test('message-first composer renders without template chips', async ({ page }) => {
    // Message textarea should be visible
    const textarea = page.locator('textarea.nb-textarea').first();
    await expect(textarea).toBeVisible();

    // Type trigger keywords that used to spawn chips
    await textarea.fill('I need someone to shovel my driveway and move a couch');
    await page.waitForTimeout(500);

    // No template chip buttons should be rendered
    const chips = page.locator('.nb-chip');
    await expect(chips).toHaveCount(0);
  });

  test('draft autosave restores message after reload', async ({ page }) => {
    const textarea = page.locator('textarea.nb-textarea').first();
    const testMessage = 'Help moving a bookshelf Saturday morning';
    await textarea.fill(testMessage);

    // Wait for autosave debounce
    await page.waitForTimeout(2000);

    // Reload and navigate back
    await page.reload();
    await page.click('.nb-tabbtn:has-text("Post")');
    await page.click('.nb-choice-title:has-text("Need a hand")');

    const restored = page.locator('textarea.nb-textarea').first();
    await expect(restored).toHaveValue(testMessage);
  });

  test('helper count controls are visible', async ({ page }) => {
    // Helpers stepper should be visible in the form
    await expect(page.locator('text=helpers').first()).toBeVisible();
  });
});

test.describe('Recommendation composer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await signInIfNeeded(page);
    await page.click('.nb-tabbtn:has-text("Post")');
    await page.click('.nb-choice-title:has-text("Recommendations")');
  });

  test('category selector renders', async ({ page }) => {
    const selects = page.locator('select');
    await expect(selects.first()).toBeVisible();
  });
});
