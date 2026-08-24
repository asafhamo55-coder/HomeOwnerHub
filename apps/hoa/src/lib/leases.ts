'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { queryGoverningDocs } from '@homeowner-portal/workflows/W1'
import { getCurrentOrg } from '@/lib/orgs'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { logPropertyEvent } from '@/lib/property-events'

// Lease management — cap policy + waiting list + current state.
//
// Schema lives in migration 0017:
//   • associations.lease_cap_pct (authoritative; board-set)
//   • associations.lease_cap_ai_suggested_pct (W1's reading; advisory)
//   • lease_waiting_list (FIFO queue, partial-unique on status='waiting')
//   • property_events (audit trail; logged via @/lib/property-events)
//
// Stats roll up over hoa_properties.tenure. The unit ↔ property bridge
// (units.legacy_hoa_property_id from migration 0005) is what scopes a
// property to an association — hoa_properties itself doesn't carry
// association_id.

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

export type WaitingListStatus = 'waiting' | 'approved' | 'withdrawn' | 'denied'
export type PropertyTenure = 'owner_occupied' | 'leased' | 'unknown'

export interface LeaseStats {
  totalUnits: number
  leasedCount: number
  ownerOccupiedCount: number
  unknownCount: number
  leasedPct: number
  capPct: number | null
  headroom: number | null
}

export interface LeaseCap {
  capPct: number | null
  aiSuggestedPct: number | null
  aiSource: string | null
  setAt: string | null
  setBy: string | null
}

export interface WaitingListEntry {
  id: string
  property_id: string
  property_address: string
  property_unit_number: string | null
  owner_name: string | null
  requested_at: string
  status: WaitingListStatus
  notes: string | null
}

export interface SuggestCapResult {
  suggestedPct: number | null
  source: string | null
  answer: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  runId: string
}

// ─── Stats ───────────────────────────────────────────────────────────

// Roll up tenure over the set of hoa_properties that map to a unit in
// this association. hoa_properties.org_id is the cheap pre-filter; the
// units join nails it down to the right association.
export async function getLeaseStats(
  associationId: string,
): Promise<LeaseStats> {
  const supabase = await getSupabaseServerClient()

  const [unitsRes, capRes] = await Promise.all([
    supabase
      .from('units' as never)
      .select('legacy_hoa_property_id')
      .eq('association_id', associationId)
      .not('legacy_hoa_property_id', 'is', null),
    supabase
      .from('associations' as never)
      .select('lease_cap_pct')
      .eq('id', associationId)
      .maybeSingle<{ lease_cap_pct: number | string | null }>(),
  ])

  const propertyIds = ((unitsRes.data ?? []) as unknown as Array<{
    legacy_hoa_property_id: string | null
  }>)
    .map((r) => r.legacy_hoa_property_id)
    .filter((id): id is string => !!id)

  let leasedCount = 0
  let ownerOccupiedCount = 0
  let unknownCount = 0

  if (propertyIds.length > 0) {
    const { data: tenureRows } = await supabase
      .from('hoa_properties')
      .select('id, tenure')
      .in('id', propertyIds)
    for (const row of (tenureRows ?? []) as unknown as Array<{
      tenure: PropertyTenure | null
    }>) {
      const t = (row.tenure ?? 'unknown') as PropertyTenure
      if (t === 'leased') leasedCount += 1
      else if (t === 'owner_occupied') ownerOccupiedCount += 1
      else unknownCount += 1
    }
  }

  const totalUnits = propertyIds.length
  const leasedPct = totalUnits === 0 ? 0 : (leasedCount / totalUnits) * 100
  const capRaw = capRes.data?.lease_cap_pct
  const capPct = capRaw === null || capRaw === undefined ? null : Number(capRaw)

  // Headroom = (cap% of totalUnits) - currently leased. Floored at 0 so
  // we never show "-3 units can still be leased".
  // A cap of 0 means "not configured" (same as null), not "no leasing."
  let headroom: number | null = null
  if (capPct !== null && capPct > 0 && totalUnits > 0) {
    const maxLeasable = Math.floor((capPct / 100) * totalUnits)
    headroom = Math.max(0, maxLeasable - leasedCount)
  }

  return {
    totalUnits,
    leasedCount,
    ownerOccupiedCount,
    unknownCount,
    leasedPct,
    capPct,
    headroom,
  }
}

