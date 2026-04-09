// ── Shared domain types ───────────────────────────────────────────────────────
// These mirror the OpenAPI schemas in api/spec/openapi.yaml.
// Keep in sync manually until codegen is wired up.

export type PlanTier = 'free' | 'pro' | 'agency'

export type LlmProvider = 'openai' | 'anthropic' | 'gemini'

export type ImageProvider = 'openai' | 'ideogram' | 'stabilityai'

export type PlatformSlug = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'tiktok'

export type JobStatus = 'pending' | 'processing' | 'complete' | 'error' | 'cancelled'

export type PostStatus = 'generated' | 'approved' | 'exported' | 'archived'

export type ExportFormat = 'csv' | 'json' | 'zip'

/** One-time tone dials for a generation job (see GenerationJobInput.tone_overrides). */
export type ToneFormality = 'casual' | 'balanced' | 'formal'

export interface ToneOverrides {
  formality: ToneFormality
  promotional_ratio: number
}

export interface PostListResponse {
  data: GeneratedPost[]
  total: number
  limit: number
  offset: number
}

export interface User {
  id: string
  email: string
  full_name: string | null
  plan_tier: PlanTier
  created_at: string
}

export interface LlmKeyMeta {
  id: string
  provider: LlmProvider | ImageProvider
  is_active: boolean
  created_at: string
}

export interface LlmKeyValidateResult {
  valid: boolean
  provider?: string
  error?: string | null
}

/** Per-platform overrides stored on `clients.platform_defaults` (see OpenAPI Client schema). */
export interface PlatformDefaultEntry {
  tone: string
  hashtag_count: number
  include_cta: boolean
}

export type PlatformDefaults = Partial<
  Record<PlatformSlug, PlatformDefaultEntry>
>

export interface Client {
  id: string
  user_id: string
  name: string
  industry: string | null
  website: string | null
  logo_url: string | null
  /** Present when the API returns raw storage metadata (e.g. edge function `select('*')`). */
  logo_storage_path?: string | null
  brand_voice: string | null
  prompt_template: string | null
  platform_defaults: PlatformDefaults | Record<string, unknown> | null
  primary_color: string | null
  secondary_color: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Platform {
  id: string
  slug: PlatformSlug
  display_name: string
  max_caption_chars: number
  aspect_ratio: string
  formatting_rules: Record<string, unknown>
}

export interface GenerationJob {
  id: string
  client_id: string
  platform_id: string
  days_requested: number
  llm_provider: LlmProvider
  status: JobStatus
  job_config: Record<string, unknown>
  created_at: string
  completed_at: string | null
}

export interface GenerationJobStatus {
  job_id: string
  status: JobStatus
  posts_total: number
  posts_complete: number
  posts_errored: number
  error_message: string | null
}

export interface GeneratedPost {
  id: string
  job_id: string
  client_id: string
  platform_id: string
  day_number: number
  caption: string
  image_prompt: string | null
  image_url: string | null
  image_storage_path: string | null
  status: PostStatus
  user_notes: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface PostHistoryEntry {
  id: string
  post_id: string
  caption: string
  image_prompt: string | null
  image_url: string | null
  version: number
  created_at: string
}

export interface ExportBatch {
  id: string
  job_id: string
  format: ExportFormat
  storage_path: string | null
  download_url: string | null
  created_at: string
}
