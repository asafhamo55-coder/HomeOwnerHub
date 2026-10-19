// BL-089 — the `collections.letter` approval executor.
//
// Runs only for the caller that won decide_approval_request()'s approve
// claim (packages/workflows approveRequest), so once. Approving a letter
// performs no side effect beyond the decision itself: nothing is sent,
// nothing is posted. The executor re-checks that the letter still belongs
// to an open case in the request's organization, and records the case as
// the result. Printing (actions.ts) is what writes the collections event.
//
// Relative imports only (the approvals inbox composes this and
// tests/integration has no `@/` alias).

import type { ApprovalExecutor } from '@homeowner-portal/workflows'
import { readLetterPayload } from './proposal'

export const letterExecutor: ApprovalExecutor = async (adminDb, request) => {
  const payload = readLetterPayload(request.payload)
  if (!payload) return { ok: false, error: 'This letter can’t be read. Draft it again from the property page.' }

  const { data, error } = await adminDb
    .from('collection_cases')
    .select('id, organization_id, status, deleted_at')
    .eq('id', payload.caseId)
    .maybeSingle()
  if (error) return { ok: false, error: 'Couldn’t check the collections case. Try again.' }
  const c = data as { id: string; organization_id: string; status: string; deleted_at: string | null } | null
  if (!c || c.organization_id !== request.organization_id || c.deleted_at !== null) {
    return { ok: false, error: 'The collections case for this letter no longer exists.' }
  }
  if (c.status === 'resolved' || c.status === 'written_off') {
    return { ok: false, error: 'The collections case for this letter is closed, so the letter wasn’t approved.' }
  }
  return { ok: true, resultRef: c.id }
}
