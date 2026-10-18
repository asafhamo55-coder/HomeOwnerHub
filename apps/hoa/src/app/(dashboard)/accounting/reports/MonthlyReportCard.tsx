import Link from 'next/link'
import { Eye, Mail } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  LoadFailed,
  StatusPill,
} from '@homeowner-portal/ui'
import { SendReportNowButton } from './SendReportNowButton'

/**
 * The month-end board report card (BL-073) on /accounting/reports.
 * Presentational: the page loads the status (lib/monthly-report/status.ts)
 * and formats dates in the association's zone.
 */
export interface MonthlyReportCardProps {
  /** null = the status read failed (said so, never "not sent yet"). */
  status: {
    last: { label: string; status: string; sentOn: string | null } | null
    pendingLabel: string
    pendingDone: boolean
  } | null
  /** Send now is admin-only; board members see Preview. */
  canSend: boolean
}

export function MonthlyReportCard({ status, canSend }: MonthlyReportCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary [&_svg]:size-5"
            aria-hidden
          >
            <Mail />
          </span>
          <div className="min-w-0">
            <CardTitle as="h2">Monthly board report</CardTitle>
            <CardDescription>
              Emailed to every board member on the 1st: last month’s cash, collections, overdue dues, budget, violations,
              architectural requests and what’s waiting on the board.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {status === null ? (
          <LoadFailed what="the report’s send history" hint="Preview still works." />
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-muted">Last sent</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-2 font-medium text-foreground">
                {status.last ? (
                  <>
                    <span>{status.last.label}</span>
                    {status.last.sentOn ? <span className="font-normal text-muted">on {status.last.sentOn}</span> : null}
                    {status.last.status === 'failed' ? (
                      <StatusPill tone="danger" label="Not delivered" size="sm" />
                    ) : status.last.status === 'sending' ? (
                      <StatusPill tone="info" label="Sending" size="sm" />
                    ) : null}
                  </>
                ) : (
                  <span>Not sent yet</span>
                )}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted">Next report</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {status.pendingDone ? `${status.pendingLabel} is done — next on the 1st` : `${status.pendingLabel}, due now`}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href="/accounting/reports/monthly-report">
            <Eye aria-hidden />
            Preview
          </Link>
        </Button>
        {canSend && status !== null ? (
          <SendReportNowButton disabled={status.pendingDone} label={status.pendingLabel} />
        ) : null}
        <Link href="/settings/notifications" className="ml-auto text-sm font-medium text-primary hover:underline">
          Your email settings
        </Link>
      </CardFooter>
    </Card>
  )
}
