'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { inngest } from '@homeowner-portal/jobs'
import {
  monthlyReportCommunicationId,
  previousMonthIn,
  wantsMonthlyBoardReport,
  withMonthlyBoardReportPref,
} from '@homeowner-portal/jobs/monthly-board-report'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readPrimaryAssociation } from '@/lib/association-setup'

// Server actions for the month-end board report (BL-073).
//
// "Send now" only queues the job's event; the job is what decides, sends
// through the outbound guard and records the send. Both this check and the
// job key on (org, month), so a second click — or a click after the 1st's
// cron already sent — sends nothing.

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }

const DENIED = "You don't have permission to perform this action."

export async function sendMonthlyReportNow(): Promise<ActionResult<{ label: string }>> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No association selected.' }
  // Admins only: Send now emails every board member.
  if ((await getCurrentUserRoleInOrg(org.id)) !== 'admin') return { ok: false, error: DENIED }

  const supabase = await getSupabaseServerClient()
  const assoc = await readPrimaryAssociation(supabase, org.id)
  if (!assoc.ok) return { ok: false, error: 'Couldn’t load the association. Try again.' }
  if (!assoc.data) return { ok: false, error: 'Set up the association first.' }

  const month = previousMonthIn(assoc.data.timeZone, new Date())
  const existing = await supabase.from('communications').select('id').eq('id', monthlyReportCommunicationId(org.id, month.month)).maybeSingle()
  if (existing.error) return { ok: false, error: 'Couldn’t check whether it was already sent. Try again.' }
  if (existing.data) return { ok: false, error: `The ${month.label} report has already been sent.` }

  try {
    await inngest.send({
      // Inngest drops a second event with the same id (24h): a double click is one send.
      id: `monthly-board-report-${org.id}-${month.month}`,
      name: 'board/monthly-report.requested',
      data: { orgId: org.id, month: month.month },
    })
  } catch (err) {
    console.error(`sendMonthlyReportNow: could not queue for org ${org.id}: ${err instanceof Error ? err.name : 'unknown'}`)
    return { ok: false, error: 'Couldn’t queue the report. Try again in a minute.' }
  }
  revalidatePath('/accounting/reports')
  return { ok: true, data: { label: month.label } }
}

const PrefSchema = z.object({ on: z.boolean() })

/** The signed-in user's own "Monthly board report" preference (auth user_metadata). */
export async function setMonthlyReportPreference(input: { on: boolean }): Promise<ActionResult> {
  const parsed = PrefSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid choice.' }
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No association selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') return { ok: false, error: DENIED }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return { ok: false, error: 'You’re signed out. Sign in and try again.' }
  const update = await supabase.auth.updateUser({ data: withMonthlyBoardReportPref(user.user_metadata, parsed.data.on) })
  if (update.error) return { ok: false, error: 'Couldn’t save your choice. Try again.' }
  revalidatePath('/settings/notifications')
  return { ok: true, data: undefined }
}

/** The signed-in user's current choice; null when it can't be read. */
export async function getMonthlyReportPreference(): Promise<boolean | null> {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return null
  return wantsMonthlyBoardReport(user.user_metadata)
}
