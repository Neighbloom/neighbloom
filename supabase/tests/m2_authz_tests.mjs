// M2 authorization tests — run with: node supabase/tests/m2_authz_tests.mjs
//
// Tests the Milestone 2 backend: lifecycle transitions, helper selection,
// private messaging, and NP awards. Verifies that:
//   - Only owners can transition/select/confirm
//   - Invalid state transitions are rejected
//   - Private messages are truly private (third party cannot read)
//   - NP awards are exactly-once (idempotent)
//   - Direct manipulation of system fields is still blocked
//
// Requires: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local
// Requires: M2 migrations applied (20261012000001 through 20261012000004)
// Requires: "Confirm email" DISABLED in Supabase Dashboard

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../../.env.local');

let url, key;
try {
  const env = readFileSync(envPath, 'utf8');
  url = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
  key = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.+)/)?.[1]?.trim();
} catch {
  console.error('Missing .env.local with Supabase credentials');
  process.exit(1);
}

const results = [];
let passCount = 0;
let failCount = 0;

function record(name, passed, note = '') {
  results.push({ name, passed, note });
  if (passed) passCount++; else failCount++;
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
}

// Expects the fn to THROW (attack should fail)
async function expectDenied(name, fn) {
  try {
    await fn();
    record(name, false, 'UNEXPECTED SUCCESS — VULNERABILITY');
  } catch (e) {
    record(name, true, `denied: ${e.message.slice(0, 70)}`);
  }
}

// Expects the fn to SUCCEED (legitimate operation)
async function expectAllowed(name, fn) {
  try {
    const result = await fn();
    record(name, true, 'ok');
    return result;
  } catch (e) {
    record(name, false, `unexpected failure: ${e.message.slice(0, 80)}`);
    return null;
  }
}

