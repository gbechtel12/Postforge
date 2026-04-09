import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { pathSegments } from '../_shared/path.ts'
import { ok, notFound, serverError } from '../_shared/response.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const pathParts = pathSegments(req)

  try {
    // POST /auth/refresh — no auth
    if (req.method === 'POST' && pathParts[1] === 'refresh') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      const body = await req.json().catch(() => null) as { refresh_token?: string } | null
      if (!body?.refresh_token) {
        return new Response(
          JSON.stringify({ error: 'unauthorized', message: 'refresh_token is required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
      const { data, error } = await anon.auth.refreshSession({ refresh_token: body.refresh_token })
      if (error || !data.session) {
        return new Response(
          JSON.stringify({ error: 'unauthorized', message: error?.message ?? 'Invalid refresh token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return ok({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in ?? 3600,
      })
    }

    // GET /auth/me
    if (req.method === 'GET' && pathParts[1] === 'me') {
      const { supabase, userId } = await requireAuth(req)
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, plan_tier, created_at')
        .eq('id', userId)
        .single()
      if (error || !data) return notFound('User not found')
      return ok(data)
    }

    return notFound()
  } catch (err) {
    if (err instanceof Response) return err
    console.error(err)
    return serverError()
  }
})
