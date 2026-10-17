import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, ListChecks, Plus, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  KeyValue,
  KeyValueList,
  LoadFailed,
  Page,
  Pager,
  StatusBadge,
  StatusPill,
  Tabs,
  pageRange,
  parsePageParam,
  type StatusTone,
} from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { VIOLATION_SEVERITY } from '@/lib/status/community'
import { violationTabs } from '../tabs'
import { StateRulesOutputSchema } from '@homeowner-portal/workflows/W3-state-rules'
import { StateRulesPanel } from '@/components/violations/StateRulesPanel'
import { ApprovalActions } from '@/components/approvals/ApprovalActions'

export const metadata = { title: 'Violation Approval Queue' }
export const dynamic = 'force-dynamic'

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

// Was a silent `.limit(50)`. Same page size, now paged.
const PAGE_SIZE = 50

const CONFIDENCE_TONE: Record<string, StatusTone> = { HIGH: 'success', MEDIUM: 'warning', LOW: 'neutral' }

export default async function ApprovalQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const org = await getCurrentOrg()
  if (!org) redirect('/onboarding')

  const page = parsePageParam((await searchParams).page)
  const { from, to } = pageRange(page, PAGE_SIZE)
  const supabase = await getSupabaseServerClient()

  const result = await loadOrFail(
    'the approval queue',
    supabase
      .from('ai_runs' as never)
      .select('id, workflow_id, workflow_version, model, confidence, created_at, input, output, citations', {
        count: 'exact',
      })
      .eq('organization_id' as never, org.id)
      .eq('workflow_id' as never, 'W3')
      .eq('status' as never, 'pending_human_approval')
      .order('created_at' as never, { ascending: false })
      .range(from, to),
  )

  const pending = result.ok ? ((result.data ?? []) as PendingRun[]) : []
  const total = result.ok ? (result.count ?? pending.length) : 0

  return (
    <Page
      title="Violations"
      width="wide"
      description="AI-drafted violation notices awaiting board review. Approving files the letter as an open violation; nothing is sent to the homeowner from here."
      linkAs={Link}
      actions={
        <Button asChild variant="secondary" icon={<ListChecks aria-hidden />}>
          <Link href="/approvals?type=w3">All approvals</Link>
        </Button>
      }
      tabs={<Tabs items={violationTabs('/violations/approval-queue')} aria-label="Violation sections" linkAs={Link} />}
    >
      {!result.ok ? (
        <LoadFailed what="the approval queue" />
      ) : pending.length === 0 && total === 0 ? (
        <EmptyState
          icon={<Sparkles aria-hidden />}
          title="Nothing waiting for approval"
          description="Drafts from Covenant Brain land here until the board reviews them."
          action={
            <Button asChild icon={<Plus aria-hidden />}>
              <Link href="/violations/new">Draft a violation</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            <span className="num font-medium text-foreground">{total}</span> draft{total === 1 ? '' : 's'} pending review
          </p>
          <ul className="space-y-4">
            {pending.map((run) => (
              <PendingRunCard key={run.id} run={run} />
            ))}
          </ul>
          {total > PAGE_SIZE || page > 1 ? (
            <Card>
              <Pager
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                rowCount={pending.length}
                hrefFor={(p) => (p > 1 ? `/violations/approval-queue?page=${p}` : '/violations/approval-queue')}
                linkAs={Link}
                noun="drafts"
              />
            </Card>
          ) : null}
        </div>
      )}
    </Page>
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

  // BL-019: drafts from W3 >= 1.1.0 carry the state rule set they were
  // written under, with only the statute quotes that passed validation.
  const stateRules = StateRulesOutputSchema.safeParse((run.output as { stateRules?: unknown }).stateRules)

  const violationLabel = input.violationType ?? 'Untyped violation'
  const confidenceLabel = typeof output.confidence === 'string' ? output.confidence.toUpperCase() : 'LOW'
  const severity = output.recommendedSeverity ?? 'low'
  const fineDollars =
    typeof output.recommendedFineAmountCents === 'number'
      ? `$${(output.recommendedFineAmountCents / 100).toFixed(0)}/day`
      : null
  const cureDays =
    typeof output.recommendedCurePeriodDays === 'number' ? `${output.recommendedCurePeriodDays} days` : null
  const notice =
    typeof output.notice === 'string'
      ? output.notice.length > 600
        ? output.notice.slice(0, 600) + '…'
        : output.notice
      : null

  return (
    <li>
      <Card>
        <CardHeader
          actions={
            <StatusPill
              tone={CONFIDENCE_TONE[confidenceLabel] ?? 'neutral'}
              label={`${confidenceLabel.charAt(0)}${confidenceLabel.slice(1).toLowerCase()} confidence`}
            />
          }
        >
          <CardTitle as="h2" className="capitalize">
            {violationLabel}
          </CardTitle>
          <p className="text-xs text-muted">
            Drafted <time dateTime={run.created_at}>{format(new Date(run.created_at), 'PPp')}</time> · Draft{' '}
            {run.id.slice(0, 8)} · v{run.workflow_version}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <KeyValueList className="sm:grid-cols-4">
            <KeyValue
              label="Severity"
              value={<StatusBadge status={severity} tones={VIOLATION_SEVERITY.tones} labels={VIOLATION_SEVERITY.labels} />}
            />
            <KeyValue label="Daily fine" value={fineDollars ? <span className="num">{fineDollars}</span> : null} />
            <KeyValue label="Cure period" value={cureDays} />
            <KeyValue
              label="CC&R cited"
              value={output.citedSection ? <Badge variant="neutral">{output.citedSection}</Badge> : null}
            />
          </KeyValueList>

          {output.citedSection ? null : (
            <Alert variant="warning" title="No CC&R section cited">
              Verify the rule before this notice is sent.
            </Alert>
          )}

          {stateRules.success ? (
            <StateRulesPanel
              variant="inset"
              title={stateRules.data.title}
              citation={stateRules.data.citation}
              sourceUrl={stateRules.data.sourceUrl}
              textVerified={stateRules.data.textVerified}
              jurisdiction={stateRules.data.jurisdiction}
              summary={stateRules.data.summary}
              quotes={stateRules.data.quotes}
              warnings={stateRules.data.warnings}
            />
          ) : null}

          {notice ? (
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-subtle p-4 text-sm leading-relaxed text-foreground">
              {notice}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <AlertTriangle className="size-4" aria-hidden /> No draft text was produced.
            </p>
          )}
        </CardContent>
        {/* BL-057: decide here, through the same control as /approvals
            — the W3 draft actions in lib/violations.ts. */}
        <CardFooter className="justify-end">
          <ApprovalActions
            decision={{ kind: 'w3', runId: run.id }}
            title={`${violationLabel} · Draft ${run.id.slice(0, 8)}`}
            amountLabel={null}
            href="/violations/approval-queue"
          />
        </CardFooter>
      </Card>
    </li>
  )
}
