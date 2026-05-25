import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  CheckCircle2,
  ChevronLeft,
  Circle,
  Clock,
  Eye,
  MailX,
  Reply,
  Sparkles,
} from 'lucide-react'
import { Badge, Card } from '@homeowner-portal/ui'
import { LocalDateTime } from '@/components/ui/LocalDateTime'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getCommunication } from '@/lib/communications/queries'
import { CommunicationActions } from './CommunicationActions'

export const metadata = { title: 'Message' }

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  draft: 'outline',
  scheduled: 'warning',
  sending: 'warning',
  sent: 'success',
  failed: 'destructive',
  cancelled: 'outline',
}

const DELIVERY_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  queued: 'outline',
  sent: 'default',
  delivered: 'success',
  opened: 'success',
  clicked: 'success',
  replied: 'success',
  bounced: 'destructive',
  failed: 'destructive',
  suppressed: 'outline',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CommunicationDetailPage({ params }: PageProps) {
  const { id } = await params
  const assoc = await getPrimaryAssociation()
  if (!assoc) notFound()
  const comm = await getCommunication(assoc.id, id)
  if (!comm) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/communications"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Communications
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-bold text-foreground">{comm.subject}</h1>
          <Badge variant={STATUS_VARIANT[comm.status] ?? 'outline'}>{comm.status}</Badge>
          <CommunicationActions commId={comm.id} />
          {comm.ai_generated ? (
            <Badge variant="outline">
              <Sparkles className="mr-1 h-3 w-3" />
              AI drafted
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted">
          {comm.category} ·{' '}
          {comm.sent_at ? (
            <LocalDateTime iso={comm.sent_at} variant="long" prefix="sent" />
          ) : comm.scheduled_for ? (
            <LocalDateTime
              iso={comm.scheduled_for}
              variant="long"
              prefix="scheduled"
            />
          ) : (
            <LocalDateTime
              iso={comm.created_at}
              variant="long"
              prefix="created"
            />
          )}
          {comm.audience_summary ? ` · ${comm.audience_summary}` : ''}
          {comm.template ? ` · template: ${comm.template.name}` : ''}
        </p>
      </header>

      {/* Delivery summary tiles */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Sent"
          value={`${comm.sentCount}/${comm.totalRecipients}`}
        />
        <Tile
          icon={<Eye className="h-4 w-4" />}
          label="Opened"
          value={String(comm.openedCount)}
        />
        <Tile
          icon={<Reply className="h-4 w-4" />}
          label="Replied"
          value={String(comm.repliedCount)}
        />
        <Tile
          icon={<MailX className="h-4 w-4" />}
          label="Failed"
          value={String(comm.failedCount)}
          tone={comm.failedCount > 0 ? 'destructive' : 'default'}
        />
      </div>

      {/* Body preview */}
      <Card>
        <div className="border-b border-border px-4 py-2 text-sm font-semibold text-foreground">
          Message body
        </div>
        <div className="prose prose-sm max-w-none p-4 text-foreground">
          <div dangerouslySetInnerHTML={{ __html: comm.body_html }} />
        </div>
      </Card>

      {/* Recipients table */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Recipients ({comm.recipients.length})
        </h2>
        {comm.recipients.length === 0 ? (
          <Card>
            <div className="p-6 text-sm italic text-muted">
              No recipients. Either the audience filter matched no units, or
              none had contact info on file.
            </div>
          </Card>
        ) : (
          <Card>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Recipient</th>
                  <th className="px-4 py-2 font-medium">Channel</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Timeline</th>
                </tr>
              </thead>
              <tbody>
                {comm.recipients.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <p className="text-foreground">{r.recipient_name ?? 'Resident'}</p>
                      <p className="text-xs text-muted">
                        {r.channel === 'email'
                          ? r.email ?? '—'
                          : r.channel === 'sms'
                            ? r.phone ?? '—'
                            : 'portal'}
                      </p>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs uppercase tracking-wide text-muted">
                      {r.channel}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={DELIVERY_VARIANT[r.delivery_status] ?? 'outline'} size="sm">
                        {r.delivery_status}
                      </Badge>
                      {r.error_message ? (
                        <p className="mt-1 text-[11px] text-destructive">
                          {r.error_message}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">
                      <Timeline
                        events={[
                          r.sent_at ? { label: 'sent', at: r.sent_at } : null,
                          r.delivered_at ? { label: 'delivered', at: r.delivered_at } : null,
                          r.opened_at ? { label: 'opened', at: r.opened_at } : null,
                          r.replied_at ? { label: 'replied', at: r.replied_at } : null,
                          r.failed_at ? { label: 'failed', at: r.failed_at } : null,
                        ].filter((x): x is { label: string; at: string } => !!x)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* Replies */}
      {comm.replies.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Replies ({comm.replies.length})
          </h2>
          <Card>
            <ul className="divide-y divide-border">
              {comm.replies.map((r) => (
                <li key={r.id} className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {r.from_email ?? r.from_phone ?? 'Anonymous'}
                    </p>
                    <p className="text-xs text-muted">
                      <LocalDateTime iso={r.received_at} variant="long" />
                      {r.read_at ? null : (
                        <span className="ml-2 inline-flex items-center gap-1 text-primary">
                          <Circle className="h-2 w-2 fill-current" />
                          unread
                        </span>
                      )}
                    </p>
                  </div>
                  {r.subject ? (
                    <p className="mt-1 text-xs text-muted">re: {r.subject}</p>
                  ) : null}
                  {r.ai_summary ? (
                    <p className="mt-2 rounded-md bg-background/50 p-2 text-xs italic text-muted">
                      <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
                      {r.ai_summary}
                    </p>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {r.body}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </div>
  )
}

function Tile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone?: 'destructive' | 'default'
}) {
  const valueClass = tone === 'destructive' ? 'text-destructive' : 'text-foreground'
  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
          {icon}
          {label}
        </div>
        <p className={`mt-2 text-lg font-semibold ${valueClass}`}>{value}</p>
      </div>
    </Card>
  )
}

function Timeline({ events }: { events: { label: string; at: string }[] }) {
  if (events.length === 0) {
    return <span className="italic text-muted">—</span>
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {events.map((e, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 ? <span className="text-muted">·</span> : null}
          <Clock className="h-3 w-3" />
          <span>
            {e.label}{' '}
            <LocalDateTime
              iso={e.at}
              variant="short"
              className="text-muted"
            />
          </span>
        </span>
      ))}
    </span>
  )
}
