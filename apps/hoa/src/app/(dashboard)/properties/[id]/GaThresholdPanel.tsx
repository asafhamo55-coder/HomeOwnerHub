import { Badge, Card, CardContent, CardHeader, CardTitle, KeyValue, KeyValueList, LoadFailed } from '@homeowner-portal/ui'
import type { DriftCitation } from '@/lib/compliance/statute-drift'
import {
  GA_PAYMENT_ORDER_NOT_APPLIED,
  GA_PAYMENT_ORDER_QUOTES,
  GA_PAYMENT_ORDER_STEPS,
  GA_THRESHOLD_PANEL_QUOTES,
  type GaThresholdView,
  type ThresholdStatus,
  type TwelveMonths,
} from '@/lib/collections/ga-threshold'
import { usdCents } from '@/lib/collections/letters/model'
import type { LoadResult } from '@/lib/load-or-fail'
import { formatDay } from '@/lib/money/format'

/** What the page streams in: the panel's read, or null when the viewer isn't board/admin or there's no open case. */
export type GaThresholdRead = Promise<LoadResult<GaThresholdView | null>>

const STATUS_VARIANT: Record<ThresholdStatus, 'warning' | 'neutral' | 'info'> = { at_or_above: 'warning', below: 'neutral', depends: 'info' }

export function statusLabel(status: ThresholdStatus, thresholdCents: number | null): string {
  const t = thresholdCents === null ? '' : ` ${usdCents(thresholdCents)}`
  if (status === 'at_or_above') return thresholdCents === null ? 'At or above the threshold' : `At or above${t}`
  if (status === 'below') return thresholdCents === null ? 'Below the threshold' : `Below${t}`
  return 'Depends on 12 months of dues'
}

export function twelveMonthsText(t: TwelveMonths): string {
  if (t.kind === 'schedule') return `${usdCents(t.cents)} (${t.rateLabel}, the dues rate from ${formatDay(t.effectiveFrom)})`
  if (t.reason === 'failed') return 'Couldn’t read the dues-rate schedule'
  if (t.reason === 'not_live') return 'Not available yet: the dues-rate schedule turns on after a database update'
  return 'No dues rate on the schedule for today'
}

function Quote({ q }: { q: DriftCitation }) {
  return (
    <figure className="space-y-1">
      <blockquote className="border-l-2 border-border pl-3 text-sm text-foreground-secondary">“{q.quote}”</blockquote>
      <figcaption className="text-xs text-muted">{q.cite}</figcaption>
    </figure>
  )
}

/**
 * BL-158: the streamed panel. Read-only: nothing here changes a payment,
 * a letter or the case. Shown to board and admins only (the page passes
 * no read to anyone else) and only for a Georgia association.
 */
export async function GaThresholdPanel({ read }: { read: GaThresholdRead }) {
  const res = await read
  if (!res.ok) return <LoadFailed what="the Georgia foreclosure threshold" />
  if (!res.data) return null
  return <GaThresholdCards view={res.data} />
}

export function GaThresholdCards({ view }: { view: GaThresholdView }) {
  const r = view.rule2027
  const changes = formatDay(view.changesOn)
  return (
    <div className="space-y-3">
      {/* BL-155: a condominium gets the payment-order note only; the threshold is the POA Act's. */}
      {view.condo ? null : (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle as="h4">Georgia foreclosure threshold</CardTitle>
          <Badge variant="neutral">Read-only</Badge>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {view.current ? (
            <div className="space-y-2">
              <p className="text-foreground-secondary">
                The rule today: the lien can’t be foreclosed unless it is at least {usdCents(view.current.floorCents)} (§ 44-3-232(c)).{' '}
                <span className="font-medium text-foreground">Changes on {changes}.</span>
              </p>
              <KeyValueList>
                <KeyValue label="Lien amount from the ledger" value={<span className="num">{usdCents(view.current.lienCents)}</span>} />
                <KeyValue label="Today’s rule" value={<Badge variant={STATUS_VARIANT[view.current.status]}>{statusLabel(view.current.status, view.current.floorCents)}</Badge>} />
              </KeyValueList>
              <p className="text-xs text-muted">Interest isn’t in the ledger and isn’t included. Fines and fees are, as the notice before foreclosure lists them today.</p>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-foreground-secondary">
              {view.current ? `From ${changes} (SB 406 § 5): ` : `Since ${changes} (SB 406 § 5): `}
              no foreclosure unless the regular and special assessments in arrears reach the lesser of {usdCents(r.capCents)} or 12 months of regular assessments, but at least {usdCents(r.floorCents)}. Fines, fees and other specific assessments don’t count.
            </p>
            <KeyValueList>
              <KeyValue label="Counted balance" value={<span className="num">{usdCents(r.countedCents)}</span>} />
              {r.creditCents !== 0 ? <KeyValue label="Unapplied payments and credits (taken off)" value={<span className="num">{usdCents(r.creditCents)}</span>} /> : null}
              {r.excludedCents > 0 ? <KeyValue label="Late charges, fines and fees (not counted)" value={<span className="num">{usdCents(r.excludedCents)}</span>} /> : null}
              {r.planCents > 0 ? <KeyValue label="Payment-plan installments (not counted)" value={<span className="num">{usdCents(r.planCents)}</span>} /> : null}
              <KeyValue label="12 months of regular assessments" value={twelveMonthsText(r.twelve)} />
              <KeyValue
                label="Threshold"
                value={<span className="num">{r.thresholdCents === null ? `${usdCents(r.floorCents)} to ${usdCents(r.capCents)}` : usdCents(r.thresholdCents)}</span>}
              />
              <KeyValue label={view.current ? `On ${changes}, at today’s balance` : 'This case'} value={<Badge variant={STATUS_VARIANT[r.status]}>{statusLabel(r.status, r.thresholdCents)}</Badge>} />
            </KeyValueList>
            {r.planCents > 0 ? (
              <p className="text-xs text-muted">Payment-plan installments aren’t counted, because a plan can include fees and HomeownerHub can’t tell. If the plan is only for regular or special assessments, ask your attorney whether they count.</p>
            ) : null}
            {r.thresholdCents === null ? (
              <p className="text-xs text-muted">
                Without a dues rate, the threshold is somewhere from {usdCents(r.floorCents)} to {usdCents(r.capCents)}. Enter 12 months of dues on the notice before foreclosure to apply it.
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            {GA_THRESHOLD_PANEL_QUOTES.map((q) => (
              <Quote key={q.cite} q={q} />
            ))}
          </div>
          <p className="text-xs text-muted">This panel only shows figures. It doesn’t decide whether to foreclose: ask your association’s attorney first.</p>
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle as="h4">How payments should be applied</CardTitle>
          <Badge variant="neutral">Read-only</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-foreground-secondary">
            {view.asOf < view.changesOn ? `From ${changes}, ` : `Since ${changes}, `}
            Georgia law (§ 43-17A-8, SB 406 § 2) says every payment from an owner is applied in this order:
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-foreground-secondary">
            {GA_PAYMENT_ORDER_STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="text-foreground-secondary">The association can’t refuse a payment of any amount for an assessment, or accelerate assessments.</p>
          <div className="space-y-3">
            {GA_PAYMENT_ORDER_QUOTES.map((q) => (
              <Quote key={q.cite} q={q} />
            ))}
          </div>
          <p className="text-xs text-muted">{GA_PAYMENT_ORDER_NOT_APPLIED}</p>
        </CardContent>
      </Card>
    </div>
  )
}
