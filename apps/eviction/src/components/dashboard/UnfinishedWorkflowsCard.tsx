import Link from 'next/link'
import { ArrowRight, FileEdit } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
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

export function UnfinishedWorkflowsCard({ drafts }: Props) {
  if (drafts.length === 0) return null

  return (
    <Card variant="elevated">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileEdit className="h-4 w-4 text-primary" />
          Unfinished workflows
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {drafts.length}
          </span>
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
                  className="flex items-center gap-3 py-3 transition-colors hover:bg-background/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-muted">
                      {KIND_LABEL[d.kind] ?? d.kind}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-fg">
                      <div className="h-1 w-24 rounded-full bg-border">
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
                  <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-fg" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
