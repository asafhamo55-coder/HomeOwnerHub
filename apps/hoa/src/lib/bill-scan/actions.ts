'use server'

// BL-059 — save a board member's corrections to a scanned bill.
//
// approval_requests has no UPDATE policy for users (0060): a user must not
// be able to rewrite a proposal's payload. This action is that write's only
// door, so it runs the board gate BEFORE any Supabase client exists, reads
// the row through the caller's RLS client, re-validates every value
// (lib/bill-scan/edit.ts), and only then writes with the service role —
// scoped to the gate's org and to a row still 'proposed'.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import type { Json } from '@homeowner-portal/db'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { logRouteFailure } from '@/lib/api/log'
import { BILL_ACTION } from './proposal'
import { saveBillEdit, type BillEditOutcome } from './edit'
import { billInvoiceExists, loadBillEditOptions } from './load'

export async function editBillProposal(input: unknown): Promise<BillEditOutcome> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const orgId = gate.orgId

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }
  const adminDb = createAdminClient()

  const result = await saveBillEdit(input, {
    userId: user.id,
    now: () => new Date(),
    loadRequest: async (id) => {
      const { data, error } = await supabase
        .from('approval_requests')
        .select('action_type, status, payload')
        .eq('id', id)
        .eq('organization_id', orgId)
        .maybeSingle()
      if (error) {
        logRouteFailure('bill-scan.edit.load', error, { orgId, rowId: id })
        return { ok: false }
      }
      return { ok: true, row: data ? { actionType: data.action_type, status: data.status, payload: data.payload } : null }
    },
    loadOptions: (associationId) => loadBillEditOptions(supabase, orgId, associationId),
    invoiceExists: (vendorId, invoiceNumber) => billInvoiceExists(supabase, vendorId, invoiceNumber),
    updateProposal: async (id, next) => {
      const { data, error } = await adminDb
        .from('approval_requests')
        .update({ payload: next.payload as unknown as Json, summary: next.summary, amount: next.amount })
        .eq('id', id)
        .eq('organization_id', orgId)
        .eq('action_type', BILL_ACTION)
        .eq('status', 'proposed')
        .select('id')
      if (error) {
        logRouteFailure('bill-scan.edit.update', error, { orgId, rowId: id })
        return 'error'
      }
      return (data ?? []).length === 1 ? 'ok' : 'not_proposed'
    },
    recordRunEdit: async (aiRunId, record) => {
      const { error } = await adminDb
        .from('ai_runs')
        .update({ human_edited_output: record as unknown as Json })
        .eq('id', aiRunId)
        .eq('organization_id', orgId)
        .eq('workflow_id', 'W36')
      if (error) logRouteFailure('bill-scan.edit.ai-run', error, { orgId, rowId: aiRunId })
      return !error
    },
  })

  if (result.ok && result.editedFields.length > 0) revalidatePath('/approvals')
  return result
}
