import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { PLAN_LABEL, smsAllowanceNotice, type SmsAllowanceStatus } from '@homeowner-portal/billing'

/**
 * BL-104 / decision §4: this month's text message use against the plan's
 * allowance. Rendered by Settings → Billing only when PRICING_V2 is on and
 * the org is on Essentials or Complete (readSmsAllowance returns null
 * otherwise). 80%: a warning. 100%: texts are paused until the 1st; email
 * and the portal still go.
 */
export function SmsAllowanceCard({ status }: { status: SmsAllowanceStatus }) {
  const notice = smsAllowanceNotice(status)
  const pct = Math.min(100, status.percentUsed)
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Text messages this month</CardTitle>
        <CardDescription>
          {PLAN_LABEL[status.plan]} includes {status.allowanceSegments} text message segments a month. Each text counts as up to two
          segments. The count resets on the 1st.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-foreground">
          <span className="font-semibold">{status.usedSegments}</span> of {status.allowanceSegments} segments used ({status.percentUsed}%)
        </p>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-subtle"
          role="progressbar"
          aria-label="Text message segments used this month"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className={status.level === 'ok' ? 'h-full bg-primary' : status.level === 'warning' ? 'h-full bg-warning' : 'h-full bg-danger'}
            style={{ width: `${pct}%` }}
          />
        </div>
        {notice ? (
          <Alert variant={status.level === 'blocked' ? 'error' : 'warning'} title={notice.title}>
            {notice.body}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
