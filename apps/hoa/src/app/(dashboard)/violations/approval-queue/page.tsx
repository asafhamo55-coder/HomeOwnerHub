import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import { Sparkles } from 'lucide-react'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Violation Approval Queue' }

interface PendingRun {
  id: string
  workflow_id: string
  workflow_version: string
  model: string
  confidence: number | null
  created_at: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  citations: string[] | null
}

export default async function ApprovalQueuePage() {
  const org = await getCurrentOrg()
  if (!org) redirect('/onboarding')

  const supabase = await getSupabaseServerClient()

  const { data: runs } = await supabase
    .from('ai_runs' as never)
    .select(
      'id, workflow_id, workflow_version, model, confidence, created_at, input, output, citations',
    )
    .eq('organization_id' as never, org.id)
    .eq('workflow_id' as never, 'W3')
    .eq('status' as never, 'pending_human_approval')
    .order('created_at' as never, { ascending: false })
    .limit(50)

  const pending = (runs ?? []) as PendingRun[]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h1>Violation Approval Queue</h1>
        </div>
        <p className="text-sm text-muted">
          AI-drafted violation notices awaiting board review. Approve, edit,
          or reject each one. Nothing here ships to a homeowner until the
          board says so.
        </p>
      </header>

      {pending.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-4 text-center text-sm text-muted">
              Nothing pending. New AI drafts from the violations wizard land
              here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {pending.map((run) => (
            <PendingRunCard key={run.id} run={run} />
          ))}
        </ul>
      )}
    </div>
  )
}

function PendingRunCard({ run }: { run: PendingRun }) {
  const input = run.input as {
    violationType?: string
    description?: string
    unitId?: string
  }
  const output = run.output as {
    notice?: string
    citedSection?: string | null
    recommendedSeverity?: string
    recommendedFineAmountCents?: number
    recommendedCurePeriodDays?: number
    confidence?: string
  }

  const confidenceLabel =
    typeof output.confidence === 'string' ? output.confidence : 'LOW'
  const confidenceVariant =
    confidenceLabel === 'HIGH'
      ? 'success'
      : confidenceLabel === 'MEDIUM'
        ? 'warning'
        : 'outline'

  const severity = output.recommendedSeverity ?? 'low'

  const fineDollars =
    typeof output.recommendedFineAmountCents === 'number'
      ? `$${(output.recommendedFineAmountCents / 100).toFixed(0)}`
      : '—'

  const cureDays =
    typeof output.recommendedCurePeriodDays === 'number'
      ? `${output.recommendedCurePeriodDays} days`
      : '—'

  const truncatedNotice =
    typeof output.notice === 'string'
      ? output.notice.length > 600
        ? output.notice.slice(0, 600) + '…'
        : output.notice
      : '(no draft text)'

  return (
    <li>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {input.violationType ?? '(no type)'}
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Badge variant={confidenceVariant as 'success' | 'warning' | 'outline'}>
                {confidenceLabel}
              </Badge>
              <Badge variant="outline">{severity}</Badge>
              <Badge variant="outline">{fineDollars}</Badge>
              <Badge variant="outline">{cureDays}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {output.citedSection ? (
            <p className="text-xs text-muted">
              Cited: <span className="font-mono">{output.citedSection}</span>
            </p>
          ) : (
            <p className="text-xs text-amber-700">
              ⚠ No direct CC&R section cited — board should verify rule before sending.
            </p>
          )}

          <p className="whitespace-pre-wrap rounded-md border border-border bg-foreground/20 p-3 text-sm">
            {truncatedNotice}
          </p>

          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              Draft ID {run.id.slice(0, 8)} · v{run.workflow_version} ·{' '}
              {new Date(run.created_at).toLocaleString()}
            </span>
            <Link
              href={`/violations/approval-queue/${run.id}`}
              className="font-medium text-primary hover:underline"
            >
              Review →
            </Link>
          </div>
        </CardContent>
      </Card>
    </li>
  )
}
