'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const Schema = z.object({
  property_address: z.string().trim().min(3, 'Property address is required.'),
  tenant_name: z.string().trim().min(1, 'Tenant name is required.'),
  tenant_email: z.string().email('Tenant email must be valid.').optional().or(z.literal('')),
  monthly_rent: z.number().min(0).max(100_000),
  days_unpaid: z.number().int().min(0).max(3650),
  county: z.string().trim().min(2),
  state: z.string().trim().length(2),
  notice_type: z.string().trim().min(2),
  notice_draft: z.string().trim().min(10, 'Notice text is empty.'),
  approved_notice: z.string().trim().min(10),
  filing_eligible_date: z.string(), // ISO date
  notice_served_method: z.enum(['personal', 'posting', 'certified_mail']).optional(),
  case_notes: z.string().trim().optional(),
  compliance_flags: z
    .object({ flags: z.array(z.string()).optional(), recommendation: z.string().optional() })
    .nullable()
    .optional(),
})

export interface CreateCaseInput {
  propertyAddress: string
  tenantName: string
  tenantEmail: string
  monthlyRent: number
  daysUnpaid: number
  county: string
  state: string
  noticeType: string
  noticeDraft: string
  approvedNotice: string
  filingEligibleDate: string
  noticeServedMethod?: 'personal' | 'posting' | 'certified_mail'
  caseNotes?: string
  complianceFlags?: { flags?: string[]; recommendation?: string } | null
}

export type CreateCaseResult =
  | { ok: true; caseId: string }
  | { ok: false; error: string }

export async function createApprovedCase(
  input: CreateCaseInput,
): Promise<CreateCaseResult> {
  const parsed = Schema.safeParse({
    property_address: input.propertyAddress,
    tenant_name: input.tenantName,
    tenant_email: input.tenantEmail || undefined,
    monthly_rent: input.monthlyRent,
    days_unpaid: input.daysUnpaid,
    county: input.county,
    state: input.state,
    notice_type: input.noticeType,
    notice_draft: input.noticeDraft,
    approved_notice: input.approvedNotice,
    filing_eligible_date: input.filingEligibleDate,
    notice_served_method: input.noticeServedMethod,
    case_notes: input.caseNotes,
    compliance_flags: input.complianceFlags ?? null,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No workspace selected.' }

  const now = new Date().toISOString()

  const { data: row, error } = await supabase
    .from('eviction_cases')
    .insert({
      org_id: org.id,
      user_id: user.id,
      property_address: parsed.data.property_address,
      tenant_name: parsed.data.tenant_name,
      tenant_email: parsed.data.tenant_email ?? null,
      county: parsed.data.county,
      state: parsed.data.state,
      monthly_rent: parsed.data.monthly_rent,
      days_unpaid: parsed.data.days_unpaid,
      notice_type: parsed.data.notice_type,
      notice_draft: parsed.data.notice_draft,
      notice_approved: true,
      notice_approved_at: now,
      notice_approved_by: user.id,
      notice_sent_at: now,
      notice_served_method: parsed.data.notice_served_method ?? null,
      filing_eligible_date: parsed.data.filing_eligible_date,
      case_notes: parsed.data.case_notes ?? null,
      compliance_flags: parsed.data.compliance_flags ?? null,
      status: 'notice_sent',
    })
    .select('id')
    .single()

  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Could not save case.' }
  }

  revalidatePath('/')
  return { ok: true, caseId: row.id }
}
