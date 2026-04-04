# PostForge

AI-powered social content and image generation platform for agencies and freelancers.

Generate a week of branded social posts — captions, image prompts, and images — for multiple clients across multiple platforms, using your own LLM API keys.

Built by [Bech Creative](https://bechcreative.com).

---

## What it does

- **Multi-client** — manage separate brand voices, logos, and prompt templates per client
- **Multi-platform** — Facebook, Instagram, LinkedIn, X, TikTok with platform-aware formatting
- **BYOK** — bring your own OpenAI, Anthropic, or Gemini key; PostForge never proxies your credits
- **Regenerate anything** — rewrite any caption or image with one click; full version history
- **Export** — CSV, JSON, or ZIP (captions + images) ready for Buffer, Hootsuite, or Later

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Query, Zustand |
| Backend | Supabase Edge Functions (Deno) |
| Database | Supabase Postgres with Row Level Security |
| Auth | Supabase Auth (email + Google OAuth) |
| Storage | Supabase Storage (logos, generated images) |
| Deploy | Vercel (frontend), Supabase (backend) |

## Repo structure

```
postforge/
├── api/
│   ├── spec/           # OpenAPI 3.1 specification
│   └── bruno/          # Bruno API test collection
├── apps/
│   └── web/            # React + Vite frontend
├── docs/
│   ├── adr/            # Architecture Decision Records
│   └── guides/         # Developer guides
├── packages/
│   ├── types/          # Shared TypeScript types
│   └── utils/          # Shared utilities
├── supabase/
│   ├── functions/      # Edge Functions (one folder per domain)
│   ├── migrations/     # Database migrations
│   └── seed/           # Seed data (platforms, etc.)
└── .github/
    └── workflows/      # CI + Deploy pipelines
```

## Getting started

See [docs/guides/local-setup.md](docs/guides/local-setup.md) for full setup instructions.

Quick start:
```bash
pnpm install
pnpm db:start
pnpm db:reset
pnpm dev
```

## API documentation

Serve locally:
```bash
pnpm api:docs:serve
# Opens Scalar UI at http://localhost:9000
```

The raw OpenAPI spec is at `api/spec/openapi.yaml`.

## API testing (Bruno)

```bash
# Run full collection against local Supabase
pnpm api:test:local

# Run against staging
pnpm api:test:staging
```

Open the Bruno desktop app and load the `api/bruno/` folder for interactive testing.

## Roadmap

See the [build tracker](#) for current phase progress.

## License

MIT — see [LICENSE](LICENSE).
