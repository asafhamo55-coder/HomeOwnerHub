import Link from 'next/link'
import { ArrowRight, FileEdit } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import type { WizardDraft } from '@/lib/drafts'

const KIND_LABEL: Record<string, string> = {
  eviction_case: 'Eviction case',
  violation: 'Violation report',
  meeting: 'Meeting minutes',
}

const RESUME_PATH: Record<string, string> = {
  eviction_case: '/cases/new',
  violation: '/violations/new',
  meeting: '/meetings/new',
}

interface Props {
  drafts: WizardDraft[]
}

export function UnfinishedWorkflowsCard({ drafts: all }: Props) {
  // wizard_drafts is shared across hubs; only eviction-case drafts can be
  // resumed in this app (the meeting/violation wizards live in HOA Hub, so
  // their links 404'd here).
  const drafts = all.filter((d) => d.kind === 'eviction_case')
  if (drafts.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <FileEdit className="size-4 text-primary" aria-hidden />
          Unfinished workflows
          <Badge size="sm">{drafts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {drafts.map((d) => {
            const percent = Math.round(
              ((d.step_index + (d.current_step === 'done' ? 1 : 0)) / Math.max(1, d.total_steps)) *
                100,
            )
            const path = RESUME_PATH[d.kind] ?? '/'
            return (
              <li key={d.id}>
                <Link
                  href={`${path}?draft=${d.id}`}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 no-underline transition-colors duration-fast hover:bg-subtle"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {KIND_LABEL[d.kind] ?? d.kind}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <div className="h-1 w-24 rounded-full bg-border" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span>{percent}%</span>
                      <span>·</span>
                      <span>{d.current_step.replace(/_/g, ' ')}</span>
                      <span>·</span>
                      <span>
                        last edited {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
