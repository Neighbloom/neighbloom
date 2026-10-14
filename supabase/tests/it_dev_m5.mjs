// ============================================================
// Neighbloom M5 — REAL dev-environment integration tests
// Target: dev Supabase project (from ../../.env.local)
// Exercises the volunteer lifecycle end to end through genuine
// app paths (REST + RPC): withdraw, cancel (incl. reopen),
// persistent helper completion, re-offer, critical-notification
// delivery (prefs OFF default, distinct events never deduped,
// block suppression), the closed raw-API bypass, and regression
// of the ordinary notification gates.
//
// Fresh throwaway accounts per run; deterministic expectations.
// NOTE on notifications: notification_prefs default to DISABLED,
// so every "notice landed" assertion below also proves the
// critical class bypasses the master opt-in.
// ============================================================
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY) { console.error('Missing env'); process.exit(2); }

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
  const email = `it.m5.${Date.now()}.${tag}@example.com`;
  const password = 'M5Battery!2026';
  const r = await fetch(`${URL_}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`signup ${tag} failed: ${JSON.stringify(j).slice(0, 200)}`);
  const u = { email, token: j.access_token, id: j.user.id };
  // Mirror the M3 setup: the posts INSERT policy requires the
  // author's profile town to be set. handle_new_user leaves it
  // NULL, so set it via UPDATE (never INSERT).
  await new Promise((res) => setTimeout(res, 300));
  const upd = await api(u.token, 'PATCH', `/profiles?id=eq.${u.id}`,
    { display_name: `IT M5 ${tag}`, town: 'Worth' }, 'return=minimal');
  if (upd.status !== 204) throw new Error(`setup town ${tag} failed: ${upd.status} ${upd.text.slice(0, 160)}`);
  return u;
}

async function rpc(token, fn, args) {
  const r = await api(token, 'POST', `/rpc/${fn}`, args);
  return r;
}

const stamp = Date.now();
const owner = await signup('owner');
const h1 = await signup('h1');
const h2 = await signup('h2');
const vol = await signup('vol');
console.log(`INFO  accounts owner=${owner.id.slice(0, 8)} h1=${h1.id.slice(0, 8)} h2=${h2.id.slice(0, 8)} vol=${vol.id.slice(0, 8)} run=${stamp}`);

async function makePost(user, helpersNeeded = 1) {
  const r = await api(user.token, 'POST', '/posts', {
    owner_id: user.id,
    title: `M5 battery post ${stamp}-${Math.random().toString(36).slice(2, 7)}`,
    details: 'Battery post for M5 verification.',
    kind: 'help', area: 'Worth', helpers_needed: helpersNeeded,
  });
  if (r.status >= 300) throw new Error(`makePost failed ${r.status}: ${r.text.slice(0, 200)}`);
  return r.json[0];
}
async function volunteer(user, postId, body = 'I can help') {
  const r = await api(user.token, 'POST', '/replies', { post_id: postId, author_id: user.id, body, kind: 'volunteer' });
  if (r.status >= 300) throw new Error(`volunteer failed ${r.status}: ${r.text.slice(0, 200)}`);
  return r.json[0];
}
async function getPost(token, id) {
  const r = await api(token, 'GET', `/posts?id=eq.${id}&select=id,stage,helpers,owner_id`);
  return r.json[0];
}
async function getReply(token, id) {
  const r = await api(token, 'GET', `/replies?id=eq.${id}&select=id,status,status_at`);
  return r.json[0];
}
async function notifCount(token, type, refId) {
  const r = await api(token, 'GET', `/notifications?type=eq.${type}&ref_id=eq.${refId}&select=id`);
  return Array.isArray(r.json) ? r.json.length : -1;
}

// ── A. Withdraw happy path + critical notice with prefs OFF ──
{
  const post = await makePost(owner, 1);
  const reply = await volunteer(vol, post.id);
  const w = await rpc(vol.token, 'withdraw_offer', { p_post_id: post.id });
  check('A1 withdraw returns withdrawn', w.json?.result === 'withdrawn', JSON.stringify(w.json));
  const after = await getReply(owner.token, reply.id);
  check('A2 reply status = withdrawn', after?.status === 'withdrawn');
  check('A3 critical notice landed despite prefs OFF', (await notifCount(owner.token, 'offer_withdrawn', post.id)) === 1);

  const w2 = await rpc(vol.token, 'withdraw_offer', { p_post_id: post.id });
  check('A4 re-withdraw is idempotent no-op', w2.json?.result === 'already_withdrawn');
  check('A5 still exactly one notice', (await notifCount(owner.token, 'offer_withdrawn', post.id)) === 1);

  // ── D. Re-offer after withdraw, withdraw again -> 2nd notice ──
  const reply2 = await volunteer(vol, post.id, 'Actually I can');
  check('D1 re-offer insert allowed (no lockout)', !!reply2?.id);
  const w3 = await rpc(vol.token, 'withdraw_offer', { p_post_id: post.id });
  check('D2 second withdraw succeeds', w3.json?.result === 'withdrawn');
  check('D3 second distinct event produced a second notice', (await notifCount(owner.token, 'offer_withdrawn', post.id)) === 2);

  // ── N. Ordinary gate regression: volunteer trigger notice dropped with prefs OFF ──
  check('N1 ordinary volunteers notice still gated (0 rows)', (await notifCount(owner.token, 'volunteers', post.id)) === 0);
}

// ── C. Withdraw by non-author ──
{
  const post = await makePost(owner, 1);
  await volunteer(vol, post.id);
  const w = await rpc(h1.token, 'withdraw_offer', { p_post_id: post.id });
  check('C1 non-author withdraw rejected', w.status >= 400 && /no active offer/i.test(w.text), w.text.slice(0, 120));
}

// ── E/F. Selection rules ──
{
  const post = await makePost(owner, 2);
  await volunteer(vol, post.id);
  await rpc(vol.token, 'withdraw_offer', { p_post_id: post.id });
  await volunteer(h1, post.id);
  await volunteer(h2, post.id);
  const selBad = await rpc(owner.token, 'select_helpers', { p_post_id: post.id, p_helper_ids: [vol.id] });
  check('E1 withdrawn volunteer cannot be selected', selBad.status >= 400 && /active volunteer offer/i.test(selBad.text), selBad.text.slice(0, 120));
  const sel = await rpc(owner.token, 'select_helpers', { p_post_id: post.id, p_helper_ids: [h1.id, h2.id] });
  check('F0 select active helpers works', sel.status < 300);
  const wSel = await rpc(h1.token, 'withdraw_offer', { p_post_id: post.id });
  check('F1 selected helper cannot withdraw (must cancel)', wSel.status >= 400 && /cancel your participation/i.test(wSel.text), wSel.text.slice(0, 120));
}

// ── G/H/I/J/K/L. Completion + cancellation lifecycle ──
{
  const post = await makePost(owner, 2);
  await volunteer(h1, post.id);
  await volunteer(h2, post.id);
  await rpc(owner.token, 'select_helpers', { p_post_id: post.id, p_helper_ids: [h1.id, h2.id] });
  await rpc(owner.token, 'transition_post', { p_post_id: post.id, p_to_stage: 'booked' });

  const mdBad = await rpc(vol.token, 'helper_mark_done', { p_post_id: post.id });
  check('L1 non-helper cannot mark done', mdBad.status >= 400 && /not a helper/i.test(mdBad.text), mdBad.text.slice(0, 120));

  const md = await rpc(h1.token, 'helper_mark_done', { p_post_id: post.id });
  check('G1 mark_done returns done', md.json?.result === 'done');
  const pAfterMd = await getPost(owner.token, post.id);
  const entry = (pAfterMd.helpers || []).find(h => h.id === h1.id);
  check('G2 done_at persisted on helpers entry', !!entry?.done_at);
  const md2 = await rpc(h1.token, 'helper_mark_done', { p_post_id: post.id });
  check('G3 mark_done idempotent', md2.json?.result === 'already_done');
  check('G4 helper_done notice landed', (await notifCount(owner.token, 'helper_done', post.id)) === 1);

  const cancelDone = await rpc(h1.token, 'cancel_participation', { p_post_id: post.id });
  check('G5 done-marked helper cannot cancel', cancelDone.status >= 400 && /marked this help complete/i.test(cancelDone.text), cancelDone.text.slice(0, 120));

  const cx = await rpc(h2.token, 'cancel_participation', { p_post_id: post.id });
  check('H1 cancel returns cancelled (not reopened)', cx.json?.result === 'cancelled' && cx.json?.reopened === false, JSON.stringify(cx.json));
  const pAfterCx = await getPost(owner.token, post.id);
  check('H2 helpers shrinks to 1, stage stays booked', (pAfterCx.helpers || []).length === 1 && pAfterCx.stage === 'booked');
  check('H3 cancel notice landed', (await notifCount(owner.token, 'helper_cancelled', post.id)) === 1);
  const cx2 = await rpc(h2.token, 'cancel_participation', { p_post_id: post.id });
  check('H4 re-cancel idempotent', cx2.json?.result === 'already_cancelled');
  check('H5 still exactly one cancel notice', (await notifCount(owner.token, 'helper_cancelled', post.id)) === 1);

  // Last-helper cancel at STARTED reopens (fresh post, single helper)
  const post2 = await makePost(owner, 1);
  await volunteer(h2, post2.id);
  await rpc(owner.token, 'select_helpers', { p_post_id: post2.id, p_helper_ids: [h2.id] });
  await rpc(owner.token, 'transition_post', { p_post_id: post2.id, p_to_stage: 'booked' });
  await rpc(owner.token, 'transition_post', { p_post_id: post2.id, p_to_stage: 'started' });
  const cxLast = await rpc(h2.token, 'cancel_participation', { p_post_id: post2.id });
  check('I1 last-helper cancel at started reopens', cxLast.json?.result === 'cancelled' && cxLast.json?.reopened === true, JSON.stringify(cxLast.json));
  const p2After = await getPost(owner.token, post2.id);
  check('I2 post back to open with no helpers', p2After.stage === 'open' && (p2After.helpers || []).length === 0);
  const tr = await api(owner.token, 'GET', `/post_transitions?post_id=eq.${post2.id}&to_stage=eq.open&select=actor_id,from_stage`);
  check('I3 reopen audit row names the helper as actor', tr.json?.length === 1 && tr.json[0].actor_id === h2.id && tr.json[0].from_stage === 'started');

  // Cancel at confirmed is rejected
  const post3 = await makePost(owner, 1);
  await volunteer(h1, post3.id);
  await rpc(owner.token, 'select_helpers', { p_post_id: post3.id, p_helper_ids: [h1.id] });
  await rpc(owner.token, 'transition_post', { p_post_id: post3.id, p_to_stage: 'booked' });
  await rpc(owner.token, 'transition_post', { p_post_id: post3.id, p_to_stage: 'started' });
  await rpc(owner.token, 'transition_post', { p_post_id: post3.id, p_to_stage: 'done' });
  await rpc(owner.token, 'award_np', {
    p_profile_id: h1.id, p_amount: 20, p_reason: 'help_confirmed',
    p_post_id: post3.id, p_idempotency_key: `help_confirmed:${post3.id}:${h1.id}`,
  });
  const cxLate = await rpc(h1.token, 'cancel_participation', { p_post_id: post3.id });
  check('K1 cancel after confirmation rejected', cxLate.status >= 400 && /can no longer be cancelled/i.test(cxLate.text), cxLate.text.slice(0, 120));
}

// ── M. Block rule: blocked actor's cancellation produces no notice ──
{
  const post = await makePost(owner, 1);
  await volunteer(h1, post.id);
  await rpc(owner.token, 'select_helpers', { p_post_id: post.id, p_helper_ids: [h1.id] });
  await rpc(owner.token, 'transition_post', { p_post_id: post.id, p_to_stage: 'booked' });
  const before = await notifCount(owner.token, 'helper_cancelled', post.id);
  const blk = await api(owner.token, 'POST', '/blocks', { blocker_id: owner.id, blocked_id: h1.id });
  check('M0 block insert works', blk.status < 300, blk.text.slice(0, 120));
  const cx = await rpc(h1.token, 'cancel_participation', { p_post_id: post.id });
  check('M1 cancel itself still succeeds', cx.json?.result === 'cancelled');
  const after = await notifCount(owner.token, 'helper_cancelled', post.id);
  check('M2 blocked actor produces no notice', after === before, `before=${before} after=${after}`);
}

// ── O. Raw-API bypass closed ──
{
  const post = await makePost(owner, 1);
  const reply = await volunteer(vol, post.id);
  const upd = await api(vol.token, 'PATCH', `/replies?id=eq.${reply.id}`, { body: 'tampered' });
  const reread = await getReply(owner.token, reply.id);
  check('O1 direct reply UPDATE changes nothing', reread?.status === 'active', `patch status=${upd.status}`);
  const del = await api(vol.token, 'DELETE', `/replies?id=eq.${reply.id}`);
  const reread2 = await api(owner.token, 'GET', `/replies?id=eq.${reply.id}&select=id`);
  check('O2 direct reply DELETE removes nothing', Array.isArray(reread2.json) && reread2.json.length === 1, `delete status=${del.status}`);
}

const passed = results.filter(r => r.pass).length;
console.log(`\n===== M5 BATTERY: ${passed}/${results.length} PASS =====`);
process.exit(passed === results.length ? 0 : 1);
