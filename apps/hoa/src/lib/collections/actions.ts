'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/association-time'
import { orgTimeZone } from '@/lib/association-time-server'
import {
  COLLECTION_EVENT_TYPES,
  COLLECTION_STATUSES,
  statusImpliedBy,
  type CollectionStatus,
} from './statuses'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import {
  DRIFT_CODES,
  OVERRIDE_REASON_CODES,
  checkLien,
  overrideAuditRow,
  resolveOverrides,
  type DriftCheck,
  type OverrideReason,
} from '@/lib/compliance/statute-drift'
import { loadGaRegistrationGate } from '@/lib/ga-registration/load'

/**
 * Writes for the collections system of record.
 *
 * Everything here records something a human did outside this app. Nothing
 * sends mail — see the "Deliberately not built" block in
 * migrations/0047_collections.sql.
 *
 * All writes go through the user-bound client so RLS applies: 0047 grants
 * collection_cases and collection_events to board/admin only, and that is
 * the enforcement point, not this file.
 */

export type CollectionResult = { ok: true } | { ok: false; error: string }

// z.enum needs a non-empty tuple; the arrays are `as const` so this is
// exact rather than widened to string[].
const StatusEnum = z.enum(COLLECTION_STATUSES as unknown as [CollectionStatus, ...CollectionStatus[]])
const EventEnum = z.enum(
  COLLECTION_EVENT_TYPES as unknown as [
    (typeof COLLECTION_EVENT_TYPES)[number],
    ...(typeof COLLECTION_EVENT_TYPES)[number][],
  ],
)

/** ISO date, and not in the future — these record what already happened. */
const PastDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')
  .refine((d) => d <= new Date().toISOString().slice(0, 10), 'That date is in the future.')

const OpenSchema = z.object({
  unitId: z.string().uuid(),
  status: StatusEnum.default('monitoring'),
  attorneyFirm: z.string().trim().max(200).optional(),
  attorneyReference: z.string().trim().max(120).optional(),
  openedOn: PastDate.optional(),
})

