'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowUp, ChevronRight, MessageSquareText, RotateCcw, Sparkles } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  Field,
  Skeleton,
  StatusPill,
  Textarea,
} from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import {
  CONFIDENCE_LABELS,
  CONFIDENCE_TONES,
  type AnswerConfidence,
} from '@/lib/status/knowledge'

/**
 * Shared chat-style pieces for the two Ask pages (Ask the Docs, Ask state
 * law). Presentational only — each page owns its own request and state.
 * The AI accent (amber) marks AI affordances only: the avatar, the
 * thinking state, the "AI answer" label. Everything else is neutral.
 */

/** The small amber tile that marks something as AI-generated. */
export function AiMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={
        size === 'sm'
          ? 'flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent-fg [&_svg]:size-3.5'
          : 'flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent-fg [&_svg]:size-4'
      }
    >
      <Sparkles />
    </span>
  )
}

export function AskComposer({
  value,
  onChange,
  onSubmit,
  pending,
  placeholder,
  rewriteContext,
  label = 'Your question',
}: {
  value: string
  onChange: (next: string) => void
  onSubmit: () => void
  pending: boolean
  placeholder: string
  rewriteContext: string
  label?: string
}) {
  const tooShort = value.trim().length < 3
  return (
    <Card className="transition-shadow focus-within:border-border-strong focus-within:shadow-md">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!tooShort && !pending) onSubmit()
        }}
      >
        <CardContent className="space-y-3 p-4 sm:p-5">
          <Field label={label} hideLabel>
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                // ⌘/Ctrl + Enter asks; plain Enter keeps a newline.
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  if (!tooShort && !pending) onSubmit()
                }
              }}
              placeholder={placeholder}
              rows={3}
              disabled={pending}
              className="resize-none border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <AiRewriteButton value={value} onChange={onChange} context={rewriteContext} disabled={pending} />
              <span className="hidden text-xs text-muted sm:inline">⌘ + Enter to ask</span>
            </div>
            <Button type="submit" loading={pending} disabled={tooShort} icon={<ArrowUp aria-hidden />}>
              {pending ? 'Thinking…' : 'Ask'}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  )
}

export function SuggestedQuestions({
  questions,
  onPick,
  disabled,
}: {
  questions: string[]
  onPick: (q: string) => void
  disabled?: boolean
}) {
  if (questions.length === 0) return null
  return (
    <section aria-labelledby="suggested-heading" className="space-y-2">
      <h2 id="suggested-heading" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        Try asking
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {questions.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              disabled={disabled}
              className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm text-foreground transition-colors duration-fast hover:border-border-strong hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <MessageSquareText className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">{q}</span>
              <ChevronRight
                className="size-4 shrink-0 text-muted transition-transform duration-fast group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Thinking({ what }: { what: string }) {
  return (
    <Card aria-live="polite" aria-busy="true">
      <CardContent className="flex gap-3 p-5">
        <AiMark />
        <div className="min-w-0 flex-1 space-y-2.5 pt-1">
          <p className="text-sm font-medium text-foreground">{what}</p>
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      </CardContent>
    </Card>
  )
}

export function AskError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert
      variant="error"
      title="Couldn’t get an answer"
      actions={
        onRetry ? (
          <Button size="sm" variant="secondary" icon={<RotateCcw aria-hidden />} onClick={onRetry}>
            Try again
          </Button>
        ) : null
      }
    >
      <p>{message}</p>
      <p className="mt-1">Nothing was saved. Your question is still in the box above.</p>
    </Alert>
  )
}

export interface AnswerCitation {
  key: string
  /** Short reference, e.g. "§ 720.303" or "Bylaws". */
  label: string
  /** Section title or excerpt heading. */
  title: string
  href?: string
}

export function AnswerCard({
  question,
  answer,
  confidence,
  meta,
  citations,
  citationsLabel = 'Sources',
  footer,
  children,
}: {
  question: string
  answer: string
  confidence?: AnswerConfidence
  /** Extra pill(s) next to the confidence (e.g. "2 data lookups"). */
  meta?: React.ReactNode
  citations?: AnswerCitation[]
  citationsLabel?: string
  footer?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <article aria-live="polite" className="space-y-3">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-subtle px-4 py-2.5 text-sm text-foreground">
          <span className="sr-only">You asked: </span>
          {question}
        </p>
      </div>
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <AiMark size="sm" />
            <h2 className="text-sm font-semibold text-foreground">AI answer</h2>
            {confidence ? (
              <StatusPill tone={CONFIDENCE_TONES[confidence]} label={CONFIDENCE_LABELS[confidence]} />
            ) : null}
            {meta}
          </div>
          <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">{answer}</p>

          {citations && citations.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                {citationsLabel} ({citations.length})
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {citations.map((c) => (
                  <li key={c.key}>
                    <CitationCard citation={c} />
                  </li>
                ))}
              </ul>
            </div>
          ) : citations ? (
            <p className="text-sm text-muted">No source sections were cited for this answer.</p>
          ) : null}

          {children}
        </CardContent>
        {footer ? <div className="border-t border-border px-5 py-3 text-xs text-muted">{footer}</div> : null}
      </Card>
    </article>
  )
}

function CitationCard({ citation }: { citation: AnswerCitation }) {
  const body = (
    <>
      <span className="num block text-xs font-semibold text-primary">{citation.label}</span>
      <span className="mt-0.5 line-clamp-2 block text-sm text-foreground">{citation.title}</span>
    </>
  )
  const cls =
    'block h-full rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors duration-fast'
  return citation.href ? (
    <Link
      href={citation.href}
      className={`${cls} hover:border-border-strong hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
