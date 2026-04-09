import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { pathSegments } from '../_shared/path.ts'
import { ok, notFound, serverError } from '../_shared/response.ts'

const SLUGS = new Set(['facebook', 'instagram', 'linkedin', 'x', 'tiktok'])

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const pathParts = pathSegments(req)
  const slug = pathParts[1] ?? null

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })

    // GET /platforms
    if (req.method === 'GET' && !slug) {
      const { data, error } = await supabase
        .from('platforms')
        .select('*')
        .order('display_name')
      if (error) throw error
      return ok(data ?? [])
    }

    // GET /platforms/:slug
    if (req.method === 'GET' && slug) {
      if (!SLUGS.has(slug)) return notFound('Platform not found')
      const { data, error } = await supabase.from('platforms').select('*').eq('slug', slug).single()
      if (error || !data) return notFound('Platform not found')
      return ok(data)
    }

    return notFound()
  } catch (err) {
    if (err instanceof Response) return err
    console.error(err)
    return serverError()
  }
})
