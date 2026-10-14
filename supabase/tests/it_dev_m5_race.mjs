// M5 race battery — §9.3 of WITHDRAWAL_PROPOSAL.md.
// Parallel two-session RPC races x20 each. Invariants:
//  (i)   a reply is never both cancelled and in posts.helpers
//  (ii)  NP awards per (post, helper) <= 1
//  (iii) a post may be confirmed only with the helper still in helpers
//  (iv)  duplicate parallel cancels produce exactly ONE transition
//        and ONE critical notification
//  (v)   simultaneous cancels of a fully-booked post reopen it
//        exactly once, only when the helpers array truly empties
//
// Account pools: the product's own rate limits (10 posts/hour per
// owner, 20 replies/hour per author — migration 20261012000007)
// mean one owner cannot create 80 posts. Owners/helpers rotate
// round-robin so every account stays well under the caps. This
// works WITH the anti-spam limits, the same way the M3 battery
// used multiple users.

import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8');
const URL_ = env.match(/VITE_SUPABASE_URL=(\S+)/)[1];
const KEY = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(\S+)/)[1];

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

async function api(token, method, path, body, prefer = 'return=representation') {
  const r = await fetch(`${URL_}/rest/v1${path}`, {
    method,
    headers: {
      apikey: KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* no-op */ }
  return { status: r.status, json, text };
}

async function signup(tag) {
  const email = `it.m5race.${Date.now()}.${tag}@example.com`;
  const password = 'M5Race!2026';
  const r = await fetch(`${URL_}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`signup ${tag} failed`);
  const u = { token: j.access_token, id: j.user.id };
  // Posts INSERT policy requires the author's profile town set
  // (handle_new_user leaves it NULL) — same setup as M3/M5.
  await new Promise((res) => setTimeout(res, 300));
  const upd = await api(u.token, 'PATCH', `/profiles?id=eq.${u.id}`,
    { display_name: `IT M5R ${tag}`, town: 'Worth' }, 'return=minimal');
  if (upd.status !== 204) throw new Error(`setup town ${tag} failed: ${upd.status}`);
  return u;
}
const rpc = (token, fn, args) => api(token, 'POST', `/rpc/${fn}`, args);
const stamp = Date.now();

// Pools: 80 posts / 16 owners = 5 each (cap 10/hr);
// hA replies 80 / 8 = 10 each (cap 20/hr); hB 20 / 4 = 5 each.
const owners = [];
for (let k = 0; k < 16; k++) owners.push(await signup(`o${k}`));
const hAs = [];
for (let k = 0; k < 8; k++) hAs.push(await signup(`ha${k}`));
const hBs = [];
for (let k = 0; k < 4; k++) hBs.push(await signup(`hb${k}`));
let oi = 0, ai = 0, bi = 0;
const nextOwner = () => owners[oi++ % owners.length];
const nextHA = () => hAs[ai++ % hAs.length];
const nextHB = () => hBs[bi++ % hBs.length];
console.log(`INFO  race pools ready run=${stamp}`);

async function notifCount(token, type, refId) {
  const r = await api(token, 'GET', `/notifications?type=eq.${type}&ref_id=eq.${refId}&select=id`);
  return Array.isArray(r.json) ? r.json.length : -1;
}
async function makePost(O, helpersNeeded = 1) {
  const r = await api(O.token, 'POST', '/posts', {
    owner_id: O.id,
    title: `M5 race post ${stamp}-${Math.random().toString(36).slice(2, 8)}`,
    details: 'Race battery.', kind: 'help', area: 'Worth', helpers_needed: helpersNeeded,
  });
  if (r.status >= 300 || !r.json?.[0]) throw new Error(`race makePost failed ${r.status}: ${r.text.slice(0, 200)}`);
  return r.json[0];
}
async function volunteer(user, postId) {
  const r = await api(user.token, 'POST', '/replies', { post_id: postId, author_id: user.id, body: 'I can help', kind: 'volunteer' });
  return r.json[0];
}
async function getPost(O, id) {
  const r = await api(O.token, 'GET', `/posts?id=eq.${id}&select=id,stage,helpers,owner_id`);
  return r.json[0];
}
async function replyStatus(O, postId, authorId) {
  const r = await api(O.token, 'GET', `/replies?post_id=eq.${postId}&author_id=eq.${authorId}&select=status&order=created_at.desc&limit=1`);
  return r.json?.[0]?.status;
}

const N = 20;

// ── R1: withdraw vs select (same volunteer) ──
{
  let ok = 0; const failures = [];
  for (let i = 0; i < N; i++) {
    const O = nextOwner(); const A = nextHA();
    const post = await makePost(O, 1);
    await volunteer(A, post.id);
    const [w, s] = await Promise.all([
      rpc(A.token, 'withdraw_offer', { p_post_id: post.id }),
      rpc(O.token, 'select_helpers', { p_post_id: post.id, p_helper_ids: [A.id] }),
    ]);
    const after = await getPost(O, post.id);
    const inHelpers = (after.helpers || []).some(h => h.id === A.id);
    const status = await replyStatus(O, post.id, A.id);
    const withdrawnAndSelected = status === 'withdrawn' && inHelpers;
    const exactlyOneWinner =
      (w.json?.result === 'withdrawn' && !inHelpers && status === 'withdrawn') ||
      (s.status < 300 && inHelpers && status === 'active');
    if (!withdrawnAndSelected && exactlyOneWinner) ok++;
    else failures.push(`iter ${i}: w=${JSON.stringify(w.json)} s=${s.status} helpers=${inHelpers} reply=${status}`);
  }
  check(`R1 withdraw-vs-select x${N}: exactly one winner, never withdrawn+selected`, ok === N, failures[0] || `${ok}/${N}`);
}

// ── R2: cancel vs (transition-to-done + award) ──
{
  let ok = 0; const failures = [];
  for (let i = 0; i < N; i++) {
    const O = nextOwner(); const A = nextHA();
    const post = await makePost(O, 1);
    await volunteer(A, post.id);
    await rpc(O.token, 'select_helpers', { p_post_id: post.id, p_helper_ids: [A.id] });
    await rpc(O.token, 'transition_post', { p_post_id: post.id, p_to_stage: 'booked' });
    await rpc(O.token, 'transition_post', { p_post_id: post.id, p_to_stage: 'started' });
    const ownerFlow = (async () => {
      const t = await rpc(O.token, 'transition_post', { p_post_id: post.id, p_to_stage: 'done' });
      if (t.status >= 400) return { t, a: null };
      const a = await rpc(O.token, 'award_np', {
        p_profile_id: A.id, p_amount: 20, p_reason: 'help_confirmed',
        p_post_id: post.id, p_idempotency_key: `help_confirmed:${post.id}:${A.id}`,
      });
      return { t, a };
    })();
    const [cx, of] = await Promise.all([
      rpc(A.token, 'cancel_participation', { p_post_id: post.id }),
      ownerFlow,
    ]);
    const after = await getPost(O, post.id);
    const inHelpers = (after.helpers || []).some(h => h.id === A.id);
    const status = await replyStatus(O, post.id, A.id);
    const ledger = await api(A.token, 'GET', `/np_ledger?post_id=eq.${post.id}&profile_id=eq.${A.id}&select=id`); // np_ledger RLS is own-ledger-only: read as the awardee
    const awards = Array.isArray(ledger.json) ? ledger.json.length : -1;
    const inv1 = !(status === 'cancelled' && inHelpers);            // (i)
    const inv2 = awards <= 1;                                        // (ii)
    const inv3 = after.stage !== 'confirmed' || inHelpers;           // (iii)
    const consistent =
      (cx.json?.result === 'cancelled' && after.stage === 'open' && !inHelpers && awards === 0) ||
      (cx.status >= 400 && after.stage === 'confirmed' && inHelpers && awards === 1) ||
      (cx.json?.result === 'cancelled' && after.stage === 'done' && !inHelpers && awards === 0); // cancel landed between done and award: award then rejects on membership
    if (inv1 && inv2 && inv3 && consistent) ok++;
    else failures.push(`iter ${i}: cx=${JSON.stringify(cx.json)}/${cx.status} stage=${after.stage} inHelpers=${inHelpers} reply=${status} awards=${awards} awardErr=${of.a ? of.a.status : 'n/a'}`);
  }
  check(`R2 cancel-vs-confirm x${N}: invariants hold, one consistent end-state`, ok === N, failures[0] || `${ok}/${N}`);
}

// ── R3: duplicate cancel (same helper, parallel) ──
{
  let ok = 0; const failures = [];
  for (let i = 0; i < N; i++) {
    const O = nextOwner(); const A = nextHA();
    const post = await makePost(O, 1);
    await volunteer(A, post.id);
    await rpc(O.token, 'select_helpers', { p_post_id: post.id, p_helper_ids: [A.id] });
    await rpc(O.token, 'transition_post', { p_post_id: post.id, p_to_stage: 'booked' });
    const [c1, c2] = await Promise.all([
      rpc(A.token, 'cancel_participation', { p_post_id: post.id }),
      rpc(A.token, 'cancel_participation', { p_post_id: post.id }),
    ]);
    const outcomes = [c1.json?.result, c2.json?.result].sort().join('+');
    const notes = await notifCount(O.token, 'helper_cancelled', post.id);
    const after = await getPost(O, post.id);
    if (outcomes === 'already_cancelled+cancelled' && notes === 1 && after.stage === 'open') ok++;
    else failures.push(`iter ${i}: outcomes=${outcomes} notes=${notes} stage=${after.stage}`);
  }
  check(`R3 duplicate-cancel x${N}: one transition, one notice`, ok === N, failures[0] || `${ok}/${N}`);
}

// ── R4: two helpers cancel simultaneously (multi-helper) ──
{
  let ok = 0; const failures = [];
  for (let i = 0; i < N; i++) {
    const O = nextOwner(); const A = nextHA(); const B = nextHB();
    const post = await makePost(O, 2);
    await volunteer(A, post.id);
    await volunteer(B, post.id);
    await rpc(O.token, 'select_helpers', { p_post_id: post.id, p_helper_ids: [A.id, B.id] });
    await rpc(O.token, 'transition_post', { p_post_id: post.id, p_to_stage: 'booked' });
    const [c1, c2] = await Promise.all([
      rpc(A.token, 'cancel_participation', { p_post_id: post.id }),
      rpc(B.token, 'cancel_participation', { p_post_id: post.id }),
    ]);
    const notes = await notifCount(O.token, 'helper_cancelled', post.id);
    const tr = await api(O.token, 'GET', `/post_transitions?post_id=eq.${post.id}&to_stage=eq.open&select=id`);
    const after = await getPost(O, post.id);
    const bothOk = c1.json?.result === 'cancelled' && c2.json?.result === 'cancelled';
    if (bothOk && notes === 2 && tr.json?.length === 1 && after.stage === 'open' && (after.helpers || []).length === 0) ok++;
    else failures.push(`iter ${i}: c=${c1.json?.result}/${c2.json?.result} notes=${notes} reopens=${tr.json?.length} stage=${after.stage}`);
  }
  check(`R4 simultaneous-cancels x${N}: both land, two notices, one reopen`, ok === N, failures[0] || `${ok}/${N}`);
}

const passed = results.filter(r => r.pass).length;
console.log(`\n===== M5 RACE BATTERY: ${passed}/${results.length} PASS =====`);
process.exit(passed === results.length ? 0 : 1);
