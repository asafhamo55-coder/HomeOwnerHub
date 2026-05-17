import Link from 'next/link'
import { FileSpreadsheet, Plus, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button, Card, EmptyState, StatusBadge } from '@homeowner-portal/ui'
import { listRfps, type RfpStatus } from '@/lib/rfps'

export const metadata = { title: 'RFPs' }

const RFP_STATUS_TONES: Record<RfpStatus, 'neutral' | 'success' | 'warning' | 'destructive'> = {
  draft: 'neutral',
  open: 'success',
  evaluation: 'warning',
  awarded: 'success',
  cancelled: 'destructive',
}

const RFP_STATUS_LABELS: Record<RfpStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  evaluation: 'In evaluation',
  awarded: 'Awarded',
  cancelled: 'Cancelled',
}

export default async function RfpsListPage() {
  const rfps = await listRfps()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>RFPs</h1>
          <p className="text-sm text-muted">
            Requests for proposal. Describe the need; the RFP Composer
            workflow drafts a structured document, you edit and publish.
          </p>
        </div>
        <Button asChild>
          <Link href="/rfps/new">
            <Plus className="h-4 w-4" />
            New RFP
          </Link>
        </Button>
      </header>

      {rfps.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet className="h-10 w-10" aria-hidden />}
          title="No RFPs yet"
          description="Describe what your association needs to procure. The Composer drafts a scoped RFP that you can edit and send to vendors."
          action={
            <Button asChild>
              <Link href="/rfps/new">
                <Plus className="h-4 w-4" />
                Draft first RFP
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rfps.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/rfps/${r.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-background/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{r.title}</p>
                    <p className="text-xs text-muted">
                      <span className="font-mono">{r.rfp_number}</span>
                      {' · deadline '}
                      {format(new Date(r.submission_deadline), 'PP')}
                      {r.budget_min || r.budget_max ? (
                        <>
                          {' · '}
                          {formatBudget(r.budget_min, r.budget_max)}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {r.ai_generated ? (
                      <Badge variant="ai" size="sm">
                        <Sparkles className="mr-1 h-3 w-3" />
                        AI draft
                      </Badge>
                    ) : null}
                    <StatusBadge
                      status={r.status}
                      tones={RFP_STATUS_TONES}
                      labels={RFP_STATUS_LABELS}
                    />
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

function formatBudget(min: number | null, max: number | null): string {
  if (min && max) return `$${min.toLocaleString()}–$${max.toLocaleString()}`
  if (max) return `up to $${max.toLocaleString()}`
  if (min) return `from $${min.toLocaleString()}`
  return ''
}