export async function getLeaseCap(
  associationId: string,
): Promise<LeaseCap | null> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('associations' as never)
    .select(
      'lease_cap_pct, lease_cap_ai_suggested_pct, lease_cap_ai_source, lease_cap_set_at, lease_cap_set_by',
    )
    .eq('id', associationId)
    .maybeSingle<{
      lease_cap_pct: number | string | null
      lease_cap_ai_suggested_pct: number | string | null
      lease_cap_ai_source: string | null
      lease_cap_set_at: string | null
      lease_cap_set_by: string | null
    }>()
  if (!data) return null
  return {
    capPct: data.lease_cap_pct === null ? null : Number(data.lease_cap_pct),
    aiSuggestedPct:
      data.lease_cap_ai_suggested_pct === null
        ? null
        : Number(data.lease_cap_ai_suggested_pct),
    aiSource: data.lease_cap_ai_source,
    setAt: data.lease_cap_set_at,
    setBy: data.lease_cap_set_by,
  }
}

const SetLeaseCapSchema = z.object({
  association_id: z.string().uuid(),
  cap_pct: z
    .number()
    .min(0, 'Cap must be 0 or higher.')
    .max(100, 'Cap must be 100 or lower.')
    .nullable(),
})

export interface SetLeaseCapInput {
  associationId: string
  capPct: number | null
}

