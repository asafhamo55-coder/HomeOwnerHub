import { Info, SearchX, Sparkles } from 'lucide-react'
import { Alert } from '@homeowner-portal/ui'
import { ArcOpenQuestions, ArcRuleList } from '@/components/arc-review/ArcRuleList'
import type { ArcMissingInfo, ArcRule } from '@/lib/arc-review/model'

// BL-024 — what "Check my request against the rules" shows the resident.
// Advisory only: relevant rules with citations, possible conflicts, what the
// board will probably ask about, and that only the board decides. Never a
// verdict (the workflow strips one), and a plain "couldn't find rules"
// when nothing clearly applies.

export interface ArcPrecheckResponse {
  status: 'answered' | 'no_rules'
  summary: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  rules: ArcRule[]
  questions: string[]
  missingInfo: ArcMissingInfo[]
  disclaimer: string
  runId: string
}

export function ArcPrecheckResult({ result }: { result: ArcPrecheckResponse }) {
  const conflicts = result.rules.filter((r) => r.status === 'possible_conflict').length
  return (
    <section aria-labelledby="arc-precheck-heading" aria-live="polite" className="space-y-4 rounded-xl border border-accent/30 bg-accent-subtle/40 p-4">
      <h2 id="arc-precheck-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {result.status === 'answered' ? (
          <Sparkles className="size-4 text-accent-fg" aria-hidden />
        ) : (
          <SearchX className="size-4 text-muted" aria-hidden />
        )}
        {result.status === 'answered' ? 'What your community’s rules say' : 'No clear rules found'}
      </h2>

      <p className="text-sm leading-relaxed text-foreground">{result.summary}</p>

      {conflicts > 0 ? (
        <Alert variant="warning" title={conflicts === 1 ? 'One rule may conflict' : `${conflicts} rules may conflict`}>
          Look at the rules marked “Possible conflict” below. You can change your request, or explain in the description why it fits.
        </Alert>
      ) : null}

      <ArcRuleList rules={result.rules} headingId="arc-precheck-rules" heading="Rules that likely apply" />
      <ArcOpenQuestions
        missingInfo={result.missingInfo}
        questions={result.questions}
        headingId="arc-precheck-asks"
        heading="The board will probably ask about"
      />

      <p className="flex items-start gap-1.5 border-t border-border pt-3 text-xs text-foreground-secondary">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{result.disclaimer} You can submit your application whatever this check says.</span>
      </p>
    </section>
  )
}
