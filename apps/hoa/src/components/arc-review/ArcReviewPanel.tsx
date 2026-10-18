import { Sparkles } from 'lucide-react'
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'
import {
  SUGGESTION_LABEL,
  SUGGESTION_TONE,
  canRunReview,
  decisionLetters,
  type ArcReviewOutput,
  type ArcReviewView,
} from '@/lib/arc-review/model'
import { ArcOpenQuestions, ArcRuleList } from './ArcRuleList'
import { ArcPhotoFindings, type ArcPhotoLink } from './ArcPhotoFindings'
import { ArcReviewActions } from './ArcReviewActions'
import { RunArcReviewButton } from './RunArcReviewButton'

// BL-027 — the AI review card on /arc/[id]. Shows the W37 draft (cited
// rules, suggested decision, reasoning, conditions) and, when the resident
// ran one, what their pre-check showed them (BL-024). BL-079 adds what the
// AI read from the attached photos, and the decision dialogs open on a full
// letter. Decides nothing: the buttons call the existing ARC actions.

export type ArcReviewPanelLoad =
  | { ok: true; review: ArcReviewView | null; precheck: ArcReviewOutput | null }
  | { ok: false }

export interface ArcReviewPanelProps {
  arcId: string
  title: string
  arcStatus: string
  load: ArcReviewPanelLoad
  /** Signs the decision letters. */
  associationName?: string | null
  /** The application's attachments by id, to name and link each photo finding. */
  photos?: Record<string, ArcPhotoLink>
  /** The photos the review would read now differ from the ones it read. */
  photosChanged?: boolean
}

export function ArcReviewPanel(props: ArcReviewPanelProps) {
  const { load } = props
  return (
    <Card>
      <CardHeader
        actions={
          load.ok && load.review?.output?.suggestion ? (
            <StatusPill
              tone={SUGGESTION_TONE[load.review.output.suggestion.decision]}
              label={`Suggests: ${SUGGESTION_LABEL[load.review.output.suggestion.decision]}`}
            />
          ) : undefined
        }
      >
        <CardTitle as="h2" className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent-fg" aria-hidden />
          AI review
        </CardTitle>
        <CardDescription>A cited suggestion from your governing documents. The board decides.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <PanelBody {...props} />
      </CardContent>
    </Card>
  )
}

function PanelBody({ arcId, title, arcStatus, load, associationName = null, photos, photosChanged = false }: ArcReviewPanelProps) {
  if (!load.ok) {
    return <Alert variant="warning" title="Couldn’t load the AI review">The application below loaded normally. Reload to try again.</Alert>
  }
  const { review, precheck } = load
  const canRun = canRunReview(review, arcStatus, { photosChanged })

  if (!review) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-foreground-secondary">No AI review has run for this application yet.</p>
        {canRun ? <RunArcReviewButton arcId={arcId} label="Run AI review" /> : null}
        <PrecheckDetails precheck={precheck} />
      </div>
    )
  }

  if (review.state === 'failed' || !review.output) {
    return (
      <div className="space-y-3">
        <Alert variant="warning" title="The AI review couldn’t run">Nothing was decided. You can run it again, or decide without it.</Alert>
        {canRun ? <RunArcReviewButton arcId={arcId} label="Run AI review again" /> : null}
      </div>
    )
  }

  const out = review.output
  const s = out.suggestion
  const pending = review.state === 'pending'
  return (
    <div className="space-y-5">
      {pending && photosChanged && canRun ? (
        <Alert variant="info" title="The photos changed since this review ran">
          <div className="space-y-3">
            <p>Photos were added or removed after the AI looked. Run it again to include them — this replaces the waiting review.</p>
            <RunArcReviewButton arcId={arcId} label="Run again with the current photos" />
          </div>
        </Alert>
      ) : null}

      <p className="text-sm leading-relaxed text-foreground">{out.summary}</p>

      {s ? (
        <section aria-labelledby={`arc-ai-why-${arcId}`} className="space-y-2 rounded-lg border border-accent/30 bg-accent-subtle p-3">
          <h3 id={`arc-ai-why-${arcId}`} className="text-xs font-medium uppercase tracking-wide text-accent-fg">
            Why: {SUGGESTION_LABEL[s.decision]}
          </h3>
          <p className="text-sm leading-relaxed text-foreground">{s.reasoning}</p>
          {s.conditions.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground-secondary">Suggested conditions</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
                {s.conditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      ) : null}

      {out.warnings.map((w) => (
        <Alert key={w} variant="warning">
          {w}
        </Alert>
      ))}

      <ArcRuleList rules={out.rules} headingId={`arc-ai-rules-${arcId}`} heading="Rules that apply" />
      <ArcPhotoFindings findings={out.photoFindings} photos={photos} headingId={`arc-ai-photos-${arcId}`} />
      <ArcOpenQuestions
        missingInfo={out.missingInfo}
        questions={out.questions}
        headingId={`arc-ai-questions-${arcId}`}
        heading="Still to find out"
      />
      <PrecheckDetails precheck={precheck} />

      <p className="text-xs text-muted">{out.disclaimer}</p>

      {pending ? (
        <div className="border-t border-border pt-4">
          <ArcReviewActions
            arcId={arcId}
            title={title}
            suggestion={s?.decision ?? null}
            drafts={decisionLetters(out, { associationName, title })}
          />
        </div>
      ) : (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm text-foreground-secondary">{review.humanFeedback ?? 'The board has acted on this review.'}</p>
          {canRun ? <RunArcReviewButton arcId={arcId} label="Run a fresh review" /> : null}
        </div>
      )}
    </div>
  )
}

function PrecheckDetails({ precheck }: { precheck: ArcReviewOutput | null }) {
  if (!precheck) return null
  return (
    <details className="rounded-lg bg-subtle px-3.5 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-foreground">What the resident saw before submitting</summary>
      <div className="mt-3 space-y-3 pb-1">
        <p className="leading-relaxed text-foreground">{precheck.summary}</p>
        <ArcRuleList rules={precheck.rules} headingId="arc-precheck-rules" heading="Rules shown to the resident" />
        <ArcOpenQuestions
          missingInfo={precheck.missingInfo}
          questions={precheck.questions}
          headingId="arc-precheck-questions"
          heading="Questions shown to the resident"
        />
      </div>
    </details>
  )
}
