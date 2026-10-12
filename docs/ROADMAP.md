# Neighbloom — Roadmap

**Last updated:** 2026-10-11

## Milestone 1 — Auth + shared posts (IN PROGRESS)

Branch: `felix/m1-auth-posts`. See `docs/ARCHITECTURE.md` for backend design.

Scope: Supabase Auth, `profiles`/`posts`/`replies` tables with RLS, post creation → shared feed → post detail working across two real accounts. Surgical fixes: remove template chips, restore rec category/prefTags UI. Demo code preserved (not deleted) until replacements verified.

Acceptance criteria: see master directive Part 10.

## Milestone 2 — Real neighbor-help interactions

Helper volunteering, requester selection, private messaging (post-scoped, RLS-gated), lifecycle progression (open→booked→started→done→confirmed), exactly-once +20 NP via server-side function. Two-account end-to-end proof. Unauthorized third parties cannot access private chat.

## Milestone 3 — Recommendations + trust

Shared rec threads, category + preference controls, top-pick behavior, reporting to a real moderation queue, server-side rate limits and abuse prevention.

## Milestone 4 — Remaining features + production readiness

Availability, saved searches, following, activity/notifications. Remove production-facing demo infrastructure and dead code (separate reviewable cleanup). Security testing, mobile QA (360px/390px), monitoring, deployment validation.

## Milestone 5 — Controlled local pilot

Southwest Chicago suburbs. Measure time-to-first-response, selection-to-confirmation, repeat participation. Guide future work from real data.

## Deferred (not approved)

Events, circles, marketplace, paid promotions, NP economy, native apps, wider geography.
