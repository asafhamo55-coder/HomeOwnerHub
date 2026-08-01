import Link from 'next/link'
import { Alert, Badge, Button, Card, CardContent } from '@homeowner-portal/ui'
import type { ConnectPreview, MailboxStatus } from '@/lib/inbox/queries'
import { DisconnectMailboxButton } from './DisconnectMailboxButton'
import { ScopePicker } from './ScopePicker'

interface Props {
  status: MailboxStatus | null
  preview: ConnectPreview | null
  scopeOptions: { addresses: string[]; labels: Array<{ id: string; name: string }> }
  returnTo: string
}

export function MailboxConnectCard({ status, preview, scopeOptions, returnTo }: Props) {
  if (!status) {
    return (
      <Card variant="elevated">
        <CardContent className="space-y-3 p-6 text-center">
          <div className="text-2xl" aria-hidden>
            ✉️
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Connect your HOA mailbox
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted">
            Emails residents send to your HOA address appear here, matched to the
            right property, with dues and ARC context beside them.
          </p>
          <Button asChild size="lg">
            <Link href={`/api/oauth/google/start?returnTo=${encodeURIComponent(returnTo)}`}>
              Continue with Google
            </Link>
          </Button>
          <p className="text-xs text-muted">Nothing is ever sent without your approval.</p>
        </CardContent>
      </Card>
    )
  }

  const backfilling = status.backfillStatus === 'running'

  // A PARTIAL sync: the connection is healthy and the cursor advanced, but
  // specific messages could not be fetched or parsed and were permanently
  // skipped (packages/jobs/src/mailbox-sync.ts writes exactly that into
  // `sync_error` on an otherwise-successful run). Both render sites used
  // to gate every error surface on `syncStatus !== 'ok'`, so this text was
  // written to the database and then never shown to anyone — the board's
  // inbox was silently missing mail while this card read "Connected".
  //
  // Rendered amber, not red, and deliberately NOT folded into the
  // destructive states below: "we have your mail, minus a few messages" is
  // a materially different situation from "we are not receiving your mail
  // at all", and collapsing the two would teach the board to ignore both.
  const partialSync = status.syncStatus === 'ok' && Boolean(status.syncError)

  // `backfillTotalEstimate` is Gmail's resultSizeEstimate — an ESTIMATE,
  // not an exact count. `backfillDone` can legitimately exceed it, so the
  // percentage is clamped to [0, 100] rather than trusted verbatim.
  const backfillPct =
    status.backfillTotalEstimate && status.backfillTotalEstimate > 0
      ? Math.min(100, Math.max(0, Math.round((status.backfillDone / status.backfillTotalEstimate) * 100)))
      : null

  return (
    <div className="space-y-4">
      <Card variant="elevated">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start gap-3 border-b border-border pb-4">
            <div className="flex-1">
              <p className="font-medium text-foreground">{status.emailAddress}</p>
              <p className={partialSync ? 'text-xs text-amber-700 dark:text-amber-400' : 'text-xs text-muted'}>
                {status.syncStatus === 'ok'
                  ? `Syncing every 2 minutes · last check ${
                      status.lastSyncedAt
                        ? new Date(status.lastSyncedAt).toLocaleTimeString()
                        : 'pending'
                    }`
                  : status.syncError ?? 'Sync problem'}
              </p>
            </div>
            <Badge
              variant={
                status.syncStatus !== 'ok'
                  ? 'destructive'
                  : partialSync
                    ? 'warning'
                    : 'success'
              }
            >
              {status.syncStatus === 'ok' ? 'Connected' : status.syncStatus}
            </Badge>
          </div>

          {status.syncStatus === 'auth_failed' ? (
            <Alert variant="error" title="Reconnect required">
              Google rejected the stored credentials. Mail is not syncing.{' '}
              <Link className="underline" href="/api/oauth/google/start">
                Reconnect
              </Link>
            </Alert>
          ) : null}

          {status.syncStatus === 'stalled' ? (
            <Alert variant="warning" title="Sync has stalled">
              No successful sync in over 30 minutes. Resident email may not be
              arriving. {status.syncError}
            </Alert>
          ) : null}

          {partialSync ? (
            <Alert variant="warning" title="Some messages were skipped">
              {/* sync_error is operator-facing diagnostic text written by
                  the jobs layer (packages/jobs), never user input, and it
                  carries counts and ids only — never an address, subject,
                  or body. React escapes it as plain text content here; it
                  is never interpolated into an href or any raw sink. */}
              {status.syncError}{' '}
              Those messages will not be retried — the sync cursor has already moved
              past them. New mail keeps arriving normally.
            </Alert>
          ) : null}

          {status.backfillStatus === 'failed' ? (
            <Alert variant="error" title="History import stopped">
              We could not finish importing this mailbox&apos;s message history, so
              older mail may be missing below. New mail keeps syncing normally. It
              will only restart on its own if a future sync happens to run
              truncated — there is no guaranteed automatic retry, so reconnect now
              to restart the import right away.{' '}
              <Link className="underline" href="/api/oauth/google/start">
                Reconnect
              </Link>
            </Alert>
          ) : null}

          {backfilling ? (
            <Alert variant="info" title="Importing history">
              <p>
                {status.backfillDone.toLocaleString()} messages imported so far
                {status.backfillTotalEstimate
                  ? ` (of about ${status.backfillTotalEstimate.toLocaleString()})`
                  : ''}
                . You can keep working — this continues in the background.
              </p>
              {backfillPct !== null ? (
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900/40"
                  role="progressbar"
                  aria-valuenow={backfillPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-blue-600 dark:bg-blue-400"
                    style={{ width: `${backfillPct}%` }}
                  />
                </div>
              ) : null}
            </Alert>
          ) : null}

          <ScopePicker
            accountId={status.id}
            currentMode={status.scopeMode}
            currentValue={status.scopeValue}
            addresses={
              scopeOptions.addresses.length > 0
                ? scopeOptions.addresses
                : [status.emailAddress]
            }
            labels={scopeOptions.labels}
            recommendedAddress={status.scopeValue}
          />

          <div className="flex justify-end border-t border-border pt-3">
            <DisconnectMailboxButton accountId={status.id} />
          </div>
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              What we found in the last 30 days
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="threads" value={preview.totalThreads} />
              <Stat label="matched to a property" value={preview.matchedThreads} tone="ok" />
              <Stat label="need review" value={preview.needsReviewThreads} tone="warn" />
            </div>

            {preview.sample.length > 0 ? (
              <>
                <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Sample — check this looks right
                </p>
                <div className="divide-y divide-border rounded-lg border border-border text-sm">
                  {preview.sample.map((row, index) => (
                    <div key={index} className="flex flex-wrap gap-2 p-2">
                      <span className="min-w-[10rem] flex-1 font-medium text-foreground">
                        {row.fromEmail ?? 'unknown sender'}
                      </span>
                      <span className="min-w-[10rem] flex-1 text-muted">
                        {row.subject ?? '(no subject)'}
                      </span>
                      <span
                        className={
                          row.matchedAddress
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }
                      >
                        {row.matchedAddress ? `→ ${row.matchedAddress}` : '→ needs review'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'ok' | 'warn'
}) {
  const border =
    tone === 'ok'
      ? 'border-emerald-300 dark:border-emerald-800'
      : tone === 'warn'
        ? 'border-amber-300 dark:border-amber-800'
        : 'border-border'
  const valueColor =
    tone === 'ok'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-foreground'
  return (
    <div className={`rounded-lg border ${border} p-3 text-center`}>
      <p className={`text-xl font-bold ${valueColor}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}
