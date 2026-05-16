'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { vendorOnboarder } from '@homeowner-portal/workflows'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// Vendor tables ship in migration 0007 but aren't yet in database.types.ts
// (regen happens post-migration). Cast through `never` like ai_runs does
// in @homeowner-portal/ai/workflow.ts.

export type ComplianceStatus = 'green' | 'yellow' | 'red' | 'missing'

export interface VendorRow {
  id: string
  legal_name: string
  dba: string | null
  status: 'prospect' | 'active' | 'inactive' | 'blacklisted'
  trades: string[] | null
  primary_email: string | null
  primary_phone: string | null
  created_at: string
}

export interface VendorWithCompliance extends VendorRow {
  compliance: {
    status: ComplianceStatus | null
    coi_expiration_date: string | null
    deficiencies: Array<{ code: string; severity: string; detail: string }> | null
    last_reviewed_at: string | null
  } | null
}

export interface VendorDetail extends VendorRow {
  ein: string | null
  address: Record<string, unknown> | null
  notes: string | null
  compliance: {
    coi_status: ComplianceStatus | null
    coi_carrier: string | null
    coi_policy_number: string | null
    coi_effective_date: string | null
    coi_expiration_date: string | null
    coi_general_liability_per_occurrence: number | null
    coi_general_liability_aggregate: number | null
    coi_workers_comp: boolean | null
    coi_additional_insured_present: boolean | null
    w9_on_file: boolean
    license_number: string | null
    license_expiration: string | null
    deficiencies: Array<{ code: string; severity: string; detail: string }> | null
    last_reviewed_at: string | null
  } | null
}

// ─── Reads ───────────────────────────────────────────────────────────

// Picks the first association for the current HOA org. Self-managed HOAs
// have exactly one; management-company orgs aren't yet supported here.
export async function getPrimaryAssociation(): Promise<{ id: string; name: string } | null> {
  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('associations' as never)
    .select('id, name')
    .eq('organization_id', org.id)
    .order('name', { ascending: true })
    .limit(1)
    .single<{ id: string; name: string }>()

  return data ?? null
}

export async function listVendors(): Promise<VendorWithCompliance[]> {
  const supabase = await getSupabaseServerClient()
  const assoc = await getPrimaryAssociation()

  const { data: vendorRows } = await supabase
    .from('vendors' as never)
    .select(
      'id, legal_name, dba, status, trades, primary_email, primary_phone, created_at',
    )
    .order('legal_name', { ascending: true })
    .limit(200)

  const vendors = (vendorRows ?? []) as unknown as VendorRow[]
  if (vendors.length === 0 || !assoc) return vendors.map((v) => ({ ...v, compliance: null }))

  const { data: complianceRows } = await supabase
    .from('vendor_compliance' as never)
    .select(
      'vendor_id, coi_status, coi_expiration_date, deficiencies, last_reviewed_at',
    )
    .eq('association_id', assoc.id)
    .in('vendor_id', vendors.map((v) => v.id))

  type ComplianceRow = {
    vendor_id: string
    coi_status: ComplianceStatus | null
    coi_expiration_date: string | null
    deficiencies: Array<{ code: string; severity: string; detail: string }> | null
    last_reviewed_at: string | null
  }
  const byVendor = new Map<string, ComplianceRow>()
  for (const row of (complianceRows ?? []) as unknown as ComplianceRow[]) {
    byVendor.set(row.vendor_id, row)
  }

  return vendors.map((v) => {
    const c = byVendor.get(v.id)
    return {
      ...v,
      compliance: c
        ? {
            status: c.coi_status,
            coi_expiration_date: c.coi_expiration_date,
            deficiencies: c.deficiencies,
            last_reviewed_at: c.last_reviewed_at,
          }
        : null,
    }
  })
}

export async function getVendor(id: string): Promise<VendorDetail | null> {
  const supabase = await getSupabaseServerClient()
  const assoc = await getPrimaryAssociation()

  const { data: vendor } = await supabase
    .from('vendors' as never)
    .select(
      'id, legal_name, dba, ein, address, status, trades, primary_email, primary_phone, notes, created_at',
    )
    .eq('id', id)
    .single()

  if (!vendor) return null
  const base = vendor as unknown as VendorRow & {
    ein: string | null
    address: Record<string, unknown> | null
    notes: string | null
  }

  let compliance: VendorDetail['compliance'] = null
  if (assoc) {
    const { data: complianceRow } = await supabase
      .from('vendor_compliance' as never)
      .select(
        'coi_status, coi_carrier, coi_policy_number, coi_effective_date, coi_expiration_date, coi_general_liability_per_occurrence, coi_general_liability_aggregate, coi_workers_comp, coi_additional_insured_present, w9_on_file, license_number, license_expiration, deficiencies, last_reviewed_at',
      )
      .eq('vendor_id', id)
      .eq('association_id', assoc.id)
      .maybeSingle()

    compliance =
      (complianceRow as unknown as VendorDetail['compliance']) ?? null
  }

  return { ...base, compliance }
}

