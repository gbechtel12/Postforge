# Agent 1 — Database Schema Migration

## Your job
Create the initial Supabase Postgres migration file that implements the
complete PostForge data model. This is the single most important file in
the project — everything else depends on it being correct.

## Output file
`supabase/migrations/20260403000001_initial_schema.sql`

## Source of truth
- ERD: `docs/adr/001-supabase-over-custom-backend.md` (context)
- Types: `apps/web/src/types/index.ts` (every table/field is defined here)
- API spec: `api/spec/openapi.yaml` (schema objects section)
- Seed data: `supabase/seed/platforms.sql` (referenced after migration)

## Tables to create (in dependency order)

### 1. `users` (extends Supabase auth.users)
```sql
-- Profile table that extends auth.users
-- id must be a FK to auth.users(id) with ON DELETE CASCADE
id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
email text NOT NULL,
full_name text,
plan_tier text NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free','pro','agency')),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
```

### 2. `user_llm_keys`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
provider text NOT NULL CHECK (provider IN ('openai','anthropic','gemini','ideogram','stabilityai')),
api_key_encrypted text NOT NULL,
is_active boolean NOT NULL DEFAULT true,
created_at timestamptz NOT NULL DEFAULT now(),
UNIQUE(user_id, provider)
```

### 3. `clients`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
name text NOT NULL,
industry text,
website text,
logo_storage_path text,
brand_voice text,
prompt_template text,
platform_defaults jsonb,
primary_color text,
secondary_color text,
is_active boolean NOT NULL DEFAULT true,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
```

### 4. `platforms` (seed/reference data — no user_id)
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
slug text NOT NULL UNIQUE,
display_name text NOT NULL,
max_caption_chars integer NOT NULL,
aspect_ratio text NOT NULL,
formatting_rules jsonb NOT NULL DEFAULT '{}'
```

### 5. `generation_jobs`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
client_id uuid NOT NULL REFERENCES clients(id),
platform_id uuid NOT NULL REFERENCES platforms(id),
days_requested integer NOT NULL CHECK (days_requested BETWEEN 1 AND 30),
llm_provider text NOT NULL CHECK (llm_provider IN ('openai','anthropic','gemini')),
image_provider text CHECK (image_provider IN ('openai','ideogram','stabilityai')),
status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','complete','error','cancelled')),
job_config jsonb NOT NULL DEFAULT '{}',
error_message text,
created_at timestamptz NOT NULL DEFAULT now(),
completed_at timestamptz
```

### 6. `generated_posts`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
job_id uuid NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
client_id uuid NOT NULL REFERENCES clients(id),
platform_id uuid NOT NULL REFERENCES platforms(id),
user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
day_number integer NOT NULL,
caption text NOT NULL,
image_prompt text,
image_url text,
image_storage_path text,
status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','approved','exported','archived')),
user_notes text,
version integer NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
```

### 7. `post_history`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
post_id uuid NOT NULL REFERENCES generated_posts(id) ON DELETE CASCADE,
user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
caption text NOT NULL,
image_prompt text,
image_url text,
version integer NOT NULL,
created_at timestamptz NOT NULL DEFAULT now()
```

### 8. `export_batches`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
job_id uuid NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
format text NOT NULL CHECK (format IN ('csv','json','zip')),
storage_path text,
status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','complete','error')),
created_at timestamptz NOT NULL DEFAULT now()
```

## Row Level Security
Enable RLS on EVERY table except `platforms` (which is public read-only).

For each user-owned table, add these policies:
- SELECT: `user_id = auth.uid()`
- INSERT: `user_id = auth.uid()`
- UPDATE: `user_id = auth.uid()`
- DELETE: `user_id = auth.uid()`

For `platforms`:
- SELECT: allow all (public, no auth required)
- No INSERT/UPDATE/DELETE policies (managed by service role only)

For `post_history`:
- Inherit access through the parent post's user_id

## Indexes to create
```sql
-- user_llm_keys
CREATE INDEX ON user_llm_keys(user_id);

-- clients
CREATE INDEX ON clients(user_id);
CREATE INDEX ON clients(user_id, is_active);

-- generation_jobs
CREATE INDEX ON generation_jobs(user_id);
CREATE INDEX ON generation_jobs(client_id);
CREATE INDEX ON generation_jobs(status);
CREATE INDEX ON generation_jobs(user_id, status);

-- generated_posts
CREATE INDEX ON generated_posts(job_id);
CREATE INDEX ON generated_posts(user_id);
CREATE INDEX ON generated_posts(client_id);
CREATE INDEX ON generated_posts(user_id, status);

-- post_history
CREATE INDEX ON post_history(post_id);
CREATE INDEX ON post_history(user_id);

-- export_batches
CREATE INDEX ON export_batches(job_id);
CREATE INDEX ON export_batches(user_id);
```

## Auto-update trigger
Add a `handle_updated_at()` trigger function and apply it to all tables
that have an `updated_at` column: `users`, `clients`, `generated_posts`.

```sql
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## New user trigger
When a user signs up via Supabase Auth, auto-insert a row into `users`:

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

## Acceptance criteria
- [ ] All 8 tables created with correct column types and constraints
- [ ] RLS enabled on all tables
- [ ] All RLS policies created and named descriptively
- [ ] All indexes created
- [ ] `handle_updated_at` trigger applied to users, clients, generated_posts
- [ ] `handle_new_user` trigger on auth.users
- [ ] Migration is idempotent (use IF NOT EXISTS where applicable)
- [ ] File runs clean with `pnpm db:reset`
