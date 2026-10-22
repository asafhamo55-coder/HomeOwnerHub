'use server'

// BL-031 remainder: preview a CINC aging report against this association's
// homes, for the opening-balance wizard (BL-126).
//
// A dry run only. It reads the homes with the caller's own client (RLS,
// 0061) and writes nothing but an audit row with ids and counts. The
// matched balances go back to the wizard, which proposes them through
// /approvals with proposeOpeningBalances; that action rebuilds and checks
// everything again on the server. Nothing posts until a board member
// approves.
//
// Board/admin only: the role gate runs first, before the file is read or
// any client exists (a server action is a public endpoint).

import { requireBoardOrAdminForAction } from '../guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readPrimaryAssociation } from '@/lib/association-setup'
import { loadOrFail } from '../../load-or-fail'
import { readAllResult } from '../../supabase/read-all'
import type { BooksUnitRow } from './model'
import { AGING_MAX_FILE_BYTES, decodeAgingFile, parseCincAging, type AgingParse } from './cinc-aging'

export type CincAgingPreview = AgingParse

export async function previewCincAging(form: FormData): Promise<CincAgingPreview> {
  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!(form instanceof FormData)) return { ok: false, error: 'Choose the aging report file.' }

  const file = form.get('file')
  if (!file || typeof file === 'string' || typeof (file as Blob).arrayBuffer !== 'function') {
    return { ok: false, error: 'Choose the aging report file.' }
  }
  const blob = file as Blob
  // Refuse by declared size before reading a byte.
  if (blob.size > AGING_MAX_FILE_BYTES) {
    return { ok: false, error: `The file is larger than ${AGING_MAX_FILE_BYTES / 1024 / 1024} MB. Export just the account, address, unit and balance columns.` }
  }
  let mapping: unknown = undefined
  const rawMapping = form.get('mapping')
  if (typeof rawMapping === 'string' && rawMapping !== '') {
    if (rawMapping.length > 500) return { ok: false, error: 'That column choice isn’t valid. Pick each column once.' }
    try {
      mapping = JSON.parse(rawMapping)
    } catch {
      return { ok: false, error: 'That column choice isn’t valid. Pick each column once.' }
    }
  }

  const decoded = decodeAgingFile(new Uint8Array(await blob.arrayBuffer()))
  if (!decoded.ok) return decoded

  const supabase = await getSupabaseServerClient()
  const assoc = await readPrimaryAssociation(supabase, gate.orgId)
  if (!assoc.ok) return { ok: false, error: 'We couldn’t check your association just now. Try again.' }
  if (!assoc.data) return { ok: false, error: 'Your HOA has no association yet. Set one up first.' }
  const associationId = assoc.data.id

  const units = await loadOrFail(
    'cinc aging: homes',
    readAllResult<BooksUnitRow>((from, to) =>
      supabase
        .from('units')
        .select('id, address_line1, unit_number, lot_number')
        .eq('association_id', associationId)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  )
  if (!units.ok) return { ok: false, error: 'We couldn’t read your homes just now. Try again.' }

  const result = parseCincAging(decoded.text, units.data ?? [], mapping)

  // Ids and counts only: never a file name, address, account or amount.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error } = await supabase.from('audit_log').insert({
      org_id: gate.orgId,
      user_id: user?.id ?? null,
      action: 'opening_balances.cinc_previewed',
      entity_type: 'association',
      entity_id: associationId,
      metadata: result.ok
        ? {
            ok: true,
            rows: result.rowsRead,
            matched: result.matched.length,
            unmatched: result.unmatchedCount,
            credits: result.credits,
            zero: result.zero,
            reconciles: result.totals.reconciles,
          }
        : { ok: false },
    })
    if (error) console.error('[opening-balances] cinc audit failed', { associationId, code: error.code ?? null })
  } catch {
    console.error('[opening-balances] cinc audit failed', { associationId, code: 'thrown' })
  }

  return result
}
