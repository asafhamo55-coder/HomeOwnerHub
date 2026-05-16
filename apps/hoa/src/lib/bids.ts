'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  bidComparator,
  type BidComparatorOutput,
} from '@homeowner-portal/workflows'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

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
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('bids' as never)
    .select(
      'id, vendor_id, total_amount, payment_terms, warranty, start_date, completion_date, status, submitted_at, raw_document_path, vendor:vendors(legal_name)',
    )
    .eq('rfp_id', rfpId)
    .order('total_amount', { ascending: true })

  const rows = (data ?? []) as unknown as Array<
    Omit<BidRow, 'vendor_legal_name'> & { vendor: { legal_name: string } | null }
  >
  return rows.map((r) => ({
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
}

export async function getBid(bidId: string): Promise<BidDetail | null> {
  const supabase = await getSupabaseServerClient()
  const { data: bid } = await supabase
    .from('bids' as never)
    .select(
      'id, vendor_id, total_amount, payment_terms, warranty, start_date, completion_date, status, submitted_at, raw_document_path, vendor:vendors(legal_name)',
    )
    .eq('id', bidId)
    .single()

  if (!bid) return null
  const r = bid as unknown as Omit<BidRow, 'vendor_legal_name'> & {
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
    line_items: (items ?? []) as unknown as BidLineItemRow[],
  }
}

export async function getLatestBidComparison(
  rfpId: string,
): Promise<BidComparisonRow | null> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('bid_comparisons' as never)
    .select(
      'id, generated_at, ai_workflow_id, comparison_table, flagged_exclusions, flagged_additions, payment_term_diffs, warranty_diffs, recommendation_memo',
    )
    .eq('rfp_id', rfpId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as unknown as BidComparisonRow | null
}

export async function getBidDocumentSignedUrl(
  storagePath: string,
): Promise<string | null> {
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
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  try {
    const { output, runId } = await bidComparator.execute(
      { rfpId },
      { organizationId: org.id },
    )
    revalidatePath(`/rfps/${rfpId}`)
    revalidatePath(`/rfps/${rfpId}/comparison`)
    return { ok: true, data: { runId, output } }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Comparison failed.',
    }
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
  await supabase
    .from('bids' as never)
    .update({ status: 'declined' } as never)
    .eq('rfp_id', rfpId)
    .eq('status', 'submitted')
    .neq('id', bidId)

  revalidatePath(`/rfps/${rfpId}`)
  revalidatePath(`/rfps/${rfpId}/bids`)
  revalidatePath(`/rfps/${rfpId}/comparison`)
  revalidatePath('/rfps')
  return { ok: true }
}
