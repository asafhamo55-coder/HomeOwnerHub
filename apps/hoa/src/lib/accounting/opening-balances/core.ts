// BL-126 — proposing opening balances. Called by the server action
// (actions.ts) after its board/admin gate; plain module so it can be tested
// with in-memory clients.
//
// NEVER posts. It rebuilds the entry from the raw figures against the books
// as the server reads them (nothing computed in the browser is trusted),
// then files ONE approval request. A board member approves it in
// /approvals, and only then does executor.ts post.
//
// Idempotent: the request's subject id is derived from the association
// alone (SEC-N3), so the approval layer's live-subject unique index
// (proposed / approved / posted) keeps ONE live or posted opening balance
// per association, whatever its start date, even when two proposals for
// different dates race past checkExisting. A re-run finds the live one
// instead of filing another. A live proposal for a DIFFERENT date, or one
// already posted, refuses the new one: two opening balances would double
// the books.

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { proposeApproval } from '@homeowner-portal/workflows'
import type { Json } from '@homeowner-portal/db'
import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { buildOpeningEntry, MAX_HOMES, resolveOpeningBooks } from './model'
import { loadOpeningBooks, type OpeningDb, type OpeningPeriod, type OpeningProposalRow } from './load'
import { OPENING_ACTION, OPENING_SUBJECT, OPENING_WORKFLOW, openingSummary, type OpeningPayload } from './proposal'

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Cents = z.number().int().min(0)

export const OpeningInputSchema = z.object({
  cutoverDate: Iso,
  chargesDueDate: Iso,
  cash: z.array(z.object({ fundId: z.string().uuid(), cents: Cents })).max(50),
  homes: z.array(z.object({ unitId: z.string().uuid(), cents: Cents })).max(MAX_HOMES),
  prepaidCents: Cents,
  payables: z.array(z.object({ fundId: z.string().uuid(), cents: Cents })).max(50),
})

type ApprovalDb = Parameters<typeof proposeApproval>[0]

export type ProposeOpeningResult =
  | { ok: true; created: boolean; approvalRequestId: string; status: string; message: string }
  | { ok: false; error: string; errors?: string[] }

/**
 * A stable uuid per association: the approval layer's idempotency key.
 * Not per date (SEC-N3): a per-date key let two live proposals for
 * different dates coexist, and both could be approved and posted.
 */
export function openingSubjectId(associationId: string): string {
  const h = createHash('sha256').update(`opening-balances:${associationId}`).digest('hex')
  // Shaped as a version-5-style uuid so it passes uuid checks everywhere.
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** The open fiscal period the start date falls in, or null. */
export function periodFor(periods: readonly OpeningPeriod[], date: string): OpeningPeriod | null {
  return periods.find((p) => p.status === 'open' && p.start_date <= date && date <= p.end_date) ?? null
}

export type ExistingCheck =
  | { kind: 'none' }
  | { kind: 'same'; proposal: OpeningProposalRow }
  | { kind: 'blocked'; error: string }

/** What a new proposal for `date` runs into among the association's earlier ones. */
export function checkExisting(proposals: readonly OpeningProposalRow[], date: string): ExistingCheck {
  const posted = proposals.find((p) => p.status === 'posted')
  if (posted) {
    const d = posted.payload?.cutoverDate
    return {
      kind: 'blocked',
      error: `Opening balances${d ? ` as of ${d}` : ''} are already posted. Correct them with entries in the ledger instead of a second opening balance.`,
    }
  }
  const live = proposals.find((p) => p.status === 'proposed' || p.status === 'approved')
  if (!live) return { kind: 'none' }
  if (live.payload?.cutoverDate === date) return { kind: 'same', proposal: live }
  return {
    kind: 'blocked',
    error: `Opening balances${live.payload ? ` as of ${live.payload.cutoverDate}` : ''} are already waiting in Approvals. Reject them there first to propose a different start date.`,
  }
}

export async function proposeOpeningCore(
  userDb: OpeningDb,
  adminDb: ApprovalDb,
  ctx: { orgId: string; associationId: string; userId: string | null },
  raw: unknown,
): Promise<ProposeOpeningResult> {
  const parsed = OpeningInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Those figures aren’t valid. Check each step and try again.' }
  const input = parsed.data

  const loaded = await loadOpeningBooks(userDb, ctx.orgId, ctx.associationId)
  if (!loaded.ok) return { ok: false, error: 'We couldn’t read the books just now. Nothing was proposed. Try again.' }
  const data = loaded.data

  const existing = checkExisting(data.proposals, input.cutoverDate)
  if (existing.kind === 'blocked') return { ok: false, error: existing.error }
  if (existing.kind === 'same') {
    return {
      ok: true,
      created: false,
      approvalRequestId: existing.proposal.id,
      status: existing.proposal.status,
      message: `Opening balances as of ${input.cutoverDate} are already waiting in Approvals. Nothing new was proposed. To change the figures, reject that one first.`,
    }
  }

  const period = periodFor(data.periods, input.cutoverDate)
  if (!period) {
    return {
      ok: false,
      error: 'No open fiscal year covers that start date. Choose a date in an open year, or open the year under Periods first.',
    }
  }

  const books = resolveOpeningBooks(data.funds, data.accounts)
  const built = buildOpeningEntry(input, books, new Set(data.units.map((u) => u.id)))
  if (!built.ok) return { ok: false, error: built.errors[0] ?? 'Those figures aren’t valid.', errors: built.errors }
  const entry = built.entry

  const payload: OpeningPayload = {
    version: 1,
    associationId: ctx.associationId,
    cutoverDate: input.cutoverDate,
    chargesDueDate: input.homes.length > 0 ? input.chargesDueDate : input.cutoverDate,
    fiscalPeriodId: period.id,
    lines: entry.lines,
    charges: entry.charges,
    arAccountId: books.ar?.accountId ?? null,
    funds: entry.funds.map((f) => ({ fundId: f.fundId, name: f.name, equityCents: f.equityCents })),
  }

  const filed = await proposeApproval(adminDb, {
    organizationId: ctx.orgId,
    workflowId: OPENING_WORKFLOW,
    actionType: OPENING_ACTION,
    subjectType: OPENING_SUBJECT,
    subjectId: openingSubjectId(ctx.associationId),
    payload: payload as unknown as Json,
    summary: openingSummary(payload),
    amount: entry.totalDebitCents / 100,
    // BL-168: the proposer is never one of the two dual-control sign-offs.
    ...(M6_APPLIED && ctx.userId ? { proposedBy: ctx.userId } : {}),
  })

  // Counts only: no amounts, homes or addresses in the audit row.
  const audit = await userDb.from('audit_log').insert({
    action: 'opening_balances_proposed',
    org_id: ctx.orgId,
    user_id: ctx.userId,
    entity_type: 'approval_request',
    entity_id: filed.id,
    metadata: {
      created: filed.created,
      fund_count: entry.funds.length,
      line_count: entry.lines.length,
      home_count: entry.charges.length,
    },
  })
  if (audit.error) console.error('[opening-balances] audit insert failed', { code: audit.error.code ?? null })

  return {
    ok: true,
    created: filed.created,
    approvalRequestId: filed.id,
    status: filed.status,
    message: filed.created
      ? 'Sent to Approvals. Nothing is posted until a board member approves it there.'
      : 'These opening balances were already proposed. Nothing new was filed.',
  }
}
