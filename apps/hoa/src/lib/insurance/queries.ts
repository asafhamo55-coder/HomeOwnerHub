/**
 * BL-132 reads (insurance_policies, migration 0068; M4_APPLIED).
 *
 * Flag off: every loader returns its "nothing" value WITHOUT touching the
 * database — the table may not exist yet. Flag on: reads with the caller's
 * own client (board/admin RLS), scoped to the org.
 *
 * Not a server action (no 'use server'); called from server components.
 * Ids and error codes only in logs.
 */

import { M4_APPLIED } from '@homeowner-portal/db/m4'
import { INSURANCE_COLUMNS, INSURANCE_TABLE, policyFromRow, type InsurancePolicy } from './model'

// insurance_policies is not in the generated types until gen:types runs
// after prod has 0068 (CLAUDE.md footgun 3).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseDb = { from: (table: string) => any }

/** The org's policies, soonest expiry first. [] with the flag off; null on a failed read. */
export async function loadInsurancePolicies(
  db: LooseDb,
  orgId: string,
  live: boolean = M4_APPLIED,
): Promise<InsurancePolicy[] | null> {
  if (!live) return []
  const { data, error } = (await db
    .from(INSURANCE_TABLE)
    .select(INSURANCE_COLUMNS)
    .eq('organization_id', orgId)
    .order('expires_on', { ascending: true })
    .range(0, 499)) as { data: Record<string, unknown>[] | null; error: { code?: string } | null }
  if (error) {
    console.error('[insurance] policies read failed', { orgId, code: error.code ?? null })
    return null
  }
  return (data ?? []).map(policyFromRow).filter((p): p is InsurancePolicy => p !== null)
}

export interface InsuranceDocumentOption {
  id: string
  name: string
}

/** The org's documents, for the policy form's "policy document" picker. [] with the flag off; null on a failed read. */
export async function loadInsuranceDocumentOptions(
  db: LooseDb,
  orgId: string,
  live: boolean = M4_APPLIED,
): Promise<InsuranceDocumentOption[] | null> {
  if (!live) return []
  const { data, error } = (await db
    .from('hoa_documents')
    .select('id, name')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(0, 499)) as { data: Array<{ id: string; name: string | null }> | null; error: { code?: string } | null }
  if (error) {
    console.error('[insurance] documents read failed', { orgId, code: error.code ?? null })
    return null
  }
  return (data ?? []).map((d) => ({ id: d.id, name: d.name?.trim() || 'Untitled document' }))
}

/**
 * BL-142: the columns an owner may see. No premium_cents, no
 * policy_number, no notes, no document link: they are never read, so they
 * can never be rendered.
 */
export const OWNER_INSURANCE_COLUMNS =
  'id, association_id, kind, carrier, coverage_limit_cents, deductible_cents, effective_on, expires_on'

/**
 * The org's policies for the resident portal's insurance summary.
 * insurance_policies RLS is board/admin only, so the caller passes the
 * service-role client; it is confined here to `orgId`, which the caller
 * takes from the signed-in member's own org (getCurrentOrg) or a verified
 * impersonation target. [] with the flag off; null on a failed read.
 */
export async function loadOwnerInsurancePolicies(
  db: LooseDb,
  orgId: string,
  live: boolean = M4_APPLIED,
): Promise<OwnerInsuranceRow[] | null> {
  if (!live) return []
  const { data, error } = (await db
    .from(INSURANCE_TABLE)
    .select(OWNER_INSURANCE_COLUMNS)
    .eq('organization_id', orgId)
    .order('expires_on', { ascending: true })
    .range(0, 499)) as { data: Record<string, unknown>[] | null; error: { code?: string } | null }
  if (error) {
    console.error('[insurance] owner summary read failed', { orgId, code: error.code ?? null })
    return null
  }
  return (data ?? []).map(policyFromRow).filter((p): p is OwnerInsuranceRow => p !== null)
}

/** A policy read with OWNER_INSURANCE_COLUMNS: premium and policy number are always null. */
export type OwnerInsuranceRow = InsurancePolicy
