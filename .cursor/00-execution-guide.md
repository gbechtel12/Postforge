# Cursor Agent Execution Guide

## Overview
Seven agents cover everything needed to get PostForge to a working,
usable state. Read this before firing any agents.

## Execution order

```
Phase A — Backend (run these first, in order)
  Agent 1: Database schema       ← everything depends on this
  Agent 2: Edge Functions        ← depends on schema
  Agent 3: Generation Engine     ← depends on schema + shared helpers
  Agent 4: Export Function       ← depends on schema + storage

Phase B — Frontend (run after Phase A is complete and db:reset passes)
  Agent 5: Auth + Shell          ← can run in parallel with 6 and 7
  Agent 6: Settings page         ← can run in parallel with 5 and 7
  Agent 7: Generator + Results   ← can run in parallel with 5 and 6
```

## Before running Agent 1

Make sure local Supabase is running:
```bash
pnpm db:start
```

Docker Desktop must be running. Supabase Studio will be at
http://localhost:54323 — use it to verify tables after migration.

## After Agent 1 completes

Apply the migration:
```bash
pnpm db:reset
```

Check Supabase Studio → Table Editor and confirm all 8 tables exist
with their RLS policies before proceeding to Agent 2.

Also apply the platform seed data:
```bash
# In Supabase Studio SQL editor, run:
# contents of supabase/seed/platforms.sql
```

## After Phase A completes

Set up your `.env.local`:
```bash
cp .env.example apps/web/.env.local
# Fill in:
# VITE_SUPABASE_URL=http://localhost:54321
# VITE_SUPABASE_ANON_KEY=<from supabase start output>
```

Then test Edge Functions locally:
```bash
pnpm functions:serve
```

Open Bruno (api/bruno/) with the `local` environment and run the
platforms folder first — it requires no auth and confirms the functions
are responding.

## Running agents in parallel (Phase B)

In Cursor with background agents enabled:
1. Open `.cursor/prompts/05-auth-and-shell.md` → start agent
2. Open `.cursor/prompts/06-settings-page.md` → start agent
3. Open `.cursor/prompts/07-generator-and-results.md` → start agent

These three touch different files and won't conflict:
- Agent 5: LoginPage, AppShell, DashboardPage
- Agent 6: SettingsPage
- Agent 7: GeneratorPage, ResultsPage, PostCard component

## After all agents complete

Run full typecheck:
```bash
pnpm typecheck
```

Fix any errors (usually import paths or missing type annotations).

Start the app:
```bash
pnpm dev
```

Run the Bruno collection against local:
```bash
pnpm api:test:local
```

## Committing agent output

After each agent completes and you've verified it works:
```bash
git add .
git commit -m "feat(scope): description of what the agent implemented"
git push
```

Suggested commit messages:
- `feat(db): initial schema with RLS and triggers`
- `feat(functions): core edge functions — auth, platforms, llm-keys, posts, history`
- `feat(functions): generation job orchestrator`
- `feat(functions): export service — csv, json, zip`
- `feat(ui): auth flow and app shell`
- `feat(ui): settings page — api keys and client profiles`
- `feat(ui): generator and results pages`

## Known gaps after all agents (Phase 2 work)
- Stripe subscription billing
- Google OAuth (email/password auth works first)
- Multi-tenant RLS audit
- VitePress documentation site
- Scalar API docs hosted page
- Production Supabase project (currently local only)
- Vercel deployment
