/**
 * BL-149: the association's Georgia registration standing for the state
 * law check (fines, collections letters, liens). Server-only: verifying
 * the signed record needs the server secret.
 *
 * `associationId` picks the association (a letter's or a case's); without
 * one, the org's first association by name — the same one
 * loadOrgStateRules() reads the fine rules from. A failed read is
 * `{ ok: false }`: callers refuse the step rather than skip the check.
 * Ids and error codes only in logs.
 */

import { gaRegistrationSecret, gaStandingOf } from './store'
import type { GaRegistrationGateInput, GaRegistrationStanding } from './model'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any }

interface AssocRow {
  id: string
  state: string | null
  governing_law_state: string | null
  compliance_settings: unknown
}

export type GaGateLoad =
  | {
      ok: true
      associationId: string | null
      /** governing_law_state, else state; upper case; null when unset. */
      state: string | null
      standing: GaRegistrationStanding | null
      /** What checkFine / checkLien take; undefined when there is no association. */
      gate: GaRegistrationGateInput | undefined
    }
  | { ok: false }

export async function loadGaRegistrationGate(
  db: LooseDb,
  orgId: string,
  today: string,
  associationId: string | null = null,
  secret: string | null = gaRegistrationSecret(),
): Promise<GaGateLoad> {
  let q = db.from('associations').select('id, state, governing_law_state, compliance_settings').eq('organization_id', orgId)
  q = associationId ? q.eq('id', associationId) : q.order('name', { ascending: true }).range(0, 0)
  const { data, error } = (await q) as { data: AssocRow[] | null; error: { code?: string } | null }
  if (error) {
    console.error('[ga-registration] association read failed', { orgId, code: error.code ?? null })
    return { ok: false }
  }
  const row = (data ?? [])[0]
  if (!row) return { ok: true, associationId: null, state: null, standing: null, gate: undefined }
  const state = (row.governing_law_state || row.state || '').trim().toUpperCase() || null
  const standing = gaStandingOf(row.id, row.compliance_settings, secret, today)
  return { ok: true, associationId: row.id, state, standing, gate: { status: standing.status, today } }
}
