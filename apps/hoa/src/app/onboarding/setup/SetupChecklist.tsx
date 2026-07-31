import Link from 'next/link'
import { Button, Card, CardContent } from '@homeowner-portal/ui'
import type { SetupStep } from '@/lib/inbox/queries'

export function SetupChecklist({
  steps,
  highlightKey,
}: {
  steps: SetupStep[]
  highlightKey?: SetupStep['key']
}) {
  const doneCount = steps.filter((s) => s.done).length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted">
          {doneCount} of {steps.length} done
        </p>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-success transition-all"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {steps.map((step) => {
        const highlighted = !step.done && step.key === highlightKey
        return (
          <Card
            key={step.key}
            variant={highlighted ? 'elevated' : 'default'}
            className={highlighted ? 'border-2 border-primary' : step.done ? 'opacity-60' : ''}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <span aria-hidden className="text-lg">
                {step.done ? '✅' : step.key === 'mailbox' ? '✉️' : '•'}
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                {!step.done ? (
                  <p className="text-xs text-muted">{step.description}</p>
                ) : null}
              </div>
              {!step.done ? (
                <Button asChild size="sm" variant={highlighted ? 'default' : 'outline'}>
                  <Link href={step.href}>{step.cta}</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
