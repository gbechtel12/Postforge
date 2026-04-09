/**
 * Export generated posts (CSV, JSON, ZIP).
 *
 * Requires a private `exports` storage bucket (created in migration
 * `20260403000001_initial_schema.sql` via storage.buckets insert).
 * If missing locally, run: `pnpm db:reset` or insert the bucket in the dashboard.
 */
import { zipSync, strToU8 } from 'https://esm.sh/fflate@0.8.2'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { pathSegments } from '../_shared/path.ts'
import { requireAuth } from '../_shared/auth.ts'
import {
  ok,
  accepted,
  badRequest,
  notFound,
  serverError,
} from '../_shared/response.ts'

const postSelect =
  'id, job_id, client_id, platform_id, day_number, caption, image_prompt, image_url, image_storage_path, status, user_notes, version, created_at, updated_at'

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function buildCsvRow(
  day: number,
  platformSlug: string,
  caption: string,
  imagePrompt: string,
  imageUrl: string,
  status: string
): string {
  return [
    String(day),
    escapeCsvCell(platformSlug),
    escapeCsvCell(caption),
    escapeCsvCell(imagePrompt),
    escapeCsvCell(imageUrl),
    escapeCsvCell(status),
  ].join(',')
}

async function loadPostsForExport(
  supabase: SupabaseClient,
  userId: string,
  jobId: string,
  statusFilter: 'all' | 'approved'
) {
  let q = supabase
    .from('generated_posts')
    .select(postSelect)
    .eq('job_id', jobId)
    .eq('user_id', userId)
    .order('day_number', { ascending: true })
  if (statusFilter === 'approved') q = q.eq('status', 'approved')
  const { data: posts, error } = await q
  if (error) throw error
  const list = posts ?? []
  const platformIds = [...new Set(list.map((p) => p.platform_id))]
  const { data: plats } = await supabase.from('platforms').select('id, slug').in('id', platformIds)
  const slugById = Object.fromEntries((plats ?? []).map((p) => [p.id, p.slug as string]))
  return { posts: list, slugById }
}

async function runZipExport(
  supabase: SupabaseClient,
  batchId: string,
  userId: string,
  jobId: string,
  posts: Array<{
    day_number: number
    platform_id: string
    caption: string
    image_prompt: string | null
    image_url: string | null
  }>,
  slugById: Record<string, string>,
  includeImages: boolean
): Promise<void> {
  try {
    const files: Record<string, Uint8Array> = {}
    for (const p of posts) {
      const slug = slugById[p.platform_id] ?? 'platform'
      const safeSlug = slug.replace(/[^a-z0-9_-]/gi, '_')
      const base = `day-${p.day_number}-${safeSlug}`
      const text = `${p.caption}\n\n---\n\n${p.image_prompt ?? ''}`
      files[`${base}.txt`] = strToU8(text)
      if (includeImages && p.image_url) {
        try {
          const imgRes = await fetch(p.image_url)
          if (imgRes.ok) {
            const buf = new Uint8Array(await imgRes.arrayBuffer())
            files[`${base}.jpg`] = buf
          }
        } catch (e) {
          console.warn('Failed to fetch image for', p.day_number, e)
        }
      }
    }
    const zipped = zipSync(files)
    const storagePath = `${userId}/${jobId}/${batchId}.zip`
    const { error: upErr } = await supabase.storage
      .from('exports')
      .upload(storagePath, zipped, {
        contentType: 'application/zip',
        upsert: true,
      })
    if (upErr) throw upErr
    const { error: updErr } = await supabase
      .from('export_batches')
      .update({ storage_path: storagePath, status: 'complete' })
      .eq('id', batchId)
    if (updErr) throw updErr
  } catch (e) {
    console.error('ZIP export failed', e)
    await supabase
      .from('export_batches')
      .update({ status: 'error' })
      .eq('id', batchId)
  }
}

