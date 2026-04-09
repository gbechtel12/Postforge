import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { pathSegments } from '../_shared/path.ts'
import { requireAuth } from '../_shared/auth.ts'
import {
  ok,
  accepted,
  badRequest,
  notFound,
  paymentRequired,
  conflict,
  serverError,
} from '../_shared/response.ts'

function scheduleBackground(p: Promise<unknown>): void {
  const ER = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (x: Promise<unknown>) => void } })
    .EdgeRuntime
  if (ER?.waitUntil) ER.waitUntil(p)
  else void p.catch(console.error)
}

type JobRow = {
  id: string
  user_id: string
  client_id: string
  platform_id: string
  days_requested: number
  llm_provider: string
  image_provider: string | null
  status: string
  job_config: Record<string, unknown>
  error_message: string | null
  created_at: string
  completed_at: string | null
}

type ClientRow = {
  id: string
  name: string
  brand_voice: string | null
  prompt_template: string | null
  platform_defaults: Record<string, unknown> | null
  primary_color: string | null
  secondary_color: string | null
}

type PlatformRow = {
  id: string
  slug: string
  display_name: string
  max_caption_chars: number
  formatting_rules: Record<string, unknown>
}

function decryptKey(encrypted: string): string {
  try {
    return atob(encrypted)
  } catch {
    return encrypted
  }
}

async function fetchActiveKey(
  supabase: SupabaseClient,
  userId: string,
  provider: string
): Promise<string | null> {
  const { data } = await supabase
    .from('user_llm_keys')
    .select('api_key_encrypted')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('is_active', true)
    .single()
  if (!data?.api_key_encrypted) return null
  return decryptKey(data.api_key_encrypted)
}

function parseCaptionPayload(text: string): { caption: string; image_prompt: string } {
  let t = text.trim()
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m.exec(t)
  if (fence) t = fence[1].trim()
  const j = JSON.parse(t) as { caption?: unknown; image_prompt?: unknown }
  return {
    caption: typeof j.caption === 'string' ? j.caption : '',
    image_prompt: typeof j.image_prompt === 'string' ? j.image_prompt : '',
  }
}

export async function callLlm(provider: string, apiKey: string, prompt: string): Promise<{ caption: string; image_prompt: string }> {
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI ${res.status}: ${err}`)
    }
    const j = await res.json() as { choices?: { message?: { content?: string } }[] }
    const content = j.choices?.[0]?.message?.content ?? '{}'
    return parseCaptionPayload(content)
  }

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Anthropic ${res.status}: ${err}`)
    }
    const j = await res.json() as { content?: { type: string; text?: string }[] }
    const block = j.content?.find((c) => c.type === 'text')
    const content = block?.text ?? '{}'
    return parseCaptionPayload(content)
  }

  if (provider === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    )
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Gemini ${res.status}: ${err}`)
    }
    const j = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    return parseCaptionPayload(text)
  }

  throw new Error(`Unsupported LLM provider: ${provider}`)
}

function buildGenerationPrompt(
  client: ClientRow,
  platform: PlatformRow,
  day: number,
  jobConfig: Record<string, unknown>
): string {
  const platformDefaults =
    (client.platform_defaults?.[platform.slug] as Record<string, unknown> | undefined) ?? {}
  const toneOverrides = (jobConfig.tone_overrides as Record<string, unknown> | undefined) ?? {}
  const daysRequested = typeof jobConfig.days_requested === 'number' ? jobConfig.days_requested : 1

  return `
${client.prompt_template ?? `You are writing social media content for ${client.name}.`}

Platform: ${platform.display_name}
Max characters: ${platform.max_caption_chars}
Formatting rules: ${JSON.stringify(platform.formatting_rules)}
Tone: ${(toneOverrides.formality as string) ?? (platformDefaults.tone as string) ?? 'professional'}
Hashtag count: ${(platformDefaults.hashtag_count as number) ?? 5}
Include CTA: ${(platformDefaults.include_cta as boolean) ?? true}

Generate content for Day ${day} of ${daysRequested}.
Vary the topic and angle from previous days — do not repeat themes.

