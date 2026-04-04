# Contributing to PostForge

## Branch strategy

| Branch | Purpose |
|---|---|
| `main` | Production. Protected — no direct pushes. |
| `develop` | Integration branch. All feature PRs target this. |
| `feature/*` | Individual features or fixes. Branch off `develop`. |
| `hotfix/*` | Emergency production fixes. Branch off `main`. |

## Workflow

1. Branch from `develop`: `git checkout -b feature/your-feature`
2. Make changes
3. Run `pnpm typecheck && pnpm lint` locally before pushing
4. Open a PR targeting `develop`
5. CI must pass (typecheck + lint + Bruno API tests)
6. Squash merge into `develop`
7. `develop` → `main` via PR when ready to release

## API changes

Any change to an endpoint **must** include:
1. Updated `api/spec/openapi.yaml`
2. Updated Bruno request(s) in `api/bruno/`
3. Updated TypeScript types in `apps/web/src/types/index.ts`

## Database changes

All schema changes go through Supabase migrations:
```bash
supabase db diff --schema public -f your_migration_name
```
Never edit migration files after they've been applied to any environment.

## Commit style

```
type(scope): short description

feat(clients): add logo upload endpoint
fix(auth): handle expired refresh token gracefully
docs(adr): add ADR-003 for export format decision
chore(deps): bump supabase-js to 2.44
```
