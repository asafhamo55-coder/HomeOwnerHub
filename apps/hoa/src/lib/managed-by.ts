import { z } from 'zod'

/**
 * The free-text "Managed by" line, for example
 * "Managed by Homeside Property Management, (404) 555-0100".
 *
 * STORAGE. No migration: one key inside associations.compliance_settings,
 * next to the board contacts (see association-contacts.ts). Every write keeps
 * the other keys. Board or admin only (RLS associations_update plus the role
 * check in the server action).
 *
 * PLAIN TEXT. Markup is removed and every line break becomes a space, so the
 * stored value is safe in an email or on a printed page. Renderers still
 * escape it: the stored value is never trusted as HTML.
 *
 * Pure (zod only) so the unit tests need no database.
 */

export const MANAGED_BY_KEY = 'managed_by_line'
export const MAX_MANAGED_BY_LENGTH = 120

export const MANAGED_BY_HELP =
  'If a management company runs your community, add its name and phone. It appears at the bottom of your emails and letters.'

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f\\u2028\\u2029]+', 'g')

/** Plain text: no tags, no angle brackets, no line breaks or control characters, single spaces, trimmed. */
export function cleanManagedBy(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const saveManagedBySchema = z.object({
  associationId: z.string().uuid(),
  managedBy: z
    .string()
    .transform(cleanManagedBy)
    .pipe(z.string().max(MAX_MANAGED_BY_LENGTH, `Keep it to ${MAX_MANAGED_BY_LENGTH} characters or fewer.`)),
})

export type SaveManagedByInput = z.input<typeof saveManagedBySchema>

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** The stored line, or '' when none. Tolerant: re-cleans and re-caps whatever is stored. */
export function readManagedBy(complianceSettings: unknown): string {
  const raw = asObject(complianceSettings)?.[MANAGED_BY_KEY]
  return cleanManagedBy(raw).slice(0, MAX_MANAGED_BY_LENGTH).trim()
}

/** compliance_settings with the line replaced (empty removes it); every other key kept. */
export function withManagedBy(complianceSettings: unknown, line: string): Record<string, unknown> {
  const next = { ...(asObject(complianceSettings) ?? {}) }
  const clean = cleanManagedBy(line).slice(0, MAX_MANAGED_BY_LENGTH).trim()
  if (clean === '') delete next[MANAGED_BY_KEY]
  else next[MANAGED_BY_KEY] = clean
  return next
}