Respond with ONLY a valid JSON object in this exact shape:
{
  "caption": "the full post caption including hashtags",
  "image_prompt": "a detailed image generation prompt for DALL-E or Ideogram that describes a branded visual for this post. Include style, mood, colors ${client.primary_color ? `(brand color: ${client.primary_color})` : ''}, composition."
}
`.trim()
}

async function maybeGenerateImage(
  imageProvider: string | null,
  imageKey: string | null,
  imagePrompt: string
): Promise<string | null> {
  if (!imageProvider || !imageKey || !imagePrompt) return null
  if (imageProvider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${imageKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: imagePrompt.slice(0, 4000),
        n: 1,
        size: '1024x1024',
      }),
    })
    if (!res.ok) {
      console.error('OpenAI image gen failed', await res.text())
      return null
    }
    const j = await res.json() as { data?: { url?: string }[] }
    return j.data?.[0]?.url ?? null
  }
  console.warn(`Image provider ${imageProvider} not fully implemented — skipping image generation`)
  return null
}

async function bumpPostsErrored(supabase: SupabaseClient, jobId: string): Promise<void> {
  const { data: row } = await supabase.from('generation_jobs').select('job_config').eq('id', jobId).single()
  const jc = (row?.job_config as Record<string, unknown> | null) ?? {}
  const n = typeof jc.posts_errored === 'number' ? jc.posts_errored + 1 : 1
  await supabase
    .from('generation_jobs')
    .update({ job_config: { ...jc, posts_errored: n } })
    .eq('id', jobId)
}

async function runGenerationJob(
  supabase: SupabaseClient,
  job: JobRow,
  llmKey: string,
  imageKey: string | null,
  client: ClientRow,
  platform: PlatformRow
): Promise<void> {
  await supabase.from('generation_jobs').update({ status: 'processing' }).eq('id', job.id)

  for (let day = 1; day <= job.days_requested; day++) {
    const { data: current } = await supabase
      .from('generation_jobs')
      .select('status')
      .eq('id', job.id)
      .single()
    if (current?.status === 'cancelled') break

    try {
      const prompt = buildGenerationPrompt(client, platform, day, job.job_config)
      const { caption, image_prompt } = await callLlm(job.llm_provider, llmKey, prompt)
      let image_url: string | null = null
      if (job.image_provider) {
        image_url = await maybeGenerateImage(job.image_provider, imageKey, image_prompt)
      }

      const { error: insErr } = await supabase.from('generated_posts').insert({
        job_id: job.id,
        client_id: job.client_id,
        platform_id: job.platform_id,
        user_id: job.user_id,
        day_number: day,
        caption,
        image_prompt,
        image_url,
        status: 'generated',
        version: 1,
      })
      if (insErr) throw insErr
    } catch (err) {
      console.error(`Day ${day} generation failed:`, err)
      await bumpPostsErrored(supabase, job.id)
    }
  }

  const { data: final } = await supabase
    .from('generation_jobs')
    .select('status')
    .eq('id', job.id)
    .single()

  if (final?.status === 'cancelled') return

  await supabase
    .from('generation_jobs')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.id)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const pathParts = pathSegments(req)
    const jobSeg = pathParts[1] ?? null
    const action = pathParts[2] ?? null

    const { supabase, userId } = await requireAuth(req)

    // GET /generate/:jobId/status
    if (req.method === 'GET' && jobSeg && action === 'status') {
      const { data: job, error: jobErr } = await supabase
        .from('generation_jobs')
        .select('id, status, days_requested, job_config, error_message')
        .eq('id', jobSeg)
        .eq('user_id', userId)
        .single()
      if (jobErr || !job) return notFound('Job not found')

      const { count, error: cErr } = await supabase
        .from('generated_posts')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', jobSeg)
      if (cErr) throw cErr

      const jc = job.job_config as Record<string, unknown> | null
      const posts_errored = typeof jc?.posts_errored === 'number' ? jc.posts_errored : 0

      return ok({
        job_id: job.id,
        status: job.status,
        posts_total: job.days_requested,
        posts_complete: count ?? 0,
        posts_errored,
        error_message: job.error_message,
      })
    }

    // POST /generate/:jobId/cancel
    if (req.method === 'POST' && jobSeg && action === 'cancel') {
      const { data: job, error: jobErr } = await supabase
        .from('generation_jobs')
        .select('id, status')
        .eq('id', jobSeg)
        .eq('user_id', userId)
        .single()
      if (jobErr || !job) return notFound('Job not found')
      if (!['pending', 'processing'].includes(job.status)) {
        return conflict('Job already completed or cancelled')
      }
      const { error: updErr } = await supabase
        .from('generation_jobs')
        .update({ status: 'cancelled' })
        .eq('id', jobSeg)
        .eq('user_id', userId)
      if (updErr) throw updErr
      return ok({ cancelled: true, job_id: jobSeg })
    }

    // POST /generate
    if (req.method === 'POST' && !jobSeg) {
      const body = await req.json() as {
        client_id?: string
        platform_id?: string
        days_requested?: number
        llm_provider?: string
        image_provider?: string | null
        tone_overrides?: { formality?: string; promotional_ratio?: number }
      }

      if (!body.client_id || !body.platform_id || body.days_requested == null || !body.llm_provider) {
        return badRequest('client_id, platform_id, days_requested, and llm_provider are required')
      }
      if (!Number.isInteger(body.days_requested) || body.days_requested < 1 || body.days_requested > 30) {
        return badRequest('days_requested must be between 1 and 30')
      }
      const llmP = body.llm_provider
      if (!['openai', 'anthropic', 'gemini'].includes(llmP)) {
        return badRequest('Invalid llm_provider')
      }
      if (
        body.image_provider != null &&
        !['openai', 'ideogram', 'stabilityai'].includes(body.image_provider)
      ) {
        return badRequest('Invalid image_provider')
      }

      const { data: client, error: cErr } = await supabase
        .from('clients')
        .select(
          'id, name, brand_voice, prompt_template, platform_defaults, primary_color, secondary_color'
        )
        .eq('id', body.client_id)
        .eq('user_id', userId)
        .single()
      if (cErr || !client) return notFound('Client not found')

      const { data: platform, error: pErr } = await supabase
        .from('platforms')
        .select('id, slug, display_name, max_caption_chars, formatting_rules')
        .eq('id', body.platform_id)
        .single()
      if (pErr || !platform) return notFound('Platform not found')

      const llmKey = await fetchActiveKey(supabase, userId, llmP)
      if (!llmKey) {
        return paymentRequired('No active API key for the selected LLM provider')
      }

      let imageKey: string | null = null
      if (body.image_provider) {
        imageKey = await fetchActiveKey(supabase, userId, body.image_provider)
        if (!imageKey) {
          return paymentRequired('No active API key for the selected image provider')
        }
      }

      const job_config = {
        client_name: client.name,
        platform_slug: platform.slug,
        prompt_template: client.prompt_template,
        platform_defaults: client.platform_defaults,
        tone_overrides: body.tone_overrides ?? null,
        days_requested: body.days_requested,
        posts_errored: 0,
        timestamp: new Date().toISOString(),
      }

      const { data: job, error: jErr } = await supabase
        .from('generation_jobs')
        .insert({
          user_id: userId,
          client_id: body.client_id,
          platform_id: body.platform_id,
          days_requested: body.days_requested,
          llm_provider: llmP,
          image_provider: body.image_provider ?? null,
          status: 'pending',
          job_config,
        })
        .select()
        .single()
      if (jErr || !job) throw jErr ?? new Error('Failed to create job')

      const jobRow = job as JobRow
      const clientRow = client as ClientRow
      const platformRow = platform as PlatformRow

      scheduleBackground(
        runGenerationJob(supabase, jobRow, llmKey, imageKey, clientRow, platformRow).catch((e) => {
          console.error('runGenerationJob failed', e)
          return supabase
            .from('generation_jobs')
            .update({
              status: 'error',
              error_message: e instanceof Error ? e.message : 'Generation failed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', jobRow.id)
        })
      )

      return accepted(job)
    }

    return notFound()
  } catch (err) {
    if (err instanceof Response) return err
    console.error(err)
    return serverError()
  }
})
