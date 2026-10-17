import Link from 'next/link'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'
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
import { VIOLATION_STATUSES, type ViolationStatus } from '@/lib/violation-statuses'
import { VIOLATION_SEVERITY, VIOLATION_STATUS } from '@/lib/status/community'
import { ViolationStatusEditor } from './ViolationStatusEditor'
import { ViolationActions } from './ViolationActions'

export const dynamic = 'force-dynamic'

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

  const result = await loadOrFail(
    'this violation',
    supabase
      .from('hoa_violations')
      .select(
        'id, description, violation_type, status, severity, ccr_section, cure_period_days, fine_amount, notice_sent_at, approved_at, approved_letter, ai_draft_letter, photo_urls, created_at, resolved_at, resolution_note, fine_start_date, property_id, property:hoa_properties(address, unit_number, owner_name)',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
  )

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
              />
            </CardContent>
          </Card>

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
