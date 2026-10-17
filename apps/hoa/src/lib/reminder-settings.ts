'use server'

// Automated dues reminders (BL-013): the board's settings reads, save and
// dry run. Storage, signing and why it is signed:
// packages/jobs/src/dues-reminders/config.ts.
//
// Board/admin only: every action re-checks the role
// (requireBoardOrAdminForAction) because a server action is a public
// endpoint, and migration 0063 makes associations/communications writes
// board-only in the database too.
//
// The dry run reports COUNTS and UNIT IDS only — no owner names, emails or
// addresses leave this file — so the preview can be shown, screenshotted
// and pasted without carrying resident PII.

import { revalidatePath } from 'next/cache'
import {
  DEFAULT_OFFSETS,
  MAX_STEPS,
  NOTE_MAX,
  OFFSET_MAX,
  OFFSET_MIN,
  effectiveDuesReminderSettings,
  nextRunDate,
  planForAssociation,
  readDuesReminderSettings,
  signDuesReminderSettings,
  supabaseReminderStore,
  validateDuesReminderInput,
  withDuesReminderSettings,
  type DuesReminderSettings,
  type PlanSkips,
} from '@homeowner-portal/jobs/dues-reminders'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { ASSOCIATION_ZONE_COLUMNS, associationTimeZone } from '@/lib/association-time'
import { getCurrentOrg } from '@/lib/orgs'
import { loadOrFail } from '@/lib/load-or-fail'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface ReminderLimits {
  offsetMin: number
  offsetMax: number
  maxSteps: number
  noteMax: number
  defaults: number[]
}

export interface BoardReminderSettings {
  association: { id: string; name: string }
  state: 'configured' | 'not_configured' | 'unverified'
  settings: DuesReminderSettings
  approvedAt: string | null
  emailConfigured: boolean
  limits: ReminderLimits
}

export type BoardReminderLoad =
  | { ok: true; data: BoardReminderSettings }
  | { ok: false; reason: 'forbidden' | 'no_association' | 'failed' }

export interface DryRunSend {
  unitId: string
  step: number
  recipientCount: number
}

export type DryRunResult =
  | {
      ok: true
      runDate: string
      sends: DryRunSend[]
      recipientTotal: number
      skipped: PlanSkips
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

type AssocRow = {
  id: string
  name: string
  organization_id: string
  compliance_settings: unknown
  state?: string | null
}

async function loadPrimaryAssociation(): Promise<{ ok: true; row: AssocRow | null } | { ok: false }> {
  const org = await getCurrentOrg()
  if (!org) return { ok: true, row: null }
  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'reminder settings association',
    supabase
      .from('associations')
      .select(`id, name, organization_id, compliance_settings, ${ASSOCIATION_ZONE_COLUMNS}`)
      .eq('organization_id', org.id)
      .order('name', { ascending: true })
      .limit(1),
  )
  if (!res.ok) return { ok: false }
  return { ok: true, row: ((res.data ?? []) as AssocRow[])[0] ?? null }
}

function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

const LIMITS: ReminderLimits = {
  offsetMin: OFFSET_MIN,
  offsetMax: OFFSET_MAX,
  maxSteps: MAX_STEPS,
  noteMax: NOTE_MAX,
  defaults: [...DEFAULT_OFFSETS],
}

export async function getBoardReminderSettings(): Promise<BoardReminderLoad> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, reason: 'forbidden' }
  const assoc = await loadPrimaryAssociation()
  if (!assoc.ok) return { ok: false, reason: 'failed' }
  if (!assoc.row) return { ok: false, reason: 'no_association' }
  const { row } = assoc

  const read = readDuesReminderSettings(row.id, row.compliance_settings, paySettingsSecret())
  return {
    ok: true,
    data: {
      association: { id: row.id, name: row.name },
      state: read.state,
      settings: effectiveDuesReminderSettings(read),
      approvedAt: read.state === 'configured' ? read.settings.approvedAt : null,
      emailConfigured: emailConfigured(),
      limits: LIMITS,
    },
  }
}

export type SaveReminderResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** Saving IS the board's approval of the cadence and message: the value is
 *  stamped with who saved it and when, then signed. */
export async function saveReminderSettings(input: {
  enabled: boolean
  offsets: number[]
  note: string
}): Promise<SaveReminderResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }

  const parsed = validateDuesReminderInput(input)
  if (!parsed.ok) return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.fieldErrors }

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'Reminder settings can’t be saved on this server yet. Contact support.' }

  const assoc = await loadPrimaryAssociation()
  if (!assoc.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  if (!assoc.row) return { ok: false, error: 'No association is set up for this organization yet.' }
  const row = assoc.row

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const stored = signDuesReminderSettings(
    row.id,
    parsed.value,
    { approvedAt: new Date().toISOString(), approvedBy: user?.id ?? null },
    secret,
  )
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withDuesReminderSettings(row.compliance_settings, stored) as never })
    .eq('id', row.id)
    .select('id')
  if (error || !data || data.length === 0) {
    return { ok: false, error: 'Couldn’t save the reminder settings. Try again.' }
  }

  revalidatePath('/settings/reminders')
  return { ok: true }
}

/**
 * What the next 9am run would send with these offsets: per (assessment,
 * step) the unit id and how many owners it would reach. Read-only — it
 * claims nothing and sends nothing. Uses the board member's own session
 * (RLS-scoped), not the service role.
 */
export async function previewReminderRun(input: { offsets: number[] }): Promise<DryRunResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }

  const parsed = validateDuesReminderInput({ enabled: true, offsets: input.offsets, note: '' })
  if (!parsed.ok) return { ok: false, error: 'Check the reminder days.', fieldErrors: parsed.fieldErrors }

  const assoc = await loadPrimaryAssociation()
  if (!assoc.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  if (!assoc.row) return { ok: false, error: 'No association is set up for this organization yet.' }

  // The association's day of the next 9am-Eastern run (BL-043).
  const runDate = nextRunDate(new Date(), associationTimeZone(assoc.row))
  try {
    const supabase = await getSupabaseServerClient()
    const plan = await planForAssociation(supabaseReminderStore(supabase), {
      associationId: assoc.row.id,
      organizationId: assoc.row.organization_id,
      today: runDate,
      offsets: parsed.value.offsets,
    })
    const sends = plan.sends.map((s) => ({ unitId: s.unitId, step: s.step, recipientCount: s.recipients.length }))
    return {
      ok: true,
      runDate,
      sends,
      recipientTotal: sends.reduce((n, s) => n + s.recipientCount, 0),
      skipped: plan.skipped,
    }
  } catch (err) {
    // The store's errors carry a code only, never row data.
    console.error('previewReminderRun failed', { error: err instanceof Error ? err.message : 'unknown' })
    return { ok: false, error: 'Couldn’t build the preview. Try again.' }
  }
}
