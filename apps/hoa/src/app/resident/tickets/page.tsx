import Link from 'next/link'
import { MessageSquarePlus, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Button, LoadFailed } from '@homeowner-portal/ui'
import { loadMyTickets } from '@/lib/resident-tickets'
import { RowGroup, ScreenEmpty, ScreenHeader, TappableRow } from '@/components/resident/screen'
import { ResidentStatus, TICKET_CATEGORY_LABEL } from '@/components/resident/status'

export const metadata = { title: 'Support requests' }
export const dynamic = 'force-dynamic'

export default async function MyTicketsPage() {
  const result = await loadMyTickets()

  return (
    <div className="space-y-6">
      <ScreenHeader
        back={{ href: '/resident/requests', label: 'Requests' }}
        title="Support requests"
        subtitle="Your requests and the board's responses."
        action={
          <Button asChild size="sm">
            <Link href="/resident/tickets/new">
              <Plus aria-hidden />
              New
            </Link>
          </Button>
        }
      />

      {!result.ok ? (
        <LoadFailed what="your support requests" />
      ) : result.data.length === 0 ? (
        <ScreenEmpty
          icon={<MessageSquarePlus />}
          title="No requests yet"
          description="When you send the board a support request, it shows up here with its current status."
          action={
            <Button asChild>
              <Link href="/resident/tickets/new">
                <Plus aria-hidden />
                New request
              </Link>
            </Button>
          }
        />
      ) : (
        <RowGroup>
          {result.data.map((t) => (
            <TappableRow
              key={t.id}
              href={`/resident/tickets/${t.id}`}
              icon={<MessageSquarePlus />}
              tone={t.status === 'closed' ? 'slate' : 'primary'}
              title={t.subject}
              subtitle={`${TICKET_CATEGORY_LABEL[t.category] ?? t.category} · opened ${format(new Date(t.created_at), 'PP')}`}
              status={<ResidentStatus kind="ticket" status={t.status} />}
            />
          ))}
        </RowGroup>
      )}
    </div>
  )
}
