# Neighbloom — Architecture

**Last updated:** 2026-10-11 (Milestone 1 baseline)
**Status:** Frontend exists (demo-only). Backend not yet built.

## Frontend (existing)

- **Stack:** React 19, Vite 7, JSX/CSS. No TypeScript.
- **Entry:** `src/main.jsx` → `src/App.jsx` (8,903 lines on checkpoint branch) + `src/App.css`.
- **Build:** `npm run build` → `vite build && cp dist/index.html dist/404.html` (static hosting fallback).
- **State:** React `useState` + `localStorage` (keys: `neighbloom_v1`, `nb_checkins_v1`, `nb_availability_v1`, `nb_draft_post_v1:{kind}`, `nb_ref_credited_*`).
- **No backend calls.** Zero `fetch`/`axios`/`WebSocket` usage as of audit.

## Backend (Milestone 1 — planned)

- **Provider:** Supabase (free tier).
- **Auth:** Supabase Auth (email/password). Replaces demo user switcher.
- **Database:** PostgreSQL with Row Level Security on every table.

### Planned schema (Milestone 1 minimal)

```
profiles
  id            uuid PK (references auth.users)
  display_name  text
  handle        text unique
  town          text (approximate area, e.g. "Worth")
  avatar_url    text nullable
  np            integer default 0
  created_at    timestamptz

posts
  id            uuid PK
  owner_id      uuid FK → profiles.id
  kind          text ('help' | 'rec')
  title         text
  details       text
  area          text
  category      text nullable
  pref_tags     text[] nullable (recommendations)
  helpers_needed integer default 1
  helpers       jsonb (selected helper IDs + stage info)
  stage         text default 'open'
  status        text default 'open'
  created_at    timestamptz
  updated_at    timestamptz

replies
  id            uuid PK
  post_id       uuid FK → posts.id
  author_id     uuid FK → profiles.id
  body          text
  kind          text ('volunteer' | 'suggestion')
  created_at    timestamptz
```

### Row Level Security (planned)

- `profiles`: public read; users update own row only.
- `posts`: public read; insert requires auth; update/delete by owner only.
- `replies`: public read; insert requires auth; update/delete by author only.

### Migrations

Versioned SQL migrations committed under `supabase/migrations/`. Never edit applied migrations; always add new ones.

## Data flow (target)

```
Phone → React app → Supabase client (anon key)
                        → PostgREST (RLS enforced)
                        → PostgreSQL
Auth: Supabase Auth → JWT → RLS policies check auth.uid()
```

Service-role key is never in the frontend. Only the anon key ships with the app.

## Deployment (existing)

- **Cloudflare Pages** (production): `neighbloom.pages.dev`
- **GitHub Pages** (historical): `neighbloom.github.io/neighbloom/`
- Vite `base` config differs per target — verify before deploying.

## Secrets handling

- Local dev: `.env.local` (gitignored). Never commit.
- Production: Cloudflare Pages environment variables.
- Supabase publishable key (`sb_publishable_...`): safe for frontend (RLS protects data).
- Supabase service-role key: server-only, never in repo or frontend bundle.

## Auth email note (Milestone 1 testing)

Supabase's default auth email service is rate-limited and restricted. For two-account testing, use email addresses you control (e.g., `you+test1@gmail.com`, `you+test2@gmail.com` — Gmail aliases deliver to the same inbox). Alternatively, disable "Confirm email" in Supabase Auth settings for the dev project to skip verification during testing. Do not disable it on production.
