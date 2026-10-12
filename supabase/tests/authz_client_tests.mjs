// Client-side authorization tests — run with: node supabase/tests/authz_client_tests.mjs
//
// These test the ACTUAL attack surface: what a malicious user can do
// through the Supabase JS client (PostgREST + Auth API) with only the
// publishable key. This is more valuable than raw SQL tests because it
// verifies the real-world exposure.
//
// Requires: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local
// Creates two test users, runs attacks, cleans up.

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

const supabase = createClient(url, key);
const results = [];

async function test(name, fn, shouldFail = true) {
  try {
    await fn();
    results.push({ name, passed: !shouldFail, note: shouldFail ? 'UNEXPECTED SUCCESS - VULNERABILITY!' : 'ok' });
  } catch (e) {
    results.push({ name, passed: shouldFail, note: shouldFail ? `correctly denied: ${e.message.slice(0, 60)}` : `unexpected failure: ${e.message.slice(0, 60)}` });
  }
}

async function main() {
  console.log('Setting up test users...\n');

  // Create two test users
  const { data: u1, error: e1 } = await supabase.auth.signUp({
    email: `test-a-${Date.now()}@example.com`,
    password: 'TestPass123!',
    options: { data: { display_name: 'Attacker Alice' } }
  });
  if (e1) throw e1;

  const { data: u2, error: e2 } = await supabase.auth.signUp({
    email: `test-b-${Date.now()}@example.com`,
    password: 'TestPass123!',
    options: { data: { display_name: 'Victim Bob' } }
  });
  if (e2) throw e2;

  const alice = createClient(url, key);
  const bob = createClient(url, key);
  await alice.auth.signInWithPassword({ email: u1.user.email, password: 'TestPass123!' });
  await bob.auth.signInWithPassword({ email: u2.user.email, password: 'TestPass123!' });

  const aliceId = u1.user.id;
  const bobId = u2.user.id;

  console.log('Running authorization tests...\n');

  // TEST 1: Alice cannot inflate her own NP via direct update
  await test('T1: Direct NP inflation blocked', async () => {
    const { error } = await alice.from('profiles').update({ np: 999999 }).eq('id', aliceId);
    if (error) throw error;
    // Verify it didn't actually change
    const { data } = await alice.from('profiles').select('np').eq('id', aliceId).single();
    if (data.np === 999999) throw new Error('NP was actually changed!');
  });

  // TEST 2: award_np does not exist (no RPC to exploit)
  await test('T2: award_np function does not exist', async () => {
    const { error } = await alice.rpc('award_np', { target_user_id: aliceId, amount: 1000 });
    if (error && error.message.includes('does not exist')) throw error; // expected
    if (!error) throw new Error('award_np should not exist!');
  });

  // TEST 3: Alice cannot update Bob's profile
  await test('T3: Cross-user profile update blocked', async () => {
    const { error, count } = await alice.from('profiles').update({ display_name: 'Hacked' }).eq('id', bobId);
    if (error) throw error;
    const { data } = await bob.from('profiles').select('display_name').eq('id', bobId).single();
    if (data.display_name === 'Hacked') throw new Error('Bob\'s profile was changed!');
  });

  // TEST 4: Alice cannot delete her profile
  await test('T4: Profile deletion blocked', async () => {
    const { error } = await alice.from('profiles').delete().eq('id', aliceId);
    if (error) throw error;
    const { data } = await alice.from('profiles').select('id').eq('id', aliceId).single();
    if (!data) throw new Error('Profile was actually deleted!');
  });

  // TEST 5: Bob creates a post, Alice cannot edit it
  const { data: bobPost } = await bob.from('posts').insert({
    owner_id: bobId, kind: 'help', title: 'Bob needs help moving'
  }).select().single();

  await test('T5: Cross-user post edit blocked', async () => {
    const { error } = await alice.from('posts').update({ title: 'Hacked by Alice' }).eq('id', bobPost.id);
    if (error) throw error;
    const { data } = await bob.from('posts').select('title').eq('id', bobPost.id).single();
    if (data.title === 'Hacked by Alice') throw new Error('Bob\'s post was changed!');
  });

  // TEST 6: Alice cannot delete Bob's post
  await test('T6: Cross-user post delete blocked', async () => {
    const { error } = await alice.from('posts').delete().eq('id', bobPost.id);
    if (error) throw error;
    const { data } = await bob.from('posts').select('id').eq('id', bobPost.id).single();
    if (!data) throw new Error('Bob\'s post was actually deleted!');
  });

  // TEST 7: Alice cannot create a post with Bob as owner (impersonation)
  await test('T7: Ownership impersonation blocked', async () => {
    const { error } = await alice.from('posts').insert({
      owner_id: bobId, kind: 'help', title: 'Fake post as Bob'
    });
    if (error) throw error;
  });

  // TEST 8: Anonymous user cannot create posts
  const anon = createClient(url, key);
  await test('T8: Anonymous post creation blocked', async () => {
    const { error } = await anon.from('posts').insert({
      owner_id: aliceId, kind: 'help', title: 'Anonymous spam'
    });
    if (error) throw error;
  });

  // TEST 9: Alice CAN update her own display name (legitimate)
  await test('T9: Own profile update allowed', async () => {
    const { error } = await alice.from('profiles').update({ display_name: 'Alice Updated' }).eq('id', aliceId);
    if (error) throw error;
  }, false);

  // TEST 10: Alice CAN create her own post (legitimate)
  await test('T10: Own post creation allowed', async () => {
    const { error } = await alice.from('posts').insert({
      owner_id: aliceId, kind: 'help', title: 'Alice needs help'
    });
    if (error) throw error;
  }, false);

  // TEST 11: Alice cannot modify post stage directly (system field)
  const { data: alicePost } = await alice.from('posts').select('id').eq('owner_id', aliceId).limit(1).single();
  await test('T11: Direct stage modification blocked', async () => {
    const { error } = await alice.from('posts').update({ stage: 'done' }).eq('id', alicePost.id);
    if (error) throw error;
  });

  // TEST 12: Alice cannot modify helpers directly (system field)
  await test('T12: Direct helpers modification blocked', async () => {
    const { error } = await alice.from('posts').update({ helpers: [{ id: 'fake' }] }).eq('id', alicePost.id);
    if (error) throw error;
  });

  // TEST 13: Alice CAN update legitimate post fields
  await test('T13: Legitimate post field update allowed', async () => {
    const { error } = await alice.from('posts').update({ title: 'Updated by Alice' }).eq('id', alicePost.id);
    if (error) throw error;
  }, false);

  // TEST 14: System fields forced to defaults on INSERT
  await test('T14: INSERT system fields forced to defaults', async () => {
    const { data, error } = await alice.from('posts').insert({
      owner_id: aliceId, kind: 'help', title: 'Test defaults',
      stage: 'done', status: 'done', helpers: [{ id: 'fake' }]
    }).select('stage, status, helpers').single();
    if (error) throw error;
    if (data.stage !== 'open') throw new Error(`stage was ${data.stage}, expected open`);
    if (data.status !== 'open') throw new Error(`status was ${data.status}, expected open`);
    if (JSON.stringify(data.helpers) !== '[]') throw new Error(`helpers was modified!`);
  }, false);

  // Cleanup
  console.log('\nCleaning up...');
  await alice.from('posts').delete().eq('owner_id', aliceId);
  await bob.from('posts').delete().eq('owner_id', bobId);

  // Print results
  console.log('\n=== RESULTS ===\n');
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    console.log(`${icon} ${r.name}: ${r.note}`);
    if (!r.passed) allPassed = false;
  }
  console.log(`\n${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED - REVIEW ABOVE'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
