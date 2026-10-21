// BL-126 — the `accounting.opening_balances` approval executor.
//
// Runs only for the caller that won decide_approval_request()'s approve
// claim (packages/workflows approveRequest), so once. It re-checks the
// proposal against the books as they are NOW, then:
//   1. adds one open charge (assessments row, type regular) per home that
//      owed money on the start date — the resident ledger and dues aging
//      read these;
//   2. posts ONE journal entry: Dr cash per fund, Dr accounts receivable
//      (the homes' total, Operating fund), Cr prepaid assessments and
//      accounts payable, and each fund's balance account as the plug.
// The charges go in first so a failed entry can delete them: nothing is
// left half-posted. The entry's source_id is the approval request.
//
// BL-136: once M3_APPLIED (migration 0067), each charge is marked
// assessments.source = 'opening_balance', which the nightly late-fee job
// skips. With the flag off the column may not exist, so it is not written.
//
// Relative imports only (the approvals inbox composes this and
// tests/integration loads it).

import { postJournalEntry } from '@homeowner-portal/db'
import { M3_APPLIED } from '@homeowner-portal/db/m3'
import { memoCodeFor, type ApprovalExecutor } from '@homeowner-portal/workflows'
import { entryBalances } from './model'
import { OPENING_ACTION, readOpeningPayload, type OpeningPayload } from './proposal'

const CHUNK = 200

/** assessments.source for a carried-over charge (migration 0067, BL-136). */
export const OPENING_BALANCE_SOURCE = 'opening_balance'

type Db = Parameters<ApprovalExecutor>[0]
type Fail = { ok: false; error: string }

const fail = (error: string): Fail => ({ ok: false, error })

/** Everything the posting depends on, re-read with the service role and checked. */
async function recheck(db: Db, orgId: string, requestId: string, p: OpeningPayload): Promise<Fail | { ok: true; slug: string }> {
  const { data: assoc, error: assocErr } = await db
    .from('associations')
    .select('id, organization_id, slug')
    .eq('id', p.associationId)
    .maybeSingle()
  if (assocErr) return fail('Couldn’t check the association. Try again.')
  if (!assoc || assoc.organization_id !== orgId) return fail('This association is no longer in your HOA.')

  const { data: period, error: periodErr } = await db
    .from('fiscal_periods')
    .select('id, association_id, start_date, end_date, status')
    .eq('id', p.fiscalPeriodId)
    .maybeSingle()
  if (periodErr) return fail('Couldn’t check the fiscal period. Try again.')
  if (!period || period.association_id !== p.associationId) return fail('The fiscal period for the start date no longer exists.')
  if (period.status !== 'open') return fail('The fiscal period for the start date is closed, so nothing can post to it.')
  if (p.cutoverDate < period.start_date || p.cutoverDate > period.end_date) return fail('The start date is outside its fiscal period.')

  const accountIds = [...new Set(p.lines.map((l) => l.accountId))]
  const fundIds = [...new Set(p.lines.map((l) => l.fundId))]
  const [accounts, funds] = await Promise.all([
    db.from('chart_of_accounts').select('id, association_id, is_active').in('id', accountIds),
    db.from('funds').select('id, association_id, is_active').in('id', fundIds),
  ])
  if (accounts.error || funds.error) return fail('Couldn’t check the chart of accounts. Try again.')
  const okAccounts = (accounts.data ?? []).filter((a) => a.association_id === p.associationId && a.is_active)
  const okFunds = (funds.data ?? []).filter((f) => f.association_id === p.associationId && f.is_active)
  if (okAccounts.length !== accountIds.length) return fail('An account in this entry was removed or turned off. Propose the opening balances again.')
  if (okFunds.length !== fundIds.length) return fail('A fund in this entry was removed or turned off. Propose the opening balances again.')

  const unbalanced = entryBalances(p.lines, p.charges, p.arAccountId)
  if (unbalanced) return fail(unbalanced)

  // One opening balance per association: a second one would double the books.
  // SEC-N3: any OTHER request for the association that is approved (being
  // posted, or left approved after an executor crash — state unknown) or
  // posted refuses this one. Proposals filed before the per-association
  // subject id could coexist for different dates; this is the backstop.
  const { data: other, error: otherErr } = await db
    .from('approval_requests')
    .select('id, status')
    .eq('organization_id', orgId)
    .eq('action_type', OPENING_ACTION)
    .in('status', ['approved', 'posted'])
    .eq('payload->>associationId' as never, p.associationId)
    .neq('id', requestId)
    .limit(1)
  if (otherErr) return fail('Couldn’t check for earlier opening balances. Try again.')
  const blocking = (other ?? [])[0] as { status?: string } | undefined
  if (blocking?.status === 'posted') return fail('Opening balances were already posted for this association.')
  if (blocking) return fail('Another opening balance for this association is already approved. Check Approvals before posting a second one.')

  const unitIds = [...new Set(p.charges.map((c) => c.unitId))]
  if (unitIds.length !== p.charges.length) return fail('A home is charged twice.')
  for (let i = 0; i < unitIds.length; i += CHUNK) {
    const part = unitIds.slice(i, i + CHUNK)
    const { data, error } = await db.from('units').select('id').eq('association_id', p.associationId).in('id', part)
    if (error) return fail('Couldn’t check the homes. Try again.')
    if ((data ?? []).length !== part.length) return fail('A home in this list is no longer in the association. Propose the opening balances again.')
  }
  return { ok: true, slug: assoc.slug ?? '' }
}

