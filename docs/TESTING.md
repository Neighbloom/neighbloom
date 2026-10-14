# Neighbloom — Testing

**Last updated:** 2026-10-11 (Milestone 1 baseline)

## Current state

No automated test suite exists. `package.json` has no `test` script. All verification to date is manual.

## Milestone 1 test plan

### Automated (to add)

- **Build:** `npm run build` must pass (existing).
- **Lint:** `npm run lint` must pass (existing).
- **RLS negative tests:** SQL-level tests asserting:
  - User A cannot UPDATE/DELETE User B's posts.
  - Unauthenticated INSERT into `posts` is rejected.
  - User cannot UPDATE another user's `profiles` row.
- **Migration integrity:** migrations apply cleanly to a fresh database.

### Manual (two-account verification)

Using two separate browsers (or incognito + normal):

1. User A signs up → creates a help post → sees it in feed.
2. User B signs up → sees User A's post in feed → creates own post.
3. User A sees User B's post.
4. Reload both browsers → posts persist.
5. Log out / log in → posts persist, identity correct.
6. User A tries to edit User B's post → blocked (UI hides controls; RLS rejects API call).
7. Direct API call as User A to update User B's post → 403/RLS denial.

### Regression (existing demo workflows)

Before backend cutover, manually verify on the checkpoint branch:
- [ ] Help post creation (message-first composer)
- [ ] Draft autosave + restore across reload
- [ ] Helper count / photo / timing controls visible
- [ ] Rec post creation flow
- [ ] Feed filters (All / Need a hand / Recommendations)
- [ ] Mobile layout at 360px and 390px (no horizontal overflow, no pinch-zoom needed)
- [ ] Shareable post URL (`/p/`) renders

Record results in this file. Preexisting failures are documented, not hidden.

## Later milestones

- Milestone 2: two-account chat isolation test (third user cannot read private thread), exactly-once NP test (double-confirm attempt grants once).
- Milestone 3: rate-limit enforcement test, moderation queue test.
- Milestone 4: full mobile QA matrix, production smoke test.

## Tooling

Playwright for browser E2E (free). Vitest for unit tests (free). Supabase local CLI for RLS tests against a local Postgres (free).
