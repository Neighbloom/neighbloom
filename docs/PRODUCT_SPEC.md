# Neighbloom — Product Specification

**Last updated:** 2026-10-11 (Milestone 1 baseline)
**Source:** Historical handoff (2026-10-11) + code audit of `feature/checkpoint-working`

## Purpose

Neighbloom is a hyperlocal neighborhood help and recommendations network. It makes asking neighbors for small-scale help feel natural, enables reliable neighbors to respond and coordinate, and uses authentic local recommendations to stay valuable even before help-request volume is high.

## Audience

Residents of southwest Chicago suburbs at launch (Worth, Tinley Park, Orland Park, Oak Lawn, Hickory Hills, Palos Heights, Palos Hills, Palos Park, Homer Glen, Frankfort, Lemont). People who currently rely on Facebook groups and Nextdoor. Designed to be welcoming to elderly residents and people unable to volunteer — requesting help must never be gated on earning points.

## Core product loops

### Need-a-hand (help requests)

1. Requester creates a **public** help post: what they need, approximate area, when, how many helpers (up to 10 in checkpoint).
2. Neighbors reply with **Offer help** (public volunteer replies).
3. Requester selects one or more volunteers (limited by requested slots).
4. **Private chat unlocks** only between requester and selected helper(s). Unselected users cannot DM.
5. Lifecycle: `open → booked → started → done → confirmed`.
6. On confirmation, each selected helper earns **+20 NP**. Post is marked resolved.

### Recommendations

1. Requester posts a specific local need (e.g., "trustworthy plumber near Worth"), category, and preference tags (Neighbor-owned, Honest pricing, No upsell, Fast turnaround, Warranty-backed, Great with kids, Accepts insurance).
2. Neighbors answer **in public threads**, naming a person/business with a real reason.
3. Interactions: helpful votes, top pick, hearts, nested comments.
4. **No NP for recommendations.** **No DMs by default** ("In-thread only • No DMs").

## Navigation

Four bottom tabs: **Home | Post | Activity | Profile**. No other tabs. (Blooms, Missions, Circles, Marketplace, Messages were prototyped and removed — do not reintroduce.)

## Neighbor Points (NP)

| NP | Badge |
|---:|---|
| 0+ | 🌱 Seedling |
| 100+ | 🌿 Sprout |
| 300+ | 🌸 Blossom |
| 800+ | 🌳 Oak |

**Approved awards:**
- +20 NP per selected helper on requester-confirmed help
- +5 NP daily check-in (with streak)
- +25 NP one-time Quick Start (check in + publish post + follow neighbor)
- +20 NP displayed on invite CTA (verified conversion not yet implemented)

**Not approved:** Requester NP on confirm. No-show penalties. Paid boosts. NP as currency.

## Trust & safety principles

- Public posts show town/approximate area only. Never exact addresses, phone numbers, or minors' info publicly.
- Private coordination details stay in gated chat.
- Help-post creation is never gated on points.
- Reports go to a real moderation queue (not yet built).
- The founder has flagged an open question: will people reliably help strangers for NP alone? Build around reliable response/completion, not points accumulation.

## What is NOT in scope

Circles, events, block parties, tool-lending, carpool, neighborhood-watch, classifieds, marketplace, Missions/Blooms tab, business advertising, paid promotions, fully private requests, strict exterior-only enforcement (undecided), no-show penalties, sponsor discounts, subscription model.
