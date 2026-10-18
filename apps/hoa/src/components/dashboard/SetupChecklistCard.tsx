import Link from 'next/link'
import { ArrowRight, Check, HelpCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@homeowner-portal/ui'
import type { SetupChecklist, SetupChecklistStep } from '@/lib/dashboard/setup-checklist'
import { guideHref } from '@/lib/guide'
import { HowLink } from '@/components/guide/HowLink'
import { DismissSetupButton } from './DismissSetupButton'

/**
 * First-run checklist (BL-008). Six steps, each derived from data, each a
 * deep link. A step whose read failed says "Couldn't check" — it is never
 * shown as done. Only a complete checklist offers Dismiss.
 *
 * Its own `.cq` container, so the step grid follows the card's real width
 * (a docked Copilot narrows it) rather than the viewport.
 */
export function SetupChecklistCard({ checklist }: { checklist: SetupChecklist }) {
  const { steps, doneCount, total, percent, complete, unknownCount } = checklist

  return (
    <section aria-labelledby="setup-heading" className="cq">
      <Card>
        <CardHeader
          actions={
            complete ? (
              <DismissSetupButton />
            ) : (
              <span className="num whitespace-nowrap text-sm text-muted">
                {doneCount} of {total} done
              </span>
            )
          }
        >
          <CardTitle as="h2" id="setup-heading">
            {complete ? 'Your HOA is set up' : 'Get your HOA set up'}
          </CardTitle>
          <CardDescription>
            {complete
              ? 'Every step is done. You can hide this card.'
              : unknownCount > 0
                ? `We couldn’t check ${unknownCount === 1 ? 'one step' : `${unknownCount} steps`} just now — open ${unknownCount === 1 ? 'it' : 'them'} to see where things stand.`
                : 'A few steps and the board has everything in one place.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-subtle"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Setup progress: ${doneCount} of ${total} steps done`}
          >
            <div className="h-full rounded-full bg-success-solid" style={{ width: `${percent}%` }} />
          </div>
          <ol className="grid gap-2 cq-md:grid-cols-2 cq-lg:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.key} className="min-w-0">
                <StepItem step={step} index={i} />
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  )
}

/**
 * One step: the step itself is one link (to the page that does it), and a
 * separate small "How?" link opens the guide article in the help drawer
 * (BL-070). Two sibling links, never one nested in the other. Completion
 * still comes from data only.
 */
function StepItem({ step, index }: { step: SetupChecklistStep; index: number }) {
  // A second way to do the step (the properties import) is a third sibling
  // link, set in room the step leaves for it at the bottom.
  const secondary = step.state === 'todo' ? step.secondary : undefined
  return (
    <div className="relative h-full">
      <StepLink step={step} index={index} roomBelow={Boolean(secondary)} />
      <HowLink articleId={step.guide} href={guideHref(step.guide)} label={step.title} className="absolute right-2 top-2" />
      {secondary ? (
        <Link
          href={secondary.href}
          className="absolute bottom-0.5 left-12 inline-flex min-h-10 items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:bottom-2 sm:min-h-0"
        >
          {secondary.label}
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      ) : null}
    </div>
  )
}

function StepLink({ step, index, roomBelow = false }: { step: SetupChecklistStep; index: number; roomBelow?: boolean }) {
  const done = step.state === 'done'
  const unknown = step.state === 'unknown'

  return (
    <Link
      href={step.href}
      className={cn(
        'group flex h-full items-start gap-3 rounded-lg border border-border p-3 pr-16 transition-colors duration-fast hover:border-border-strong hover:bg-subtle',
        roomBelow && 'pb-11 sm:pb-8',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          done
            ? 'bg-success-solid text-on-solid'
            : unknown
              ? 'bg-warning-subtle text-warning'
              : 'border border-border-strong text-muted',
        )}
      >
        {done ? <Check className="size-3.5" /> : unknown ? <HelpCircle className="size-3.5" /> : index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-medium', done ? 'text-muted' : 'text-foreground')}>
          {step.title}
          <span className="sr-only">{done ? ' — done' : unknown ? ' — couldn’t check' : ' — not done yet'}</span>
        </span>
        {done ? (
          <span className="block text-xs text-muted">Done</span>
        ) : unknown ? (
          <span className="block text-xs text-warning">Couldn’t check</span>
        ) : (
          <>
            <span className="block text-xs text-muted">{step.description}</span>
            <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:underline">
              {step.cta}
              <ArrowRight className="size-3" aria-hidden />
            </span>
          </>
        )}
      </span>
    </Link>
  )
}
