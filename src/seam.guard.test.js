// Seam guard (added 2026-10-13, P0 seam fix).
//
// The product's worst recurring defect class: a function resolves a
// post from the LOCAL demo list (`posts`) instead of the merged feed
// (`displayPosts`). For authenticated users the two lists are
// disjoint, so the lookup silently fails on every real post — the
// tap does nothing and nobody sees an error. Three production fixes
// in Oct 2026 (replies, selection, transitions) and the helper-side
// seam were all this one mistake.
//
// Rule: a bare `posts.find(` / `posts.filter(` is allowed ONLY as
// (a) the fallback half of the established pattern
//     `displayPosts.find(...) || posts.find(...)`, or
// (b) inside a function on the allowlist below, where the local list
//     is the correct source (demo data or local bookkeeping that
//     never presents itself as server truth).
// Any new bare site fails this suite. Fix the lookup, or add the
// function here WITH its reason.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'App.jsx'), 'utf8');
const lines = src.split('\n');

const ALLOWLIST = {
  cancelOffer:
    'audience lookup for a LOCAL activity breadcrumb; server offers are gated at the top of the function',
  sendChatMessage:
    'local/demo chat writer; server conversations send via m2SendMessage before this is reachable',
  markHelpful:
    'demo-only rec moderation; its buttons no longer render on server posts',
  setTopPick:
    'demo-only rec moderation; its buttons no longer render on server posts',
  setHelperStatus:
    'demo-only helper status; server helpers record completion via helper_mark_done (M5)',
  awardHelpers:
    'the bare lookups sit in the demo fallback branch (after the server branch returns) and feed local breadcrumbs',
  RecCommentModal:
    'demo-only modal; its opener (RecThreadModal) no longer renders for server posts',
  RecThreadModal:
    'demo-only modal; its opener is gated to non-server posts',
  CompletionPhotoForm:
    'demo-only form; the completion modal renders it only for non-server posts',
};

function enclosingFunction(idx) {
  for (let j = idx; j >= Math.max(0, idx - 400); j--) {
    const m = lines[j].match(/function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (m) return m[1];
  }
  return '(top level)';
}

function bareSites() {
  const out = [];
  // Multi-line evasion: `posts` at end of line, `.find(` / `.filter(`
  // starting the next — normalize by joining those pairs first.
  const joined = [];
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1] || '';
    if (/\bposts\s*$/.test(lines[i]) && /^\s*\.(find|filter)\(/.test(next)) {
      joined.push({ text: lines[i] + next.trim(), line: i + 1 });
      i++;
    } else {
      joined.push({ text: lines[i], line: i + 1 });
    }
  }
  joined.forEach(({ text: line, line: lineNo }) => {
    if (!/posts\.(find|filter)\(/.test(line)) return;
    if (line.includes('|| posts.')) return; // same-line fallback pattern
    if (line.includes('|| displayPosts.')) return; // reversed fallback order
    // multi-line fallback pattern: previous non-empty line ends with ||
    let k = lineNo - 2;
    while (k >= 0 && lines[k].trim() === '') k--;
    if (k >= 0 && lines[k].trimEnd().endsWith('||')) return;
    out.push({ line: lineNo, fn: enclosingFunction(lineNo - 1), text: line.trim().slice(0, 80) });
  });
  return out;
}

describe('seam guard: no bare local-list lookups outside the allowlist', () => {
  it('every bare posts.find/filter site is in an allowlisted function', () => {
    const offenders = bareSites().filter((s) => !(s.fn in ALLOWLIST));
    expect(
      offenders,
      `Bare local-list lookups found outside the allowlist:\n` +
        offenders.map((o) => `  line ${o.line} in ${o.fn}: ${o.text}`).join('\n') +
        `\nResolve from displayPosts (merged feed) instead, or allowlist with a reason in seam.guard.test.js.`
    ).toEqual([]);
  });

  it('the merged-feed pattern is in use (guard is not vacuous)', () => {
    const patternUses = lines.filter((l) => l.includes('displayPosts.find(')).length;
    expect(patternUses).toBeGreaterThan(5);
  });
});

// M5 guard (added 2026-10-13 with the M5 client): the withdrawal
// dead-end the seam era shipped ("isn't available yet") must never
// come back, and the three lifecycle RPCs must stay wired — a
// refactor that drops one silently re-opens the launch-mandatory
// gap the founder called out.
describe('M5 guard: lifecycle RPCs stay wired, dead-end copy stays gone', () => {
  it('App.jsx calls all three M5 lifecycle wrappers', () => {
    for (const fn of ['m2WithdrawOffer(', 'm2CancelParticipation(', 'm2HelperMarkDone(']) {
      expect(src.includes(fn), `missing call: ${fn}`).toBe(true);
    }
  });

  it('the pre-M5 withdrawal dead-end copy is absent', () => {
    expect(src.includes('isn’t available yet')).toBe(false);
    expect(src.includes('helperDoneNotified')).toBe(false);
  });
});
