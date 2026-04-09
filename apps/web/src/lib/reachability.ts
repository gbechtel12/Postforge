/** True when the failure is almost certainly "nothing listening" / offline API. */
export function isUnreachableBackendError(err: unknown): boolean {
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : err instanceof Error
        ? err.message
        : String(err)
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(
    msg
  )
}

export function unreachableBackendMessage(): string {
  const url = import.meta.env.VITE_SUPABASE_URL ?? '(not set)'
  return [
    `No response from Supabase at ${url}.`,
    'Start Docker, then run `pnpm db:start` from the repo root.',
    'Apply schema with `pnpm db:reset`.',
    'Edge Functions (Settings, Generate, etc.) need a second terminal: `pnpm functions:serve`.',
  ].join(' ')
}