export async function openCollectionCase(
  input: z.infer<typeof OpenSchema>,
): Promise<CollectionResult & { caseId?: string }> {
  const parsed = OpenSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  const v = parsed.data

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No organization in context.' }
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from('collection_cases')
    .insert({
      organization_id: org.id,
      association_id: assoc.id,
      unit_id: v.unitId,
      status: v.status,
      attorney_firm: v.attorneyFirm || null,
      attorney_reference: v.attorneyReference || null,
      ...(v.openedOn ? { opened_on: v.openedOn } : {}),
    })
    .select('id')
    .single()

  if (error) {
    // collection_cases_one_open_per_unit_idx. Surfacing the raw Postgres
    // text here would read as a crash for something that is a normal
    // outcome: someone opened a case in another tab.
    if (error.code === '23505') {
      return { ok: false, error: 'This property already has an open collections case.' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/properties')
  return { ok: true, caseId: data.id }
}

const EventSchema = z.object({
  caseId: z.string().uuid(),
  eventType: EventEnum,
  occurredOn: PastDate,
  note: z.string().trim().max(4000).optional(),
  amount: z.number().min(0).max(10_000_000).optional(),
  actorInitials: z.string().trim().max(8).optional(),
  /** Apply the stage change this event implies. Advisory — see statuses.ts. */
  advanceStatus: z.boolean().default(false),
  /** BL-149: finding code → the board's override reason, for a blocking lien check. */
  lawOverrides: z
    .record(z.enum(DRIFT_CODES), z.enum(OVERRIDE_REASON_CODES as [OverrideReason, ...OverrideReason[]]))
    .optional(),
})

/** A refused lien, with the check the form shows (BL-149); a recorded one may carry a warning. */
export type CollectionEventResult =
  | { ok: true; lawCheck?: DriftCheck }
  | { ok: false; error: string; lawCheck?: DriftCheck }

/**
 * Append an event to a case's trail, and optionally move the case's stage.
 *
 * The event write is the one that matters and goes first. If the status
 * update then fails, the trail still records what happened — the reverse
 * order could advance the stage while losing the evidence for why.
 *
 * BL-149: board/admin only (0047's RLS already is; this refuses first, with
 * a readable error). Recording "Lien filed" runs the state law check: for
 * a Georgia association not recorded as registered with the Secretary of
 * State it warns before Jan 1, 2027 and blocks from then, unless the board
 * gives its reason, which is written to audit_log (ids and codes only)
 * before the event.
 */
export async function recordCollectionEvent(
  input: z.infer<typeof EventSchema>,
): Promise<CollectionEventResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = EventSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  const v = parsed.data

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No organization in context.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let lawCheck: DriftCheck | undefined
  if (v.eventType === 'lien_filed') {
    const lien = await lienCheckFor(supabase as never, org.id, v.caseId)
    if (!lien.ok) return { ok: false, error: lien.error }
    lawCheck = lien.check
    const resolved = resolveOverrides(lien.check, v.lawOverrides)
    if (!resolved.ok) return { ok: false, error: resolved.error, lawCheck: lien.check }
    if (resolved.applied.length > 0) {
      if (!user) return { ok: false, error: 'You are not signed in.' }
      const { error: auditErr } = await supabase.from('audit_log').insert(
        overrideAuditRow({
          orgId: org.id,
          userId: user.id,
          entityType: 'collection_case',
          entityId: v.caseId,
          step: 'lien',
          state: lien.check.state,
          applied: resolved.applied,
        }) as never,
      )
      if (auditErr) {
        console.error('[collections] lien override audit failed', { caseId: v.caseId, code: auditErr.code ?? null })
        return { ok: false, error: 'Couldn’t record the board’s override, so the lien wasn’t recorded. Try again.' }
      }
    }
  }

  const { error: insertErr } = await supabase.from('collection_events').insert({
    organization_id: org.id,
    collection_case_id: v.caseId,
    event_type: v.eventType,
    occurred_on: v.occurredOn,
    note: v.note || null,
    amount: v.amount ?? null,
    actor_initials: v.actorInitials || null,
    recorded_by: user?.id ?? null,
  })

  if (insertErr) return { ok: false, error: insertErr.message }

  if (v.advanceStatus) {
    const implied = statusImpliedBy(v.eventType)
    if (implied) {
      const { error: statusErr } = await supabase
        .from('collection_cases')
        .update({ status: implied })
        .eq('id', v.caseId)

      if (statusErr) {
        // Deliberately not a failure: the event is recorded and that is the
        // durable fact. Say plainly that the stage did not move so the
        // board can set it directly rather than assuming it advanced.
        return {
          ok: false,
          error: `Event recorded, but the stage could not be updated: ${statusErr.message}`,
        }
      }
    }
  }

  revalidatePath('/properties')
  return lawCheck && lawCheck.findings.length > 0 ? { ok: true, lawCheck } : { ok: true }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any }

/** The lien check for one of the org's cases, on its association's today (BL-149). */
async function lienCheckFor(
  db: LooseDb,
  orgId: string,
  caseId: string,
): Promise<{ ok: true; check: DriftCheck } | { ok: false; error: string }> {
  const { data, error } = (await db
    .from('collection_cases')
    .select('id, association_id')
    .eq('organization_id', orgId)
    .eq('id', caseId)
    .maybeSingle()) as { data: { id: string; association_id: string | null } | null; error: { code?: string } | null }
  if (error) {
    console.error('[collections] case read failed', { caseId, code: error.code ?? null })
    return { ok: false, error: 'Couldn’t check state law for this lien. Try again.' }
  }
  if (!data) return { ok: false, error: 'That collections case wasn’t found.' }
  const today = todayIn(await orgTimeZone(db as never, orgId))
  const reg = await loadGaRegistrationGate(db, orgId, today, data.association_id)
  if (!reg.ok) return { ok: false, error: 'Couldn’t check state law for this lien. Try again.' }
  return { ok: true, check: checkLien({ state: reg.state, gaRegistration: reg.gate }) }
}

const StatusSchema = z.object({
  caseId: z.string().uuid(),
  status: StatusEnum,
  closedReason: z.string().trim().max(500).optional(),
})

/**
 * Set a case's stage directly.
 *
 * Collections does not always run forward — an account can be pulled back
 * from the attorney after a payment plan — so there is no transition
 * validation, matching how the board actually works. The change is recorded
 * as a `status_changed` event so the trail explains the jump.
 */
export async function setCollectionStatus(
  input: z.infer<typeof StatusSchema>,
): Promise<CollectionResult> {
  const parsed = StatusSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  const v = parsed.data

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No organization in context.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The association's day (BL-043): a case closed at 9pm Eastern closes that day.
  const today = todayIn(await orgTimeZone(supabase, org.id))
  const terminal = v.status === 'resolved' || v.status === 'written_off'

  const { error } = await supabase
    .from('collection_cases')
    .update({
      status: v.status,
      // Only stamp closure when moving INTO a terminal state; reopening
      // clears it so a reopened case does not read as still closed.
      closed_on: terminal ? today : null,
      closed_reason: terminal ? (v.closedReason || null) : null,
    })
    .eq('id', v.caseId)

  if (error) return { ok: false, error: error.message }

  await supabase.from('collection_events').insert({
    organization_id: org.id,
    collection_case_id: v.caseId,
    event_type: terminal ? 'case_closed' : 'status_changed',
    occurred_on: today,
    note: v.closedReason || null,
    recorded_by: user?.id ?? null,
  })

  revalidatePath('/properties')
  return { ok: true }
}