// ─── Writes ──────────────────────────────────────────────────────────

const CreateVendorSchema = z.object({
  legal_name: z.string().trim().min(2, 'Legal name is required.'),
  dba: z.string().trim().optional().nullable(),
  ein: z.string().trim().optional().nullable(),
  primary_email: z.string().trim().email().optional().nullable().or(z.literal('')),
  primary_phone: z.string().trim().optional().nullable(),
  trades: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().trim().optional().nullable(),
})

export interface CreateVendorInput {
  legalName: string
  dba?: string | null
  ein?: string | null
  primaryEmail?: string | null
  primaryPhone?: string | null
  trades?: string[]
  notes?: string | null
}

export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

export async function createVendor(
  input: CreateVendorInput,
): Promise<ActionResult<{ vendorId: string }>> {
  const parsed = CreateVendorSchema.safeParse({
    legal_name: input.legalName,
    dba: input.dba ?? null,
    ein: input.ein ?? null,
    primary_email: input.primaryEmail ?? '',
    primary_phone: input.primaryPhone ?? null,
    trades: input.trades ?? [],
    notes: input.notes ?? null,
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
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const { data: row, error } = await supabase
    .from('vendors' as never)
    .insert({
      organization_id: org.id,
      legal_name: parsed.data.legal_name,
      dba: parsed.data.dba || null,
      ein: parsed.data.ein || null,
      primary_email: parsed.data.primary_email || null,
      primary_phone: parsed.data.primary_phone || null,
      trades: parsed.data.trades,
      notes: parsed.data.notes || null,
      status: 'prospect',
      created_by: user.id,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Could not create vendor.' }
  }

  revalidatePath('/vendors')
  return { ok: true, data: { vendorId: row.id } }
}

const ManualExtractSchema = z.object({
  coi: z
    .object({
      carrier: z.string().nullable(),
      policyNumber: z.string().nullable(),
      effectiveDate: z.string().nullable(),
      expirationDate: z.string().nullable(),
      generalLiabilityPerOccurrence: z.number().nullable(),
      generalLiabilityAggregate: z.number().nullable(),
      workersComp: z.boolean().nullable(),
      autoLiability: z.number().nullable(),
      umbrella: z.number().nullable(),
      additionalInsuredPresent: z.boolean().nullable(),
      extractionConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    })
    .nullable(),
  w9: z
    .object({
      legalName: z.string().nullable(),
      einMasked: z.string().nullable(),
      address: z.string().nullable(),
      classification: z.string().nullable(),
      extractionConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    })
    .nullable(),
  license: z
    .object({
      number: z.string().nullable(),
      state: z.string().nullable(),
      trade: z.string().nullable(),
      expiration: z.string().nullable(),
      status: z.string().nullable(),
      extractionConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    })
    .nullable(),
})

export interface RunComplianceInput {
  vendorId: string
  manualExtract: z.infer<typeof ManualExtractSchema>
}

export async function runComplianceCheck(
  input: RunComplianceInput,
): Promise<
  ActionResult<{
    status: ComplianceStatus
    deficiencies: Array<{ code: string; severity: string; detail: string }>
    summary: string
    runId: string
  }>
> {
  const parsed = ManualExtractSchema.safeParse(input.manualExtract)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid extract.' }
  }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No association configured for this HOA.' }

  try {
    const { output, runId } = await vendorOnboarder.execute(
      {
        vendorId: input.vendorId,
        associationId: assoc.id,
        documents: [],
        manualExtract: parsed.data,
      },
      { organizationId: org.id },
    )

    revalidatePath(`/vendors/${input.vendorId}`)
    revalidatePath('/vendors')
    return {
      ok: true,
      data: {
        status: output.complianceStatus,
        deficiencies: output.deficiencies,
        summary: output.summary,
        runId,
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Compliance check failed.',
    }
  }
}

export async function approveVendor(
  vendorId: string,
): Promise<ActionResult> {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No association configured for this HOA.' }

  // Gate: only approve when compliance is green for this association.
  const { data: compliance } = await supabase
    .from('vendor_compliance' as never)
    .select('coi_status')
    .eq('vendor_id', vendorId)
    .eq('association_id', assoc.id)
    .maybeSingle<{ coi_status: ComplianceStatus | null }>()

  if (!compliance || compliance.coi_status !== 'green') {
    return {
      ok: false,
      error: 'Vendor is not green for this association. Approval is blocked.',
    }
  }

  const { error } = await supabase
    .from('vendors' as never)
    .update({ status: 'active' } as never)
    .eq('id', vendorId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/vendors/${vendorId}`)
  revalidatePath('/vendors')
  return { ok: true }
}
