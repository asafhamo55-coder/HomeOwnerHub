import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@homeownerhub/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'

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
      'id, description, violation_type, status, severity, ccr_section, cure_period_days, fine_amount, notice_sent_at, approved_at, approved_letter, ai_draft_letter, photo_urls, created_at, property:hoa_properties(address, unit_number, owner_name)',
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
  const overdue = cureDeadline ? cureDeadline < new Date() && v.status !== 'resolved' : false

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/violations"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to violations
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-muted">{v.description}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-fg">
          <span>{v.property?.address ?? 'Property unknown'}</span>
          {v.property?.unit_number ? <span>· {v.property.unit_number}</span> : null}
          {v.ccr_section ? <span>· {v.ccr_section}</span> : null}
          <Badge variant={v.status === 'resolved' ? 'success' : overdue ? 'destructive' : 'warning'} size="sm">
            {overdue ? 'overdue' : v.status.replace('_', ' ')}
          </Badge>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Notice as sent</CardTitle>
          </CardHeader>
          <CardContent>
            {v.approved_letter ? (
              <pre className="whitespace-pre-wrap rounded-lg border border-border bg-background p-4 font-mono text-xs leading-relaxed text-muted">
                {v.approved_letter}
              </pre>
            ) : (
              <p className="text-sm text-muted-fg">No approved letter on file.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Reported">
              {v.created_at ? format(new Date(v.created_at), 'PPp') : '—'}
            </Row>
            <Row label="Approved">
              {v.approved_at ? format(new Date(v.approved_at), 'PPp') : '—'}
            </Row>
            <Row label="Notice sent">
              {v.notice_sent_at ? format(new Date(v.notice_sent_at), 'PPp') : '—'}
            </Row>
            <Row label="Cure deadline">
              {cureDeadline ? format(cureDeadline, 'PP') : '—'}
            </Row>
            <Row label="Daily fine">
              {v.fine_amount != null ? `$${v.fine_amount}/day` : '—'}
            </Row>
            {v.severity ? (
              <Row label="Severity">
                <Badge variant="outline" size="sm">
                  {v.severity}
                </Badge>
              </Row>
            ) : null}
          </CardContent>
        </Card>
      </div>

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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-fg">{label}</span>
      <span className="text-right text-muted">{children}</span>
    </div>
  )
}
