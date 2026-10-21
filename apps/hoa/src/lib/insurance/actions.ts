'use server'

// BL-132: the board records the association's insurance policies and
// fidelity bond (insurance_policies, migration 0068; M4_APPLIED).
//
// Board/admin only: every action re-checks the role first
// (requireBoardOrAdminForAction) because a server action is a public
// endpoint. Writes go through the caller's own client, so RLS (board/admin
// of the org) is the second wall. The association must be one of the
// current org's; the policy document must be the org's (the 0068 trigger
// refuses another org's with 23503, mapped below).
//
// Flag off: nothing is read or written; the board is told why.
// Logs carry ids and error codes only.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { M4_APPLIED } from '@homeowner-portal/db/m4'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { INSURANCE_NOT_LIVE, INSURANCE_TABLE, POLICY_KINDS, dollarsToCents } from './model'
import type { LooseDb } from './queries'

export type InsuranceActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
const money = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    const c = dollarsToCents(v ?? null)
    if (c !== null && (!Number.isFinite(c) || c < 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter an amount in dollars, like 250000.' })
      return z.NEVER
    }
    return c
  })

const PolicySchema = z
  .object({
    associationId: z.string().uuid().optional().nullable().transform((v) => v ?? null),
    kind: z.enum(POLICY_KINDS, { errorMap: () => ({ message: 'Pick the kind of policy.' }) }),
    carrier: z.string().trim().min(1, 'Enter the insurance company.').max(200, 'Keep it under 200 characters.'),
    policyNumber: optionalText(100),
    coverageLimit: money,
    deductible: money,
    premium: money,
    effectiveOn: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || DAY.test(v), 'Enter a date.'),
    expiresOn: z.string().regex(DAY, 'Enter the date the policy ends.'),
    documentId: z.string().uuid().optional().nullable().transform((v) => v ?? null),
    notes: optionalText(2000),
  })
  .refine((p) => p.effectiveOn === null || p.effectiveOn < p.expiresOn, {
    path: ['expiresOn'],
    message: 'The end date must be after the start date.',
  })

export type PolicyInput = z.input<typeof PolicySchema>

function fieldErrors(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of issues) {
    const k = String(i.path[0] ?? '')
    if (k && !out[k]) out[k] = i.message
  }
  return out
}

function row(orgId: string, p: z.output<typeof PolicySchema>) {
  return {
    organization_id: orgId,
    association_id: p.associationId,
    kind: p.kind,
    carrier: p.carrier,
    policy_number: p.policyNumber,
    coverage_limit_cents: p.coverageLimit,
    deductible_cents: p.deductible,
    premium_cents: p.premium,
    effective_on: p.effectiveOn,
    expires_on: p.expiresOn,
    document_id: p.documentId,
    notes: p.notes,
  }
}

/** The association, when given, must be one of the org's. */
async function associationIsOrgs(db: LooseDb, orgId: string, associationId: string | null): Promise<boolean | 'error'> {
  if (!associationId) return true
  const { data, error } = (await db
    .from('associations')
    .select('id')
    .eq('organization_id', orgId)
    .eq('id', associationId)) as { data: Array<{ id: string }> | null; error: { code?: string } | null }
  if (error) return 'error'
  return (data ?? []).some((r) => r.id === associationId)
}

function writeError(code: string | undefined): string {
  if (code === '23503') return 'That document isn’t in your association’s library.'
  if (code === '23514') return 'Some fields need attention.'
  if (code === '42501') return 'You can’t change insurance records for this association.'
  return 'Couldn’t save. Try again.'
}

export async function saveInsurancePolicy(input: { id?: string | null; policy: PolicyInput }): Promise<InsuranceActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!M4_APPLIED) return { ok: false, error: INSURANCE_NOT_LIVE }

  const id = input?.id ?? null
  if (id !== null && !z.string().uuid().safeParse(id).success) return { ok: false, error: 'Invalid input.' }
  const parsed = PolicySchema.safeParse(input?.policy ?? {})
  if (!parsed.success) return { ok: false, error: 'Some fields need attention.', fieldErrors: fieldErrors(parsed.error.issues) }

  const supabase = (await getSupabaseServerClient()) as unknown as LooseDb
  const assocOk = await associationIsOrgs(supabase, gate.orgId, parsed.data.associationId)
  if (assocOk === 'error') return { ok: false, error: 'Couldn’t load your association. Try again.' }
  if (!assocOk) return { ok: false, error: 'That association isn’t part of your organization.' }

  const values = row(gate.orgId, parsed.data)
  const res = (id
    ? await supabase
        .from(INSURANCE_TABLE)
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', gate.orgId)
        .select('id')
    : await supabase.from(INSURANCE_TABLE).insert(values).select('id')) as {
    data: Array<{ id: string }> | null
    error: { code?: string } | null
  }
  if (res.error || !res.data || res.data.length === 0) {
    const code = res.error?.code ?? 'no_rows'
    console.error('[insurance] save failed', { orgId: gate.orgId, policyId: id, code })
    return { ok: false, error: res.error ? writeError(res.error.code) : 'That policy isn’t here any more.' }
  }

  revalidatePath('/insurance')
  revalidatePath('/')
  return { ok: true, id: res.data[0]!.id }
}

export async function deleteInsurancePolicy(id: string): Promise<InsuranceActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!M4_APPLIED) return { ok: false, error: INSURANCE_NOT_LIVE }
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Invalid input.' }

  const supabase = (await getSupabaseServerClient()) as unknown as LooseDb
  const { data, error } = (await supabase
    .from(INSURANCE_TABLE)
    .delete()
    .eq('id', id)
    .eq('organization_id', gate.orgId)
    .select('id')) as { data: Array<{ id: string }> | null; error: { code?: string } | null }
  if (error || !data || data.length === 0) {
    console.error('[insurance] delete failed', { orgId: gate.orgId, policyId: id, code: error?.code ?? 'no_rows' })
    return { ok: false, error: error ? 'Couldn’t delete. Try again.' : 'That policy isn’t here any more.' }
  }
  revalidatePath('/insurance')
  revalidatePath('/')
  return { ok: true }
}
