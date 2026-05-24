import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card, EmptyState } from '@homeowner-portal/ui'
import { listTicketsForBoard, type TicketStatus, type TicketPriority } from '@/lib/tickets'

export const metadata = { title: 'Tickets' }

const STATUS_VARIANT: Record<TicketStatus, 'success' | 'warning' | 'outline'> = {
  open: 'outline',
  in_progress: 'warning',
  closed: 'success',
}

const PRIORITY_VARIANT: Record<TicketPriority, 'destructive' | 'warning' | 'outline' | 'default'> = {
  urgent: 'destructive',
  high: 'warning',
  normal: 'outline',
  low: 'default',
}

const CATEGORY_LABEL: Record<string, string> = {
  maintenance: 'Maintenance',
  noise: 'Noise',
  parking: 'Parking',
  common_area: 'Common area',
  billing: 'Billing',
  access: 'Access',
  safety: 'Safety',
  general: 'General',
  other: 'Other',
}

export default async function TicketsPage() {
  const tickets = await listTicketsForBoard()
  const open = tickets.filter((t) => t.status !== 'closed').length

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Tickets</h1>
        <p className="text-sm text-muted">
          {open} open · {tickets.length} total
        </p>
      </header>

      {tickets.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" aria-hidden />}
          title="No tickets yet"
          description="When residents submit support tickets, they will appear here."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tickets/${t.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 hover:bg-foreground/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.subject}</p>
                    <p className="text-xs text-muted">
                      {t.submitter_name ?? t.submitter_email ?? 'Unknown'}
                      {t.unit_number ? ` · Unit ${t.unit_number}` : ''}
                      {' · '}
                      {CATEGORY_LABEL[t.category] ?? t.category}
                      {' · '}
                      {format(new Date(t.created_at), 'PP')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.priority !== 'normal' ? (
                      <Badge variant={PRIORITY_VARIANT[t.priority]} size="sm">
                        {t.priority}
                      </Badge>
                    ) : null}
                    <Badge variant={STATUS_VARIANT[t.status]} size="sm">
                      {t.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