export async function setLeaseCap(
  input: SetLeaseCapInput,
): Promise<ActionResult> {
  const parsed = SetLeaseCapSchema.safeParse({
    association_id: input.associationId,
    cap_pct: input.capPct,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  // Board/admin only. The (dashboard) layout already redirects residents
  // away from the page, but server actions are reachable via direct POST
  // regardless, so we gate here too.
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { error } = await supabase
    .from('associations' as never)
    .update({
      lease_cap_pct: parsed.data.cap_pct,
      lease_cap_set_at: new Date().toISOString(),
      lease_cap_set_by: user.id,
    } as never)
    .eq('id', parsed.data.association_id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/leases')
  return { ok: true }
}

// ─── AI suggestion (W1 — Governing Docs Brain) ───────────────────────

const LEASE_CAP_QUESTION =
  'What percentage of units in this community are allowed to be leased or rented out at any time? If there is a cap, quote the section of the declaration or rules that establishes it.'

const PCT_REGEX = /(\d{1,3}(?:\.\d+)?)\s*%/

export async function suggestLeaseCapFromDocs(
  associationId: string,
): Promise<ActionResult<SuggestCapResult>> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  // Board/admin only. Server actions are reachable via direct POST so
  // even though the page redirects residents, we double-check here.
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  // The caller passes associationId for clarity, but we validate against
  // the user's primary association to keep RLS-friendly behavior. If
  // they don't match, fail fast.
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No association configured for this HOA.' }
  if (assoc.id !== associationId) {
    return { ok: false, error: 'Association mismatch.' }
  }

  let result: Awaited<ReturnType<typeof queryGoverningDocs>>
  try {
    result = await queryGoverningDocs(LEASE_CAP_QUESTION, {
      organizationId: org.id,
      associationId: assoc.id,
    })
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'AI service unavailable.',
    }
  }

  // Try to extract a number 0-100 from the answer. If the docs don't
  // mention a cap, we expect the LLM to say so — and we'll surface that
  // verbatim to the UI rather than picking up a random "5%" in some
  // unrelated clause. PCT_REGEX over the whole answer is good enough
  // for v1; tighten if we see false positives in eval.
  const match = result.answer.match(PCT_REGEX)
  let suggestedPct: number | null = null
  if (match) {
    const n = Number(match[1])
    if (Number.isFinite(n) && n >= 0 && n <= 100) suggestedPct = n
  }

  // Build a human-readable source string from the first citation.
  // citations[] entries come back with docType + section.
  const firstCitation = result.citations[0]
  const source = firstCitation
    ? formatCitation(firstCitation.docType, firstCitation.section)
    : null

  const supabase = await getSupabaseServerClient()
  const { error: updateErr } = await supabase
    .from('associations' as never)
    .update({
      lease_cap_ai_suggested_pct: suggestedPct,
      lease_cap_ai_source: source,
    } as never)
    .eq('id', assoc.id)
  if (updateErr) {
    return { ok: false, error: updateErr.message }
  }

  revalidatePath('/leases')
  return {
    ok: true,
    data: {
      suggestedPct,
      source,
      answer: result.answer,
      confidence: result.confidence,
      runId: result.runId,
    },
  }
}

function formatCitation(docType: string, section: string | null): string {
  const docName = humanizeDocType(docType)
  if (!section) return docName
  return `${docName} ${section}`
}

function humanizeDocType(docType: string): string {
  switch (docType) {
    case 'declaration':
    case 'ccr':
    case 'ccrs':
      return 'Declaration'
    case 'bylaws':
      return 'Bylaws'
    case 'rules':
    case 'rules_and_regs':
      return 'Rules & Regulations'
    case 'amendment':
      return 'Amendment'
    default:
      return docType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }
}

// ─── Waiting list ────────────────────────────────────────────────────

export async function listWaitingList(
  associationId: string,
): Promise<WaitingListEntry[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('lease_waiting_list' as never)
    .select(
      'id, property_id, requested_at, status, notes, property:hoa_properties(address, unit_number, owner_name)',
    )
    .eq('association_id', associationId)
    .order('requested_at', { ascending: true })

  const rows = (data ?? []) as unknown as Array<{
    id: string
    property_id: string
    requested_at: string
    status: WaitingListStatus
    notes: string | null
    property: {
      address: string | null
      unit_number: string | null
      owner_name: string | null
    } | null
  }>

  return rows.map((r) => ({
    id: r.id,
    property_id: r.property_id,
    property_address: r.property?.address ?? '(unknown address)',
    property_unit_number: r.property?.unit_number ?? null,
    owner_name: r.property?.owner_name ?? null,
    requested_at: r.requested_at,
    status: r.status,
    notes: r.notes,
  }))
}

const AddWaitingListSchema = z.object({
  property_id: z.string().uuid(),
  notes: z.string().trim().max(2000, 'Notes must be 2000 characters or fewer.').optional(),
})

export interface AddToWaitingListInput {
  propertyId: string
  notes?: string
}

export async function addToWaitingList(
  input: AddToWaitingListInput,
): Promise<ActionResult<{ entryId: string }>> {
  const parsed = AddWaitingListSchema.safeParse({
    property_id: input.propertyId,
    notes: input.notes,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  // Board/admin only on the manager-side action. Residents have their
  // own portal flow and shouldn't be able to add to the waiting list
  // through this entrypoint.
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No association configured.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('lease_waiting_list' as never)
    .insert({
      organization_id: org.id,
      association_id: assoc.id,
      property_id: parsed.data.property_id,
      status: 'waiting',
      notes: parsed.data.notes ?? null,
      created_by: user?.id ?? null,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !data) {
    // The partial unique index on (property_id WHERE status='waiting')
    // means trying to add the same property twice fails with a duplicate
    // key error. Translate to something the UI can show.
    const msg = error?.message ?? 'Could not add to waiting list.'
    if (msg.includes('lease_waiting_list_one_open_per_property_idx')) {
      return {
        ok: false,
        error: 'This property is already on the waiting list.',
      }
    }
    return { ok: false, error: msg }
  }

  const ev = await logPropertyEvent({
    propertyId: parsed.data.property_id,
    kind: 'waiting_list_added',
    payload: { waitingListEntryId: data.id },
    notes: parsed.data.notes ?? null,
  })
  if (!ev.ok) {
    console.error('[leases.addToWaitingList] event log failed', ev.error)
  }

  revalidatePath('/leases')
  revalidatePath(`/properties/${parsed.data.property_id}`)
  return { ok: true, data: { entryId: data.id } }
}

export async function approveWaitingListEntry(
  entryId: string,
): Promise<ActionResult> {
  // Board/admin only on the manager-side action.
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data: entry } = await supabase
    .from('lease_waiting_list' as never)
    .select('id, property_id, status')
    .eq('id', entryId)
    .maybeSingle<{ id: string; property_id: string; status: WaitingListStatus }>()
  if (!entry) return { ok: false, error: 'Waiting-list entry not found.' }
  if (entry.status !== 'waiting') {
    return { ok: false, error: `Entry is already ${entry.status}.` }
  }

  // Flip the property's tenure to 'leased' — that's the whole point of
  // approving. Read the prior tenure so the property_events row can
  // show the actual transition.
  const { data: prop } = await supabase
    .from('hoa_properties')
    .select('id, tenure')
    .eq('id', entry.property_id)
    .maybeSingle<{ id: string; tenure: PropertyTenure | null }>()
  const prevTenure: PropertyTenure = (prop?.tenure ?? 'unknown') as PropertyTenure

  const nowIso = new Date().toISOString()
  // Guard against a TOCTOU race: a concurrent caller could approve/deny
  // this same entry between our SELECT above and this UPDATE. The
  // .eq('status', 'waiting') makes the UPDATE conditional, and .select()
  // returns the row only if it actually flipped. If we get nothing back,
  // someone else already resolved it — bail rather than firing tenure
  // changes and audit events for a no-op.
  const { data: updatedRows, error: updateErr } = await supabase
    .from('lease_waiting_list' as never)
    .update({
      status: 'approved',
      status_updated_at: nowIso,
      status_updated_by: user.id,
    } as never)
    .eq('id', entryId)
    .eq('status', 'waiting')
    .select('id')
  if (updateErr) return { ok: false, error: updateErr.message }
  if (!updatedRows || (updatedRows as unknown as Array<unknown>).length === 0) {
    return {
      ok: false,
      error:
        'This entry was already resolved by another action — refresh and try again.',
    }
  }

  if (prevTenure !== 'leased') {
    const { error: tenureErr } = await supabase
      .from('hoa_properties')
      .update({
        tenure: 'leased',
        tenure_updated_at: nowIso,
        tenure_updated_by: user.id,
      } as never)
      .eq('id', entry.property_id)
    if (tenureErr) {
      // Don't leave the UI saying "Approved" while the property is
      // still owner-occupied — cap counts would diverge. Surface a
      // clear error so the user can refresh and retry.
      console.error(
        '[leases.approveWaitingListEntry] tenure update failed',
        tenureErr.message,
      )
      return {
        ok: false,
        error: `Approved the entry but couldn't update property tenure: ${tenureErr.message}. Refresh and retry.`,
      }
    }
  }

  const evResolved = await logPropertyEvent({
    propertyId: entry.property_id,
    kind: 'waiting_list_resolved',
    payload: { outcome: 'approved', entryId },
  })
  if (!evResolved.ok) {
    console.error(
      '[leases.approveWaitingListEntry] event log failed',
      evResolved.error,
    )
  }
  if (prevTenure !== 'leased') {
    const evTenure = await logPropertyEvent({
      propertyId: entry.property_id,
      kind: 'tenure_changed',
      payload: { from: prevTenure, to: 'leased', via: 'waiting_list_approval' },
    })
    if (!evTenure.ok) {
      console.error(
        '[leases.approveWaitingListEntry] event log failed',
        evTenure.error,
      )
    }
    const evStart = await logPropertyEvent({
      propertyId: entry.property_id,
      kind: 'lease_started',
      payload: { entryId },
    })
    if (!evStart.ok) {
      console.error(
        '[leases.approveWaitingListEntry] event log failed',
        evStart.error,
      )
    }
  }

  revalidatePath('/leases')
  revalidatePath(`/properties/${entry.property_id}`)
  return { ok: true }
}

export async function denyWaitingListEntry(
  entryId: string,
  reason: string,
): Promise<ActionResult> {
  // Board/admin only.
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data: entry } = await supabase
    .from('lease_waiting_list' as never)
    .select('id, property_id, status')
    .eq('id', entryId)
    .maybeSingle<{ id: string; property_id: string; status: WaitingListStatus }>()
  if (!entry) return { ok: false, error: 'Waiting-list entry not found.' }
  if (entry.status !== 'waiting') {
    return { ok: false, error: `Entry is already ${entry.status}.` }
  }

  const nowIso = new Date().toISOString()
  // Conditional UPDATE + .select() for the same TOCTOU reason as
  // approveWaitingListEntry: a concurrent resolve between the SELECT
  // above and this write would otherwise leave us reporting success
  // while nothing changed.
  const { data: updatedRows, error } = await supabase
    .from('lease_waiting_list' as never)
    .update({
      status: 'denied',
      status_updated_at: nowIso,
      status_updated_by: user.id,
    } as never)
    .eq('id', entryId)
    .eq('status', 'waiting')
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!updatedRows || (updatedRows as unknown as Array<unknown>).length === 0) {
    return {
      ok: false,
      error:
        'This entry was already resolved by another action — refresh and try again.',
    }
  }

  const ev = await logPropertyEvent({
    propertyId: entry.property_id,
    kind: 'waiting_list_resolved',
    payload: { outcome: 'denied', entryId, reason: reason || null },
    notes: reason || null,
  })
  if (!ev.ok) {
    console.error('[leases.denyWaitingListEntry] event log failed', ev.error)
  }

  revalidatePath('/leases')
  revalidatePath(`/properties/${entry.property_id}`)
  return { ok: true }
}

export async function withdrawWaitingListEntry(
  entryId: string,
): Promise<ActionResult> {
  // Board/admin only on the manager-side action.
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data: entry } = await supabase
    .from('lease_waiting_list' as never)
    .select('id, property_id, status')
    .eq('id', entryId)
    .maybeSingle<{ id: string; property_id: string; status: WaitingListStatus }>()
  if (!entry) return { ok: false, error: 'Waiting-list entry not found.' }
  if (entry.status !== 'waiting') {
    return { ok: false, error: `Entry is already ${entry.status}.` }
  }

  const nowIso = new Date().toISOString()
  // Conditional UPDATE + .select() for the same TOCTOU reason as
  // approveWaitingListEntry: a concurrent resolve between the SELECT
  // above and this write would otherwise leave us reporting success
  // while nothing changed.
  const { data: updatedRows, error } = await supabase
    .from('lease_waiting_list' as never)
    .update({
      status: 'withdrawn',
      status_updated_at: nowIso,
      status_updated_by: user.id,
    } as never)
    .eq('id', entryId)
    .eq('status', 'waiting')
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!updatedRows || (updatedRows as unknown as Array<unknown>).length === 0) {
    return {
      ok: false,
      error:
        'This entry was already resolved by another action — refresh and try again.',
    }
  }

  const ev = await logPropertyEvent({
    propertyId: entry.property_id,
    kind: 'waiting_list_resolved',
    payload: { outcome: 'withdrawn', entryId },
  })
  if (!ev.ok) {
    console.error(
      '[leases.withdrawWaitingListEntry] event log failed',
      ev.error,
    )
  }

  revalidatePath('/leases')
  revalidatePath(`/properties/${entry.property_id}`)
  return { ok: true }
}
