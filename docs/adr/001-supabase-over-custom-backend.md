# ADR-001: Supabase over custom Express/Postgres backend

**Date:** 2026-04-03  
**Status:** Accepted

## Context
PostForge needs auth, a relational database, file storage, realtime job status
updates, and serverless functions. We evaluated: custom Node/Express + Postgres
on Railway, PlanetScale + Cloudflare Workers, and Supabase.

## Decision
Use Supabase as the full backend platform — Auth, Postgres, Storage, Edge
Functions (Deno), and Realtime.

## Consequences
**Positive:**
- Auth, RLS, Storage, and Realtime are handled with zero additional services
- Local development via Supabase CLI is first-class (Docker-based, full parity)
- Row Level Security handles multi-tenant data isolation at the DB layer
- Greg has prior experience with Supabase (InventoryXP project)
- Free tier is sufficient for Phase 1 solo use

**Negative:**
- Edge Functions are Deno-based, not Node — some npm packages require esm.sh shims
- Vendor lock-in on Supabase-specific APIs (mitigated by standard Postgres underneath)
- Cold start latency on Edge Functions in free tier

**Neutral:**
- Supabase Vault handles key encryption, removing the need for a custom crypto service
