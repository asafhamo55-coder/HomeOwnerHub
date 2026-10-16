// Client side of the envelope: the message to show a person for a failed
// response body. Never shows a bare code ("no_org") or "[object Object]"
// (C-12). Tolerates the legacy `{ error, message }` shape while routes
// migrate. Safe in client components (no server imports).

export function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback
  const b = body as { error?: unknown; message?: unknown }
  if (b.error && typeof b.error === 'object') {
    const m = (b.error as { message?: unknown }).message
    return typeof m === 'string' && m.trim() ? m : fallback
  }
  if (typeof b.message === 'string' && b.message.trim()) return b.message
  return fallback
}

/** Read a fetch Response's error message, surviving an HTML or empty body. */
export async function responseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    return apiErrorMessage(await res.json(), fallback)
  } catch {
    return fallback
  }
}