async function removeCharges(db: Db, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += CHUNK) {
    await db.from('assessments').delete().in('id', ids.slice(i, i + CHUNK))
  }
}

export const openingExecutor: ApprovalExecutor = async (db, request) => {
  const p = readOpeningPayload(request.payload)
  if (!p) return fail('These opening balances can’t be read. Reject them and enter them again.')

  const checked = await recheck(db, request.organization_id, request.id, p)
  if (!checked.ok) return checked

  const { data: unitRows, error: unitErr } =
    p.charges.length === 0
      ? { data: [] as Array<{ id: string; unit_number: string | null }>, error: null }
      : await (async () => {
          const out: Array<{ id: string; unit_number: string | null }> = []
          const ids = p.charges.map((c) => c.unitId)
          for (let i = 0; i < ids.length; i += CHUNK) {
            const r = await db.from('units').select('id, unit_number').in('id', ids.slice(i, i + CHUNK))
            if (r.error) return { data: null, error: r.error }
            out.push(...(r.data ?? []))
          }
          return { data: out, error: null }
        })()
  if (unitErr || !unitRows) return fail('Couldn’t read the homes. Try again.')
  const unitNumber = new Map(unitRows.map((u) => [u.id, u.unit_number]))

  // 1. The charges.
  const inserted: string[] = []
  for (let i = 0; i < p.charges.length; i += CHUNK) {
    const rows = p.charges.slice(i, i + CHUNK).map((c) => ({
      organization_id: request.organization_id,
      association_id: p.associationId,
      unit_id: c.unitId,
      fiscal_period_id: p.fiscalPeriodId,
      assessment_type: 'regular',
      amount: c.cents / 100,
      due_date: p.chargesDueDate,
      status: 'open',
      memo_code: memoCodeFor({
        associationSlug: checked.slug,
        unitNumber: unitNumber.get(c.unitId) ?? null,
        unitId: c.unitId,
        assessmentType: 'regular',
      }),
      ...(M3_APPLIED ? { source: OPENING_BALANCE_SOURCE } : {}),
    }))
    // assessments.source is not in the generated types until gen:types runs
    // after prod has 0067 (CLAUDE.md footgun 3), hence the cast.
    const { data, error } = await db.from('assessments').insert(rows as never).select('id')
    if (error || !data || data.length !== rows.length) {
      inserted.push(...(data ?? []).map((r) => r.id))
      await removeCharges(db, inserted)
      return fail('Couldn’t add the homes’ opening charges. Nothing was posted.')
    }
    inserted.push(...data.map((r) => r.id))
  }

  // 2. The entry.
  const je = await postJournalEntry(db, {
    organizationId: request.organization_id,
    associationId: p.associationId,
    fiscalPeriodId: p.fiscalPeriodId,
    entryDate: p.cutoverDate,
    memo: `Opening balances as of ${p.cutoverDate} (approved)`,
    source: 'manual',
    sourceId: request.id,
    createdBy: request.decided_by ?? undefined,
    lines: p.lines.map((l) => ({
      accountId: l.accountId,
      fundId: l.fundId,
      debit: l.debitCents / 100,
      credit: l.creditCents / 100,
      memo: 'Opening balance',
    })),
  })
  if (!je.ok) {
    // postJournalEntry removed its own header; take the charges back out too.
    await removeCharges(db, inserted)
    return fail('The journal entry couldn’t be posted, so nothing was. Check the fiscal period and accounts, then propose again.')
  }
  return { ok: true, resultRef: je.journalEntryId }
}
