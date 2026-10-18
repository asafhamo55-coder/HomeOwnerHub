/**
 * "What's new" (BL-070 spec §6.5, on BL-071's /whats-new page): the
 * user-facing entries compiled from docs/releases `whats_new:` blocks.
 * Reads the generated module only.
 */
import { WHATS_NEW } from '@/generated/guide'
import type { WhatsNewEntry } from './types'

/** Board-app entries (admin or board). /whats-new and the sidebar dot both use this set, so their ids agree. */
export function boardWhatsNew(): readonly WhatsNewEntry[] {
  return WHATS_NEW.filter((e) => e.roles.some((r) => r === 'admin' || r === 'board'))
}

/** The newest board entry id, or null when there is none (no dot). */
export function latestBoardWhatsNewId(): string | null {
  return boardWhatsNew()[0]?.id ?? null
}

/** Board entries grouped by release-note slug, for the per-note cards. */
export function boardWhatsNewByNote(): Map<string, WhatsNewEntry[]> {
  const out = new Map<string, WhatsNewEntry[]>()
  for (const e of boardWhatsNew()) out.set(e.note, [...(out.get(e.note) ?? []), e])
  return out
}

export const WHATS_NEW_LABEL: Record<WhatsNewEntry['label'], string> = {
  new: 'New',
  improvement: 'Improved',
  fix: 'Fixed',
}
