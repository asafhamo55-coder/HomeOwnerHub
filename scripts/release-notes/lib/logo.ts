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

async function loads(url: string, f: typeof fetch, timeoutMs: number): Promise<boolean> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await f(url, { method: 'HEAD', signal: ctl.signal, redirect: 'follow' })
    return res.status === 200 && (res.headers.get('content-type') ?? '').toLowerCase().startsWith('image/')
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
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
