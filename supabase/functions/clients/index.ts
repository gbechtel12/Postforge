import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { ok, created, noContent, badRequest, notFound, serverError } from '../_shared/response.ts'

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { supabase, userId } = await requireAuth(req)
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    // pathParts: ['clients'] or ['clients', ':id'] or ['clients', ':id', 'logo']
    const clientId = pathParts[1] ?? null
    const subResource = pathParts[2] ?? null

    // GET /clients
    if (req.method === 'GET' && !clientId) {
      const activeOnly = url.searchParams.get('active_only') !== 'false'
      let query = supabase
        .from('clients')
        .select('*')
        .eq('user_id', userId)
        .order('name')
      if (activeOnly) query = query.eq('is_active', true)
      const { data, error } = await query
      if (error) throw error
      return ok(data)
    }

    // GET /clients/:id
    if (req.method === 'GET' && clientId) {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .eq('user_id', userId)
        .single()
      if (error || !data) return notFound('Client not found')
      return ok(data)
    }

    // POST /clients
    if (req.method === 'POST' && !clientId) {
      const body = await req.json()
      if (!body.name) return badRequest('name is required')
      const { data, error } = await supabase
        .from('clients')
        .insert({ ...body, user_id: userId })
        .select()
        .single()
      if (error) throw error
      return created(data)
    }

    // PATCH /clients/:id
    if (req.method === 'PATCH' && clientId && !subResource) {
      const body = await req.json()
      const { data, error } = await supabase
        .from('clients')
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq('id', clientId)
        .eq('user_id', userId)
        .select()
        .single()
      if (error || !data) return notFound('Client not found')
      return ok(data)
    }

    // DELETE /clients/:id (soft delete)
    if (req.method === 'DELETE' && clientId) {
      const { error } = await supabase
        .from('clients')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', clientId)
        .eq('user_id', userId)
      if (error) return notFound('Client not found')
      return noContent()
    }

    return notFound()
  } catch (err) {
    if (err instanceof Response) return err
    console.error(err)
    return serverError()
  }
})
