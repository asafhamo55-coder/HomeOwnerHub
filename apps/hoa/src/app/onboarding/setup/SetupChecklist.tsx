import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button, Card, cn } from '@homeowner-portal/ui'
import type { SetupStep } from '@/lib/inbox/queries'

export function SetupChecklist({
  steps,
  highlightKey,
}: {
  steps: SetupStep[]
  highlightKey?: SetupStep['key']
}) {
  const doneCount = steps.filter((s) => s.done).length
  const pct = steps.length === 0 ? 0 : Math.round((doneCount / steps.length) * 100)

  return (
    <Card>
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-foreground">Setup checklist</h2>
        <div className="flex items-center gap-3">
          <span className="num text-sm text-muted">
            {doneCount} of {steps.length} done
          </span>
          <div
            className="h-1.5 w-24 overflow-hidden rounded-full bg-subtle"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Setup progress"
          >
            <div className="h-full rounded-full bg-success-solid" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <ol className="divide-y divide-border">
        {steps.map((step, i) => {
          const highlighted = !step.done && step.key === highlightKey
          return (
            <li key={step.key} className={cn('flex items-center gap-4 px-5 py-4', highlighted && 'bg-primary-subtle/50')}>
              <span
                className={cn(
                  'num flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  step.done
                    ? 'bg-success-solid text-on-solid'
                    : highlighted
                      ? 'bg-primary text-primary-fg'
                      : 'border border-border-strong text-muted',
                )}
              >
                {step.done ? <Check className="size-4" aria-hidden /> : i + 1}
                <span className="sr-only">{step.done ? ' (done)' : ''}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', step.done ? 'text-muted line-through' : 'text-foreground')}>
                  {step.title}
                </p>
                {!step.done ? <p className="text-xs text-muted">{step.description}</p> : null}
              </div>
              {!step.done ? (
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  {step.secondary ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={step.secondary.href}>{step.secondary.label}</Link>
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant={highlighted ? 'primary' : 'secondary'}>
                    <Link href={step.href}>{step.cta}</Link>
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
