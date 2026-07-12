import Link from 'next/link'
import { MessageSquarePlus, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button } from '@homeowner-portal/ui'
import { listMyTickets, type TicketStatus } from '@/lib/resident-tickets'
import { ScreenEmpty, ScreenHeader, TappableRow } from '@/components/resident/screen'

export const metadata = { title: 'My Tickets' }
export const dynamic = 'force-dynamic'

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
    <div className="space-y-6">
      <ScreenHeader
        title="Support tickets"
        subtitle="Your requests and the board's responses."
        action={
          <Button asChild size="sm">
            <Link href="/resident/tickets/new">
              <Plus className="h-4 w-4" />
              New
            </Link>
          </Button>
        }
      />

      {tickets.length === 0 ? (
        <ScreenEmpty
          icon={<MessageSquarePlus className="h-6 w-6" />}
          title="No tickets yet"
          description="When you submit a support request, it will appear here with its current status."
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
        <div className="space-y-2.5">
          {tickets.map((t) => (
            <TappableRow
              key={t.id}
              href={`/resident/tickets/${t.id}`}
              icon={<MessageSquarePlus className="h-5 w-5" />}
              title={t.subject}
              subtitle={`${CATEGORY_LABEL[t.category] ?? t.category} · opened ${format(new Date(t.created_at), 'PP')}`}
              trailing={
                <Badge variant={STATUS_VARIANT[t.status]} size="sm">
                  {t.status.replace('_', ' ')}
                </Badge>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
