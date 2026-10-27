'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Circle, Printer, RotateCcw } from 'lucide-react'
import { READINESS_QUESTIONS, scoreReadiness } from '@/lib/georgia/readiness'
import { TrackedLink } from '@/components/site/tracked-link'
import { cn } from '@/lib/cn'

// Computed in the browser from component state only. Nothing is saved,
// sent or logged: closing the tab forgets every answer.

type Answers = Record<string, boolean | undefined>

export function ReadinessCheck() {
  const [answers, setAnswers] = useState<Answers>({})
  const [done, setDone] = useState(false)
  const answered = READINESS_QUESTIONS.filter((q) => answers[q.id] !== undefined).length
  const result = useMemo(() => scoreReadiness(answers), [answers])

  if (done) {
    return (
      <div>
        <div className="card p-6 md:p-8">
          <p className="eyebrow">Your result</p>
          <p className="mt-3 text-5xl font-semibold tracking-tight text-foreground" aria-live="polite">
            {result.yes} <span className="text-2xl font-medium text-muted">of {result.total}</span>
          </p>
          <p className="mt-3 text-[17px] leading-relaxed text-foreground-secondary">{result.headline}</p>
          <p className="mt-2 text-sm text-muted">Nothing you entered was saved or sent. This is a self-check, not legal advice.</p>
          <div className="mt-6 flex flex-wrap gap-3 print:hidden">
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden />
              Print this checklist
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setAnswers({})
                setDone(false)
              }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Start over
            </button>
          </div>
        </div>

        <h2 className="t-h3 mt-10 text-foreground">Your checklist</h2>
        <ul className="mt-5 space-y-3">
          {READINESS_QUESTIONS.map((q) => {
            const ok = answers[q.id] === true
            return (
              <li key={q.id} className="flex gap-4 rounded-xl border border-border bg-surface p-4 [break-inside:avoid]">
                {ok ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-label="Done" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-label="To do" />
                )}
                <div>
                  <p className={cn('text-[15px] font-medium leading-snug', ok ? 'text-foreground-secondary' : 'text-foreground')}>{q.question}</p>
                  {!ok && (
                    <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">
                      <strong className="font-semibold text-foreground">To do:</strong> {q.action}{' '}
                      <Link href={`/georgia/${q.guide}`} className="font-semibold text-primary underline-offset-2 hover:underline print:hidden">
                        Read the guide
                      </Link>
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="mt-10 rounded-2xl border border-border bg-subtle/60 p-6 text-center print:hidden">
          <p className="text-lg font-semibold text-foreground">Want help closing the open items?</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-foreground-secondary">We reply within 1 business day.</p>
          <TrackedLink href="/demo" event="demo_cta_click" position="readiness_result" className="btn btn-primary btn-lg group mt-5">
            Book a 20-minute demo
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </TrackedLink>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setDone(true)
        window.scrollTo({ top: 0 })
      }}
    >
      <p className="text-sm text-muted" aria-live="polite">
        {answered} of {READINESS_QUESTIONS.length} answered. Skipped questions count as not yet.
      </p>
      <ol className="mt-5 space-y-5">
        {READINESS_QUESTIONS.map((q, i) => (
          <li key={q.id}>
            <fieldset className="card p-5">
              <legend className="sr-only">Question {i + 1}</legend>
              <p className="text-[16px] font-medium leading-snug text-foreground">
                <span className="mr-2 text-muted">{i + 1}.</span>
                {q.question}
              </p>
              <div className="mt-4 flex gap-3" role="radiogroup" aria-label={q.question}>
                {([
                  [true, 'Yes'],
                  [false, 'No or not sure'],
                ] as const).map(([value, label]) => {
                  const picked = answers[q.id] === value
                  return (
                    <button
                      key={label}
                      type="button"
                      role="radio"
                      aria-checked={picked}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: value }))}
                      className={cn(
                        'min-h-11 rounded-xl border px-5 text-[15px] font-semibold transition-colors',
                        picked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-surface text-foreground-secondary hover:border-border-strong hover:bg-subtle',
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      <button type="submit" className="btn btn-primary btn-lg mt-8 w-full sm:w-auto">
        Show my score and checklist
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </form>
  )
}
