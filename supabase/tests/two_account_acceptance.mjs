// Milestone 1 Acceptance Test: Two independent accounts, shared posts.
// Run with: node supabase/tests/two_account_acceptance.mjs
//
// Verifies:
// 1. User A creates a post → persisted to Supabase
// 2. User B (independent session) sees User A's post
// 3. User B creates a post → User A sees it
// 4. Ownership restrictions enforced

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '../../.env.local'), 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.+)/)?.[1]?.trim();

const timestamp = Date.now();
const results = [];

function check(name, condition, detail = '') {
  const passed = !!condition;
  results.push({ name, passed, detail });
  console.log(`${passed ? '✓' : '✗'} ${name}${detail ? `: ${detail}` : ''}`);
  return passed;
}

async function main() {
  console.log('=== Milestone 1 Acceptance Test ===\n');

  // Setup: two independent clients (simulating two browsers)
  const clientA = createClient(url, key);
  const clientB = createClient(url, key);

  console.log('Creating User A...');
  const { data: uA, error: eA } = await clientA.auth.signUp({
    email: `m1-alice-${timestamp}@gmail.com`,
    password: 'TestPass123!',
    options: { data: { display_name: 'Alice' } }
  });
  if (eA) throw new Error(`User A signup failed: ${eA.message}`);

  console.log('Creating User B...');
  const { data: uB, error: eB } = await clientB.auth.signUp({
    email: `m1-bob-${timestamp}@gmail.com`,
    password: 'TestPass123!',
    options: { data: { display_name: 'Bob' } }
  });
  if (eB) throw new Error(`User B signup failed: ${eB.message}`);

  // Sign in both (separate sessions)
  await clientA.auth.signInWithPassword({ email: uA.user.email, password: 'TestPass123!' });
  await clientB.auth.signInWithPassword({ email: uB.user.email, password: 'TestPass123!' });

  const aliceId = uA.user.id;
  const bobId = uB.user.id;
  console.log(`\nUser A (Alice): ${aliceId.slice(0, 8)}...`);
  console.log(`User B (Bob): ${bobId.slice(0, 8)}...\n`);

  // TEST 1: Alice creates a help post
  console.log('--- Test 1: Alice creates a post ---');
  const { data: postA, error: errA } = await clientA.from('posts').insert({
    owner_id: aliceId,
    kind: 'help',
    title: 'Need help moving a couch',
    details: 'Saturday morning, elevator building',
    area: 'Worth',
    helpers_needed: 2,
  }).select().single();
  
  check('Alice creates post', !errA && postA?.id, errA?.message || `ID: ${postA?.id?.slice(0, 8)}`);
  check('System fields defaulted', postA?.stage === 'open' && postA?.status === 'open', 
    `stage=${postA?.stage}, status=${postA?.status}`);

  // TEST 2: Bob sees Alice's post (independent session)
  console.log('\n--- Test 2: Bob sees Alice\'s post ---');
  const { data: bobFeed, error: errFeed } = await clientB
    .from('posts')
    .select('*, owner:profiles!posts_owner_id_fkey(display_name)')
    .order('created_at', { ascending: false });
  
  const alicePostVisible = bobFeed?.some(p => p.id === postA.id);
  check('Bob sees Alice\'s post', !errFeed && alicePostVisible, 
    errFeed?.message || `Found ${bobFeed?.length} posts, Alice's visible: ${alicePostVisible}`);
  check('Owner info included', bobFeed?.find(p => p.id === postA.id)?.owner?.display_name === 'Alice');

  // TEST 3: Bob creates a post, Alice sees it
  console.log('\n--- Test 3: Bob creates a post, Alice sees it ---');
  const { data: postB, error: errB } = await clientB.from('posts').insert({
    owner_id: bobId,
    kind: 'rec',
    title: 'Need a plumber in Worth',
    category: 'Plumber',
    area: 'Worth',
  }).select().single();
  
  check('Bob creates post', !errB && postB?.id, errB?.message || `ID: ${postB?.id?.slice(0, 8)}`);

  const { data: aliceFeed } = await clientA
    .from('posts')
    .select('id')
    .order('created_at', { ascending: false });
  
  const bobPostVisible = aliceFeed?.some(p => p.id === postB.id);
  check('Alice sees Bob\'s post', bobPostVisible);

  // TEST 4: Ownership enforced (Bob cannot edit Alice's post)
  console.log('\n--- Test 4: Ownership restrictions ---');
  await clientB.from('posts').update({ title: 'Hacked' }).eq('id', postA.id);
  const { data: verifyA } = await clientA.from('posts').select('title').eq('id', postA.id).single();
  check('Bob cannot edit Alice\'s post', verifyA?.title !== 'Hacked', `Title: "${verifyA?.title}"`);

  // TEST 5: Alice can edit her own post
  const { error: errEdit } = await clientA.from('posts').update({ title: 'Need help moving a couch (updated)' }).eq('id', postA.id);
  const { data: verifyEdit } = await clientA.from('posts').select('title').eq('id', postA.id).single();
  check('Alice can edit own post', !errEdit && verifyEdit?.title?.includes('updated'));

  // TEST 6: Alice can delete her own post
  const { error: errDel } = await clientA.from('posts').delete().eq('id', postA.id);
  const { data: verifyDel } = await clientA.from('posts').select('id').eq('id', postA.id).maybeSingle();
  check('Alice can delete own post', !errDel && !verifyDel);

  // Cleanup Bob's post
  await clientB.from('posts').delete().eq('id', postB.id);

  // Summary
  console.log('\n=== SUMMARY ===');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n🎉 MILESTONE 1 ACCEPTANCE: PASSED');
    console.log('Two independent accounts can create and view shared persistent posts.');
  } else {
    console.log('\n❌ MILESTONE 1 ACCEPTANCE: FAILED');
    process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
