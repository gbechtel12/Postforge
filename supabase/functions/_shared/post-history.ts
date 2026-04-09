import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, notFound, badRequest } from './response.ts'

const postSelect =
  'id, job_id, client_id, platform_id, day_number, caption, image_prompt, image_url, image_storage_path, status, user_notes, version, created_at, updated_at'

export async function getPostHistory(
  supabase: SupabaseClient,
  userId: string,
  postId: string
): Promise<Response> {
  const { data: post, error: postErr } = await supabase
    .from('generated_posts')
    .select('id')
    .eq('id', postId)
    .eq('user_id', userId)
    .single()
  if (postErr || !post) return notFound('Post not found')

  const { data, error } = await supabase
    .from('post_history')
    .select('id, post_id, caption, image_prompt, image_url, version, created_at')
    .eq('post_id', postId)
    .order('version', { ascending: true })
  if (error) throw error
  return ok(data ?? [])
}

export async function restorePostVersion(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
  versionStr: string
): Promise<Response> {
  const version = Number(versionStr)
  if (!Number.isInteger(version) || version < 1) {
    return badRequest('Invalid version')
  }

  const { data: post, error: postErr } = await supabase
    .from('generated_posts')
    .select(postSelect)
    .eq('id', postId)
    .eq('user_id', userId)
    .single()
  if (postErr || !post) return notFound('Post not found')

  const { data: hist, error: histErr } = await supabase
    .from('post_history')
    .select('caption, image_prompt, image_url, version')
    .eq('post_id', postId)
    .eq('version', version)
    .single()
  if (histErr || !hist) return notFound('History entry not found')

  const { error: snapErr } = await supabase.from('post_history').insert({
    post_id: postId,
    user_id: userId,
    caption: post.caption,
    image_prompt: post.image_prompt,
    image_url: post.image_url,
    version: post.version,
  })
  if (snapErr) throw snapErr

  const nextVersion = post.version + 1
  const { data: updated, error: updErr } = await supabase
    .from('generated_posts')
    .update({
      caption: hist.caption,
      image_prompt: hist.image_prompt,
      image_url: hist.image_url,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .eq('user_id', userId)
    .select(postSelect)
    .single()
  if (updErr || !updated) throw updErr ?? new Error('Update failed')
  return ok(updated)
}
