import Link from 'next/link'
import { CalendarDays, ExternalLink, Eye, EyeOff, FileText, Scale, ShieldCheck } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadFailed,
  NoOrgSelected,
  Page,
  StatusPill,
  type StatusTone,
} from '@homeowner-portal/ui'
import { sectionUrl } from '@homeowner-portal/workflows/state-law-florida'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { getCurrentOrg } from '@/lib/orgs'
import { getEffectiveRoleInOrg } from '@/lib/role-override'
import { getAssociationState } from '@/lib/state-law'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDay } from '@/lib/money/format'
import { MEETING_TYPE } from '@/lib/status/community'
import { STATE_NAMES } from '@/lib/status/knowledge'
import {
  checkQuote,
  complianceGate,
  evaluateMeetings,
  evaluateRecords,
  officialStatuteText,
  summarizeRecords,
  type MeetingLine,
  type NoticeFinding,
  type RecordLine,
  type RecordStatus,
} from '@/lib/fl-compliance/evaluate'
import {
  APPLICABILITY,
  NOTICE_DAYS,
  OWNER_ONLY_AREA,
  POSTING_PARCEL_THRESHOLD,
} from '@/lib/fl-compliance/rules'
import {
  countUnits,
  loadComplianceDocs,
  loadComplianceMeetings,
  loadFlRecordsStatute,
} from '@/lib/fl-compliance/load'
import { residentDocumentHref } from '@/lib/resident-documents/visibility'
import { LegalDisclaimer } from '@/components/knowledge/LegalDisclaimer'
import { LegalTabs } from '@/components/knowledge/LegalTabs'
import { StatuteCitation } from '@/components/knowledge/StatuteCitation'

export const metadata = { title: 'Records & notices check' }
export const dynamic = 'force-dynamic'

/** Edition whose text the quotes were verified against (rules.test.ts). */
const VERIFIED_EDITION = 2026

const RECORD_TONE: Record<RecordStatus, StatusTone> = {
  present: 'success',
  stale: 'warning',
  missing: 'danger',
  none_on_file: 'neutral',
}
const RECORD_LABEL: Record<RecordStatus, string> = {
  present: 'On file',
  stale: 'May be out of date',
  missing: 'Missing',
  none_on_file: 'None on file',
}

const NOTICE_TONE: Record<NoticeFinding, StatusTone> = {
  added_late: 'warning',
  maybe_late: 'info',
  posted_on_time: 'success',
  posted_late: 'danger',
  not_recorded: 'neutral',
  added_after: 'neutral',
  exempt: 'neutral',
}
const NOTICE_LABEL: Record<NoticeFinding, string> = {
  added_late: 'Added too late',
  maybe_late: 'Check the agenda',
  posted_on_time: 'Posted on time',
  posted_late: 'Posted late',
  not_recorded: 'Notice not recorded',
  added_after: 'Added after the meeting',
  exempt: 'Exempt',
}

const DISCLAIMER =
  'This checklist is an aid for your board, not a certification of compliance. It compares what is on file in HomeownerHub with § 720.303 and cannot see documents or notices posted anywhere else. For a compliance opinion, consult a licensed Florida attorney.'

