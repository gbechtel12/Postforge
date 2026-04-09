import { corsHeaders } from './cors.ts'

export function ok<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function created<T>(data: T): Response {
  return ok(data, 201)
}

export function accepted<T>(data: T): Response {
  return ok(data, 202)
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export function badRequest(message: string, details?: unknown): Response {
  return new Response(
    JSON.stringify({ error: 'validation_error', message, details }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

export function paymentRequired(message: string): Response {
  return new Response(
    JSON.stringify({ error: 'payment_required', message }),
    { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

export function notFound(message = 'Not found'): Response {
  return new Response(
    JSON.stringify({ error: 'not_found', message }),
    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

export function conflict(message: string): Response {
  return new Response(
    JSON.stringify({ error: 'conflict', message }),
    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

export function serverError(message = 'Internal server error'): Response {
  return new Response(
    JSON.stringify({ error: 'server_error', message }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
