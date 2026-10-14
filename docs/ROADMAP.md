# Neighbloom — Roadmap

**Last updated:** 2026-10-12

## Milestone 1 — Auth + shared posts (COMPLETE)

Branch: `felix/m1-auth-posts`. Real Supabase Auth, profiles/posts/replies with RLS, shared feed, post creation/edit/delete, real identity mapping, atomic creation, logout. 14/14 authz tests, 9/9 acceptance tests, 20/20 Vitest.

## Milestone 2 — Real neighbor-help interactions (COMPLETE — backend + UI)

Helper volunteering (persisted), requester selection via `select_helpers()` RPC, private messaging (conversations + messages tables, participant-only RLS, realtime), lifecycle progression via `transition_post()` RPC (open→booked→started→done→confirmed), exactly-once +20 NP via `award_np()` with idempotency + ledger. Server-side input validation, rate limiting triggers, reporting/blocking tables.

## Milestone 3 — Recommendations + trust (COMPLETE — backend)

Shared rec threads, reporting to real moderation queue (`reports` table), server-side rate limits, blocking (`blocks` table), abuse prevention via triggers.

## Milestone 4 — Product Excellence (NEW — AWAITING FOUNDER APPROVAL)

**Principle:** Engineering completion ≠ product people love. This phase makes Neighbloom feel finished, delightful, and worth returning to — before any launch consideration.

**Engagement audit findings (2026-10-12):** No habit-forming loops exist. NP is superficial (private number, meaningless badges). Zero notifications. Transactional, not communal. Cold open is severe (empty feed, no reason to return).

**Proposed concepts (require founder approval before implementation):**
1. **Push notifications** — 4 high-leverage types (help nearby, volunteers on your post, new replies, confirmation). The circulatory system.
2. **Public gratitude & helper recognition** — Optional public thank-you after confirmation. "Helped X neighbors" counter on profiles. Replaces NP as the recognition driver.
3. **Neighborhood pulse digest** — Weekly: "This week in Worth: 3 neighbors got help, welcome to 4 new neighbors." Curiosity loop for no-need opens.
4. **Unforgettable award moment** — Full-screen celebration (not just a toast). Peak-end rule: the confirm moment is the emotional peak.
5. **Reciprocity ledger** — "Helped 6 · Received 2" on profiles. Descriptive, not prescriptive. No shaming.

**Explicitly NOT approved:** NP economy changes, new tabs, additional streak mechanics, new social features beyond the five above, any dark patterns.

## Milestone 5 — Polish + production readiness

Password recovery flow, email confirmation re-enabled + tested, mobile QA (360px/390px), accessibility audit, error monitoring, backup plan, production deployment checklist, dead code cleanup (separate reviewable pass).

## Milestone 6 — Engagement validation pilot

**Not a launch.** 10–15 real users in one suburb. Measure: time-to-first-volunteer, 7-day return rate, qualitative "would you miss this?" interviews. No public launch until data shows people actually return.

## Milestone 7 — Controlled local pilot

Southwest Chicago suburbs. Measure time-to-first-response, selection-to-confirmation, repeat participation. Guide future work from real data.

## Launch stages (separate gates)

1. **Engineering complete** ← we are here (M1–M3 done)
2. **Product excellence** (M4 — needs approval)
3. **Engagement validated** (M6 — real user data)
4. **Launch approved** (founder sign-off only)

No stage is skipped. No stage is declared complete on tests alone.

## Deferred (not approved)

Events, circles, marketplace, paid promotions, NP economy, native apps, wider geography.
