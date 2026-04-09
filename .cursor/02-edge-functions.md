# Agent 2 — Edge Functions (Core Endpoints)

## Your job
Implement the remaining Supabase Edge Functions. The `clients` function is
fully implemented and is your pattern reference — match it exactly.

## Pattern reference
Read `supabase/functions/clients/index.ts` completely before writing
anything. Every function you write must follow the same structure:
- Import shared helpers from `../_shared/`
- Handle OPTIONS preflight first
- Call `requireAuth()` to get `{ supabase, userId }`
- Parse URL path for routing
- Return typed responses using the helper functions
- Catch `Response` throws from `requireAuth` and re-throw
- Log unexpected errors and return `serverError()`

## Shared helpers available
- `supabase/functions/_shared/cors.ts` — `corsHeaders`
- `supabase/functions/_shared/auth.ts` — `requireAuth(req)`
- `supabase/functions/_shared/response.ts` — `ok`, `created`, `noContent`, `badRequest`, `notFound`, `serverError`

## API contract
All request/response shapes are defined in `api/spec/openapi.yaml`.
Match them exactly — field names, types, nullable fields, status codes.

---

## Function 1: `supabase/functions/auth/index.ts`

### Routes
**GET /auth/me**
- Call `requireAuth`
- Query `users` table for the authenticated user's row
- Return the user object

**POST /auth/refresh**
- No auth required on this route
- Body: `{ refresh_token: string }`
- Call `supabase.auth.refreshSession({ refresh_token })`
- Return `{ access_token, refresh_token, expires_in }`
- Return 401 if refresh fails

---

## Function 2: `supabase/functions/platforms/index.ts`

### Routes
**GET /platforms**
- No auth required
- Query all rows from `platforms` table ordered by `display_name`
- Return array

**GET /platforms/:slug**
- No auth required
- Path param: slug (facebook | instagram | linkedin | x | tiktok)
- Query `platforms` where `slug = :slug`
- Return 404 if not found

---

## Function 3: `supabase/functions/llm-keys/index.ts`

### Routes
**GET /llm-keys**
- Requires auth
- Select `id, provider, is_active, created_at` only — NEVER select `api_key_encrypted`
- Filter by `user_id = userId`
- Return array

**POST /llm-keys**
- Requires auth
- Body: `{ provider: string, api_key: string }`
- Validate provider is one of: openai, anthropic, gemini, ideogram, stabilityai
- Validate api_key is non-empty string
- Encrypt the key using Supabase Vault:
  ```typescript
  const { data: encrypted } = await supabase.rpc('vault_encrypt', {
    secret: body.api_key,
    key_id: Deno.env.get('VAULT_KEY_ID')
  })
  ```
  Note: If Vault RPC isn't available yet, store with a TODO comment and
  use a base64 placeholder so the endpoint works while Vault is configured:
  ```typescript
  const encrypted = btoa(body.api_key) // TODO: replace with Vault encryption
  ```
- Upsert (insert or replace on conflict user_id + provider)
- Return metadata only (no encrypted key)

**DELETE /llm-keys/:provider**
- Requires auth
- Delete where `user_id = userId AND provider = :provider`
- Return 404 if not found
- Return 204 on success

**POST /llm-keys/:provider/validate**
- Requires auth
- Fetch the encrypted key for this user + provider
- Decrypt it (reverse of encryption above)
- Make a minimal test call to the provider:
  - OpenAI: `GET https://api.openai.com/v1/models` with Bearer token
  - Anthropic: `POST https://api.anthropic.com/v1/messages` with minimal body, check for non-401
  - Gemini: `GET https://generativelanguage.googleapis.com/v1/models?key={key}`
  - Ideogram/StabilityAI: attempt a minimal auth check endpoint
- Return `{ valid: boolean, provider: string, error: string | null }`
- Never return the key itself

---

## Function 4: `supabase/functions/posts/index.ts`

### Routes
**GET /posts**
- Requires auth
- Query params: `job_id`, `client_id`, `platform_id`, `status`, `limit` (default 20, max 100), `offset` (default 0)
- Filter by `user_id = userId` always (RLS backup)
- Apply additional filters if query params present
- Return `{ data: Post[], total: number, limit: number, offset: number }`
- For total count use Supabase `count: 'exact'` option

**GET /posts/:id**
- Requires auth
- Return single post where `id = :id AND user_id = userId`
- Return 404 if not found or not owned

**PATCH /posts/:id**
- Requires auth
- Body: `{ status?, user_notes?, caption? }` (all optional)
- Only allow updating: status, user_notes, caption
- Strip any other fields from body before updating
- Update `updated_at` to now()
- Return updated post

---

## Function 5: `supabase/functions/history/index.ts`

### Routes
**GET /posts/:postId/history**
- Requires auth
- Verify the post exists and belongs to userId
- Query `post_history` where `post_id = :postId`
- Order by `version ASC`
- Return array

**POST /posts/:postId/history/:version/restore**
- Requires auth
- Verify the post exists and belongs to userId
- Fetch the history entry for the given version
- Snapshot current post state into post_history (new entry)
- Update the post with the historical caption, image_prompt, image_url
- Increment post.version by 1
- Return the updated post

---

## Acceptance criteria
- [ ] All 5 function files created
- [ ] Every route handles OPTIONS preflight
- [ ] Auth is enforced on all protected routes
- [ ] `api_key_encrypted` is NEVER returned in any response
- [ ] All response shapes match `api/spec/openapi.yaml` schemas
- [ ] 404 returned when resource not found or not owned by user
- [ ] Errors logged to console for debugging
- [ ] TypeScript types used throughout (no `any` except where unavoidable)
