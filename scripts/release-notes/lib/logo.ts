// Picks the header logo for the internal emails. Prod can serve an older
// logo folder than the repo (the rebrand shipped /email/v4/ before the
// deploy), so a send checks LOGO_DIRS in order and uses the first URL that
// answers 200 with an image. If none do, the header falls back to a text
// wordmark. The check never throws and is bounded by a timeout; logs carry
// only the folder name.

import { BRAND, LOGO_DIRS, LOGO_FILE } from './brand'

export const LOGO_CHECK_TIMEOUT_MS = 5000

let resolved: string | null | undefined

/** The URL the header should use: the resolved one, else the default first choice. */
export function getLogoUrl(): string | null {
  return resolved === undefined ? BRAND.logoUrl : resolved
}

/** Forget a previous resolution (tests). */
export function resetLogo(): void {
  resolved = undefined
}

const isImage = (res: Response) => (res.headers.get('content-type') ?? '').toLowerCase().startsWith('image/')

/** One request with its own timer; null on a network error or timeout. */
async function attempt(url: string, f: typeof fetch, timeoutMs: number, init: RequestInit): Promise<Response | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await f(url, { ...init, signal: ctl.signal, redirect: 'follow' })
    // Only the status line and headers matter; never download the body.
    if (init.method === 'GET') await res.body?.cancel().catch(() => {})
    return res
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * HEAD first. Some hosts answer HEAD with 405/403/501, or a 200 with no
 * content-type, so those retry once with GET and Range: bytes=0-0 and accept
 * 200 or 206 with an image type. At most two attempts, each with its own timer.
 */
async function loads(url: string, f: typeof fetch, timeoutMs: number): Promise<boolean> {
  const head = await attempt(url, f, timeoutMs, { method: 'HEAD' })
  if (!head) return false
  const type = head.headers.get('content-type')
  if (head.status === 200 && type) return isImage(head)
  if (![403, 405, 501].includes(head.status) && !(head.status === 200 && !type)) return false
  const get = await attempt(url, f, timeoutMs, { method: 'GET', headers: { Range: 'bytes=0-0' } })
  return !!get && (get.status === 200 || get.status === 206) && isImage(get)
}

/**
 * Checks each logo folder in order and remembers the first that loads (or
 * null when none do). Never throws.
 */
export async function resolveLogo(
  f: typeof fetch = fetch,
  log?: (line: string) => void,
  timeoutMs = LOGO_CHECK_TIMEOUT_MS,
): Promise<string | null> {
  const origin = BRAND.prodUrl.replace(/\/+$/, '')
  resolved = null
  for (const dir of LOGO_DIRS) {
    const url = `${origin}/${dir}/${LOGO_FILE}`
    if (await loads(url, f, timeoutMs)) {
      resolved = url
      log?.(`logo: using ${dir}${dir === LOGO_DIRS[0] ? '' : ' (newer folder not live yet)'}`)
      return url
    }
  }
  log?.('logo: no logo URL answered; using the text wordmark')
  return null
}
