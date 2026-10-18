/**
 * One chunk of the board's roster import → the import engine (P4).
 *
 * No fork of the import: each home becomes one property row and each of
 * its rows with an owner becomes one owner row, and importLots
 * (lib/properties/import.ts) writes them, the same engine the platform-
 * admin CSV import uses. This file only translates the board's rows in
 * and the engine's per-row outcomes back out.
 *
 * Every row is validated again here (rows.ts), so a request built by hand
 * can't write what the dry run would refuse. Runs on the caller's RLS
 * client; the caller gates on board/admin first. No `'use server'`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { importLots, type LotPropertyRow, type LotResidentRow, type RowOutcome } from '../import'
import { validateRosterRow, type RosterRowInput } from './rows'
import type { CommitHome, RosterMode, RowStatus } from './classify'

type Db = SupabaseClient<Database>

export interface RowResult {
  row: number
  status: RowStatus
  /** User-facing, never database text. */
  reason?: string
  propertyId?: string | null
}

export type ChunkResult = { ok: true; results: RowResult[] } | { ok: false; error: string }

export interface CommitInput {
  orgId: string
  associationId: string | null
  mode: RosterMode
  homes: readonly CommitHome[]
}

const HOME_STATUS: Record<RowOutcome['status'], RowStatus> = {
  created: 'new',
  reused: 'update',
  updated: 'update',
  skipped: 'duplicate',
  error: 'error',
}

export async function commitRosterHomes(db: Db, input: CommitInput): Promise<ChunkResult> {
  const properties: LotPropertyRow[] = []
  const residents: LotResidentRow[] = []
  const results = new Map<number, RowResult>()
  const sent: CommitHome[] = []

  for (const home of input.homes) {
    const valid: RosterRowInput[] = []
    for (const r of home.rows) {
      const issue = validateRosterRow(r)
      if (issue) results.set(r.row, { row: r.row, status: 'error', reason: issue })
      else valid.push(r)
    }
    const [head] = valid
    if (!head) continue
    sent.push({ rows: valid })
    const pid = `h${head.row}`
    properties.push({
      id: pid,
      address_line1: head.address,
      unit: head.unit ?? undefined,
      city: head.city ?? undefined,
      state: head.state ?? undefined,
      zip: head.zip ?? undefined,
      tenure: head.tenure,
      mailing_address: head.mailingAddress,
    })
    for (const r of valid) {
      if (!r.ownerName && !r.ownerEmail) continue
      residents.push({
        id: `o${r.row}`,
        property_id: pid,
        full_name: r.ownerName ?? undefined,
        email: r.ownerEmail ?? undefined,
        phone: r.ownerPhone ?? undefined,
        type: 'owner',
        is_current: 'true',
      })
    }
  }

  if (properties.length > 0) {
    const outcome = await importLots(db, {
      orgId: input.orgId,
      associationId: input.associationId,
      properties,
      residents,
      apply: true,
      onExisting: input.mode,
      onAmbiguous: 'error',
    })
    if (!outcome.ok) return { ok: false, error: outcome.error ?? 'Couldn’t import these rows. Nothing was written.' }

    for (const home of sent) {
      const head = home.rows[0]
      const po = outcome.outcomes.properties[`h${head.row}`] ?? { status: 'error', reason: 'Couldn’t save this home. Try again.' }
      const status = HOME_STATUS[po.status]
      for (const r of home.rows) {
        if (status === 'error') {
          results.set(r.row, { row: r.row, status, reason: po.reason })
          continue
        }
        if (status === 'duplicate') {
          results.set(r.row, { row: r.row, status, reason: po.reason, propertyId: po.propertyId ?? null })
          continue
        }
        const ro = outcome.outcomes.residents[`o${r.row}`]
        if (ro?.status === 'error') {
          results.set(r.row, {
            row: r.row,
            status: 'error',
            reason: r === head ? `The home was saved, but its owner wasn’t. ${ro.reason ?? ''}`.trim() : ro.reason,
            propertyId: po.propertyId ?? null,
          })
          continue
        }
        results.set(r.row, { row: r.row, status, propertyId: po.propertyId ?? null })
      }
    }
  }

  // In the order the rows came in.
  const order = input.homes.flatMap((h) => h.rows.map((r) => r.row))
  return { ok: true, results: order.map((n) => results.get(n)!).filter(Boolean) }
}
