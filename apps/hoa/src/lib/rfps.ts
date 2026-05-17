'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { rfpComposer, type RfpComposerOutput } from '@homeowner-portal/workflows'
import { getCurrentOrg } from '@/lib/orgs'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export type RfpStatus = 'draft' | 'open' | 'evaluation' | 'awarded' | 'cancelled'

export interface RfpRow {
  id: string
  rfp_number: string
  title: string
  status: RfpStatus
  submission_deadline: string
  budget_min: number | null
  budget_max: number | null
  ai_generated: boolean
  created_at: string
}

export interface RfpLineItem {
  id: string
  description: string
  quantity: number | null
  unit: string | null
  notes: string | null
}

export interface RfpDetail extends RfpRow {
  scope: string
  evaluation_criteria: Array<{ criterion: string; weight: number }> | null
  insurance_requirements: Record<string, unknown> | null
  qualifications: string[] | null
  submission_instructions: string | null
  ai_workflow_id: string | null
  awarded_to_vendor_id: string | null
  awarded_at: string | null
  line_items: RfpLineItem[]
}

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

// ─── Reads ───────────────────────────────────────────────────────────

export async function listRfps(): Promise<RfpRow[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('rfps' as never)
    .select(
      'id, rfp_number, title, status, submission_deadline, budget_min, budget_max, ai_generated, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(100)
  return (data ?? []) as unknown as RfpRow[]
}

export async function getRfp(id: string): Promise<RfpDetail | null> {
  const supabase = await getSupabaseServerClient()
  const { data: rfp } = await supabase
    .from('rfps' as never)
    .select(
      'id, rfp_number, title, status, submission_deadline, budget_min, budget_max, scope, evaluation_criteria, insurance_requirements, ai_generated, ai_workflow_id, awarded_to_vendor_id, awarded_at, created_at',
    )
    .eq('id', id)
    .single()

  if (!rfp) return null
  const base = rfp as unknown as Omit<RfpDetail, 'line_items' | 'qualifications' | 'submission_instructions'> & {
    qualifications?: string[] | null
    submission_instructions?: string | null
  }

  const { data: items } = await supabase
    .from('rfp_line_items' as never)
    .select('id, description, quantity, unit, notes')
    .eq('rfp_id', id)
    .order('description', { ascending: true })

  return {
    ...base,
    qualifications: base.qualifications ?? null,
    submission_instructions: base.submission_instructions ?? null,
    line_items: (items ?? []) as unknown as RfpLineItem[],
  }
}

// ─── Writes ──────────────────────────────────────────────────────────

const CreateDraftSchema = z.object({
  free_text_need: z.string().trim().min(10, 'Describe the need in at least one sentence.').max(4000),
  budget_min: z.number().nonnegative().nullable().optional(),
  budget_max: z.number().nonnegative().nullable().optional(),
  submission_deadline: z
    .string()
    .datetime({ message: 'Submission deadline must be a valid ISO 8601 timestamp.' }),
})

export interface CreateRfpDraftInput {
  freeTextNeed: string
  budgetMin?: number | null
  budgetMax?: number | null
  submissionDeadline: string
}

export async function createRfpDraft(
  input: CreateRfpDraftInput,
): Promise<ActionResult<{ rfpId: string; aiRunId: string }>> {
  const parsed = CreateDraftSchema.safeParse({
    free_text_need: input.freeTextNeed,
    budget_min: input.budgetMin ?? null,
    budget_max: input.budgetMax ?? null,
    submission_deadline: input.submissionDeadline,
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

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No association configured for this HOA.' }

  let output: RfpComposerOutput
  let runId: string
  try {
    const result = await rfpComposer.execute(
      {
        associationId: assoc.id,
        freeTextNeed: parsed.data.free_text_need,
        budgetMin: parsed.data.budget_min ?? null,
        budgetMax: parsed.data.budget_max ?? null,
        submissionDeadline: parsed.data.submission_deadline,
      },
      { organizationId: org.id },
    )
    output = result.output
    runId = result.runId
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'RFP draft failed.',
    }
  }

  const rfpNumber = await nextRfpNumber(supabase, assoc.id)

  const { data: rfpRow, error: insertErr } = await supabase
    .from('rfps' as never)
    .insert({
      organization_id: org.id,
      association_id: assoc.id,
      rfp_number: rfpNumber,
      title: output.title,
      scope: output.scope,
      budget_min: parsed.data.budget_min ?? null,
      budget_max: parsed.data.budget_max ?? null,
      evaluation_criteria: output.evaluationCriteria,
      insurance_requirements: output.insuranceRequirements,
      submission_deadline: parsed.data.submission_deadline,
      status: 'draft',
      ai_generated: true,
      ai_workflow_id: runId,
      created_by: user.id,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (insertErr || !rfpRow) {
    return {
      ok: false,
      error: insertErr?.message ?? 'Could not save RFP draft.',
    }
  }

  if (output.lineItems.length > 0) {
    const itemRows = output.lineItems.map((li) => ({
      rfp_id: rfpRow.id,
      description: li.description,
      quantity: li.quantity ?? null,
      unit: li.unit ?? null,
      notes: li.notes ?? null,
    }))
    const { error: linesErr } = await supabase
      .from('rfp_line_items' as never)
      .insert(itemRows as never)
    if (linesErr) {
      // Line-items failed but the RFP row exists. `publishRfp` will
      // refuse the draft until at least one line item lands, so the
      // manager will see an actionable error rather than a silent
      // half-saved draft. Surface the underlying message so support
      // can diagnose.
      console.error('[rfps.createRfpDraft] line items insert failed', linesErr.message)
      return {
        ok: false,
        error: `Saved the draft, but ${output.lineItems.length} line item${
          output.lineItems.length === 1 ? '' : 's'
        } didn't save: ${linesErr.message}. Re-open the draft and re-enter them.`,
      }
    }
  }

  revalidatePath('/rfps')
  return { ok: true, data: { rfpId: rfpRow.id, aiRunId: runId } }
}

const UpdateRfpSchema = z.object({
  title: z.string().trim().min(2).optional(),
  scope: z.string().trim().min(2).optional(),
  budget_min: z.number().nonnegative().nullable().optional(),
  budget_max: z.number().nonnegative().nullable().optional(),
  submission_deadline: z.string().datetime().optional(),
})

export interface UpdateRfpInput {
  rfpId: string
  title?: string
  scope?: string
  budgetMin?: number | null
  budgetMax?: number | null
  submissionDeadline?: string
}

export async function updateRfp(input: UpdateRfpInput): Promise<ActionResult> {
  const parsed = UpdateRfpSchema.safeParse({
    title: input.title,
    scope: input.scope,
    budget_min: input.budgetMin,
    budget_max: input.budgetMax,
    submission_deadline: input.submissionDeadline,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const patch: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) patch.title = parsed.data.title
  if (parsed.data.scope !== undefined) patch.scope = parsed.data.scope
  if (parsed.data.budget_min !== undefined) patch.budget_min = parsed.data.budget_min
  if (parsed.data.budget_max !== undefined) patch.budget_max = parsed.data.budget_max
  if (parsed.data.submission_deadline !== undefined) {
    patch.submission_deadline = parsed.data.submission_deadline
  }

  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase
    .from('rfps' as never)
    .update(patch as never)
    .eq('id', input.rfpId)
    .eq('status', 'draft') // Edits only allowed on drafts.

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/rfps/${input.rfpId}`)
  revalidatePath('/rfps')
  return { ok: true }
}

export async function publishRfp(rfpId: string): Promise<ActionResult> {
  const supabase = await getSupabaseServerClient()

  // Sanity check: an RFP without line items is almost certainly an
  // accidental publish.
  const { count } = await supabase
    .from('rfp_line_items' as never)
    .select('id', { count: 'exact', head: true })
    .eq('rfp_id', rfpId)

  if ((count ?? 0) === 0) {
    return {
      ok: false,
      error: 'Add at least one line item before publishing.',
    }
  }

  const { error } = await supabase
    .from('rfps' as never)
    .update({ status: 'open' } as never)
    .eq('id', rfpId)
    .eq('status', 'draft')

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/rfps/${rfpId}`)
  revalidatePath('/rfps')
  return { ok: true }
}

export async function cancelRfp(rfpId: string): Promise<ActionResult> {
  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from('rfps' as never)
    .update({ status: 'cancelled' } as never)
    .eq('id', rfpId)
    .in('status', ['draft', 'open'])
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/rfps/${rfpId}`)
  revalidatePath('/rfps')
  return { ok: true }
}

// ─── helpers ─────────────────────────────────────────────────────────

// RFP number format: RFP-YYYY-NNN (sequential per association per year).
async function nextRfpNumber(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  associationId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `RFP-${year}-`
  const { data } = await supabase
    .from('rfps' as never)
    .select('rfp_number')
    .eq('association_id', associationId)
    .like('rfp_number', `${prefix}%`)
    .order('rfp_number', { ascending: false })
    .limit(1)
    .maybeSingle<{ rfp_number: string }>()

  let next = 1
  if (data?.rfp_number) {
    const suffix = data.rfp_number.slice(prefix.length)
    const n = Number.parseInt(suffix, 10)
    if (Number.isFinite(n)) next = n + 1
  }
  return `${prefix}${String(next).padStart(3, '0')}`
}
