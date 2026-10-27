// BL-168 — Treasurer routing and dual control for money approvals, applied
// just before a money item (a scanned bill, a CPA's adjusting entry) is
// approved. Runs on the DECIDER's own RLS client: board/admin read
// approval_requests, approval_signoffs, org_members and associations, and
// record_approval_signoff() (migration 0070) refuses anyone else (42501).
//
// The hard rule lives in the database: approval_requests_dual_control()
// refuses to approve a money item above the association's amount without
// two different sign-offs, whoever calls decide_approval_request. This file
// is the routing around it — the Treasurer goes first, and a first
// signature on a dual-control item is recorded instead of approving.
//
// Relative imports only (tests/integration loads it).

import { isMoneyAction, readOfficerTitle, routeApproval, type OfficerTitle, type Signer } from './model'

/** The slice of a Supabase client this uses (the app passes its RLS client). */
export interface SignoffDb {
  from(table: string): any // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>
}

export type GateOutcome = { ok: true; message: string } | { ok: false; error: string }

export interface GateInput {
  orgId: string
  requestId: string
  deciderId: string
}

interface MemberRow {
  user_id: string
  role: 'admin' | 'board'
  officer_title: string | null
}

/**
 * null = nothing to do, carry on and approve. Otherwise the outcome to
 * show: a refusal (not your turn, a read failed) or "sign-off recorded".
 */
export async function moneyGate(db: SignoffDb, input: GateInput): Promise<GateOutcome | null> {
  const { data: req, error: reqErr } = await db
    .from('approval_requests')
    .select('id, organization_id, action_type, amount, status, proposed_by')
    .eq('id', input.requestId)
    .maybeSingle()
  if (reqErr) return { ok: false, error: 'Couldn’t check this approval. Try again.' }
  const row = req as { organization_id: string; action_type: string; amount: number | string | null; status: string; proposed_by: string | null } | null
  if (!row || row.organization_id !== input.orgId) return { ok: false, error: 'That approval item isn’t valid.' }
  if (!isMoneyAction(row.action_type) || row.status !== 'proposed') return null
  // Segregation of duties: whoever put the item in front of the board is never a signature on it.
  if (row.proposed_by && row.proposed_by === input.deciderId) {
    return { ok: false, error: 'You put this item forward, so another board member needs to approve it.' }
  }

  const [assocs, members, signed] = await Promise.all([
    db.from('associations').select('dual_control_cents').eq('organization_id', input.orgId).not('dual_control_cents', 'is', null),
    db.from('org_members').select('user_id, role, officer_title').eq('org_id', input.orgId).in('role', ['admin', 'board']),
    db.from('approval_signoffs').select('signer_id').eq('approval_request_id', input.requestId),
  ])
  if (assocs.error || members.error || signed.error) return { ok: false, error: 'Couldn’t check the sign-offs. Try again.' }

  const cents = ((assocs.data ?? []) as Array<{ dual_control_cents: number | string | null }>)
    .map((a) => Number(a.dual_control_cents))
    .filter((n) => Number.isFinite(n) && n > 0)
  const thresholdCents = cents.length > 0 ? Math.min(...cents) : null

  const byId = new Map<string, Signer>()
  let treasurerExists = false
  for (const m of (members.data ?? []) as MemberRow[]) {
    const title: OfficerTitle | null = m.role === 'board' ? readOfficerTitle(m.officer_title) : null
    if (title === 'treasurer') treasurerExists = true
    byId.set(m.user_id, { userId: m.user_id, role: m.role, title })
  }
  const signer = byId.get(input.deciderId)
  if (!signer) return { ok: false, error: 'Only board members and admins can approve this.' }
  const earlier = ((signed.data ?? []) as Array<{ signer_id: string }>).flatMap((s) => {
    const who = byId.get(s.signer_id)
    return who ? [who] : []
  })

  const amount = row.amount === null || row.amount === '' ? null : Number(row.amount)
  const step = routeApproval({
    actionType: row.action_type,
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    thresholdCents,
    treasurerExists,
    signoffs: earlier,
    signer,
  })
  if (step.kind === 'wait') return { ok: false, error: step.message }

  // Record this person's sign-off (idempotent), then either stop or carry on.
  const rec = await db.rpc('record_approval_signoff', { p_request_id: input.requestId })
  if (rec.error) return { ok: false, error: 'Couldn’t record your sign-off. Try again.' }
  if (step.kind === 'signoff') return { ok: true, message: step.message }
  return null
}

