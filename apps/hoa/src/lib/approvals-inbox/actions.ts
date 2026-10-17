'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { approveVendor, rejectVendor } from '@/lib/vendors'
import { approveViolationDraft, rejectViolationDraft } from '@/lib/violations'
import { enterBill } from '@/lib/invoices'
import { getPrimaryAssociation } from '@/lib/vendors'
import { makeBillExecutor } from '@/lib/bill-scan/executor'
import { billHandlers, decideApprovalFor, postingHandlers, type InboxDecisionInput, type InboxDecisionOutcome } from './decide'

/**
 * The one decision endpoint behind /approvals (BL-014). It only routes:
 * W18 goes through the approval layer exactly as the matching queue's
 * approvePosting/rejectPosting do (the user's RLS client makes the
 * decision via decide_approval_request; service role runs the executor),
 * vendors through approveVendor/rejectVendor, and W3 letters through
 * approveViolationDraft/rejectViolationDraft (BL-048), and scanned bills
 * through the approval layer with the w36.ap_bill executor, which enters the
 * bill via enterBill (BL-021). See decide.ts.
 *
 * Residents are refused here, before any Supabase client is created.
 */
export async function decideApproval(input: InboxDecisionInput): Promise<InboxDecisionOutcome> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const supabase = await getSupabaseServerClient()
  const adminDb = createAdminClient()
  // The bill executor enters the bill as the APPROVER, through the same
  // action as "Enter a bill" — invoice row + Dr expense / Cr AP JE.
  const billExecutor = makeBillExecutor({
    primaryAssociationId: async () => (await getPrimaryAssociation())?.id ?? null,
    invoiceExists: async (vendorId, invoiceNumber) => {
      const { count, error } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', vendorId)
        .eq('invoice_number', invoiceNumber)
        .is('deleted_at', null)
      return error ? { ok: false } : { ok: true, exists: (count ?? 0) > 0 }
    },
    enterBill,
  })
  const result = await decideApprovalFor(gate.role, input, {
    ...postingHandlers(supabase, adminDb),
    ...billHandlers(supabase, adminDb, billExecutor),
    approveVendor,
    rejectVendor,
    approveViolationDraft,
    rejectViolationDraft,
  })

  revalidatePath('/approvals')
  if (input.kind === 'w18') {
    revalidatePath('/accounting/bank')
    revalidatePath('/accounting/bank/queue')
    revalidatePath('/accounting/ledger')
  } else if (input.kind === 'bill') {
    revalidatePath('/accounting')
    revalidatePath('/accounting/invoices')
    revalidatePath('/accounting/ledger')
  } else if (input.kind === 'w3') {
    revalidatePath('/violations')
    revalidatePath('/violations/approval-queue')
  } else {
    revalidatePath('/vendors/approval-queue')
  }
  // The sidebar badge lives in the dashboard layout.
  revalidatePath('/', 'layout')
  return result
}
