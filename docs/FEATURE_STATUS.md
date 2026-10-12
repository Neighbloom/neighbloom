# Neighbloom — Feature Status

**Last updated:** 2026-10-11 (Milestone 1 baseline, branch `felix/m1-auth-posts`)
**Legend:** ✅ Real · 🟡 Demo-only (works in one browser) · 🔴 Broken/regressed · ⬜ Missing · 🗑️ Dead code

## Help requests

| Feature | Status | Notes |
|---|---|---|
| Create help post | 🟡 | localStorage only. Checkpoint: message-first composer. |
| Draft autosave | 🟡 | localStorage, 7-day TTL. Checkpoint addition. |
| Edit post | 🟡 | Client-side only. |
| Template chips | 🔴 | Founder-rejected. Keyword chips in checkpoint must be removed. |
| Volunteer / Offer help | 🟡 | localStorage only. |
| Select helper(s) | 🟡 | Client-side, no server enforcement. |
| Lifecycle (open→booked→started→done→confirmed) | 🟡 | Client-side stage machine. |
| Confirm +20 NP | 🟡 | Client-side, no idempotency. Self-dealing trivial via user switcher. |
| Per-post area override | 🔴 | Checkpoint removed it (defaults to profile location). Needs decision. |

## Recommendations

| Feature | Status | Notes |
|---|---|---|
| Create rec post | 🟡 | localStorage only. |
| Category selector | 🔴 | Missing from checkpoint render (regression). |
| Preference tags UI | 🔴 | Missing from checkpoint render (regression). State still exists. |
| Public thread replies | 🟡 | localStorage only. |
| Helpful / top pick / hearts | 🟡 | Client-side. |
| Chat after top pick | 🗑️ | Hardcoded `false`, unreachable. Dead path. |
| 25s cooldown, 12/day limit | 🟡 | Client-side flags, bypassable. |

## Communication

| Feature | Status | Notes |
|---|---|---|
| Post-scoped chat | 🟡 | localStorage only. No cross-browser messaging. |
| Chat permissions | 🟡 | Client-side checks only. |
| Shareable post URLs | 🟡 | New in checkpoint (`/p/`). Static only. |

## Identity & trust

| Feature | Status | Notes |
|---|---|---|
| Real auth | ⬜ | No signup/login. Demo switcher only. **Milestone 1.** |
| Profiles | 🟡 | Seeded fake users. |
| NP awards | 🟡 | All client-side, no anti-abuse. |
| Daily check-in | 🟡 | localStorage date check. Clock-change bypassable. |
| Quick Start | 🟡 | Client-side boolean. |
| Availability / LiveBoard | 🟡 | localStorage, 2h expiry. Not visible cross-browser. |
| Following | 🟡 | localStorage graph. |
| Report / block | 🟡 | Local only. No moderation queue. **Milestone 3.** |

## Feed & discovery

| Feature | Status | Notes |
|---|---|---|
| Home feed (help + rec) | 🟡 | localStorage posts + seeds. |
| Type/location filters | 🟡 | Client-side filtering. |
| Saved searches (max 5) | 🟡 | localStorage. |
| Real radius queries | ⬜ | Haversine on town centers, client-side. **Milestone 1 (server).** |

## Demo / dead code (to remove in cleanup pass, NOT Milestone 1)

- Demo user switcher ×2, Reset demo data button, `USERS_SEED`
- Dead `HelpForm` / `RecForm` (~1,000 lines)
- `HELP_TEMPLATES` definition, `fillHelpTemplate()`, `helpExamples`
- `allowChatAfterTopPick` dead gating code

## Missing entirely

Real auth, database, RLS, server-side permissions, moderation queue, push notifications, production error monitoring.

## Test coverage (as of 2026-10-11)

- **20 Vitest unit tests** in `src/utils.test.js` — all passing. Covers: input sanitization (`normalizeText`), link detection (`containsLink`), phone masking (`maskPhones`), NP badge thresholds (`badgeFor`), rec title generation (`buildRecTitle`), relative timestamps (`timeAgo`).
- **10 SQL negative authorization tests** in `supabase/tests/rls_negative_tests.sql` — for manual execution against Supabase after migrations.
- **Manual regression checklist** in `docs/TESTING.md` — to be executed before Supabase cutover.
- **Not yet covered:** UI component tests, E2E browser tests (Playwright planned for Milestone 2).