async function main() {
  console.log('\n=== M2 Authorization Tests ===\n');
  const timestamp = Date.now();

  // Create three test users: owner (requester), helper (volunteer), outsider
  const mkUser = async (label, displayName) => {
    const sb = createClient(url, key);
    const { data, error } = await sb.auth.signUp({
      email: `nb-m2-${label}-${timestamp}@gmail.com`,
      password: 'TestPass123!',
      options: { data: { display_name: displayName } }
    });
    if (error) throw new Error(`Signup failed for ${label}: ${error.message}`);
    // Wait for profile trigger
    await new Promise(r => setTimeout(r, 2000));
    return sb;
  };

  console.log('Creating test users...');
  const owner = await mkUser('owner', 'M2 Owner');
  const helper = await mkUser('helper', 'M2 Helper');
  const outsider = await mkUser('outsider', 'M2 Outsider');

  const ownerId = (await owner.auth.getUser()).data.user.id;
  const helperId = (await helper.auth.getUser()).data.user.id;
  const outsiderId = (await outsider.auth.getUser()).data.user.id;

  // Owner creates a help post
  console.log('Setting up test post...');
  const { data: post, error: postErr } = await owner
    .from('posts')
    .insert({ owner_id: ownerId, kind: 'help', title: 'M2 Test: Need help moving', details: 'Test post', helpers_needed: 2 })
    .select().single();
  if (postErr) throw new Error(`Post creation failed: ${postErr.message}`);
  const postId = post.id;

  // Helper volunteers
  const { error: replyErr } = await helper
    .from('replies')
    .insert({ post_id: postId, author_id: helperId, body: 'I can help!', kind: 'volunteer' });
  if (replyErr) throw new Error(`Volunteer reply failed: ${replyErr.message}`);

  console.log('\n--- Lifecycle Tests ---');

  // 1. Outsider cannot transition owner's post
  await expectDenied('Outsider cannot transition post', async () => {
    const { error } = await outsider.rpc('transition_post', { p_post_id: postId, p_to_stage: 'booked' });
    if (error) throw error;
  });

  // 2. Owner cannot skip stages (open -> started is invalid)
  await expectDenied('Owner cannot skip open->started', async () => {
    const { error } = await owner.rpc('transition_post', { p_post_id: postId, p_to_stage: 'started' });
    if (error) throw error;
  });

  // 3. Owner cannot book without selecting helpers
  await expectDenied('Cannot book without helpers selected', async () => {
    const { error } = await owner.rpc('transition_post', { p_post_id: postId, p_to_stage: 'booked' });
    if (error) throw error;
  });

  // 4. Outsider cannot select helpers
  await expectDenied('Outsider cannot select helpers', async () => {
    const { error } = await outsider.rpc('select_helpers', { p_post_id: postId, p_helper_ids: [helperId] });
    if (error) throw error;
  });

  // 5. Owner cannot select someone who didn't volunteer
  await expectDenied('Cannot select non-volunteer', async () => {
    const { error } = await owner.rpc('select_helpers', { p_post_id: postId, p_helper_ids: [outsiderId] });
    if (error) throw error;
  });

  // 6. Owner CAN select the volunteer (legitimate)
  await expectAllowed('Owner selects volunteer', async () => {
    const { error } = await owner.rpc('select_helpers', { p_post_id: postId, p_helper_ids: [helperId] });
    if (error) throw error;
  });

  // 7. Owner CAN now book (legitimate)
  await expectAllowed('Owner books post', async () => {
    const { error } = await owner.rpc('transition_post', { p_post_id: postId, p_to_stage: 'booked' });
    if (error) throw error;
  });

  // 8. Direct stage manipulation still blocked
  await expectDenied('Direct stage UPDATE still blocked', async () => {
    const { error } = await owner.from('posts').update({ stage: 'done' }).eq('id', postId);
    if (error) throw error;
    // Verify no rows changed (RLS may return success with 0 rows)
    const { data } = await owner.from('posts').select('stage').eq('id', postId).single();
    if (data.stage === 'done') throw new Error('Stage was actually changed!');
  });

  console.log('\n--- Messaging Tests ---');

  // 9. Owner creates conversation with selected helper
  const conv = await expectAllowed('Owner creates conversation', async () => {
    const { data, error } = await owner.rpc('create_conversation', { p_post_id: postId, p_helper_id: helperId });
    if (error) throw error;
    return data;
  });

  // 10. Outsider cannot read the conversation
  await expectDenied('Outsider cannot read conversation', async () => {
    const { data, error } = await outsider.from('conversations').select('*').eq('id', conv.id);
    if (error) throw error;
    if (data && data.length > 0) throw new Error('Outsider could read private conversation!');
  });

  // 11. Outsider cannot send messages to the conversation
  await expectDenied('Outsider cannot send messages', async () => {
    const { error } = await outsider.from('messages').insert({
      conversation_id: conv.id, sender_id: outsiderId, body: 'Hacked!'
    });
    if (error) throw error;
  });

  // 12. Helper CAN read and send (legitimate)
  await expectAllowed('Helper reads conversation', async () => {
    const { data, error } = await helper.from('conversations').select('*').eq('id', conv.id);
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Helper cannot read own conversation');
  });

  await expectAllowed('Helper sends message', async () => {
    const { error } = await helper.from('messages').insert({
      conversation_id: conv.id, sender_id: helperId, body: 'I can come Saturday!'
    });
    if (error) throw error;
  });

  // 13. Outsider cannot create conversation for someone else's post
  await expectDenied('Outsider cannot create conversation', async () => {
    const { error } = await outsider.rpc('create_conversation', { p_post_id: postId, p_helper_id: outsiderId });
    if (error) throw error;
  });

  console.log('\n--- NP Award Tests ---');

  // Advance to done so we can test confirmation
  await owner.rpc('transition_post', { p_post_id: postId, p_to_stage: 'started' });
  await owner.rpc('transition_post', { p_post_id: postId, p_to_stage: 'done' });

  // 14. Outsider cannot award NP via confirmation
  await expectDenied('Outsider cannot confirm/award', async () => {
    const { error } = await outsider.rpc('award_np', {
      p_profile_id: helperId, p_amount: 20, p_reason: 'help_confirmed',
      p_post_id: postId, p_idempotency_key: `test:${timestamp}:outsider`
    });
    if (error) throw error;
  });

  // 15. Owner CAN confirm and award (legitimate)
  const awardKey = `help_confirmed:${postId}:${helperId}:${timestamp}`;
  const award1 = await expectAllowed('Owner confirms and awards +20 NP', async () => {
    const { data, error } = await owner.rpc('award_np', {
      p_profile_id: helperId, p_amount: 20, p_reason: 'help_confirmed',
      p_post_id: postId, p_idempotency_key: awardKey
    });
    if (error) throw error;
    return data;
  });

  // 16. Duplicate award with same key is idempotent (no double-award)
  await expectAllowed('Duplicate award is idempotent', async () => {
    const { data, error } = await owner.rpc('award_np', {
      p_profile_id: helperId, p_amount: 20, p_reason: 'help_confirmed',
      p_post_id: postId, p_idempotency_key: awardKey
    });
    if (error) throw error;
    // Should return the SAME ledger entry, not a new one
    if (data.id !== award1.id) throw new Error('Duplicate created a new ledger entry!');
  });

  // 17. Verify helper NP increased by exactly 20 (not 40)
  await expectAllowed('Helper NP increased by exactly 20', async () => {
    const { data, error } = await helper.from('profiles').select('np').eq('id', helperId).single();
    if (error) throw error;
    if (data.np !== 20) throw new Error(`Expected NP=20, got ${data.np}`);
  });

  // 18. Direct NP manipulation still blocked
  await expectDenied('Direct NP UPDATE still blocked', async () => {
    const { error } = await helper.from('profiles').update({ np: 99999 }).eq('id', helperId);
    if (error) throw error;
    const { data } = await helper.from('profiles').select('np').eq('id', helperId).single();
    if (data.np === 99999) throw new Error('NP was actually changed!');
  });

  // 19. Cannot award wrong amount for help_confirmed
  await expectDenied('Cannot award wrong amount', async () => {
    const { error } = await owner.rpc('award_np', {
      p_profile_id: helperId, p_amount: 100, p_reason: 'help_confirmed',
      p_post_id: postId, p_idempotency_key: `test:${timestamp}:wrongamt`
    });
    if (error) throw error;
  });

  // 20. Cannot check in for another user
  await expectDenied('Cannot check in for another user', async () => {
    const { error } = await owner.rpc('award_np', {
      p_profile_id: helperId, p_amount: 5, p_reason: 'daily_checkin',
      p_idempotency_key: `test:${timestamp}:fakecheckin`
    });
    if (error) throw error;
  });

  // Cleanup
  console.log('\nCleaning up...');
  await owner.from('posts').delete().eq('id', postId);
  // Note: Auth users cannot be deleted via client; they remain as test artifacts.

  console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Test harness failed:', e.message);
  process.exit(1);
});
