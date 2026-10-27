'use server'

// BL-153: the annual report's two server actions.
//   saveAnnualReportNarrative: keeps the board's narrative per meeting in
//     associations.compliance_settings (no migration; ./narrative.ts).
//   annualReportNoticeSection: the owner-safe report as HTML, for the
//     annual-meeting notice to carry under the board's message. The
//     communications email path takes no file attachments (lib/email.ts),
//     so "attach" is the report's text in the notice itself.
//
// Board/admin only: each call re-checks the role because a server action
// is a public endpoint; the associations UPDATE policy (0063) is the
// database-side gate. Nothing is sent from here.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { readKitAssociations, readKitMeeting } from '@/lib/meeting-quorum/load'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadReportForMeeting } from './for-meeting'
import { NARRATIVE_MAX, annualReportSectionsHtml } from './message'
import { withNarrative } from './narrative'

const MeetingId = z.string().uuid()

export async function saveAnnualReportNarrative(meetingId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!MeetingId.safeParse(meetingId).success || typeof text !== 'string') return { ok: false, error: 'Invalid input.' }
  if (text.length > NARRATIVE_MAX) return { ok: false, error: `Keep it to ${NARRATIVE_MAX} characters.` }

  const supabase = await getSupabaseServerClient()
  const m = await readKitMeeting(supabase, gate.orgId, meetingId)
  if (!m.ok) return { ok: false, error: 'Couldn’t load this meeting. Try again.' }
  if (!m.meeting) return { ok: false, error: 'That meeting isn’t part of your organization.' }

  const a = await readKitAssociations(supabase, gate.orgId)
  if (!a.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  const assoc = a.rows[0]
  if (!assoc) return { ok: false, error: 'Set up an association before saving the message.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const next = withNarrative(assoc.compliance_settings, meetingId, text, { updatedAt: new Date().toISOString(), updatedBy: user?.id ?? null })
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: next as never })
    .eq('id', assoc.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[annual-report] narrative save failed', { code: error?.code ?? 'no_rows', meetingId })
    return { ok: false, error: 'Couldn’t save. Try again.' }
  }
  revalidatePath(`/meetings/${meetingId}/annual-report`)
  return { ok: true }
}

export async function annualReportNoticeSection(meetingId: string): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!MeetingId.safeParse(meetingId).success) return { ok: false, error: 'Invalid meeting.' }

  const supabase = await getSupabaseServerClient()
  const r = await loadReportForMeeting(supabase, gate.orgId, meetingId)
  if (!r.ok) {
    return { ok: false, error: r.reason === 'not_found' ? 'That meeting isn’t part of your organization.' : 'Couldn’t build the annual report. Try again.' }
  }
  if (!r.annual) return { ok: false, error: 'The annual report goes with the annual meeting.' }
  const html = ['<p><strong>The board’s annual report to owners</strong></p>', ...annualReportSectionsHtml(r.report, r.narrative)].join('\n')
  return { ok: true, html }
}
