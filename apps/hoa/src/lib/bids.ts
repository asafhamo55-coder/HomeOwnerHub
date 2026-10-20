'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  bidComparator,
  type BidComparatorOutput,
} from '@homeowner-portal/workflows'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { chargeAiActionQuota } from '@/lib/api/ai-action-quota'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { checkOrgOwned } from '@/lib/org-owned'

const RFP_NOT_FOUND = 'We could not find that RFP.'
const CHECK_FAILED = "We couldn't check that RFP. Try again."
const COMPARISON_FAILED = 'The bid comparison failed. Try again.'
const NEEDS_TWO_BIDS = 'At least two submitted bids are needed before comparing.'

export type BidStatus =
  | 'draft'
  | 'submitted'
  | 'withdrawn'
  | 'declined'
  | 'awarded'

export interface BidRow {
  id: string
  vendor_id: string
  vendor_legal_name: string
  total_amount: number
  payment_terms: string | null
  warranty: string | null
  start_date: string | null
  completion_date: string | null
  status: BidStatus
  submitted_at: string | null
  raw_document_path: string | null
}

export interface BidLineItemRow {
  id: string
  rfp_line_item_id: string | null
  description: string
  quantity: number | null
  unit_price: number | null
  line_total: number | null
  is_excluded: boolean
  is_addition: boolean
  notes: string | null
}

export interface BidDetail extends BidRow {
  line_items: BidLineItemRow[]
  parsed_pdf_text: string | null
  parsed_pdf_at: string | null
}

export interface BidComparisonRow {
  id: string
  generated_at: string
  ai_workflow_id: string
  comparison_table: unknown
  flagged_exclusions: unknown
  flagged_additions: unknown
  payment_term_diffs: unknown
  warranty_diffs: unknown
  recommendation_memo: string
}

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

// ─── Reads ───────────────────────────────────────────────────────────

export async function listBidsForRfp(rfpId: string): Promise<BidRow[]> {
  const res = await listBidsForRfpResult(rfpId)
  return res.ok ? res.data : []
}

/** Same read, but a failure is reported instead of becoming "no bids". */
export async function listBidsForRfpResult(
  rfpId: string,
): Promise<{ ok: true; data: BidRow[] } | { ok: false }> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('bids' as never)
    .select(
      'id, vendor_id, total_amount, payment_terms, warranty, start_date, completion_date, status, submitted_at, raw_document_path, vendor:vendors(legal_name)',
    )
    .eq('rfp_id', rfpId)
    .order('total_amount', { ascending: true })
  if (error) {
    console.error('listBidsForRfp failed', { code: error.code, message: error.message })
    return { ok: false }
  }

  const rows = (data ?? []) as unknown as Array<
    Omit<BidRow, 'vendor_legal_name'> & { vendor: { legal_name: string } | null }
  >
  const bids = rows.map((r) => ({
    id: r.id,
    vendor_id: r.vendor_id,
    vendor_legal_name: r.vendor?.legal_name ?? '(unknown vendor)',
    total_amount: r.total_amount,
    payment_terms: r.payment_terms,
    warranty: r.warranty,
    start_date: r.start_date,
    completion_date: r.completion_date,
    status: r.status,
    submitted_at: r.submitted_at,
    raw_document_path: r.raw_document_path,
  }))
  return { ok: true, data: bids }
}

export async function getBid(bidId: string): Promise<BidDetail | null> {
  const supabase = await getSupabaseServerClient()
  const { data: bid } = await supabase
    .from('bids' as never)
    .select(
      'id, vendor_id, total_amount, payment_terms, warranty, start_date, completion_date, status, submitted_at, raw_document_path, parsed_pdf_text, parsed_pdf_at, vendor:vendors(legal_name)',
    )
    .eq('id', bidId)
    .single()

  if (!bid) return null
  const r = bid as unknown as Omit<BidRow, 'vendor_legal_name'> & {
    parsed_pdf_text: string | null
    parsed_pdf_at: string | null
    vendor: { legal_name: string } | null
  }

  const { data: items } = await supabase
    .from('bid_line_items' as never)
    .select(
      'id, rfp_line_item_id, description, quantity, unit_price, line_total, is_excluded, is_addition, notes',
    )
    .eq('bid_id', bidId)

  return {
    id: r.id,
    vendor_id: r.vendor_id,
    vendor_legal_name: r.vendor?.legal_name ?? '(unknown vendor)',
    total_amount: r.total_amount,
    payment_terms: r.payment_terms,
    warranty: r.warranty,
    start_date: r.start_date,
    completion_date: r.completion_date,
    status: r.status,
    submitted_at: r.submitted_at,
    raw_document_path: r.raw_document_path,
    parsed_pdf_text: r.parsed_pdf_text,
    parsed_pdf_at: r.parsed_pdf_at,
    line_items: (items ?? []) as unknown as BidLineItemRow[],
  }
}

export async function getLatestBidComparison(
  rfpId: string,
): Promise<BidComparisonRow | null> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('bid_comparisons' as never)
    .select(
      'id, generated_at, ai_workflow_id, comparison_table, flagged_exclusions, flagged_additions, payment_term_diffs, warranty_diffs, recommendation_memo',
    )
    .eq('rfp_id', rfpId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  // Throw rather than return null: "no comparison run yet" and "couldn't
  // read the comparison" must look different (the page uses tryLoad).
  if (error) throw new Error(`bid_comparisons: ${error.code ?? 'error'}`)
  return data as unknown as BidComparisonRow | null
}

