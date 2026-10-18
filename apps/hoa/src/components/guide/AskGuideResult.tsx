import Link from 'next/link'
import { ArrowRight, BookOpen } from 'lucide-react'
import { Alert, Button, cn } from '@homeowner-portal/ui'
import type { AskResult } from '@/lib/guide/ask'
import type { AskSuggestion } from '@/lib/guide/ask-core'
import { answerBlocks, type AnswerPiece } from '@/lib/guide/answer-text'
import { UiChip } from './GuideContent'

// The four "Ask the guide" outcomes (spec §6.3), rendered from the route's
// validated response. Props only — no fetching, no state — so it renders on
// the server in tests and previews exactly as it does in the client.

export const ASK_FOOTER = 'Answers come only from the HomeownerHub guide. For your community’s rules, use Ask the Docs.'

export interface AskGuideResultProps {
  result: AskResult
  /** Called when a link inside the result is followed (the drawer closes itself). */
  onNavigate?: () => void
  /** Called when "Take me there" is followed, with the cited article. */
  onTakeMeThere?: (articleId: string) => void
  /** Smaller type for the drawer. */
  compact?: boolean
}

function Pieces({ pieces }: { pieces: AnswerPiece[] }) {
  return (
    <>
      {pieces.map((p, i) =>
        p.t === 'text' ? (
          <span key={i}>{p.v}</span>
        ) : p.t === 'ui' ? (
          <UiChip key={i} label={p.label} />
        ) : (
          <sup key={i} className="num ml-0.5 text-[0.7em] font-semibold text-primary">
            <span className="sr-only">source </span>
            {p.n}
          </sup>
        ),
      )}
    </>
  )
}

function Suggestions({ items, onNavigate, label }: { items: AskSuggestion[]; onNavigate?: () => void; label: string }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {items.map((s) => (
          <li key={s.articleId}>
            <Link
              href={s.href}
              onClick={onNavigate}
              className="block px-3 py-2.5 no-underline transition-colors duration-fast hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="block text-sm font-medium text-foreground">{s.title}</span>
              <span className="block text-xs text-muted">{s.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AskGuideResult({ result, onNavigate, onTakeMeThere, compact = false }: AskGuideResultProps) {
  const text = compact ? 'text-sm' : 'text-base'

  if (result.kind === 'answer') {
    const take = result.takeMeThere
    return (
      <div className="space-y-4" data-ask-state="answer">
        <div className={cn('space-y-3 text-foreground', text)}>
          {answerBlocks(result.answer).map((b, i) =>
            b.t === 'p' ? (
              <p key={i}>
                <Pieces pieces={b.pieces} />
              </p>
            ) : (
              <ol key={i} className="list-decimal space-y-1.5 pl-5 marker:text-muted">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Pieces pieces={item} />
                  </li>
                ))}
              </ol>
            ),
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">From the guide</p>
          <ul className="flex flex-wrap gap-2">
            {result.citations.map((c, i) => (
              <li key={`${c.articleId}-${c.href}`} className="min-w-0 max-w-full">
                <Link
                  href={c.href}
                  onClick={onNavigate}
                  className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground no-underline transition-colors duration-fast hover:border-border-strong hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="num shrink-0 text-primary">{i + 1}</span>
                  <BookOpen className="size-3.5 shrink-0 text-muted" aria-hidden />
                  <span className="truncate">
                    {c.title}
                    <span className="text-muted"> · {c.sectionHeading}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {take ? (
          <Button asChild size={compact ? 'md' : 'lg'} className="w-full sm:w-auto">
            <Link
              href={take.href}
              onClick={() => {
                onTakeMeThere?.(result.citations[0]?.articleId ?? '')
                onNavigate?.()
              }}
              className="no-underline"
            >
              Take me there
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        ) : null}
        <p className="text-xs text-muted">{ASK_FOOTER}</p>
      </div>
    )
  }

  if (result.kind === 'rules_question') {
    return (
      <div className="space-y-3" data-ask-state="rules_question">
        <Alert variant="info" title="That’s a question for your community’s rules">
          The guide explains how to use HomeownerHub. What your CC&amp;Rs, bylaws or rules allow is answered by Ask the Docs, from your own
          governing documents.
        </Alert>
        <Button asChild variant="secondary" className="w-full sm:w-auto">
          <Link href={result.askDocsHref} onClick={onNavigate} className="no-underline">
            Ask the Docs
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </div>
    )
  }

  if (result.kind === 'not_covered') {
    return (
      <div className="space-y-3" data-ask-state="not_covered">
        <Alert variant="info" title="The guide doesn’t cover that yet">
          {result.suggestions.length > 0 ? 'Here are the closest articles. ' : ''}
          It may be something HomeownerHub can’t do yet. For a question about your community’s rules, use Ask the Docs.
        </Alert>
        <Suggestions items={result.suggestions} onNavigate={onNavigate} label="Closest articles" />
      </div>
    )
  }

  return (
    <div className="space-y-3" data-ask-state="unavailable">
      <Alert variant="warning" title="Ask the guide isn’t available right now">
        {result.suggestions.length > 0 ? 'These articles match your question.' : 'Try searching the guide instead.'}
      </Alert>
      <Suggestions items={result.suggestions} onNavigate={onNavigate} label="Matching articles" />
    </div>
  )
}