export default async function CompliancePage() {
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />

  const [role, stateResult] = await Promise.all([
    getEffectiveRoleInOrg(org.id),
    tryLoad('association state', () => getAssociationState()),
  ])
  const isBoard = role === 'admin' || role === 'board'
  const gate = stateResult.ok ? complianceGate(stateResult.data) : null

  const shell = (children: React.ReactNode, meta?: React.ReactNode) => (
    <Page
      linkAs={Link}
      title="Records & notices check"
      description="Florida’s official-records and meeting-notice rules for HOA websites, checked against what’s on file here."
      meta={meta ?? <Badge variant="neutral">Fla. Stat. § 720.303</Badge>}
      tabs={<LegalTabs current="/legal/compliance" />}
    >
      <LegalDisclaimer>{DISCLAIMER}</LegalDisclaimer>
      {children}
    </Page>
  )

  if (!isBoard) {
    return shell(
      <EmptyState
        icon={<ShieldCheck aria-hidden />}
        title="For board members and admins"
        description="The records and notices check is available to your association’s board."
        action={
          <Button asChild variant="secondary">
            <Link href="/legal">Back to State law</Link>
          </Button>
        }
      />,
    )
  }

  if (!stateResult.ok || !gate) return shell(<LoadFailed what="your association’s state" retryHref="/legal/compliance" />)

  if (gate.kind === 'not_florida') {
    const state = stateResult.data
    return shell(
      <EmptyState
        icon={<Scale aria-hidden />}
        title="Available for Florida associations"
        description={
          state
            ? `This check follows Florida’s § 720.303. Your association is in ${STATE_NAMES[state]}, so it doesn’t apply — the State law overview covers your state’s statutes.`
            : 'This check follows Florida’s § 720.303. Your association has no supported state set, so it doesn’t apply.'
        }
        action={
          <Button asChild variant="secondary">
            <Link href="/legal">Back to State law</Link>
          </Button>
        }
      />,
    )
  }

  const now = new Date()
  const [statuteResult, docsResult, meetingsResult, unitsResult] = await Promise.all([
    tryLoad('§ 720.303 text', () => loadFlRecordsStatute()),
    tryLoad('documents', () => loadComplianceDocs(org.id)),
    tryLoad('meetings', () => loadComplianceMeetings(org.id, now)),
    tryLoad('unit count', () => countUnits(org.id)),
  ])

  // A failed statute read is treated exactly like "not loaded": no quote is
  // shown unless it was validated against text we actually read.
  const statute = statuteResult.ok ? statuteResult.data : null
  const statuteText = officialStatuteText(statute)
  const officialUrl = statute?.source_name && statute.source_url ? statute.source_url : sectionUrl(VERIFIED_EDITION, '720.303')

  const records = docsResult.ok ? evaluateRecords(docsResult.data, now) : null
  const summary = records ? summarizeRecords(records) : null
  const meetings = meetingsResult.ok ? evaluateMeetings(meetingsResult.data, now) : null
  const lateCount = meetings?.filter((m) => m.finding === 'added_late').length ?? 0

  return shell(
    <>
      {!statuteResult.ok ? (
        <LoadFailed what="the statute text" hint="Quotes are hidden until it loads." retryHref="/legal/compliance" />
      ) : statuteText == null ? (
        <Alert variant="warning" title="Statute text not yet loaded">
          The official text of § 720.303 hasn’t been loaded for Florida yet, so no quotes are shown. Each line
          still names its subsection — verify it against{' '}
          <a href={officialUrl} target="_blank" rel="noreferrer" className="font-medium underline">
            § 720.303 on flsenate.gov
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          .
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Who this applies to</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-foreground-secondary">
            The website-posting list applies to associations with {POSTING_PARCEL_THRESHOLD} or more parcels.{' '}
            {unitsResult.ok ? (
              <>
                You have <span className="num font-medium text-foreground">{unitsResult.data.toLocaleString()}</span>{' '}
                {unitsResult.data === 1 ? 'unit' : 'units'} on file
                {unitsResult.data < POSTING_PARCEL_THRESHOLD ? ', so it may not apply to you yet' : ''}.
              </>
            ) : (
              'We couldn’t count your units on file.'
            )}
          </p>
          <StatuteCitation check={checkQuote(APPLICABILITY, statuteText)} />
          <p className="text-sm text-foreground-secondary">
            Posted records must sit in an owners-only area. Residents sign in to HomeownerHub’s resident portal,
            and its Documents screen shows them your CC&amp;Rs, bylaws and rules, plus governing documents filed as a
            declaration, bylaws, rules, amendment or policy — current versions with a file attached. Anything else
            on file (minutes, and documents typed “other” such as budgets, insurance or correspondence) stays
            board-only, so each record below says whether owners can see it.
          </p>
          <StatuteCitation check={checkQuote(OWNER_ONLY_AREA, statuteText)} />
        </CardContent>
      </Card>

      <section aria-labelledby="records-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="records-heading" className="text-lg font-semibold text-foreground">
            Official records to post
          </h2>
          {summary ? (
            <p className="num text-sm text-muted">
              {summary.present} on file · {summary.stale} may be out of date · {summary.missing} missing ·{' '}
              {summary.postedForOwners} posted for owners
            </p>
          ) : null}
        </div>
        <p className="text-sm text-muted">
          Matched from document types (CC&amp;Rs, bylaws, rules) and, for anything else, from document titles.
          The age windows for “may be out of date” are our rule of thumb, not the statute’s.
        </p>
        {!records ? (
          <LoadFailed what="your documents" retryHref="/legal/compliance" />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {records.map((line) => (
                <li key={line.category.id}>
                  <RecordItem line={line} statuteText={statuteText} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="notices-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="notices-heading" className="text-lg font-semibold text-foreground">
            Meeting notices
          </h2>
          {meetings && meetings.length > 0 ? (
            <p className="num text-sm text-muted">
              {lateCount} of {meetings.length} added fewer days ahead than required
            </p>
          ) : null}
        </div>
        {M1_APPLIED ? (
          <Alert variant="info" title="Where a posting date is recorded, it decides">
            A meeting with a recorded notice date is checked against that date. For the rest, HomeownerHub only knows
            when the meeting was added here: one added fewer than {NOTICE_DAYS} days ahead can’t have had a{' '}
            {NOTICE_DAYS}-day notice sent through HomeownerHub.
          </Alert>
        ) : (
          <Alert variant="info" title="Notice posting isn’t recorded">
            HomeownerHub doesn’t store when a meeting’s notice was posted. What it does know is when the meeting was
            added here: a meeting added fewer than {NOTICE_DAYS} days ahead can’t have had a {NOTICE_DAYS}-day notice
            sent through HomeownerHub. Whether a notice went up — here or anywhere else — you need to confirm.
          </Alert>
        )}
        {!meetings ? (
          <LoadFailed what="meetings" retryHref="/legal/compliance" />
        ) : meetings.length === 0 ? (
          <EmptyState
            icon={<CalendarDays aria-hidden />}
            title="No meetings in the last 30 days or the next 90"
            description="Schedule your next meeting at least 14 days ahead so its notice can go out in time."
            action={
              <Button asChild variant="secondary">
                <Link href="/meetings/schedule">Schedule a meeting</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {meetings.map((line) => (
                <li key={line.meeting.id}>
                  <MeetingItem line={line} statuteText={statuteText} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <p className="text-sm text-muted">
        Read the full section:{' '}
        {statute && statuteText ? (
          <Link href={`/legal/browse/${statute.id}`} className="font-medium text-primary hover:underline">
            § 720.303 in Statutes
          </Link>
        ) : (
          <a
            href={officialUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            § 720.303 on flsenate.gov
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </p>
    </>,
  )
}

function docHref(d: { source: 'hoa' | 'governing'; id: string }): string {
  return d.source === 'hoa' ? `/documents/${d.id}` : '/documents/governing'
}

function RecordItem({ line, statuteText }: { line: RecordLine; statuteText: string | null }) {
  const newest = line.matches[0]
  const more = line.matches.length - 1
  return (
    <div className="space-y-2 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <h3 className="min-w-0 text-sm font-medium text-foreground">{line.category.label}</h3>
        <StatusPill tone={RECORD_TONE[line.status]} label={RECORD_LABEL[line.status]} />
      </div>
      {newest ? (
        <p className="min-w-0 text-sm text-foreground-secondary">
          <FileText className="mr-1 inline size-3.5 align-[-2px] text-muted" aria-hidden />
          <Link href={docHref(newest)} className="break-words font-medium text-primary hover:underline">
            {newest.title}
          </Link>
          {newest.date ? <span className="text-muted"> · {formatDay(newest.date)}</span> : null}
          {newest.matchedBy === 'title' ? <span className="text-muted"> · matched by title</span> : null}
          {more > 0 ? <span className="text-muted"> · {more} more</span> : null}
          {line.status === 'stale' && line.ageMonths != null ? (
            <span className="block text-muted">
              Newest is {line.ageMonths} months old. {line.category.staleReason}
            </span>
          ) : null}
        </p>
      ) : null}
      {line.posting ? <PostingLine line={line} /> : null}
      {newest ? null : line.status === 'none_on_file' ? (
        <p className="text-sm text-muted">Nothing on file. Required only if any such contract or document exists.</p>
      ) : (
        <p className="text-sm text-muted">
          Nothing on file matches.{' '}
          <Link href="/documents/upload" className="font-medium text-primary hover:underline">
            Upload it
          </Link>
        </p>
      )}
      <StatuteCitation check={checkQuote(line.category.citation, statuteText)} />
    </div>
  )
}

/** The owner-facing copy, exactly as a resident opens it (new tab). */
function OwnerCopyLink({ doc, children }: { doc: { source: 'hoa' | 'governing'; id: string }; children: React.ReactNode }) {
  return (
    <a
      href={residentDocumentHref(doc)}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-primary hover:underline"
    >
      {children}
      <span className="sr-only"> (opens the copy owners see in a new tab)</span>
    </a>
  )
}

function PostingLine({ line }: { line: RecordLine }) {
  const posted = line.postedDoc
  if (line.posting === 'posted' && posted) {
    return (
      <p className="text-sm text-foreground-secondary">
        <Eye className="mr-1 inline size-3.5 align-[-2px] text-success" aria-hidden />
        <OwnerCopyLink doc={posted}>Posted for owners</OwnerCopyLink>
      </p>
    )
  }
  if (line.posting === 'older_posted' && posted) {
    return (
      <p className="text-sm text-foreground-secondary">
        <EyeOff className="mr-1 inline size-3.5 align-[-2px] text-warning" aria-hidden />
        Newest on file is not visible to owners; they see an older one:{' '}
        <OwnerCopyLink doc={posted}>
          <span className="break-words">{posted.title}</span>
        </OwnerCopyLink>
      </p>
    )
  }
  return (
    <p className="text-sm text-muted">
      <EyeOff className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
      On file, not visible to owners
    </p>
  )
}

function noticeDetail(line: MeetingLine): string {
  const d = line.daysAhead
  if (line.basis === 'posted') {
    const posted = d == null ? 'Notice posted' : `Notice posted ${d} ${d === 1 ? 'day' : 'days'} ahead`
    if (line.finding === 'posted_late') return `${posted} — fewer days than this meeting requires.`
    return `${posted}.`
  }
  const ahead = d == null ? 'Date added unknown' : `Added ${d} ${d === 1 ? 'day' : 'days'} ahead`
  switch (line.finding) {
    case 'added_late':
      return `${ahead} — too late for the notice to have gone out through HomeownerHub in time. Check whether it was posted elsewhere.`
    case 'maybe_late':
      return `${ahead} — enough for the 48-hour rule, short of ${NOTICE_DAYS} days if special assessments or parcel-use rule changes were on the agenda.`
    case 'added_after':
      return 'Added after the meeting (e.g. minutes recorded later), so it says nothing about the notice.'
    case 'exempt':
      return `${ahead}.`
    default:
      return `${ahead}. When — or whether — the notice was posted isn’t recorded.`
  }
}

function MeetingItem({ line, statuteText }: { line: MeetingLine; statuteText: string | null }) {
  const type = line.meeting.meetingType ? (MEETING_TYPE[line.meeting.meetingType] ?? line.meeting.meetingType) : 'Meeting'
  return (
    <div className="space-y-2 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <h3 className="min-w-0 text-sm font-medium text-foreground">
          <Link href={`/meetings/${line.meeting.id}`} className="hover:text-primary hover:underline">
            {type} meeting · <span className="num">{formatDay(line.meeting.meetingDate)}</span>
          </Link>
          <span className="ml-2 text-xs font-normal text-muted">{line.when === 'upcoming' ? 'Upcoming' : 'Recent'}</span>
        </h3>
        <StatusPill tone={NOTICE_TONE[line.finding]} label={NOTICE_LABEL[line.finding]} />
      </div>
      <p className="text-sm text-foreground-secondary">{noticeDetail(line)}</p>
      <p className="text-sm text-muted">{line.rule.summary}</p>
      <div className="space-y-2">
        {line.rule.citations.map((c) => (
          <StatuteCitation key={c.subsection} check={checkQuote(c, statuteText)} />
        ))}
      </div>
    </div>
  )
}
