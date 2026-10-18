import Link from 'next/link'
import { ArrowRight, BookOpen, X } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { BOARD_FIRST_WEEK_STEPS, RESIDENT_FIRST_WEEK_STEPS, type FirstWeekStep } from '@/lib/guide/first-week'

const COPY = {
  board: {
    title: 'Your first week on the board',
    description: 'What boards do most weeks. Each step opens a short guide with the exact steps.',
    steps: BOARD_FIRST_WEEK_STEPS,
  },
  resident: {
    title: 'New here? Things you can do',
    description: 'A few things to try first. Each one has a short guide if you get stuck.',
    steps: RESIDENT_FIRST_WEEK_STEPS,
  },
} as const

/**
 * The "Your first week" card (user-guide spec §6.4). Presentational only:
 * whether it shows, and remembering a dismiss, is FirstWeekGate's job.
 * Each step is one link plus a smaller sibling link (never nested), the
 * same shape as the setup checklist. Its own `.cq`, so the step grid follows
 * the card's real width (a docked Copilot narrows it), not the viewport.
 */
export function FirstWeekCard({ variant, onDismiss }: { variant: 'board' | 'resident'; onDismiss?: () => void }) {
  const copy = COPY[variant]
  return (
    <section aria-labelledby="first-week-heading" className="cq">
      <Card>
        <CardHeader
          actions={
            onDismiss ? (
              <Button type="button" size="sm" variant="ghost" icon={<X />} onClick={onDismiss} aria-label={`Dismiss: ${copy.title}`}>
                Dismiss
              </Button>
            ) : null
          }
        >
          <CardTitle as="h2" id="first-week-heading">
            {copy.title}
          </CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className={variant === 'board' ? 'grid gap-2 cq-md:grid-cols-2 cq-lg:grid-cols-3' : 'grid gap-2 cq-md:grid-cols-2'}>
            {copy.steps.map((step, i) => (
              <li key={step.key} className="min-w-0">
                <StepRow step={step} index={i} variant={variant} />
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  )
}

function StepRow({ step, index, variant }: { step: FirstWeekStep; index: number; variant: 'board' | 'resident' }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border transition-colors duration-fast hover:border-border-strong">
      <Link
        href={step.href}
        className="group flex flex-1 items-start gap-3 rounded-t-lg p-3 no-underline hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden
          className="num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-xs font-semibold text-muted"
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground group-hover:underline">{step.title}</span>
          <span className="block text-xs text-muted">{step.description}</span>
        </span>
        {variant === 'board' ? (
          <BookOpen className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        ) : (
          <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        )}
      </Link>
      <Link
        href={step.secondary.href}
        aria-label={`${step.secondary.label}: ${step.title}`}
        className="inline-flex min-h-10 items-center gap-1 self-start rounded-md px-3 pb-2 pl-12 text-xs font-medium text-primary no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
      >
        {step.secondary.label}
        <ArrowRight className="size-3" aria-hidden />
      </Link>
    </div>
  )
}
