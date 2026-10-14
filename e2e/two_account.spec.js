// Two-account browser acceptance test for Milestone 1.
// Verifies real UI with two independent authenticated accounts.

import { test, expect, chromium } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

test('two accounts share posts via real UI', async () => {
  const timestamp = Date.now();
  const emailA = `ui-alice-${timestamp}@gmail.com`;
  const emailB = `ui-bob-${timestamp}@gmail.com`;
  const password = 'TestPass123!';

  // Launch two independent browser contexts (simulating two devices)
  const browser = await chromium.launch({
    channel: 'chromium',
    proxy: {
      server: process.env.HTTPS_PROXY,
      bypass: 'localhost,127.0.0.1',
    },
  });
  
  const ctxA = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const ctxB = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // User A: Sign up
  await pageA.goto('http://localhost:5173/');
  await pageA.waitForTimeout(2000);
  await pageA.click('text=Don\'t have an account? Sign up');
  await pageA.fill('input[placeholder="Display name"]', 'Alice');
  await pageA.fill('input[type="email"]', emailA);
  await pageA.fill('input[type="password"]', password);
  await pageA.click('button[type="submit"]');
  await pageA.waitForTimeout(3000);
  await pageA.screenshot({ path: '/tmp/ui-alice-home.png' });

  // User A: Create a post
  await pageA.click('.nb-tabbtn:has-text("Post")');
  await pageA.click('.nb-choice-title:has-text("Need a hand")');
  await pageA.waitForTimeout(1000);
  const textareaA = pageA.locator('textarea.nb-textarea').first();
  await textareaA.fill('Need help moving a couch Saturday morning');
  await pageA.screenshot({ path: '/tmp/ui-alice-composer.png' });
  
  // Submit the post (find submit button)
  const submitBtn = pageA.locator('button:has-text("Post")').last();
  await submitBtn.click();
  await pageA.waitForTimeout(3000);
  await pageA.screenshot({ path: '/tmp/ui-alice-feed.png' });

  // User B: Sign up (independent)
  await pageB.goto('http://localhost:5173/');
  await pageB.waitForTimeout(2000);
  await pageB.click('text=Don\'t have an account? Sign up');
  await pageB.fill('input[placeholder="Display name"]', 'Bob');
  await pageB.fill('input[type="email"]', emailB);
  await pageB.fill('input[type="password"]', password);
  await pageB.click('button[type="submit"]');
  await pageB.waitForTimeout(3000);

  // User B: Should see Alice's post in feed
  await pageB.screenshot({ path: '/tmp/ui-bob-feed.png' });
  const alicePost = pageB.locator('text=Need help moving a couch Saturday morning');
  await expect(alicePost).toBeVisible({ timeout: 10000 });

  console.log('✓ Two-account UI test passed: Bob sees Alice\'s post');

  await browser.close();
});
