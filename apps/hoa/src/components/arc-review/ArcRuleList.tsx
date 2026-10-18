import { Badge, StatusPill } from '@homeowner-portal/ui'
import { MISSING_INFO_LABEL, citationLabel, type ArcMissingInfo, type ArcRule } from '@/lib/arc-review/model'

// BL-024 / BL-027 — the cited rules and open questions, shared by the
// resident pre-check and the board's AI review card. Presentational only.

const RULE_STATUS: Record<ArcRule['status'], { tone: 'success' | 'warning' | 'neutral'; label: string }> = {
  fits: { tone: 'success', label: 'Looks consistent' },
  possible_conflict: { tone: 'warning', label: 'Possible conflict' },
  unclear: { tone: 'neutral', label: 'Needs detail' },
}

export function ArcRuleList({ rules, headingId, heading }: { rules: ArcRule[]; headingId: string; heading: string }) {
  if (rules.length === 0) return null
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-xs font-medium uppercase tracking-wide text-muted">
        {heading}
      </h3>
      <ul className="space-y-2">
        {rules.map((r) => (
          <li key={r.chunkId} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="neutral">{citationLabel(r)}</Badge>
              <StatusPill tone={RULE_STATUS[r.status].tone} label={RULE_STATUS[r.status].label} />
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground">{r.point}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ArcOpenQuestions({
  missingInfo,
  questions,
  headingId,
  heading,
}: {
  missingInfo: ArcMissingInfo[]
  questions: string[]
  headingId: string
  heading: string
}) {
  if (missingInfo.length === 0 && questions.length === 0) return null
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-xs font-medium uppercase tracking-wide text-muted">
        {heading}
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground">
        {missingInfo.map((m) => (
          <li key={m}>{MISSING_INFO_LABEL[m]}</li>
        ))}
        {questions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
    </section>
  )
}
