# Neighbloom — Decisions Log

**Last updated:** 2026-10-11 (Milestone 1 baseline)
**Purpose:** Durable record of approved decisions, rejected approaches, and rationale. Future agents: do not reverse these without founder approval.

## Approved

- **Four-tab navigation** (Home/Post/Activity/Profile). Older five-tab layouts removed.
- **Message-first help composer** (checkpoint): single textarea, first line derives the "what."
- **Draft autosave** (7-day TTL) for post composer.
- **Supabase** as backend (Milestone 1): Auth + PostgreSQL + Row Level Security.
- **`feature/checkpoint-working`** as development baseline (2026-10-11).
- **Working branch**: `felix/m1-auth-posts` for Milestone 1. `main` and `feature/checkpoint-working` stay untouched until verified merge.

## Rejected — do not reintroduce

- **Help template/message chips** (2026-01-27, reaffirmed 2026-10-11): The founder explicitly said "do not merely redesign those chips." This includes keyword-triggered chips. Use natural placeholder guidance only.
- **Blooms, Missions, Circles tabs**: removed from navigation. Do not add back.
- **Townsy / Fight-IQ concepts**: separate projects. Never merge into Neighbloom.
- **No-show penalties** (-40 NP, cooldowns), **cancellation penalties**: brainstormed, not approved.
- **Requester +5 NP** on confirm: discussed, not approved. Current rule is +20 to helpers only.
- **Paid boosts, credits, premium tier, sponsor discounts, subscription model**: not validated. Do not build.
- **Gig-worker marketplace positioning**: Neighbloom is neighbor help, not TaskRabbit.
- **Glide / Bubble / BuildAI**: early experiments, not the canonical stack. Canonical is React/Vite.

## Open / undecided

- **Safety taxonomy** (indoor tasks, payments): past UI said "no indoor entry" but V2 softened enforcement. No final approved policy. Needs explicit founder sign-off before launch.
- **Per-post area override**: checkpoint defaults to profile location; main allowed per-post area. Undecided which is correct.
- **NP utility**: founder wants points to feel meaningful (trust/standing/privileges) but no economy is validated. Do not invent one.
- **Monetization**: no validated model. Do not build billing.

## Architecture decisions

- **Keep React/Vite frontend.** No framework switch without compelling evidence.
- **Supabase free tier** for Milestone 1. No paid services without founder approval.
- **Docs live in `docs/`** in the repo. Not in external tools.
- **Smallest possible diffs** per change (per CLAUDE.md). No incidental refactors.
