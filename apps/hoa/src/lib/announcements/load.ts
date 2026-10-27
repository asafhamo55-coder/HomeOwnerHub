/**
 * BL-173: the dashboard's read of the seasonal nudge. Server component use
 * only (not a server action, so it is not a public endpoint).
 *
 * Reads the association's signed dismissals with the caller's own client
 * and returns the nudge to show, or null. A failed read shows nothing: a
 * missing suggestion costs nothing, and the grid is always one tap away.
 * Logs a code only.
 */

import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { nextNudge, type Nudge } from './nudge'
import { readDismissedKeys } from './dismiss'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any }

export async function loadNudge(db: LooseDb, associationId: string, today: string): Promise<Nudge | null> {
  // Cheap exit: most days have no occasion within 7 days, so skip the read.
  if (nextNudge(today) === null) return null
  const { data, error } = (await db.from('associations').select('compliance_settings').eq('id', associationId).maybeSingle()) as {
    data: { compliance_settings: unknown } | null
    error: { code?: string } | null
  }
  if (error) {
    console.error('[announcement-nudge] read failed', { associationId, code: error.code ?? 'unknown' })
    return null
  }
  const dismissed = readDismissedKeys(associationId, data?.compliance_settings ?? null, paySettingsSecret())
  return nextNudge(today, dismissed)
}
