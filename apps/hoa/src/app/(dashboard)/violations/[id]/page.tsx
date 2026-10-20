import Link from 'next/link'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId, resolveUnitForProperty } from '@/lib/properties/resolve'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { CalendarClock, CheckCircle2, Clock, FileCheck2, Flag, Gavel, Mail, XCircle } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  KeyValue,
  KeyValueList,
  LoadFailed,
  Page,
  StatusBadge,
  StatusPill,
  Timeline,
  type TimelineItem,
} from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { timed } from '@/lib/perf/timing'
import { VIOLATION_STATUSES, type ViolationStatus } from '@/lib/violation-statuses'
import { VIOLATION_SEVERITY, VIOLATION_STATUS } from '@/lib/status/community'
import { ViolationStatusEditor } from './ViolationStatusEditor'
import { ViolationActions } from './ViolationActions'
import { CureCommitmentCard } from './CureCommitmentCard'
import { FollowUpLetterDialog } from './FollowUpLetterDialog'
import { FOLLOW_UP_AWAITING_SAVE_PATH, followUpLabel, followUpOfRunInput } from '@/lib/violation-follow-up'
import { getCurrentOrg } from '@/lib/orgs'
import { loadBoardResponseThreads, type BoardResponseThread, type Db } from '@/lib/violation-response'
import { BoardConversation } from '@/components/board-review/BoardConversation'
import {
  cureCommitmentApplies,
  cureCommitmentPenaltyBlock,
  loadCureCommitment,
  loadOrgStateRules,
  type CureCommitment,
} from '@/lib/violation-cure-commitment'
import { checkFine, fineCents } from '@/lib/compliance/statute-drift'

export const dynamic = 'force-dynamic'

const R = '/violations/[id]'

interface ViolationDetail {
  id: string
  description: string
  violation_type: string
  status: string
  severity: string | null
  ccr_section: string | null
  cure_period_days: number | null
  fine_amount: number | null
  notice_sent_at: string | null
  approved_at: string | null
  approved_letter: string | null
  ai_draft_letter: string | null
  photo_urls: string[] | null
  created_at: string | null
  resolved_at: string | null
  resolution_note: string | null
  fine_start_date: string | null
  property_id: string | null
  property: { address: string; unit_number: string | null; owner_name: string | null } | null
}

const CLOSED = new Set(['resolved', 'dismissed', 'waived', 'cured'])
// No follow-up letters once the board has dropped the case.
const NO_FOLLOW_UP = new Set(['resolved', 'dismissed', 'waived'])

interface FollowUpRunRow {
  id: string
  status: string
  human_approved: boolean | null
  approved_at: string | null
  created_at: string
  input: unknown
  output: unknown
}

function letterOf(output: unknown): string | null {
  const n = output && typeof output === 'object' ? (output as { notice?: unknown }).notice : null
  return typeof n === 'string' && n.trim() ? n : null
}

