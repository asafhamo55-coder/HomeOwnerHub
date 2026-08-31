import { Megaphone } from 'lucide-react'
import { markAnnouncementsViewed } from '@/lib/resident-announcements'
import { format } from 'date-fns'
import { Badge } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor } from '@/lib/impersonation'
import { getResidentUnits } from '@/lib/resident'
import { resolveForDisplay } from '@/lib/communications/display'
import {
  buildRecipientIdentityFilters,
  pickRowPerCommunication,
  type RecipientRow,
} from '@/lib/communications/resident-scope'
import { ScreenEmpty, ScreenHeader } from '@/components/resident/screen'

export const metadata = { title: 'Announcements' }
export const dynamic = 'force-dynamic'

interface CommRow {
  id: string
  subject: string
  body_text: string | null
  body_html: string
  category: string
  sent_at: string | null
  created_at: string
}

const CATEGORY_LABEL: Record<string, string> = {
  welcome: 'Welcome',
  dues: 'Dues',
  meeting: 'Meeting',
  violation: 'Violation',
  arc: 'ARC',
  financial: 'Financial',
  emergency: 'Emergency',
  announcement: 'Announcement',
  custom: 'Custom',
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/**
 * Announcements a resident was actually sent.
 *
 * Two things this screen has to get right, and used to get wrong:
 *
 * 1. SCOPE. It selected every `communications` row in the organization,
 *    filtered only by `status = 'sent'`. A resident saw messages addressed
 *    to other owners' units — including dues reminders. The reach-through
 *    is `communication_recipients`, the row the send pipeline writes per
 *    (recipient x channel); a resident may only read a communication they
 *    have such a row for. RLS is not sufficient on its own here, because
 *    getResidentActor hands back a SERVICE-ROLE client while an admin is
 *    impersonating an owner, and service-role bypasses RLS entirely.
 *
 * 2. RENDERING. `communications.subject` and `body_html` store the
 *    TEMPLATE, with `{{association_name}}` / `{{amount_summary}}`
 *    placeholders resolved per recipient only at delivery time. Rendering
 *    them verbatim showed residents raw merge syntax. The reader's own
 *    `rendered_subject` is the literal line they were sent; where it is
 *    absent, display.ts resolves what it can and labels the rest.
 *
 * Ordering by the recipient row's `sent_at` rather than the parent's is
 * deliberate: it is when THIS reader was sent the message.
 */
export default async function ResidentAnnouncementsPage() {
  const org = await getCurrentOrg()
  if (!org) return null

  const actor = await getResidentActor()
  const units = await getResidentUnits()
  const supabase = actor.client

  const identityFilters = buildRecipientIdentityFilters({
    unitIds: units.map((u) => u.unit_id).filter(Boolean),
    userId: actor.id,
    email: actor.email,
  })

  // No identity to match on means nothing was ever addressed to this
  // reader. Skipping the query matters — an empty or() would match rows.
  const recipientRows: RecipientRow[] =
    identityFilters.length === 0
      ? []
      : (((
          await supabase
            .from('communication_recipients' as never)
            .select('communication_id, rendered_subject, unit_id, sent_at')
            .eq('organization_id', org.id)
            .or(identityFilters.join(','))
            .order('sent_at', { ascending: false, nullsFirst: false })
            // Generous relative to the 50 communications shown, because a
            // reader on several channels has several rows per message.
            .limit(300)
        ).data ?? []) as unknown as RecipientRow[])

  // Reading IS opening this page: every body renders inline below, so
  // there is no per-announcement view to hang a finer read receipt on.
  // Stamped after the rows are fetched so a reader who loads the page sees
  // this visit's announcements listed, and only the NEXT one is counted new.
  await markAnnouncementsViewed(supabase as never, actor.id)

  const byComm = pickRowPerCommunication(recipientRows)
  const commIds = [...byComm.keys()].slice(0, 50)

  const comms: CommRow[] =
    commIds.length === 0
      ? []
      : (((
          await supabase
            .from('communications' as never)
            .select('id, subject, body_text, body_html, category, sent_at, created_at')
            .eq('organization_id', org.id)
            .eq('status', 'sent')
            .is('deleted_at', null)
            .in('id', commIds)
        ).data ?? []) as unknown as CommRow[])

  // Which community each unit belongs to, so a multi-property owner gets
  // the right name substituted into each message rather than the first.
  const associationNameByUnit = new Map(
    units.map((u) => [u.unit_id, u.association_name ?? '']),
  )
  const fallbackAssociationName = units[0]?.association_name ?? ''

  const ordered = comms
    .map((c) => {
      const recipient = byComm.get(c.id)
      const associationName =
        (recipient?.unit_id ? associationNameByUnit.get(recipient.unit_id) : null) ||
        fallbackAssociationName
      return {
        comm: c,
        // The literal line this reader was sent, when the send pipeline
        // recorded it. Null means unknown, not empty — fall back rather
        // than showing a blank heading.
        subject:
          recipient?.rendered_subject ??
          resolveForDisplay(c.subject, { associationName }).text,
        body: resolveForDisplay(c.body_text ?? stripHtml(c.body_html), { associationName })
          .text,
        sentAt: recipient?.sent_at ?? c.sent_at ?? c.created_at,
      }
    })
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))

  return (
    <div className="space-y-6">
      <ScreenHeader title="Announcements" subtitle="Recent updates from your board." />

      {ordered.length === 0 ? (
        <ScreenEmpty
          icon={<Megaphone className="h-6 w-6" />}
          title="No announcements yet"
          description="When the board sends a communication, it will show up here."
        />
      ) : (
        <ul className="space-y-3">
          {ordered.map(({ comm: c, subject, body, sentAt }) => (
            <li key={c.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-[15px] font-semibold text-foreground">{subject}</h2>
                <Badge variant="outline" size="sm">
                  {CATEGORY_LABEL[c.category] ?? c.category}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted">{format(new Date(sentAt), 'PPp')}</p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">{body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
