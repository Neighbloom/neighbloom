// Regression tests for the message-first help composer and draft restoration.
// These verify existing demo behavior before Supabase migration replaces
// the underlying persistence.

import { test, expect } from '@playwright/test';

test.describe('Help composer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
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
    await page.click('.nb-tabbtn:has-text("Post")');
    await page.click('.nb-choice-title:has-text("Recommendations")');
  });

  test('category selector renders', async ({ page }) => {
    const selects = page.locator('select');
    await expect(selects.first()).toBeVisible();
  });
});
