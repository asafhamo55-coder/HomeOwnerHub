// BL-021 — the `w36.ap_bill` approval executor.
//
// Runs only after decide_approval_request() made THIS caller the winner of
// the approve claim (packages/workflows approveRequest), so it runs once.
// It adds no posting logic: the bill goes through enterBill
// (lib/invoices.ts), the same action as "Enter a bill" — invoice row, the
// Dr expense / Cr AP journal entry, the rollback on a failed JE. The
// executor only re-validates the proposal against the world as it is now.
//
// Dependencies are injected so the composition is unit-testable without
// Next or Supabase; actions.ts wires the real ones.

import type { ApprovalExecutor } from '@homeowner-portal/workflows'
import { enterBillInputFrom, readBillPayload, type EnterBillFromProposal } from './proposal'

export interface BillExecutorDeps {
  /** The association enterBill will write to (getPrimaryAssociation). */
  primaryAssociationId(): Promise<string | null>
  /** A live (non-deleted) invoice with this vendor + number already exists. */
  invoiceExists(vendorId: string, invoiceNumber: string): Promise<{ ok: true; exists: boolean } | { ok: false }>
  enterBill(input: EnterBillFromProposal): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }>
}

export function makeBillExecutor(deps: BillExecutorDeps): ApprovalExecutor {
  return async (_adminDb, request) => {
    const payload = readBillPayload(request.payload)
    if (!payload) return { ok: false, error: 'This proposal is not a readable bill. Enter it by hand instead.' }

    const mapped = enterBillInputFrom(payload)
    if (!mapped.ok) return mapped

    const assoc = await deps.primaryAssociationId()
    if (assoc !== payload.associationId) {
      return { ok: false, error: 'This bill was scanned for a different association. Enter it by hand instead.' }
    }

    const dup = await deps.invoiceExists(mapped.input.vendorId, mapped.input.invoiceNumber)
    if (!dup.ok) return { ok: false, error: 'Couldn’t check for an existing copy of this bill. Try again.' }
    if (dup.exists) {
      return { ok: false, error: `Invoice ${mapped.input.invoiceNumber} from this vendor is already entered.` }
    }

    const r = await deps.enterBill(mapped.input)
    return r.ok ? { ok: true, resultRef: r.invoiceId } : { ok: false, error: r.error }
  }
}
