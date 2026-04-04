# Changelog

All notable changes to PostForge will be documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased]

### Added
- Initial project scaffold (monorepo structure, pnpm workspaces)
- OpenAPI 3.1 specification — full endpoint coverage for all 8 API domains
- Bruno API collection — 29 requests across 8 folders with env chaining and CI support
- Supabase project configuration and Edge Function scaffolding
- Shared middleware: CORS headers, auth resolution, response helpers
- Database seed data for platform registry
- GitHub Actions: CI (typecheck + lint + Bruno API tests), Deploy to Vercel
- Architecture Decision Records: ADR-001 (Supabase), ADR-002 (BYOK)
- Local development guide
