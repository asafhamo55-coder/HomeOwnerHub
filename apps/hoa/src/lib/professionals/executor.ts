// BL-168 — the `pro.*` approval executor.
//
// Runs only for the caller that won decide_approval_request()'s approve
// claim (packages/workflows approveRequest), so once. It re-checks the
// proposal against the world as it is NOW, then:
//   pro.journal_entry  posts the CPA's adjusting entry (source 'manual',
//                      source_id the approval request) and returns its id;
//   every other kind   performs no side effect beyond the decision: a
//                      review note, an attorney note, an upload and a draft
//                      letter become "accepted" by the board. Nothing is
//                      sent. The request row itself is the record.
//
// Relative imports only (the approvals inbox composes this and
// tests/integration loads it).

import { postJournalEntry } from '@homeowner-portal/db'
import type { ApprovalExecutor } from '@homeowner-portal/workflows'
import { readProPayload, type MatterRef } from './model'

type Db = Parameters<ApprovalExecutor>[0]
type Fail = { ok: false; error: string }
const fail = (error: string): Fail => ({ ok: false, error })

/** Does the matter still exist in the request's organization? */
async function matterExists(db: Db, orgId: string, m: MatterRef): Promise<boolean | 'error'> {
  const table = m.type === 'collections_case' ? 'collection_cases' : m.type === 'violation' ? 'hoa_violations' : 'tickets'
  const orgCol = m.type === 'violation' ? 'org_id' : 'organization_id'
  const { data, error } = await db
    .from(table as 'tickets')
    .select('id')
    .eq('id', m.id)
    .eq(orgCol as 'organization_id', orgId)
    .maybeSingle()
  if (error) return 'error'
  return Boolean(data)
}

export const proExecutor: ApprovalExecutor = async (db, request) => {
  const payload = readProPayload(request.action_type, request.payload)
  if (!payload) return fail('This item can’t be read. Reject it and ask for it again.')

  if (payload.kind === 'note' || payload.kind === 'attachment' || payload.kind === 'letter') {
    const exists = await matterExists(db, request.organization_id, payload.matter)
    if (exists === 'error') return fail('Couldn’t check the matter. Try again.')
    if (!exists) return fail('The matter for this item no longer exists.')
    return { ok: true, resultRef: request.id }
  }

  if (payload.kind === 'review') {
    const { data, error } = await db
      .from('fiscal_periods')
      .select('id, organization_id')
      .eq('id', payload.fiscalPeriodId)
      .maybeSingle()
    if (error) return fail('Couldn’t check the fiscal period. Try again.')
    if (!data || data.organization_id !== request.organization_id) return fail('The fiscal period for this note no longer exists.')
    return { ok: true, resultRef: request.id }
  }

  // payload.kind === 'entry'
  const orgId = request.organization_id
  const { data: assoc, error: assocErr } = await db.from('associations').select('id, organization_id').eq('id', payload.associationId).maybeSingle()
  if (assocErr) return fail('Couldn’t check the association. Try again.')
  if (!assoc || assoc.organization_id !== orgId) return fail('This association is no longer in your HOA.')

  const { data: period, error: periodErr } = await db
    .from('fiscal_periods')
    .select('id, association_id, start_date, end_date, status')
    .eq('id', payload.fiscalPeriodId)
    .maybeSingle()
  if (periodErr) return fail('Couldn’t check the fiscal period. Try again.')
  if (!period || period.association_id !== payload.associationId) return fail('The fiscal period for this entry no longer exists.')
  if (period.status !== 'open') return fail('The fiscal period is closed, so nothing can post to it. Reject this entry.')
  if (payload.entryDate < period.start_date || payload.entryDate > period.end_date) return fail('The entry date is outside its fiscal period.')

  const accountIds = [...new Set(payload.lines.map((l) => l.accountId))]
  const fundIds = [...new Set(payload.lines.map((l) => l.fundId))]
  const [accounts, funds] = await Promise.all([
    db.from('chart_of_accounts').select('id, association_id, is_active').in('id', accountIds),
    db.from('funds').select('id, association_id, is_active').in('id', fundIds),
  ])
  if (accounts.error || funds.error) return fail('Couldn’t check the chart of accounts. Try again.')
  const okAccounts = (accounts.data ?? []).filter((a) => a.association_id === payload.associationId && a.is_active)
  const okFunds = (funds.data ?? []).filter((f) => f.association_id === payload.associationId && f.is_active)
  if (okAccounts.length !== accountIds.length) return fail('An account in this entry was removed or turned off. Reject it and ask for it again.')
  if (okFunds.length !== fundIds.length) return fail('A fund in this entry was removed or turned off. Reject it and ask for it again.')

  const posted = await postJournalEntry(db, {
    organizationId: orgId,
    associationId: payload.associationId,
    fiscalPeriodId: payload.fiscalPeriodId,
    entryDate: payload.entryDate,
    memo: payload.memo,
    source: 'manual',
    sourceId: request.id,
    createdBy: request.decided_by ?? undefined,
    lines: payload.lines.map((l) => ({
      accountId: l.accountId,
      fundId: l.fundId,
      debit: l.debit,
      credit: l.credit,
      ...(l.memo ? { memo: l.memo } : {}),
    })),
  })
  if (!posted.ok) return fail(posted.error)
  return { ok: true, resultRef: posted.journalEntryId }
}
