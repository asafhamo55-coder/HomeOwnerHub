// The feed's reads (Round 29).
//
// The route has no session, so it uses the service role. That is safe only
// because everything is pinned by values the verified token and the database
// agree on: the user must still be a member of the token's org, and every
// query below is filtered by that org and by the association ids found for it.
// Nothing here takes an id from the request other than the signed claims.
//
// Returns null for "not a member / revoked / unreadable", which the route
// answers exactly like a bad token (404), so the feed leaks nothing.

import { associationTimeZone, todayIn } from '../association-time'
import { isProfessionalRole } from '../roles'
import { feedVersionOf, type FeedTokenClaims } from './token'
import { feedWindowStart, type FeedEventRow, type FeedMeetingRow } from './build'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAdmin = { from: (table: string) => any; auth: { admin: { getUserById: (id: string) => Promise<any> } } }

const ROW_CAP = 500

export interface FeedData {
  associationName: string
  timeZone: string
  today: string
  meetings: FeedMeetingRow[]
  events: FeedEventRow[]
}

export type FeedLoad = { ok: true; data: FeedData } | { ok: false; reason: 'denied' | 'error' }

export async function loadFeedData(admin: AnyAdmin, claims: FeedTokenClaims, now: Date = new Date()): Promise<FeedLoad> {
  const { userId, orgId } = claims

  // 1. The account must exist and still be on the token's version.
  const userRes = await admin.auth.admin.getUserById(userId)
  if (userRes.error) return { ok: false, reason: userRes.error.status === 404 ? 'denied' : 'error' }
  const user = userRes.data?.user
  if (!user || user.id !== userId) return { ok: false, reason: 'denied' }
  if (feedVersionOf(user.user_metadata) !== claims.version) return { ok: false, reason: 'denied' }
  // A suspended account's link stops too.
  const bannedUntil = (user as { banned_until?: string | null }).banned_until
  if (bannedUntil && new Date(bannedUntil).getTime() > now.getTime()) return { ok: false, reason: 'denied' }

  // 2. The user must still belong to this org, as a member (not an outside professional).
  const memberRes = await admin
    .from('org_members')
    .select('role, access_expires_at')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  if (memberRes.error) return { ok: false, reason: 'error' }
  const member = memberRes.data as { role: string; access_expires_at: string | null } | null
  if (!member || isProfessionalRole(member.role)) return { ok: false, reason: 'denied' }
  if (member.access_expires_at && new Date(member.access_expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: 'denied' }
  }

  // 3. The org's associations. The events below are community-wide for the org
  //    (like the resident portal), not limited to one unit's association.
  const assocRes = await admin.from('associations').select('id, name, state').eq('organization_id', orgId)
  if (assocRes.error) return { ok: false, reason: 'error' }
  const assocs = ((assocRes.data ?? []) as Array<{ id: string; name: string | null; state: string | null }>).sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? ''),
  )
  const timeZone = associationTimeZone(assocs[0] ?? null)
  const today = todayIn(timeZone, now)
  const from = feedWindowStart(today)
  const ids = assocs.map((a) => a.id)

  const meetingsP = admin
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type, status, deleted_at')
    .eq('org_id', orgId)
    .gte('meeting_date', from)
    .order('meeting_date', { ascending: true })
    .limit(ROW_CAP)
  let eventsQ = admin
    .from('hoa_recurring_events')
    .select('id, title, event_date, is_active, notify_audience')
    .eq('organization_id', orgId)
    .gte('event_date', from)
    .order('event_date', { ascending: true })
    .limit(ROW_CAP)
  // Org-wide reminders (no association) or ones for any association of the token's org.
  eventsQ = ids.length > 0 ? eventsQ.or(`association_id.is.null,association_id.in.(${ids.join(',')})`) : eventsQ.is('association_id', null)

  const [meetings, events] = await Promise.all([meetingsP, eventsQ])
  if (meetings.error || events.error) return { ok: false, reason: 'error' }

  return {
    ok: true,
    data: {
      associationName: assocs[0]?.name?.trim() || 'Your association',
      timeZone,
      today,
      meetings: (meetings.data ?? []) as FeedMeetingRow[],
      events: (events.data ?? []) as FeedEventRow[],
    },
  }
}