function scheduleBackground(p: Promise<unknown>): void {
  const ER = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (x: Promise<unknown>) => void } })
    .EdgeRuntime
  if (ER?.waitUntil) ER.waitUntil(p)
  else void p.catch(console.error)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const pathParts = pathSegments(req)
    const batchSeg = pathParts[1] ?? null
    const dl = pathParts[2] ?? null

    const { supabase, userId } = await requireAuth(req)

    // GET /export/:batchId/download
    if (req.method === 'GET' && batchSeg && dl === 'download') {
      const { data: batch, error } = await supabase
        .from('export_batches')
        .select('id, user_id, status, storage_path, format')
        .eq('id', batchSeg)
        .eq('user_id', userId)
        .single()
      if (error || !batch) return notFound('Export batch not found')
      if (batch.status !== 'complete' || !batch.storage_path) {
        return notFound('Export is not ready for download')
      }
      const { data: signed, error: signErr } = await supabase.storage
        .from('exports')
        .createSignedUrl(batch.storage_path, 900)
      if (signErr || !signed?.signedUrl) {
        console.error(signErr)
        return serverError('Could not create download URL')
      }
      const expires_at = new Date(Date.now() + 900_000).toISOString()
      return ok({ download_url: signed.signedUrl, expires_at })
    }

    // POST /export
    if (req.method === 'POST' && !batchSeg) {
      const body = await req.json() as {
        job_id?: string
        format?: string
        include_images?: boolean
        status_filter?: string
      }
      if (!body.job_id || !body.format) {
        return badRequest('job_id and format are required')
      }
      if (!['csv', 'json', 'zip'].includes(body.format)) {
        return badRequest('format must be csv, json, or zip')
      }
      const status_filter = body.status_filter === 'approved' ? 'approved' : 'all'
      const include_images = body.include_images !== false

      const { data: job, error: jobErr } = await supabase
        .from('generation_jobs')
        .select('id, status')
        .eq('id', body.job_id)
        .eq('user_id', userId)
        .single()
      if (jobErr || !job) return notFound('Job not found')
      if (job.status !== 'complete') {
        return badRequest('Job must be complete before export')
      }

      const { posts, slugById } = await loadPostsForExport(
        supabase,
        userId,
        body.job_id,
        status_filter
      )

      if (body.format === 'zip') {
        const { data: batch, error: bErr } = await supabase
          .from('export_batches')
          .insert({
            job_id: body.job_id,
            user_id: userId,
            format: 'zip',
            status: 'processing',
          })
          .select()
          .single()
        if (bErr || !batch) throw bErr ?? new Error('batch insert failed')

        scheduleBackground(
          runZipExport(
            supabase,
            batch.id,
            userId,
            body.job_id,
            posts.map((p) => ({
              day_number: p.day_number,
              platform_id: p.platform_id,
              caption: p.caption,
              image_prompt: p.image_prompt,
              image_url: p.image_url,
            })),
            slugById,
            include_images
          )
        )

        return accepted(batch)
      }

      const { data: batch, error: bErr } = await supabase
        .from('export_batches')
        .insert({
          job_id: body.job_id,
          user_id: userId,
          format: body.format,
          status: 'complete',
        })
        .select()
        .single()
      if (bErr || !batch) throw bErr ?? new Error('batch insert failed')

      if (body.format === 'csv') {
        const header = 'day_number,platform,caption,image_prompt,image_url,status'
        const rows = posts.map((p) =>
          buildCsvRow(
            p.day_number,
            slugById[p.platform_id] ?? '',
            p.caption,
            p.image_prompt ?? '',
            p.image_url ?? '',
            p.status
          )
        )
        const csv = [header, ...rows].join('\r\n')
        return new Response(csv, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="postforge-export-${body.job_id}.csv"`,
          },
        })
      }

      // json
      return ok(posts)
    }

    return notFound()
  } catch (err) {
    if (err instanceof Response) return err
    console.error(err)
    return serverError()
  }
})
