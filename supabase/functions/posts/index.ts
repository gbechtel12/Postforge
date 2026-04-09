import { corsHeaders } from '../_shared/cors.ts'
import { pathSegments } from '../_shared/path.ts'
import { requireAuth } from '../_shared/auth.ts'
import { ok, badRequest, notFound, serverError } from '../_shared/response.ts'
import { getPostHistory, restorePostVersion } from '../_shared/post-history.ts'

const postSelect =
  'id, job_id, client_id, platform_id, day_number, caption, image_prompt, image_url, image_storage_path, status, user_notes, version, created_at, updated_at'

const POST_STATUSES = new Set(['generated', 'approved', 'exported', 'archived'])

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { supabase, userId } = await requireAuth(req)
    const url = new URL(req.url)
    const pathParts = pathSegments(req)
    const postId = pathParts[1] ?? null
    const seg2 = pathParts[2] ?? null
    const seg3 = pathParts[3] ?? null
    const seg4 = pathParts[4] ?? null

    // GET /posts/:postId/history (OpenAPI)
    if (req.method === 'GET' && postId && seg2 === 'history' && !seg3) {
      return await getPostHistory(supabase, userId, postId)
    }

    // POST /posts/:postId/history/:version/restore
    if (req.method === 'POST' && postId && seg2 === 'history' && seg3 && seg4 === 'restore') {
      return await restorePostVersion(supabase, userId, postId, seg3)
    }

    // GET /posts
    if (req.method === 'GET' && !postId) {
      const jobId = url.searchParams.get('job_id')
      const clientId = url.searchParams.get('client_id')
      const platformId = url.searchParams.get('platform_id')
      const status = url.searchParams.get('status')
      let limit = Number(url.searchParams.get('limit') ?? 20)
      let offset = Number(url.searchParams.get('offset') ?? 0)
      if (!Number.isFinite(limit) || limit < 1) limit = 20
      if (limit > 100) limit = 100
      if (!Number.isFinite(offset) || offset < 0) offset = 0

      let query = supabase
        .from('generated_posts')
        .select(postSelect, { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (jobId) query = query.eq('job_id', jobId)
      if (clientId) query = query.eq('client_id', clientId)
      if (platformId) query = query.eq('platform_id', platformId)
      if (status) query = query.eq('status', status)

      const end = offset + limit - 1
      const { data, error, count } = await query.range(offset, end)
      if (error) throw error
      return ok({
        data: data ?? [],
        total: count ?? 0,
        limit,
        offset,
      })
    }

    // GET /posts/:id
    if (req.method === 'GET' && postId && !seg2) {
      const { data, error } = await supabase
        .from('generated_posts')
        .select(postSelect)
        .eq('id', postId)
        .eq('user_id', userId)
        .single()
      if (error || !data) return notFound('Post not found')
      return ok(data)
    }

    // PATCH /posts/:id
    if (req.method === 'PATCH' && postId && !seg2) {
      const raw = await req.json() as Record<string, unknown>
      const patch: Record<string, unknown> = {}
      if ('status' in raw) {
        if (typeof raw.status !== 'string' || !POST_STATUSES.has(raw.status)) {
          return badRequest('Invalid status')
        }
        patch.status = raw.status
      }
      if ('user_notes' in raw) {
        if (raw.user_notes !== null && typeof raw.user_notes !== 'string') {
          return badRequest('Invalid user_notes')
        }
        patch.user_notes = raw.user_notes
      }
      if ('caption' in raw) {
        if (typeof raw.caption !== 'string') return badRequest('Invalid caption')
        patch.caption = raw.caption
      }
      if (Object.keys(patch).length === 0) return badRequest('No valid fields to update')

      patch.updated_at = new Date().toISOString()

      const { data, error } = await supabase
        .from('generated_posts')
        .update(patch)
        .eq('id', postId)
        .eq('user_id', userId)
        .select(postSelect)
        .single()
      if (error || !data) return notFound('Post not found')
      return ok(data)
    }

    return notFound()
  } catch (err) {
    if (err instanceof Response) return err
    console.error(err)
    return serverError()
  }
})
