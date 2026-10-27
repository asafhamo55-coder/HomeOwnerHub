/**
 * BL-153: where the board's annual-report narrative is kept. No migration:
 * associations.compliance_settings (jsonb object, 0008) under one key, one
 * entry per meeting, the same shape the quorum kit uses
 * (lib/meeting-quorum/store.ts). Writes ride the board/admin-only UPDATE
 * policy on associations (0063); the text is shown to owners in the report
 * anyway, so it is not signed. Pure and client-safe.
 */

import { NARRATIVE_MAX } from './message'

export const NARRATIVES_KEY = 'annual_report_narratives'
export const MAX_STORED_NARRATIVES = 8

export interface StoredNarrative {
  text: string
  updated_at: string
  updated_by: string | null
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** The saved narrative for this meeting, '' when none or malformed. */
export function readNarrative(complianceSettings: unknown, meetingId: string): string {
  const entry = asObject(asObject(asObject(complianceSettings)?.[NARRATIVES_KEY])?.[meetingId])
  return typeof entry?.text === 'string' ? entry.text.slice(0, NARRATIVE_MAX) : ''
}

/**
 * compliance_settings with this meeting's narrative replaced and every
 * other key kept. An empty text removes the entry. Keeps at most
 * MAX_STORED_NARRATIVES (the longest-unchanged go first; this one stays).
 */
export function withNarrative(
  complianceSettings: unknown,
  meetingId: string,
  text: string,
  stamp: { updatedAt: string; updatedBy: string | null },
): Record<string, unknown> {
  const base = asObject(complianceSettings) ?? {}
  const all: Record<string, unknown> = { ...(asObject(base[NARRATIVES_KEY]) ?? {}) }
  const clean = text.slice(0, NARRATIVE_MAX)
  if (clean.trim()) all[meetingId] = { text: clean, updated_at: stamp.updatedAt, updated_by: stamp.updatedBy } satisfies StoredNarrative
  else delete all[meetingId]
  const at = (v: unknown) => {
    const t = asObject(v)?.updated_at
    return typeof t === 'string' ? t : ''
  }
  const others = Object.keys(all)
    .filter((k) => k !== meetingId)
    .sort((a, b) => at(all[b]).localeCompare(at(all[a])))
  const keep = new Set([meetingId, ...others.slice(0, MAX_STORED_NARRATIVES - 1)])
  const pruned: Record<string, unknown> = {}
  for (const k of Object.keys(all)) if (keep.has(k)) pruned[k] = all[k]
  return { ...base, [NARRATIVES_KEY]: pruned }
}
