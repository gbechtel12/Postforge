-- PostForge initial schema: tables, RLS, indexes, triggers, storage bucket

-- ─── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Tables ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  plan_tier text NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'agency')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_llm_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai', 'anthropic', 'gemini', 'ideogram', 'stabilityai')),
  api_key_encrypted text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
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
);

CREATE TABLE IF NOT EXISTS public.platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  max_caption_chars integer NOT NULL,
  aspect_ratio text NOT NULL,
  formatting_rules jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id),
  platform_id uuid NOT NULL REFERENCES public.platforms (id),
  days_requested integer NOT NULL CHECK (days_requested BETWEEN 1 AND 30),
  llm_provider text NOT NULL CHECK (llm_provider IN ('openai', 'anthropic', 'gemini')),
  image_provider text CHECK (image_provider IN ('openai', 'ideogram', 'stabilityai')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'error', 'cancelled')),
  job_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.generated_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.generation_jobs (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id),
  platform_id uuid NOT NULL REFERENCES public.platforms (id),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  day_number integer NOT NULL,
  caption text NOT NULL,
  image_prompt text,
  image_url text,
  image_storage_path text,
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'approved', 'exported', 'archived')),
  user_notes text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.post_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.generated_posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  caption text NOT NULL,
  image_prompt text,
  image_url text,
  version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.export_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.generation_jobs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('csv', 'json', 'zip')),
  storage_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'error')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_llm_keys_user_id ON public.user_llm_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients (user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user_id_is_active ON public.clients (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id ON public.generation_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_client_id ON public.generation_jobs (client_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON public.generation_jobs (status);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id_status ON public.generation_jobs (user_id, status);
CREATE INDEX IF NOT EXISTS idx_generated_posts_job_id ON public.generated_posts (job_id);
CREATE INDEX IF NOT EXISTS idx_generated_posts_user_id ON public.generated_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_generated_posts_client_id ON public.generated_posts (client_id);
CREATE INDEX IF NOT EXISTS idx_generated_posts_user_id_status ON public.generated_posts (user_id, status);
CREATE INDEX IF NOT EXISTS idx_post_history_post_id ON public.post_history (post_id);
CREATE INDEX IF NOT EXISTS idx_post_history_user_id ON public.post_history (user_id);
CREATE INDEX IF NOT EXISTS idx_export_batches_job_id ON public.export_batches (job_id);
CREATE INDEX IF NOT EXISTS idx_export_batches_user_id ON public.export_batches (user_id);

-- ─── updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS clients_updated_at ON public.clients;
CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS generated_posts_updated_at ON public.generated_posts;
CREATE TRIGGER generated_posts_updated_at
  BEFORE UPDATE ON public.generated_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── New user → public.users ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── Storage: exports bucket (private) ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', false)
ON CONFLICT (id) DO NOTHING;

-- ─── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_llm_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_batches ENABLE ROW LEVEL SECURITY;

-- users (id = auth user)
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS users_insert_own ON public.users;
CREATE POLICY users_insert_own ON public.users FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS users_delete_own ON public.users;
CREATE POLICY users_delete_own ON public.users FOR DELETE USING (id = auth.uid());

-- user_llm_keys
DROP POLICY IF EXISTS user_llm_keys_select_own ON public.user_llm_keys;
CREATE POLICY user_llm_keys_select_own ON public.user_llm_keys FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_llm_keys_insert_own ON public.user_llm_keys;
CREATE POLICY user_llm_keys_insert_own ON public.user_llm_keys FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_llm_keys_update_own ON public.user_llm_keys;
CREATE POLICY user_llm_keys_update_own ON public.user_llm_keys FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_llm_keys_delete_own ON public.user_llm_keys;
CREATE POLICY user_llm_keys_delete_own ON public.user_llm_keys FOR DELETE USING (user_id = auth.uid());

-- clients
DROP POLICY IF EXISTS clients_select_own ON public.clients;
CREATE POLICY clients_select_own ON public.clients FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS clients_insert_own ON public.clients;
CREATE POLICY clients_insert_own ON public.clients FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS clients_update_own ON public.clients;
CREATE POLICY clients_update_own ON public.clients FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS clients_delete_own ON public.clients;
CREATE POLICY clients_delete_own ON public.clients FOR DELETE USING (user_id = auth.uid());

-- platforms: public read-only
DROP POLICY IF EXISTS platforms_select_all ON public.platforms;
CREATE POLICY platforms_select_all ON public.platforms FOR SELECT USING (true);

-- generation_jobs
DROP POLICY IF EXISTS generation_jobs_select_own ON public.generation_jobs;
CREATE POLICY generation_jobs_select_own ON public.generation_jobs FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS generation_jobs_insert_own ON public.generation_jobs;
CREATE POLICY generation_jobs_insert_own ON public.generation_jobs FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS generation_jobs_update_own ON public.generation_jobs;
CREATE POLICY generation_jobs_update_own ON public.generation_jobs FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS generation_jobs_delete_own ON public.generation_jobs;
CREATE POLICY generation_jobs_delete_own ON public.generation_jobs FOR DELETE USING (user_id = auth.uid());

-- generated_posts
DROP POLICY IF EXISTS generated_posts_select_own ON public.generated_posts;
CREATE POLICY generated_posts_select_own ON public.generated_posts FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS generated_posts_insert_own ON public.generated_posts;
CREATE POLICY generated_posts_insert_own ON public.generated_posts FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS generated_posts_update_own ON public.generated_posts;
CREATE POLICY generated_posts_update_own ON public.generated_posts FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS generated_posts_delete_own ON public.generated_posts;
CREATE POLICY generated_posts_delete_own ON public.generated_posts FOR DELETE USING (user_id = auth.uid());

-- post_history (via parent post ownership)
DROP POLICY IF EXISTS post_history_select_via_post ON public.post_history;
CREATE POLICY post_history_select_via_post ON public.post_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.generated_posts p
      WHERE p.id = post_history.post_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS post_history_insert_via_post ON public.post_history;
CREATE POLICY post_history_insert_via_post ON public.post_history FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.generated_posts p
      WHERE p.id = post_history.post_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS post_history_update_via_post ON public.post_history;
CREATE POLICY post_history_update_via_post ON public.post_history FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.generated_posts p
      WHERE p.id = post_history.post_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.generated_posts p
      WHERE p.id = post_history.post_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS post_history_delete_via_post ON public.post_history;
CREATE POLICY post_history_delete_via_post ON public.post_history FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.generated_posts p
      WHERE p.id = post_history.post_id AND p.user_id = auth.uid()
    )
  );

-- export_batches
DROP POLICY IF EXISTS export_batches_select_own ON public.export_batches;
CREATE POLICY export_batches_select_own ON public.export_batches FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS export_batches_insert_own ON public.export_batches;
CREATE POLICY export_batches_insert_own ON public.export_batches FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS export_batches_update_own ON public.export_batches;
CREATE POLICY export_batches_update_own ON public.export_batches FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS export_batches_delete_own ON public.export_batches;
CREATE POLICY export_batches_delete_own ON public.export_batches FOR DELETE USING (user_id = auth.uid());
