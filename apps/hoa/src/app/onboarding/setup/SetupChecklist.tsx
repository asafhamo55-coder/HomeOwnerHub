import Link from 'next/link'
import { Check, HelpCircle } from 'lucide-react'
import { Button, Card, cn } from '@homeowner-portal/ui'
import type { SetupChecklist as SetupChecklistModel, SetupChecklistKey } from '@/lib/dashboard/setup-checklist'

/**
 * The sign-up page's view of THE setup checklist (BL-127): the same steps,
 * states and links as the dashboard card — it used to be its own 4-step
 * list that disagreed with the dashboard's 6. `hrefOverride` lets this
 * page point a step at something on the page itself (the mailbox connect
 * card below).
 */
export function SetupChecklist({
  checklist,
  highlightKey,
  hrefOverride = {},
}: {
  checklist: SetupChecklistModel
  highlightKey?: SetupChecklistKey
  hrefOverride?: Partial<Record<SetupChecklistKey, string>>
}) {
  const { steps, doneCount, total, percent } = checklist

  return (
    <Card>
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-foreground">Setup checklist</h2>
        <div className="flex items-center gap-3">
          <span className="num text-sm text-muted">
            {doneCount} of {total} done
          </span>
          <div
            className="h-1.5 w-24 overflow-hidden rounded-full bg-subtle"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Setup progress"
          >
            <div className="h-full rounded-full bg-success-solid" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
      <ol className="divide-y divide-border">
        {steps.map((step, i) => {
          const done = step.state === 'done'
          const unknown = step.state === 'unknown'
          const highlighted = !done && step.key === highlightKey
          return (
            <li key={step.key} className={cn('flex items-center gap-4 px-5 py-4', highlighted && 'bg-primary-subtle/50')}>
              <span
                className={cn(
                  'num flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  done
                    ? 'bg-success-solid text-on-solid'
                    : unknown
                      ? 'bg-warning-subtle text-warning'
                      : highlighted
                        ? 'bg-primary text-primary-fg'
                        : 'border border-border-strong text-muted',
                )}
              >
                {done ? <Check className="size-4" aria-hidden /> : unknown ? <HelpCircle className="size-4" aria-hidden /> : i + 1}
                <span className="sr-only">{done ? ' (done)' : unknown ? ' (couldn’t check)' : ''}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', done ? 'text-muted line-through' : 'text-foreground')}>
                  {step.title}
                  {step.optional ? <span className="ml-1.5 text-xs font-normal text-muted">(optional)</span> : null}
                </p>
                {unknown ? (
                  <p className="text-xs text-warning">Couldn’t check</p>
                ) : !done ? (
                  <p className="text-xs text-muted">{step.description}</p>
                ) : null}
              </div>
              {!done ? (
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  {step.secondary ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={step.secondary.href}>{step.secondary.label}</Link>
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant={highlighted ? 'primary' : 'secondary'}>
                    <Link href={hrefOverride[step.key] ?? step.href}>{step.cta}</Link>
                  </Button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
