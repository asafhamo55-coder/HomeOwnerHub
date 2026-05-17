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

export interface VendorAddress {
  line1?: string | null
  line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
}

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

export interface VendorDocument {
  id: string
  doc_type: 'coi' | 'w9' | 'license' | 'contract' | 'other'
  storage_path: string
  uploaded_at: string
  expires_at: string | null
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
  address: VendorAddress | null
  service_area_zips: string[] | null
  notes: string | null
  documents: VendorDocument[]
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
      'id, legal_name, dba, ein, address, service_area_zips, status, trades, primary_email, primary_phone, notes, created_at',
    )
    .eq('id', id)
    .single()

  if (!vendor) return null
  const base = vendor as unknown as VendorRow & {
    ein: string | null
    address: VendorAddress | null
    service_area_zips: string[] | null
    notes: string | null
  }

  const { data: docRows } = await supabase
    .from('vendor_documents' as never)
    .select('id, doc_type, storage_path, uploaded_at, expires_at')
    .eq('vendor_id', id)
    .order('uploaded_at', { ascending: false })
  const documents = (docRows ?? []) as unknown as VendorDocument[]

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

  return { ...base, documents, compliance }
}

// ─── Writes ──────────────────────────────────────────────────────────

const AddressSchema = z.object({
  line1: z.string().trim().optional().nullable(),
  line2: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  postal_code: z.string().trim().optional().nullable(),
})

// EIN: 9 digits, optionally with a hyphen. Allows masked-EIN passthrough
// (we don't validate the issuer, just shape).
const EIN_REGEX = /^\d{2}-?\d{7}$/

const CreateVendorSchema = z
  .object({
    legal_name: z.string().trim().min(2, 'Legal name is required.'),
    dba: z.string().trim().optional().nullable(),
    ein: z
      .string()
      .trim()
      .min(1, 'EIN is required (needed for 1099 reporting).')
      .regex(EIN_REGEX, 'EIN must be 9 digits, e.g. 12-3456789.'),
    primary_email: z
      .string()
      .trim()
      .email('Email looks invalid.')
      .optional()
      .nullable()
      .or(z.literal('')),
    primary_phone: z.string().trim().optional().nullable(),
    trades: z
      .array(z.string().trim().min(1))
      .min(1, 'Add at least one trade — drives license validation.'),
    address: AddressSchema.optional().nullable(),
    service_area_zips: z.array(z.string().trim().regex(/^\d{5}$/, 'ZIP must be 5 digits.')).default([]),
    notes: z.string().trim().optional().nullable(),
  })
  .refine(
    (v) => (v.primary_email && v.primary_email !== '') || (v.primary_phone && v.primary_phone !== ''),
    {
      message: 'At least one of email or phone is required.',
      path: ['primary_email'],
    },
  )

export interface CreateVendorInput {
  legalName: string
  dba?: string | null
  ein: string
  primaryEmail?: string | null
  primaryPhone?: string | null
  trades: string[]
  address?: VendorAddress | null
  serviceAreaZips?: string[]
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
    ein: input.ein,
    primary_email: input.primaryEmail ?? '',
    primary_phone: input.primaryPhone ?? null,
    trades: input.trades,
    address: input.address ?? null,
    service_area_zips: input.serviceAreaZips ?? [],
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

  const address = parsed.data.address
  const addressJson =
    address && Object.values(address).some((v) => v != null && v !== '')
      ? {
          line1: address.line1 ?? null,
          line2: address.line2 ?? null,
          city: address.city ?? null,
          state: address.state ?? null,
          postal_code: address.postal_code ?? null,
        }
      : null

  const { data: row, error } = await supabase
    .from('vendors' as never)
    .insert({
      organization_id: org.id,
      legal_name: parsed.data.legal_name,
      dba: parsed.data.dba || null,
      ein: parsed.data.ein,
      primary_email: parsed.data.primary_email || null,
      primary_phone: parsed.data.primary_phone || null,
      trades: parsed.data.trades,
      address: addressJson,
      service_area_zips:
        parsed.data.service_area_zips.length > 0
          ? parsed.data.service_area_zips
          : null,
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

const RecordDocSchema = z.object({
  vendor_id: z.string().uuid(),
  doc_type: z.enum(['coi', 'w9', 'license', 'contract', 'other']),
  storage_path: z.string().min(1),
  expires_at: z.string().nullable().optional(),
})

export interface RecordVendorDocInput {
  vendorId: string
  docType: 'coi' | 'w9' | 'license' | 'contract' | 'other'
  storagePath: string
  expiresAt?: string | null
}

export async function recordVendorDocument(
  input: RecordVendorDocInput,
): Promise<ActionResult<{ documentId: string }>> {
  const parsed = RecordDocSchema.safeParse({
    vendor_id: input.vendorId,
    doc_type: input.docType,
    storage_path: input.storagePath,
    expires_at: input.expiresAt ?? null,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid document.' }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const { data: row, error } = await supabase
    .from('vendor_documents' as never)
    .insert({
      organization_id: org.id,
      vendor_id: parsed.data.vendor_id,
      doc_type: parsed.data.doc_type,
      storage_path: parsed.data.storage_path,
      expires_at: parsed.data.expires_at,
      uploaded_by: user.id,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Could not save document.' }
  }

  revalidatePath(`/vendors/${parsed.data.vendor_id}`)
  revalidatePath(`/vendors/${parsed.data.vendor_id}/compliance`)
  return { ok: true, data: { documentId: row.id } }
}

export async function deleteVendorDocument(
  documentId: string,
): Promise<ActionResult> {
  const supabase = await getSupabaseServerClient()

  // Look up to find the storage_path + vendor_id before deleting.
  const { data: doc } = await supabase
    .from('vendor_documents' as never)
    .select('vendor_id, storage_path')
    .eq('id', documentId)
    .maybeSingle<{ vendor_id: string; storage_path: string }>()

  if (!doc) return { ok: false, error: 'Document not found.' }

  await supabase.storage.from('hoa-documents').remove([doc.storage_path])

  const { error } = await supabase
    .from('vendor_documents' as never)
    .delete()
    .eq('id', documentId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/vendors/${doc.vendor_id}`)
  revalidatePath(`/vendors/${doc.vendor_id}/compliance`)
  return { ok: true }
}

export async function getVendorDocumentSignedUrl(
  storagePath: string,
): Promise<string | null> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase.storage
    .from('hoa-documents')
    .createSignedUrl(storagePath, 60 * 60) // 1 hour
  return data?.signedUrl ?? null
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