function crumbLabel(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40).trimEnd()}…` : text
}

export default async function ViolationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()

  // The org (memoized; the layout already resolved it) is read alongside
  // the violation rather than after it (BL-099).
  const [result, org] = await Promise.all([
    timed(R, 'violation.row', () =>
      loadOrFail(
        'this violation',
        supabase
          .from('hoa_violations')
          .select(
            'id, description, violation_type, status, severity, ccr_section, cure_period_days, fine_amount, notice_sent_at, approved_at, approved_letter, ai_draft_letter, photo_urls, created_at, resolved_at, resolution_note, fine_start_date, property_id, property:hoa_properties(address, unit_number, owner_name)',
          )
          .eq('id', id)
          .is('deleted_at', null)
          .maybeSingle(),
      ),
    ),
    getCurrentOrg(),
  ])

  if (!result.ok) {
    return (
      <Page
        title="Violation"
        breadcrumbs={[{ label: 'Violations', href: '/violations' }, { label: 'Violation' }]}
        linkAs={Link}
      >
        <LoadFailed what="this violation" retryHref={`/violations/${id}`} />
      </Page>
    )
  }
  if (!result.data) notFound()
  const v = result.data as unknown as ViolationDetail

  // Cure deadline = notice_sent_at + cure_period_days
  let cureDeadline: Date | null = null
  if (v.notice_sent_at && v.cure_period_days) {
    cureDeadline = new Date(new Date(v.notice_sent_at).getTime() + v.cure_period_days * 86_400_000)
  }
  const isClosed = CLOSED.has(v.status)
  const overdue = cureDeadline ? cureDeadline < new Date() && !isClosed : false
  // Defensive: legacy rows may carry a status not yet in the enum.
  // Default to 'open' for the editor — admin can move it forward from there.
  const currentStatus: ViolationStatus = (VIOLATION_STATUSES as readonly string[]).includes(v.status)
    ? (v.status as ViolationStatus)
    : 'open'

  // CA § 5855(c)(2): the owner's financial commitment to cure. Other
  // states never see the control. A failed state read hides it (the server
  // actions re-check the state); a failed commitment read says so, because
  // "none recorded" would wrongly unblock a fine.
  //
  // Follow-up letters (second notice, hearing, fine, decision) drafted from
  // this page: W3 runs carrying this violation as `followUp`. Pending ones
  // wait in Approvals; approved ones are the letter of record for that step.
  //
  // BL-099: these three need only the violation and the org, not each
  // other, so they run together — they used to run one after another
  // (rules, then commitment, then unit, then follow-ups).
  type CommitmentCard = { commitment: CureCommitment | null; blockReason: string | null; loadFailed: boolean }
  // BL-130: one read of the association's state serves the commitment card
  // and the state law check on the fine. A failed read hides both (the
  // server action re-checks and refuses on a failed read).
  const rulesP = org ? loadOrgStateRules(supabase, org.id).catch(() => null) : Promise.resolve(null)
  const [commitmentCard, unit, followUpResult, responses, lawRules] = await Promise.all([
    org
      ? timed(R, 'violation.cureCommitment', async (): Promise<CommitmentCard | null> => {
          const rules = await rulesP
          if (!rules || !cureCommitmentApplies(rules)) return null
          try {
            const commitment = await loadCureCommitment(supabase, org.id, v.id)
            return { commitment, blockReason: cureCommitmentPenaltyBlock(rules, commitment), loadFailed: false }
          } catch {
            return { commitment: null, blockReason: null, loadFailed: true }
          }
        })
      : Promise.resolve(null),
    org && v.property_id
      ? timed(R, 'violation.unit', () =>
          resolveUnitForProperty(supabase, org.id, asPropertyId(v.property_id!)).then(
            (r) => ({ unitId: r.unitId as string | null, failed: false }),
            () => ({ unitId: null, failed: true }),
          ),
        )
      : Promise.resolve({ unitId: null, failed: false }),
    org
      ? timed(R, 'violation.followUps', () =>
          loadOrFail(
            'follow-up letters',
            supabase
              .from('ai_runs' as never)
              .select('id, status, human_approved, approved_at, created_at, input, output')
              .eq('organization_id' as never, org.id)
              .eq('workflow_id' as never, 'W3')
              .eq('input->followUp->>violationId' as never, v.id)
              // Unsaved dialog drafts are the board's working copy, not letters.
              .is(FOLLOW_UP_AWAITING_SAVE_PATH as never, null)
              .order('created_at' as never, { ascending: false })
              .range(0, 49),
          ),
        )
      : Promise.resolve(null),
    // BL-129: the homeowner's responses (tickets linked by audit_log).
    org
      ? timed(R, 'violation.responses', () =>
          loadBoardResponseThreads(supabase as unknown as Db, { orgId: org.id, violationId: v.id }).catch(() => null),
        )
      : Promise.resolve([] as BoardResponseThread[]),
    rulesP,
  ])
  const lawCheck = lawRules && currentStatus !== 'fined' ? checkFine({ state: lawRules.state, dailyFineCents: fineCents(v.fine_amount) }) : null
  const unitId: string | null = unit.unitId
  const unitLoadFailed = unit.failed
  const followUps = followUpResult?.ok ? ((followUpResult.data ?? []) as unknown as FollowUpRunRow[]) : []
  const canDraftFollowUp = Boolean(org) && !NO_FOLLOW_UP.has(v.status)

  const fmt = (iso: string, pattern = 'PP') => format(new Date(iso), pattern)
  const timeEl = (iso: string, pattern = 'PP') => <time dateTime={iso}>{fmt(iso, pattern)}</time>

  // History, oldest first. Only events that actually happened, plus the
  // cure deadline (past or upcoming) because it is the date everyone asks about.
  const history: TimelineItem[] = []
  if (v.created_at)
    history.push({ id: 'reported', title: 'Reported', time: timeEl(v.created_at), icon: <Flag />, tone: 'neutral' })
  if (v.approved_at)
    history.push({ id: 'approved', title: 'Notice approved by the board', time: timeEl(v.approved_at), icon: <FileCheck2 />, tone: 'brand' })
  if (v.notice_sent_at)
    history.push({
      id: 'sent',
      title: 'Notice sent',
      meta: v.cure_period_days ? `${v.cure_period_days}-day cure period` : undefined,
      time: timeEl(v.notice_sent_at),
      icon: <Mail />,
      tone: 'info',
    })
  if (cureDeadline && !isClosed)
    history.push({
      id: 'cure',
      title: overdue ? 'Cure period ended' : 'Cure period ends',
      meta: overdue ? 'Overdue' : 'Upcoming',
      time: <time dateTime={cureDeadline.toISOString()}>{format(cureDeadline, 'PP')}</time>,
      icon: overdue ? <Clock /> : <CalendarClock />,
      tone: overdue ? 'danger' : 'warning',
    })
  for (const r of [...followUps].reverse()) {
    if (r.human_approved !== true || !r.approved_at) continue
    const fu = followUpOfRunInput(r.input)
    if (!fu) continue
    history.push({ id: `fu-${r.id}`, title: `${followUpLabel(fu)} approved by the board`, time: timeEl(r.approved_at), icon: <FileCheck2 />, tone: 'brand' })
  }
  if (v.fine_start_date)
    history.push({ id: 'fines', title: 'Fines started', meta: v.fine_amount != null ? `$${v.fine_amount}/day` : undefined, time: timeEl(v.fine_start_date), icon: <Gavel />, tone: 'danger' })
  if (v.resolved_at)
    history.push({
      id: 'closed',
      title: v.status === 'dismissed' ? 'Dismissed' : v.status === 'waived' ? 'Waived' : 'Resolved',
      time: timeEl(v.resolved_at),
      icon: v.status === 'dismissed' || v.status === 'waived' ? <XCircle /> : <CheckCircle2 />,
      tone: v.status === 'dismissed' || v.status === 'waived' ? 'neutral' : 'success',
      body: v.resolution_note ? <p className="whitespace-pre-wrap">{v.resolution_note}</p> : undefined,
    })

  const address = v.property?.address ?? 'Property unknown'

  return (
    <Page
      width="wide"
      title={v.description}
      breadcrumbs={[{ label: 'Violations', href: '/violations' }, { label: crumbLabel(v.description) }]}
      linkAs={Link}
      meta={
        <>
          <StatusBadge status={v.status} tones={VIOLATION_STATUS.tones} labels={VIOLATION_STATUS.labels} />
          {overdue ? <StatusPill tone="danger" label="Cure overdue" icon={<Clock aria-hidden />} /> : null}
        </>
      }
      description={
        <>
          {v.property && v.property_id ? (
            <Link href={propertyHref(asPropertyId(v.property_id))} className="text-foreground-secondary hover:text-primary hover:underline">
              {address}
              {v.property.unit_number ? ` · ${v.property.unit_number}` : ''}
            </Link>
          ) : (
            address
          )}
          {v.ccr_section ? ` · ${v.ccr_section}` : ''}
        </>
      }
      actions={<ViolationActions violationId={v.id} />}
    >
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValueList className="sm:grid-cols-3">
                <KeyValue label="Type" value={<span className="capitalize">{v.violation_type}</span>} />
                <KeyValue label="CC&R section" value={v.ccr_section} />
                <KeyValue
                  label="Severity"
                  value={
                    v.severity ? (
                      <StatusBadge status={v.severity} tones={VIOLATION_SEVERITY.tones} labels={VIOLATION_SEVERITY.labels} />
                    ) : null
                  }
                />
                <KeyValue
                  label="Property"
                  value={
                    v.property && v.property_id ? (
                      <Link href={propertyHref(asPropertyId(v.property_id))} className="text-primary hover:underline">
                        {address}
                        {v.property.unit_number ? ` · ${v.property.unit_number}` : ''}
                      </Link>
                    ) : null
                  }
                />
                <KeyValue label="Owner" value={v.property?.owner_name} />
                <KeyValue label="Cure period" value={v.cure_period_days != null ? `${v.cure_period_days} days` : null} />
                <KeyValue label="Daily fine if uncured" value={v.fine_amount != null ? <span className="num">${v.fine_amount}/day</span> : null} />
              </KeyValueList>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Notice as sent</CardTitle>
              <CardDescription>The letter the board approved. This is the version of record.</CardDescription>
            </CardHeader>
            <CardContent>
              {v.approved_letter ? (
                <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-subtle p-4 text-sm leading-relaxed text-foreground">
                  {v.approved_letter}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  No approved letter on file. Violations reported before the notice wizard, or still awaiting
                  approval, have no letter yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              actions={
                canDraftFollowUp && unitId ? (
                  <FollowUpLetterDialog
                    violation={{
                      id: v.id,
                      unitId,
                      violationType: v.violation_type,
                      description: v.description,
                      status: v.status,
                      noticeSentAt: v.notice_sent_at,
                    }}
                  />
                ) : null
              }
            >
              <CardTitle as="h2">Follow-up letters</CardTitle>
              <CardDescription>
                Second notices, hearing notices, fine notices and decision letters. A letter you save waits in Approvals
                until the board approves it. Nothing is sent to the homeowner.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {canDraftFollowUp && !unitId ? (
                <p className="text-sm text-muted">
                  {unitLoadFailed
                    ? 'We could not load this home’s unit record. Reload the page to draft a letter.'
                    : 'This violation has no home with a unit record, so a letter can’t be drafted. Ask an admin to check it under Properties.'}
                </p>
              ) : null}
              {followUpResult && !followUpResult.ok ? (
                <LoadFailed what="follow-up letters" retryHref={`/violations/${v.id}`} />
              ) : followUps.length === 0 ? (
                <p className="text-sm text-muted">No follow-up letters yet.</p>
              ) : (
                <ul className="space-y-3">
                  {followUps.map((r) => {
                    const fu = followUpOfRunInput(r.input)
                    const letter = letterOf(r.output)
                    const pending = r.status === 'pending_human_approval'
                    return (
                      <li key={r.id} className="rounded-lg border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {fu ? followUpLabel(fu) : 'Follow-up letter'}{' '}
                            <span className="font-normal text-muted">
                              · drafted <time dateTime={r.created_at}>{fmt(r.created_at)}</time>
                            </span>
                          </p>
                          {pending ? (
                            <Link href="/approvals?type=w3" className="text-sm text-primary hover:underline">
                              Awaiting approval
                            </Link>
                          ) : r.human_approved ? (
                            <StatusPill tone="success" label="Approved" />
                          ) : (
                            <StatusPill tone="neutral" label="Rejected" />
                          )}
                        </div>
                        {letter && r.human_approved ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-sm text-primary">Show letter</summary>
                            <div className="mt-2 max-h-[24rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-subtle p-3 text-sm leading-relaxed text-foreground">
                              {letter}
                            </div>
                          </details>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Homeowner responses</CardTitle>
              <CardDescription>
                What the owner or resident of this home wrote back from their portal. Reply from the thread; nothing is
                sent to them automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {responses === null ? (
                <LoadFailed what="homeowner responses" retryHref={`/violations/${v.id}`} />
              ) : responses.length === 0 ? (
                <p className="text-sm text-muted">No response from the home yet.</p>
              ) : (
                responses.map((t) => (
                  <div key={t.ticketId} className="space-y-3">
                    <BoardConversation messages={t.messages} residentLabel="Homeowner" emptyHint="" />
                    <Link href={`/tickets/${t.ticketId}`} className="inline-block text-sm font-medium text-primary hover:underline">
                      Open the thread to reply or see photos
                    </Link>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {v.photo_urls && v.photo_urls.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle as="h2">Photos</CardTitle>
                <CardDescription>
                  {v.photo_urls.length} photo{v.photo_urls.length === 1 ? '' : 's'} on the record. Select one to open it full size.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {v.photo_urls.map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Violation photo ${i + 1}`} className="h-32 w-full object-cover" />
                  </a>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Update status</CardTitle>
              <CardDescription>Move the case forward as the owner responds.</CardDescription>
            </CardHeader>
            <CardContent>
              <ViolationStatusEditor
                violationId={v.id}
                currentStatus={currentStatus}
                currentResolutionNote={v.resolution_note}
                fineBlockedReason={commitmentCard?.blockReason ?? null}
                lawCheck={lawCheck}
              />
            </CardContent>
          </Card>

          {commitmentCard ? (
            <CureCommitmentCard
              violationId={v.id}
              commitment={
                commitmentCard.commitment
                  ? { committedOn: commitmentCard.commitment.committedOn, note: commitmentCard.commitment.note }
                  : null
              }
              blockReason={commitmentCard.blockReason}
              loadFailed={commitmentCard.loadFailed}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle as="h2">History</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length > 0 ? (
                <Timeline items={history} label="Violation history" />
              ) : (
                <p className="text-sm text-muted">No history recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  )
}
