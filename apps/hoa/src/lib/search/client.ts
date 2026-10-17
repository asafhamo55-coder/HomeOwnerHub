// Palette side of record search (BL-022): calls GET /api/search and maps the
// answer to palette hits. Plain module (no React, no server imports) so it
// is unit-testable and safe in a client component.

import { apiErrorMessage } from '@/lib/api/client'
import { RECORD_GROUP_LABEL, RECORD_TYPES, type RecordSearchResult, type RecordType } from './types'

export interface RecordPaletteHit {
  /** `${type}:${id}` — a property can appear as both an owner and a property row. */
  id: string
  type: RecordType
  label: string
  hint: string | undefined
  /** Status and day — the palette's right-hand `meta` (BL-060). */
  detail: string | undefined
  href: string
  group: string
}

export interface RecordPaletteResult {
  hits: RecordPaletteHit[]
  notice: string | undefined
}

const FALLBACK = 'Try again in a moment.'

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The line that says results are partial, or undefined when nothing failed. */
export function failedNotice(failed: RecordType[]): string | undefined {
  const labels = RECORD_TYPES.filter((t) => failed.includes(t)).map((t) => RECORD_GROUP_LABEL[t])
  if (labels.length === 0) return undefined
  return `${listJoin(labels)} couldn’t be searched, so results may be incomplete.`
}

export async function fetchRecordSearch(
  query: string,
  signal: AbortSignal,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<RecordPaletteResult> {
  const res = await fetchImpl(`/api/search?q=${encodeURIComponent(query)}`, {
    signal,
    headers: { accept: 'application/json' },
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok || !body || typeof body !== 'object') {
    throw new Error(apiErrorMessage(body, FALLBACK))
  }
  const data = body as RecordSearchResult
  const hits: RecordPaletteHit[] = []
  for (const g of data.groups ?? []) {
    for (const item of g.items ?? []) {
      hits.push({
        id: `${item.type}:${item.id}`,
        type: item.type,
        label: item.label,
        hint: item.hint ?? undefined,
        detail: item.detail ?? undefined,
        href: item.href,
        group: g.label,
      })
    }
  }
  return { hits, notice: failedNotice(data.failed ?? []) }
}
