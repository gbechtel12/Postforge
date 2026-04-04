# Local development setup

## Prerequisites

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- Docker Desktop (required for Supabase local)
- Supabase CLI (`brew install supabase/tap/supabase` or see supabase.com/docs/guides/cli)
- Bruno desktop app (https://www.usebruno.com/)

## Steps

### 1. Clone and install

```bash
git clone https://github.com/your-org/postforge.git
cd postforge
pnpm install
```

### 2. Environment setup

```bash
cp .env.example apps/web/.env.local
# Fill in your Supabase project URL and anon key
```

### 3. Start Supabase locally

```bash
pnpm db:start
# First run pulls Docker images — takes ~2 minutes
# Supabase Studio: http://localhost:54323
```

### 4. Apply database migrations

```bash
pnpm db:reset
# Applies all migrations + seed data
```

### 5. Start the dev server

```bash
pnpm dev
# App: http://localhost:5173
```

### 6. Load the Bruno collection

Open Bruno → Open Collection → select `api/bruno/`  
Select the `local` environment.

## Useful commands

| Command | What it does |
|---|---|
| `pnpm db:start` | Start local Supabase |
| `pnpm db:stop` | Stop local Supabase |
| `pnpm db:reset` | Wipe and re-apply all migrations |
| `pnpm functions:serve` | Run Edge Functions locally |
| `pnpm api:test:local` | Run Bruno collection against local |
| `pnpm api:docs:serve` | Serve OpenAPI docs (Scalar) |