export async function getBidDocumentSignedUrl(
  storagePath: string,
): Promise<string | null> {
  // Bid PDFs carry vendor pricing and the bucket's read policy is
  // org-wide, so the board gate plus a bid row in this org that names the
  // path are the boundary — not the caller-supplied path.
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return null
  if (typeof storagePath !== 'string' || !storagePath.startsWith(`${gate.orgId}/`)) return null
  const owned = await checkOrgOwned('bids', storagePath, gate.orgId, { column: 'raw_document_path' })
  if (owned !== 'owned') return null
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase.storage
    .from('hoa-documents')
    .createSignedUrl(storagePath, 60 * 60)
  return data?.signedUrl ?? null
}

// ─── Writes ──────────────────────────────────────────────────────────

export async function runBidComparison(
  rfpId: string,
): Promise<ActionResult<{ runId: string; output: BidComparatorOutput }>> {
  // H-1: role gate first, then the client-supplied rfpId must be this
  // org's — both before the quota charge and W23's service-role reads.
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }

  const owned = await checkOrgOwned('rfps', rfpId, gate.orgId)
  if (owned === 'error') return { ok: false, error: CHECK_FAILED }
  if (owned !== 'owned') return { ok: false, error: RFP_NOT_FOUND }

  // BL-112: board-initiated AI comparison (W23) → `board_ai`.
  const quota = await chargeAiActionQuota('board_ai', gate.orgId)
  if (!quota.ok) return { ok: false, error: quota.error }

  try {
    const { output, runId } = await bidComparator.execute(
      { rfpId },
      { organizationId: gate.orgId },
    )
    revalidatePath('/')  // dashboard rollup
    revalidatePath(`/rfps/${rfpId}`)
    revalidatePath(`/rfps/${rfpId}/comparison`)
    return { ok: true, data: { runId, output } }
  } catch (err) {
    // Fixed strings only: workflow messages can carry ids and DB text.
    const code = err instanceof Error ? (err.message.split(':')[0] ?? 'error') : 'error'
    console.error('[bids] runBidComparison failed', { rfpId, code })
    if (code === 'w23_needs_at_least_two_bids') return { ok: false, error: NEEDS_TWO_BIDS }
    if (code === 'rfp_not_found') return { ok: false, error: RFP_NOT_FOUND }
    return { ok: false, error: COMPARISON_FAILED }
  }
}

const AwardSchema = z.object({
  rfp_id: z.string().uuid(),
  bid_id: z.string().uuid(),
})

export async function awardBid(
  rfpId: string,
  bidId: string,
): Promise<ActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }

  const parsed = AwardSchema.safeParse({ rfp_id: rfpId, bid_id: bidId })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  // Look up the winning bid's vendor.
  const { data: bid } = await supabase
    .from('bids' as never)
    .select('id, vendor_id, status, rfp_id')
    .eq('id', bidId)
    .maybeSingle<{
      id: string
      vendor_id: string
      status: string
      rfp_id: string
    }>()

  if (!bid) return { ok: false, error: 'Bid not found.' }
  if (bid.rfp_id !== rfpId) {
    return { ok: false, error: 'Bid does not belong to this RFP.' }
  }
  if (bid.status !== 'submitted') {
    return { ok: false, error: `Only submitted bids can be awarded; this one is '${bid.status}'.` }
  }

  // Flip the RFP first; if that succeeds, mark this bid awarded + the
  // others declined. We don't wrap in a transaction (Supabase JS
  // doesn't easily expose one) — order matters: status checks above
  // mean a re-run is safe (idempotent if interrupted).
  const now = new Date().toISOString()
  const { error: rfpErr } = await supabase
    .from('rfps' as never)
    .update({
      status: 'awarded',
      awarded_to_vendor_id: bid.vendor_id,
      awarded_at: now,
    } as never)
    .eq('id', rfpId)
    .eq('status', 'open')

  if (rfpErr) return { ok: false, error: rfpErr.message }

  const { error: winErr } = await supabase
    .from('bids' as never)
    .update({ status: 'awarded' } as never)
    .eq('id', bidId)
  if (winErr) return { ok: false, error: winErr.message }

  // Other submitted bids on this RFP become 'declined'. Withdrawn /
  // draft bids stay where they are.
  //
  // KNOWN CONSISTENCY GAP: if this update fails, the winning bid + RFP
  // are already final but losing bids remain in 'submitted'. We log
  // loudly so a human / monitoring can repair the rows, but we do NOT
  // fail the whole award — the awarded bid is the source of truth.
  const { error: declineErr } = await supabase
    .from('bids' as never)
    .update({ status: 'declined' } as never)
    .eq('rfp_id', rfpId)
    .eq('status', 'submitted')
    .neq('id', bidId)

  if (declineErr) {
    console.error(
      '[bids] decline losing bids failed',
      declineErr.message,
      { rfpId, awardedBidId: bidId },
    )
  }

  revalidatePath(`/rfps/${rfpId}`)
  revalidatePath(`/rfps/${rfpId}/bids`)
  revalidatePath(`/rfps/${rfpId}/comparison`)
  revalidatePath('/rfps')
  return { ok: true }
}
