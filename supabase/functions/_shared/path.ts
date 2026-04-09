/**
 * Normalize pathname so routing works for both `/fn/...` and `/functions/v1/fn/...`
 * (Supabase may forward either shape depending on environment).
 */
export function pathSegments(req: Request): string[] {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean)
  const v1 = parts.indexOf('v1')
  if (v1 >= 0 && parts.length > v1 + 1) {
    return parts.slice(v1 + 1)
  }
  return parts
}
