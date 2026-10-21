/**
 * BL-137: the audited override. After a billing run (Generate dues, Add a
 * due) bills regular dues at an amount that differs from the dues rate in
 * effect, one audit_log row records it: the rate id, the amount the rate
 * gives and the amount billed (cents), the cadence and the scope. Ids and
 * amounts only — no address, name or memo.
 *
 * Flag off (M5_APPLIED false): returns 'off' without touching the
 * database. Best effort: a failed read or write is logged (code only) and
 * never undoes the billing that already happened.
 *
 * Not a server action; lib/assessments.ts calls it after its own role gate.
 */

import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { rateOverride, type BillingCadence } from './model'
import { loadDuesRates, type LooseDb } from './queries'

export const RATE_OVERRIDE_ACTION = 'dues_rate.override'

type AuditDb = LooseDb & { auth?: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } }

export interface OverrideInput {
  orgId: string
  associationId: string
  /** The day the billed charge belongs to (the association's day). */
  day: string
  cadence: BillingCadence
  billedCents: number
  scope: 'all' | 'unit'
  created: number
}

export type OverrideOutcome = 'off' | 'none' | 'logged' | 'failed'

export async function recordDuesRateOverride(db: AuditDb, input: OverrideInput, live: boolean = M5_APPLIED): Promise<OverrideOutcome> {
  if (!live) return 'off'
  if (input.created <= 0) return 'none'
  try {
    const rates = await loadDuesRates(db, input.associationId, true)
    if (!rates) return 'failed'
    const o = rateOverride(rates, input.day, input.cadence, input.billedCents)
    if (!o) return 'none'
    let userId: string | null = null
    try {
      userId = (await db.auth?.getUser())?.data.user?.id ?? null
    } catch {
      userId = null
    }
    const { error } = await db.from('audit_log').insert({
      org_id: input.orgId,
      user_id: userId,
      action: RATE_OVERRIDE_ACTION,
      entity_type: 'dues_rate',
      entity_id: o.rateId,
      metadata: {
        association_id: input.associationId,
        expected_cents: o.expectedCents,
        billed_cents: o.billedCents,
        cadence: input.cadence,
        scope: input.scope,
        charges: input.created,
      },
    })
    if (error) {
      console.error('[dues-rates] override audit failed', { associationId: input.associationId, code: error.code ?? null })
      return 'failed'
    }
    return 'logged'
  } catch {
    console.error('[dues-rates] override audit failed', { associationId: input.associationId, code: 'thrown' })
    return 'failed'
  }
}
