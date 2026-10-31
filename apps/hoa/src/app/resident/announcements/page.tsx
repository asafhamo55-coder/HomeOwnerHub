import { Megaphone } from 'lucide-react'
import { readThenMarkViewed } from '@/lib/resident-announcements'
import {
  announcementsHref,
  categoriesWithItems,
  isNewAnnouncement,
  parseCategoryParam,
} from '@/lib/resident-announcements-list'
import { AnnouncementBody } from '@/components/resident/AnnouncementBody'
import { format } from 'date-fns'
import {
  Badge,
  LoadFailed,
  NoOrgSelected,
  Pager,
  pageRange,
  parsePageParam,
} from '@homeowner-portal/ui'
import Link from 'next/link'
import { loadOrFail } from '@/lib/load-or-fail'
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

// Announcements per page. This was a hard cut at the 50 newest with no
// way to see older ones.
const PAGE_SIZE = 50
// Recipient rows to read. A reader on several channels has several rows per
// message, so this is generous relative to the messages shown; when it is
// hit, the page says older announcements may be missing rather than
// implying the list is complete.
const RECIPIENT_ROW_CAP = 1000

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
export default async function ResidentAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string }>
}) {
  const sp = await searchParams
  const page = parsePageParam(sp.page)
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected href="/resident" />

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
  let recipientRows: RecipientRow[] = []
  if (identityFilters.length > 0) {
    const recipients = await loadOrFail(
      'resident announcement recipients',
      supabase
        .from('communication_recipients' as never)
        .select('communication_id, rendered_subject, unit_id, sent_at')
        .eq('organization_id', org.id)
        .or(identityFilters.join(','))
        .order('sent_at', { ascending: false, nullsFirst: false })
        .range(0, RECIPIENT_ROW_CAP - 1),
    )
    if (!recipients.ok) return <AnnouncementsFailed />
    recipientRows = (recipients.data ?? []) as unknown as RecipientRow[]
  }
  const recipientCapHit = recipientRows.length >= RECIPIENT_ROW_CAP

  // Reading IS opening this page: every body renders inline below, so
  // there is no per-announcement view to hang a finer read receipt on.
  // Stamped after the rows are fetched so a reader who loads the page sees
  // this visit's announcements listed, and only the NEXT one is counted new.
  // Not stamped when the read failed (returned above): the reader saw
  // nothing, so nothing should stop counting as new.
  // The previous visit time is read first so this visit still shows what
  // was new; the stamp only affects the next one.
  const lastViewedAt = await readThenMarkViewed(supabase as never, actor.id)

  const byComm = pickRowPerCommunication(recipientRows)
  const reachableIds = [...byComm.keys()]

  // Category of every announcement this reader can reach, so chips only
  // list categories with items and the filter applies before paging.
  // Same org, sent and not-deleted conditions as the main read; ids come
  // only from the reader's own recipient rows.
  const categoryById = new Map<string, string>()
  for (let i = 0; i < reachableIds.length; i += 200) {
    const chunk = reachableIds.slice(i, i + 200)
    const cats = await loadOrFail(
      'resident announcement categories',
      supabase
        .from('communications' as never)
        .select('id, category')
        .eq('organization_id', org.id)
        .eq('status', 'sent')
        .is('deleted_at', null)
        .in('id', chunk),
    )
    if (!cats.ok) return <AnnouncementsFailed />
    for (const r of (cats.data ?? []) as unknown as { id: string; category: string }[]) {
      categoryById.set(r.id, r.category)
    }
  }
  const sentIds = reachableIds.filter((id) => categoryById.has(id))
  const chips = categoriesWithItems(sentIds.map((id) => ({ category: categoryById.get(id)! })))
  const category = parseCategoryParam(sp.category, chips)
  const allCommIds = category ? sentIds.filter((id) => categoryById.get(id) === category) : sentIds
  const { from, to } = pageRange(page, PAGE_SIZE)
  const commIds = allCommIds.slice(from, to + 1)

  let comms: CommRow[] = []
  if (commIds.length > 0) {
    const commsResult = await loadOrFail(
      'resident announcements',
      supabase
        .from('communications' as never)
        .select('id, subject, body_text, body_html, category, sent_at, created_at')
        .eq('organization_id', org.id)
        .eq('status', 'sent')
        .is('deleted_at', null)
        .in('id', commIds),
    )
    if (!commsResult.ok) return <AnnouncementsFailed />
    comms = (commsResult.data ?? []) as unknown as CommRow[]
  }

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

      {chips.length > 1 ? (
        <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
          {[{ category: null as string | null, count: sentIds.length }, ...chips].map((c) => {
            const active = c.category === category
            return (
              <Link
                key={c.category ?? 'all'}
                href={announcementsHref(c.category, 1)}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-medium ${
                  active
                    ? 'border-primary bg-primary text-primary-fg'
                    : 'border-border bg-surface text-foreground-secondary hover:text-foreground'
                }`}
              >
                {c.category ? (CATEGORY_LABEL[c.category] ?? c.category) : 'All'} ({c.count})
              </Link>
            )
          })}
        </nav>
      ) : null}

      {ordered.length === 0 && allCommIds.length === 0 && !category ? (
        <ScreenEmpty
          icon={<Megaphone />}
          title="No announcements yet"
          description="When the board sends a communication, it will show up here."
        />
      ) : (
        <ul className="space-y-3">
          {ordered.map(({ comm: c, subject, body, sentAt }) => (
            <li key={c.id} id={c.id} className="scroll-mt-20 rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">{subject}</h2>
                <div className="flex items-center gap-2">
                  {isNewAnnouncement(sentAt, lastViewedAt) ? (
                    <Badge variant="solid" size="sm">New</Badge>
                  ) : null}
                  <Badge variant="outline" size="sm">
                    {CATEGORY_LABEL[c.category] ?? c.category}
                  </Badge>
                </div>
              </div>
              <p className="mt-0.5 text-xs text-muted">{format(new Date(sentAt), 'PPp')}</p>
              <AnnouncementBody body={body} />
            </li>
          ))}
        </ul>
      )}

      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={allCommIds.length}
        rowCount={commIds.length}
        hrefFor={(p) => announcementsHref(category, p)}
        linkAs={Link}
        noun="announcements"
      />
      {recipientCapHit ? (
        <p className="px-1 text-xs text-muted">
          Showing your most recent announcements; some older ones may not be listed.
        </p>
      ) : null}
    </div>
  )
}

function AnnouncementsFailed() {
  return (
    <div className="space-y-6">
      <ScreenHeader title="Announcements" subtitle="Recent updates from your board." />
      <LoadFailed what="your announcements" />
    </div>
  )
}
