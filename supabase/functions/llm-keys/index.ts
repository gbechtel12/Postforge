import { corsHeaders } from '../_shared/cors.ts'
import { pathSegments } from '../_shared/path.ts'
import { requireAuth } from '../_shared/auth.ts'
import { ok, created, noContent, badRequest, notFound, serverError } from '../_shared/response.ts'

const PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'ideogram', 'stabilityai'])

function decryptKey(encrypted: string): string {
  try {
    return atob(encrypted)
  } catch {
    return encrypted
  }
}

async function validateProviderKey(provider: string, apiKey: string): Promise<{ valid: boolean; error: string | null }> {
  try {
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (res.status === 401) return { valid: false, error: 'Unauthorized' }
      if (!res.ok) return { valid: false, error: `OpenAI returned ${res.status}` }
      return { valid: true, error: null }
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
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      })
      if (res.status === 401) return { valid: false, error: 'Unauthorized' }
      if (res.ok || res.status === 400) return { valid: true, error: null }
      return { valid: false, error: `Anthropic returned ${res.status}` }
    }
    if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`
      )
      if (res.status === 401 || res.status === 403) return { valid: false, error: 'Unauthorized' }
      if (!res.ok) return { valid: false, error: `Gemini returned ${res.status}` }
      return { valid: true, error: null }
    }
    if (provider === 'stabilityai') {
      const res = await fetch('https://api.stability.ai/v1/user/account', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (res.status === 401 || res.status === 403) return { valid: false, error: 'Unauthorized' }
      if (!res.ok) return { valid: false, error: `Stability AI returned ${res.status}` }
      return { valid: true, error: null }
    }
    if (provider === 'ideogram') {
      const res = await fetch('https://api.ideogram.ai/v1/ideogram-api/account/profile', {
        headers: { 'Api-Key': apiKey },
      })
      if (res.status === 401 || res.status === 403) return { valid: false, error: 'Unauthorized' }
      if (res.ok || res.status === 404) return { valid: true, error: null }
      return { valid: false, error: `Ideogram returned ${res.status}` }
    }
    return { valid: false, error: 'Unknown provider' }
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : 'Request failed' }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const pathParts = pathSegments(req)
    const providerSeg = pathParts[1] ?? null
    const sub = pathParts[2] ?? null

    // GET /llm-keys
    if (req.method === 'GET' && !providerSeg) {
      const { supabase, userId } = await requireAuth(req)
      const { data, error } = await supabase
        .from('user_llm_keys')
        .select('id, provider, is_active, created_at')
        .eq('user_id', userId)
      if (error) throw error
      return ok(data ?? [])
    }

    // POST /llm-keys
    if (req.method === 'POST' && !providerSeg) {
      const { supabase, userId } = await requireAuth(req)
      const body = await req.json() as { provider?: string; api_key?: string }
      if (!body.provider || !PROVIDERS.has(body.provider)) {
        return badRequest('Invalid or missing provider')
      }
      if (typeof body.api_key !== 'string' || body.api_key.trim() === '') {
        return badRequest('api_key is required')
      }

      let encrypted: string
      const keyId = Deno.env.get('VAULT_KEY_ID')
      if (keyId) {
        const { data: vaultData, error: vaultErr } = await supabase.rpc('vault_encrypt', {
          secret: body.api_key,
          key_id: keyId,
        })
        if (!vaultErr && vaultData != null) {
          encrypted = typeof vaultData === 'string' ? vaultData : String(vaultData)
        } else {
          encrypted = btoa(body.api_key) // TODO: replace with Vault when vault_encrypt succeeds
        }
      } else {
        encrypted = btoa(body.api_key) // TODO: replace with Vault encryption when VAULT_KEY_ID is set
      }

      const { data, error } = await supabase
        .from('user_llm_keys')
        .upsert(
          {
            user_id: userId,
            provider: body.provider,
            api_key_encrypted: encrypted,
            is_active: true,
          },
          { onConflict: 'user_id,provider' }
        )
        .select('id, provider, is_active, created_at')
        .single()
      if (error) throw error
      return created(data)
    }

    // DELETE /llm-keys/:provider
    if (req.method === 'DELETE' && providerSeg && !sub) {
      const { supabase, userId } = await requireAuth(req)
      if (!PROVIDERS.has(providerSeg)) return notFound('Key not found')
      const { data, error } = await supabase
        .from('user_llm_keys')
        .delete()
        .eq('user_id', userId)
        .eq('provider', providerSeg)
        .select('id')
      if (error) throw error
      if (!data?.length) return notFound('Key not found')
      return noContent()
    }

    // POST /llm-keys/:provider/validate
    if (req.method === 'POST' && providerSeg && sub === 'validate') {
      const { supabase, userId } = await requireAuth(req)
      if (!PROVIDERS.has(providerSeg)) return notFound('Key not found')
      const { data: row, error } = await supabase
        .from('user_llm_keys')
        .select('api_key_encrypted')
        .eq('user_id', userId)
        .eq('provider', providerSeg)
        .single()
      if (error || !row) return notFound('Key not found')

      const raw = decryptKey(row.api_key_encrypted)
      const result = await validateProviderKey(providerSeg, raw)
      return ok({ valid: result.valid, provider: providerSeg, error: result.error })
    }

    return notFound()
  } catch (err) {
    if (err instanceof Response) return err
    console.error(err)
    return serverError()
  }
})
