# PostForge — Bruno API Collection

Bruno collection for the PostForge API. Mirrors the OpenAPI 3.1 spec at `../openapi.yaml`.

## Setup

1. Install [Bruno](https://www.usebruno.com/) desktop app
2. Open Bruno → **Open Collection** → select this folder
3. Select your environment (local / staging / production)
4. Fill in environment secrets (see below)

## Environment Variables

Each environment file contains the following vars. Most are populated
automatically by post-response scripts as you run requests in order.

| Variable | Set by | Description |
|---|---|---|
| `baseUrl` | pre-set | API base URL |
| `supabaseUrl` | pre-set | Supabase project URL |
| `supabaseAnonKey` | manual | Supabase anon key — get from Supabase dashboard |
| `accessToken` | auth/refresh-token | Supabase JWT — paste initial token from the frontend or Supabase dashboard |
| `refreshToken` | auth/refresh-token | Supabase refresh token |
| `clientId` | clients/create-client | Auto-set after creating a client |
| `platformId` | platforms/list-platforms | Auto-set after listing platforms |
| `jobId` | generation/start-job | Auto-set after starting a generation job |
| `postId` | posts/list-posts | Auto-set after listing posts |
| `batchId` | export/export-csv | Auto-set after creating an export |

## Recommended Run Order (First-Time Setup)

Run these in sequence to populate all environment variables:

1. `auth/get-current-user` — confirm your token works
2. `platforms/list-platforms` — seeds `platformId`
3. `clients/create-client` — seeds `clientId`
4. `llm-keys/add-anthropic-key` — add your Anthropic key
5. `llm-keys/validate-key` — confirm it works
6. `generation/start-job` — seeds `jobId`
7. `generation/poll-job-status` — wait for `status: complete`
8. `posts/list-posts` — seeds `postId`
9. `posts/get-post` — inspect a generated post
10. `export/export-csv` — seeds `batchId`
11. `export/get-download-url` — confirm signed URL

## Running as CI (Bruno CLI)

Install the CLI:
```bash
npm install -g @usebruno/cli
```

Run the full collection against staging:
```bash
bru run --env staging --recursive
```

Run a single folder:
```bash
bru run posts/ --env staging
```

Run with output report (JUnit XML for GitHub Actions):
```bash
bru run --env staging --recursive --reporter junit --output results.xml
```

## Folder Structure

```
postforge-bruno/
├── environments/
│   ├── local.bru
│   ├── staging.bru
│   └── production.bru
├── auth/           — token management + 401 guards
├── llm-keys/       — BYOK key management
├── clients/        — client CRUD + logo upload
├── platforms/      — platform registry (read-only)
├── generation/     — job creation, polling, cancel
├── posts/          — post CRUD, regen caption/image
├── history/        — version history + restore
├── export/         — CSV/JSON/ZIP exports
└── README.md
```

## Notes

- Secrets (`accessToken`, `supabaseAnonKey`) are marked `vars:secret` — Bruno
  will never log or expose them in output
- The `production` environment is intentionally minimal — do not run
  destructive tests (delete, cancel) against production
- All post-response scripts that set env vars are idempotent — safe to re-run
