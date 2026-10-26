'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { authSubmitterEmails } from '@/lib/contact-updates/submitter-email'
import { approveVendor, rejectVendor } from '@/lib/vendors'
import { approveViolationDraft, rejectViolationDraft } from '@/lib/violations'
import { enterBill } from '@/lib/invoices'
import { getPrimaryAssociation } from '@/lib/vendors'
import { makeBillExecutor } from '@/lib/bill-scan/executor'
import { billInvoiceExists } from '@/lib/bill-scan/load'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { moneyGate, type SignoffDb } from '@/lib/professionals/signoff'
import { PRO_AUDIT } from '@/lib/professionals/model'
import { billHandlers, contactHandlers, decideApprovalFor, joinHandlers, letterHandlers, openingHandlers, postingHandlers, proHandlers, type InboxDecisionInput, type InboxDecisionOutcome } from './decide'

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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }
  // The bill executor enters the bill as the APPROVER, through the same
  // action as "Enter a bill" — invoice row + Dr expense / Cr AP JE.
  const billExecutor = makeBillExecutor({
    primaryAssociationId: async () => (await getPrimaryAssociation())?.id ?? null,
    invoiceExists: (vendorId, invoiceNumber) => billInvoiceExists(supabase, vendorId, invoiceNumber),
    enterBill,
  })
  const result = await decideApprovalFor(gate.role, input, {
    ...postingHandlers(supabase, adminDb),
    ...billHandlers(supabase, adminDb, billExecutor),
    ...letterHandlers(supabase, adminDb),
    ...openingHandlers(supabase, adminDb),
    ...proHandlers(supabase, adminDb),
    approveVendor,
    rejectVendor,
    approveViolationDraft,
    rejectViolationDraft,
    // PR-10: the board's own RLS client; adminDb is never passed here. The
    // one service-role call is a read of submitters' auth emails, so a
    // typed "Signed in as" line never picks whose rows change.
    ...contactHandlers(supabase, { orgId: gate.orgId, deciderId: user.id, deciderRole: gate.role }, { submitterEmails: authSubmitterEmails }),
    // BL-143: the board's own RLS client; owner_join_decide refuses non-board callers.
    ...joinHandlers(supabase, M5_APPLIED),
    // BL-168: Treasurer routing and dual control on the decider's own RLS
    // client; absent with M6_APPLIED false (no routing, as today).
    ...(M6_APPLIED
      ? {
          moneyGate: async (requestId: string) => {
            const gated = await moneyGate(supabase as unknown as SignoffDb, { orgId: gate.orgId, requestId, deciderId: user.id })
            // A sign-off was recorded unless the gate refused (ok:false) or had nothing to do for a non-money item.
            if (gated === null || gated.ok) {
              const { error } = await supabase.from('audit_log').insert({
                org_id: gate.orgId,
                user_id: user.id,
                action: PRO_AUDIT.signoff,
                entity_type: 'approval_request',
                entity_id: requestId,
                metadata: { outcome: gated === null ? 'approved' : 'recorded' },
              })
              if (error) console.warn('[approvals] signoff audit failed', { code: error.code })
            }
            return gated
          },
        }
      : {}),
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
  } else if (input.kind === 'contact') {
    revalidatePath('/properties', 'layout')
    revalidatePath('/tickets', 'layout')
    revalidatePath('/resident/account')
  } else if (input.kind === 'join') {
    revalidatePath('/settings/members')
    revalidatePath('/properties', 'layout')
  } else if (input.kind === 'opening') {
    revalidatePath('/accounting', 'layout')
    revalidatePath('/dues')
    revalidatePath('/properties', 'layout')
  } else if (input.kind === 'pro') {
    revalidatePath('/accounting', 'layout')
    revalidatePath('/settings/professionals')
    revalidatePath('/pro', 'layout')
  } else if (input.kind === 'collections') {
    revalidatePath('/properties', 'layout')
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
