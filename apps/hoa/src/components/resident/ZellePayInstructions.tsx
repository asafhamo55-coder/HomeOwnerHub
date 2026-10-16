import { cn } from '@homeowner-portal/ui'
import type { PayLine } from '@/lib/pay-by-zelle'
import { formatDay } from '@/lib/money/format'
import { CopyButton } from './CopyButton'

// The Pay-by-Zelle instructions a resident follows (backlog BL-006). Shared
// by the resident Pay screen and the board's live preview in Settings, so
// the board sees exactly what residents see. Presentational only: it must
// stay free of server-only imports (the preview renders it client-side), so
// `PayLine` is a type-only import.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export interface ZellePayInstructionsProps {
  recipient: string
  recipientName: string | null
  instructions: string | null
  lines: PayLine[]
  /** Shown before each charge when the resident has several homes. */
  unitLabelFor?: (assessmentId: string) => string | null
  className?: string
}

export function ZellePayInstructions({
  recipient,
  recipientName,
  instructions,
  lines,
  unitLabelFor,
  className,
}: ZellePayInstructionsProps) {
  const many = lines.length > 1
  return (
    <ol className={cn('space-y-3', className)}>
      <Step n={1} title="Open Zelle in your bank’s app">
        <p className="text-sm text-muted">Zelle is built into most US banking apps. There’s no fee to send.</p>
      </Step>

      <Step n={2} title="Send to">
        <CopyField label="Zelle recipient" value={recipient} copyLabel="Copy Zelle recipient" />
        {recipientName ? (
          <p className="mt-2 text-sm text-muted">
            Zelle should show <span className="font-medium text-foreground">{recipientName}</span>. If it shows a
            different name, stop and check with your board.
          </p>
        ) : null}
      </Step>

      <Step
        n={3}
        title={many ? `Send ${lines.length} payments — one per charge` : 'Enter the amount and memo exactly'}
      >
        {many ? (
          <p className="mb-3 text-sm text-muted">
            Each charge has its own memo code. Separate payments let each one match automatically.
          </p>
        ) : null}
        <div className="space-y-3">
          {lines.map((line) => {
            const unit = unitLabelFor?.(line.assessmentId)
            return (
              <div key={line.assessmentId} className="space-y-2 rounded-lg border border-border p-3">
                {many || unit ? (
                  <p className="text-sm font-semibold text-foreground">
                    {line.label}
                    <span className="font-normal text-muted">
                      {' '}
                      · {unit ? `${unit} · ` : ''}due {formatDay(line.dueDate, 'short')}
                    </span>
                  </p>
                ) : null}
                <CopyField
                  label="Amount"
                  value={usd.format(line.amount)}
                  copyValue={line.amount.toFixed(2)}
                  copyLabel={`Copy amount for ${line.label}`}
                  numeric
                />
                {line.memoCode ? (
                  <CopyField
                    label="Memo"
                    value={line.memoCode}
                    copyLabel={`Copy memo code for ${line.label}`}
                    code
                  />
                ) : (
                  <p className="rounded-lg bg-subtle px-3 py-2.5 text-sm text-foreground-secondary">
                    This charge has no memo code. Put your street address in the memo — your board will match it by
                    hand.
                  </p>
                )}
                {line.memoCode && !line.autoMatch ? (
                  <p className="text-xs text-muted">
                    Part of this charge is already paid, so your board will confirm this payment by hand.
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </Step>

      {instructions ? (
        <li className="list-none rounded-xl border border-border bg-subtle p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">A note from your board</p>
          <p className="mt-1 whitespace-pre-line text-sm text-foreground [overflow-wrap:anywhere]">{instructions}</p>
        </li>
      ) : null}
    </ol>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="list-none rounded-xl border border-border bg-surface p-4">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary"
          aria-hidden
        >
          {n}
        </span>
        <h3 className="text-sm font-semibold text-foreground">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h3>
      </div>
      {children}
    </li>
  )
}

function CopyField({
  label,
  value,
  copyValue,
  copyLabel,
  numeric,
  code,
}: {
  label: string
  value: string
  copyValue?: string
  copyLabel: string
  numeric?: boolean
  code?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p
          className={cn(
            'select-all text-base font-semibold text-foreground [overflow-wrap:anywhere]',
            numeric && 'num',
            code && 'font-mono tracking-wide',
          )}
        >
          {value}
        </p>
      </div>
      <CopyButton value={copyValue ?? value} label={copyLabel} />
    </div>
  )
}
