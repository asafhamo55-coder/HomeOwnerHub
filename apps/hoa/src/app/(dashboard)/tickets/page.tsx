import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { format } from 'date-fns'
import {
  Badge,
  Card,
  EmptyState,
  LoadFailed,
  Page,
  Pager,
  parsePageParam,
} from '@homeowner-portal/ui'
import { listTicketsForBoard, type TicketStatus, type TicketPriority } from '@/lib/tickets'

export const metadata = { title: 'Tickets' }

// Was a hidden `.limit(200)` inside listTicketsForBoard.
const PAGE_SIZE = 100

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

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const page = parsePageParam((await searchParams).page)
  const result = await listTicketsForBoard({ page, pageSize: PAGE_SIZE })
  const tickets = result.ok ? result.rows : []

  return (
    <Page
      title="Tickets"
      description={result.ok ? `${result.openCount} open · ${result.total} total` : null}
    >
      {!result.ok ? (
        <LoadFailed what="tickets" />
      ) : tickets.length === 0 && result.total === 0 ? (
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
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={result.total}
            rowCount={tickets.length}
            hrefFor={(p) => (p > 1 ? `/tickets?page=${p}` : '/tickets')}
            linkAs={Link}
            noun="tickets"
            className="border-t border-border"
          />
        </Card>
      )}
    </Page>
  )
}
