import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import {
  BackLink,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KeyValue,
  KeyValueList,
  PageHeader,
} from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { VIOLATION_STATUSES, type ViolationStatus } from '@/lib/violation-statuses'
import { ViolationStatusEditor } from './ViolationStatusEditor'
import { ViolationActions } from './ViolationActions'

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
  property: { address: string; unit_number: string | null; owner_name: string | null } | null
}

export default async function ViolationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()

  const { data } = await supabase
    .from('hoa_violations')
    .select(
      'id, description, violation_type, status, severity, ccr_section, cure_period_days, fine_amount, notice_sent_at, approved_at, approved_letter, ai_draft_letter, photo_urls, created_at, resolved_at, resolution_note, fine_start_date, property:hoa_properties(address, unit_number, owner_name)',
    )
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const v = data as unknown as ViolationDetail

  // Cure deadline = notice_sent_at + cure_period_days
  let cureDeadline: Date | null = null
  if (v.notice_sent_at && v.cure_period_days) {
    cureDeadline = new Date(new Date(v.notice_sent_at).getTime() + v.cure_period_days * 86_400_000)
  }
  const isClosed = v.status === 'resolved' || v.status === 'dismissed'
  const overdue = cureDeadline ? cureDeadline < new Date() && !isClosed : false
  // Defensive: legacy rows may carry a status not yet in the enum.
  // Default to 'open' for the editor — admin can move it forward from there.
  const currentStatus: ViolationStatus =
    (VIOLATION_STATUSES as readonly string[]).includes(v.status)
      ? (v.status as ViolationStatus)
      : 'open'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackLink href="/violations" label="All violations" />

      <PageHeader
        title={v.description}
        description={
          <>
            {v.property?.address ?? 'Property unknown'}
            {v.property?.unit_number ? <> · {v.property.unit_number}</> : null}
            {v.ccr_section ? <> · {v.ccr_section}</> : null}
          </>
        }
        actions={
          <>
          <ViolationActions violationId={v.id} />
          <Badge
            variant={
              v.status === 'resolved'
                ? 'success'
                : v.status === 'dismissed'
                  ? 'neutral'
                  : overdue
                    ? 'destructive'
                    : 'warning'
            }
            size="sm"
          >
            {overdue ? 'overdue' : v.status.replace('_', ' ')}
          </Badge>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Notice as sent</CardTitle>
          </CardHeader>
          <CardContent>
            {v.approved_letter ? (
              <pre className="whitespace-pre-wrap rounded-lg border border-border bg-background p-4 font-mono text-xs leading-relaxed text-foreground">
                {v.approved_letter}
              </pre>
            ) : (
              <p className="text-sm text-muted">No approved letter on file.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList className="sm:grid-cols-1">
              <KeyValue
                label="Reported"
                value={v.created_at ? format(new Date(v.created_at), 'PPp') : null}
              />
              <KeyValue
                label="Approved"
                value={v.approved_at ? format(new Date(v.approved_at), 'PPp') : null}
              />
              <KeyValue
                label="Notice sent"
                value={v.notice_sent_at ? format(new Date(v.notice_sent_at), 'PPp') : null}
              />
              <KeyValue
                label="Cure deadline"
                value={cureDeadline ? format(cureDeadline, 'PP') : null}
              />
              {v.fine_start_date ? (
                <KeyValue
                  label="Fines started"
                  value={format(new Date(v.fine_start_date), 'PP')}
                />
              ) : null}
              <KeyValue
                label="Daily fine"
                value={v.fine_amount != null ? `$${v.fine_amount}/day` : null}
              />
              {v.resolved_at ? (
                <KeyValue
                  label={v.status === 'dismissed' ? 'Dismissed' : 'Resolved'}
                  value={format(new Date(v.resolved_at), 'PPp')}
                />
              ) : null}
              {v.severity ? (
                <KeyValue
                  label="Severity"
                  value={
                    <Badge variant="outline" size="sm">
                      {v.severity}
                    </Badge>
                  }
                />
              ) : null}
            </KeyValueList>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Update status</CardTitle>
        </CardHeader>
        <CardContent>
          <ViolationStatusEditor
            violationId={v.id}
            currentStatus={currentStatus}
            currentResolutionNote={v.resolution_note}
          />
        </CardContent>
      </Card>

      {v.resolution_note ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {v.status === 'dismissed' ? 'Reason for dismissal' : 'Resolution note'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-foreground">{v.resolution_note}</p>
          </CardContent>
        </Card>
      ) : null}

      {v.photo_urls && v.photo_urls.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Photos</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {v.photo_urls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Violation photo"
                  className="h-32 w-full rounded-lg border border-border object-cover"
                />
              </a>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

