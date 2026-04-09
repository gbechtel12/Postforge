# Agent 3 — Generation Engine (Core Feature)

## Your job
Implement the generation job orchestrator — the heart of PostForge. This
is the most complex Edge Function and warrants its own agent.

## Output file
`supabase/functions/generate/index.ts`

## Pattern reference
Read `supabase/functions/clients/index.ts` for the base structure.
Read `supabase/functions/_shared/` for all helpers.

## What this function does
1. Receives a generation request (client, platform, days, LLM provider)
2. Creates a `generation_jobs` record with status `pending`
3. Returns 202 immediately with the job record
4. Kicks off async generation (using Deno background tasks)
5. For each day (1 through days_requested):
   a. Builds a prompt using the client's prompt_template + platform rules
   b. Calls the user's LLM to generate a caption + image prompt
   c. Optionally calls image generation API if image_provider is set
   d. Saves each post to `generated_posts`
   e. Updates job status and progress in `generation_jobs`
6. Marks job as `complete` (or `error` if it fails)

---

## Routes

### POST /generate
**Request body:**
```typescript
{
  client_id: string        // uuid
  platform_id: string      // uuid
  days_requested: number   // 1-30
  llm_provider: string     // openai | anthropic | gemini
  image_provider?: string  // openai | ideogram | stabilityai | null
  tone_overrides?: {
    formality?: string
    promotional_ratio?: number
  }
}
```

**Steps:**
1. Validate all required fields
2. Verify client exists and belongs to user
3. Verify platform exists
4. Fetch user's LLM key for the specified provider — return 402 if not found
5. Fetch client details (name, brand_voice, prompt_template, platform_defaults)
6. Fetch platform details (display_name, max_caption_chars, formatting_rules)
7. Create generation_jobs record:
   ```typescript
   {
     user_id: userId,
     client_id, platform_id, days_requested, llm_provider, image_provider,
     status: 'pending',
     job_config: {
       // snapshot everything used for this job
       client_name: client.name,
       platform_slug: platform.slug,
       prompt_template: client.prompt_template,
       platform_defaults: client.platform_defaults,
       tone_overrides,
       timestamp: new Date().toISOString()
     }
   }
   ```
8. Return 202 with the job record
9. Fire background task with `EdgeRuntime.waitUntil(runGenerationJob(...))`

### GET /generate/:jobId/status
- Requires auth
- Return job status + progress counts from generation_jobs
- Count posts_complete: SELECT COUNT(*) FROM generated_posts WHERE job_id = :jobId
- Count posts_errored from job metadata
- Response shape:
  ```typescript
  {
    job_id: string
    status: string
    posts_total: number
    posts_complete: number
    posts_errored: number
    error_message: string | null
  }
  ```

### POST /generate/:jobId/cancel
- Requires auth
- If status is pending or processing, update to cancelled
- If already complete/cancelled/error, return 409

---

## Background job function

```typescript
async function runGenerationJob(
  supabase: SupabaseClient,
  job: GenerationJob,
  llmKey: string,
  client: Client,
  platform: Platform
) {
  // Update status to processing
  await supabase.from('generation_jobs')
    .update({ status: 'processing' })
    .eq('id', job.id)

  const posts = []

  for (let day = 1; day <= job.days_requested; day++) {
    // Check if cancelled between iterations
    const { data: current } = await supabase
      .from('generation_jobs').select('status').eq('id', job.id).single()
    if (current?.status === 'cancelled') break

    try {
      // Build the prompt
      const prompt = buildGenerationPrompt(client, platform, day, job.job_config)

      // Call LLM
      const { caption, image_prompt } = await callLlm(
        job.llm_provider, llmKey, prompt
      )

      // Optionally generate image
      let image_url = null
      if (job.image_provider) {
        // image generation call here
      }

      // Save post
      const { data: post } = await supabase
        .from('generated_posts')
        .insert({
          job_id: job.id,
          client_id: job.client_id,
          platform_id: job.platform_id,
          user_id: job.user_id,
          day_number: day,
          caption,
          image_prompt,
          image_url,
          status: 'generated',
          version: 1
        })
        .select().single()

      posts.push(post)
    } catch (err) {
      console.error(`Day ${day} generation failed:`, err)
      // Continue with remaining days — partial success is ok
    }
  }

  // Mark complete
  await supabase.from('generation_jobs').update({
    status: 'complete',
    completed_at: new Date().toISOString()
  }).eq('id', job.id)
}
```

## LLM caller function

Implement `callLlm(provider, apiKey, prompt)` that routes to the correct API:

**OpenAI (gpt-4o):**
```typescript
const res = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' }
  })
})
```

**Anthropic (claude-sonnet-4-5):**
```typescript
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  })
})
```

**Gemini (gemini-1.5-flash):**
```typescript
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  }
)
```

All three must return `{ caption: string, image_prompt: string }` by
parsing the response and extracting JSON. Include fallback parsing if
the LLM wraps the JSON in markdown code fences.

## Prompt builder function

Implement `buildGenerationPrompt(client, platform, day, jobConfig)`:

```typescript
function buildGenerationPrompt(client, platform, day, jobConfig) {
  const platformDefaults = client.platform_defaults?.[platform.slug] ?? {}
  const toneOverrides = jobConfig.tone_overrides ?? {}

  return `
${client.prompt_template ?? `You are writing social media content for ${client.name}.`}

Platform: ${platform.display_name}
Max characters: ${platform.max_caption_chars}
Formatting rules: ${JSON.stringify(platform.formatting_rules)}
Tone: ${toneOverrides.formality ?? platformDefaults.tone ?? 'professional'}
Hashtag count: ${platformDefaults.hashtag_count ?? 5}
Include CTA: ${platformDefaults.include_cta ?? true}

Generate content for Day ${day} of ${jobConfig.days_requested}.
Vary the topic and angle from previous days — do not repeat themes.

Respond with ONLY a valid JSON object in this exact shape:
{
  "caption": "the full post caption including hashtags",
  "image_prompt": "a detailed image generation prompt for DALL-E or Ideogram that describes a branded visual for this post. Include style, mood, colors ${client.primary_color ? `(brand color: ${client.primary_color})` : ''}, composition."
}
`.trim()
}
```

## Acceptance criteria
- [ ] POST /generate returns 202 with job record immediately
- [ ] Background task starts after response is sent
- [ ] Each of the 3 LLM providers works independently
- [ ] Partial failures (one day fails) don't kill the whole job
- [ ] Cancelled jobs stop processing between day iterations
- [ ] Status endpoint returns accurate progress counts
- [ ] Generated posts appear in `generated_posts` table as they complete
- [ ] job_config snapshot is stored on the job record
- [ ] 402 returned when no LLM key found for provider
