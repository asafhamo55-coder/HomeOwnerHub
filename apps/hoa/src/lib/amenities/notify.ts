// BL-034 amenity notices. NOT a 'use server' file: it exports plain helpers and
// is imported only by lib/amenities/actions.ts after the main write succeeded.
//
// What goes out, and to whom:
//   - a new request that needs an answer: a bell row for the org's board and
//     admins (board-in-app-notify; no email, no SMS);
//   - the board's answer (approved, turned down, canceled by the board): one
//     email to the resident who asked, through the app's GUARDED sendEmail
//     (the outbound guard checks the address and the org's sandbox mode).
//
// The email goes only when the resident has not turned email off
// (resident_communication_preferences.email_opt_in, on by default) and, for a
// California association, only when the member consented to email notices
// (BL-020, lib/email-consent.ts). No text messages are sent from here.
//
// Never throws: the booking is already saved. Logs carry ids and counts only,
// never an address, a subject or a body.

import { createAdminClient } from '@homeowner-portal/db'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { reportError } from '@homeowner-portal/observability/report'
import { notifyBoardSafely } from '@/lib/board-in-app-notify'
import { associationTimeZone } from '@/lib/association-time'
import { appUrl, sendEmail } from '@/lib/email'
import { loadEmailConsent } from '@/lib/email-consent'
import { formatSlot } from './model'
import { buildAmenityEmail, mayEmailMember, requestBell, type AmenityEmailKind } from './notice'

type Db = ReturnType<typeof createAdminClient>

/** Email the resident the board's answer. Fire after the write; never throws. */
export async function emailResidentOfAnswer(args: {
  kind: AmenityEmailKind
  organizationId: string
  associationId: string
  reservationId: string
  residentId: string | null
  amenityName: string
  startsAt: string
  endsAt: string
  note: string | null
}): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    if (!args.residentId) return 'skipped'
    const db: Db = createAdminClient()
    const [profile, pref, assoc, consent] = await Promise.all([
      db.from('profiles').select('email').eq('id', args.residentId).maybeSingle(),
      db
        .from('resident_communication_preferences')
        .select('email_opt_in')
        .eq('organization_id', args.organizationId)
        .eq('user_id', args.residentId)
        .maybeSingle(),
      db.from('associations').select('state').eq('id', args.associationId).eq('organization_id', args.organizationId).maybeSingle(),
      loadEmailConsent(db, args.organizationId),
    ])
    if (profile.error || pref.error || assoc.error || !consent.ok) {
      console.error('[amenities] notice lookup failed', { reservationId: args.reservationId })
      return 'failed'
    }
    const to = (profile.data as { email: string | null } | null)?.email?.trim()
    if (!to) return 'skipped'
    const allowed = mayEmailMember({
      state: (assoc.data as { state: string | null } | null)?.state,
      emailOptIn: (pref.data as { email_opt_in: boolean } | null)?.email_opt_in !== false,
      consent: consent.available ? consent.consent.get(args.residentId) : undefined,
      consentAvailable: consent.available,
    })
    if (!allowed) return 'skipped'

    const message = buildAmenityEmail(args.kind, {
      amenityName: args.amenityName,
      slot: formatSlot(args.startsAt, args.endsAt, associationTimeZone(assoc.data as { state: string | null } | null)),
      note: args.note,
      link: appUrl('/resident/amenities'),
    })
    const orgSandbox = await fetchOrgSandbox(db, args.organizationId)
    const res = await sendEmail({ to, ...message }, { orgSandbox, ref: args.reservationId })
    if (!res.ok) {
      console.error('[amenities] notice not sent', { reservationId: args.reservationId, kind: args.kind })
      return 'failed'
    }
    return 'sent'
  } catch (err) {
    reportError(err, 'amenities-notify', { reservationId: args.reservationId, kind: args.kind })
    return 'failed'
  }
}

/** Tell the board a request is waiting. Never throws. */
export async function bellBoardOfRequest(args: Parameters<typeof requestBell>[0]): Promise<void> {
  await notifyBoardSafely(requestBell(args))
}
