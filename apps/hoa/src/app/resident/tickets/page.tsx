import Link from 'next/link'
import { MessageSquare, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button, Card, EmptyState, PageHeader } from '@homeowner-portal/ui'
import { listMyTickets, type TicketStatus } from '@/lib/resident-tickets'

export const metadata = { title: 'My Tickets' }

const STATUS_VARIANT: Record<TicketStatus, 'success' | 'warning' | 'outline'> = {
  open: 'outline',
  in_progress: 'warning',
  closed: 'success',
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

export default async function MyTicketsPage() {
  const tickets = await listMyTickets()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="My Tickets"
        description="Your support tickets and the board's responses."
        actions={
          <Button asChild>
            <Link href="/resident/tickets/new">
              <Plus className="h-4 w-4" />
              New ticket
            </Link>
          </Button>
        }
      />

      {tickets.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" aria-hidden />}
          title="No tickets yet"
          description="When you submit a support ticket, it will appear here with its current status."
          action={
            <Button asChild>
              <Link href="/resident/tickets/new">
                <Plus className="h-4 w-4" />
                Open your first ticket
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/resident/tickets/${t.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 hover:bg-foreground/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.subject}</p>
                    <p className="text-xs text-muted">
                      {CATEGORY_LABEL[t.category] ?? t.category}
                      {' · opened '}
                      {format(new Date(t.created_at), 'PP')}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[t.status]} size="sm">
                    {t.status.replace('_', ' ')}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
