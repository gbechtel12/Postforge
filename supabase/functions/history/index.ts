import { corsHeaders } from '../_shared/cors.ts'
import { pathSegments } from '../_shared/path.ts'
import { requireAuth } from '../_shared/auth.ts'
import { notFound, serverError } from '../_shared/response.ts'
import { getPostHistory, restorePostVersion } from '../_shared/post-history.ts'

/**
 * Alternate routes under /functions/v1/history/...
 * OpenAPI uses /posts/:postId/history — see posts function for that path.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { supabase, userId } = await requireAuth(req)
    const pathParts = pathSegments(req)
    const postId = pathParts[1] ?? null
    const seg2 = pathParts[2] ?? null
    const seg3 = pathParts[3] ?? null
    const seg4 = pathParts[4] ?? null

    // GET /history/:postId/history
    if (req.method === 'GET' && postId && seg2 === 'history' && !seg3) {
      return await getPostHistory(supabase, userId, postId)
    }

    // POST /history/:postId/history/:version/restore
    if (req.method === 'POST' && postId && seg2 === 'history' && seg3 && seg4 === 'restore') {
      return await restorePostVersion(supabase, userId, postId, seg3)
    }

    return notFound()
  } catch (err) {
    if (err instanceof Response) return err
    console.error(err)
    return serverError()
  }
})
