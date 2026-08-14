import { Alert, Badge, Button, Card } from '@homeowner-portal/ui'
import { buildReminderPackets } from '@/lib/dues-reminders/packets'
import { getLastRemindedByEmail, RECENT_REMINDER_DAYS } from '@/lib/dues-reminders/queries'
import { SendRemindersDialog } from './SendRemindersDialog'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function agoLabel(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return 'Reminded today'
  return `Reminded ${days}d ago`
}

// Structural error info only (message/code) — never the caught value
// itself, which for a Supabase failure could carry query context.
function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/**
 * The panel lists everyone with a balance, because the manager needs the
 * whole picture. The bulk button deliberately reaches a narrower set —
 * only past-due owners — so its label carries the real count rather than
 * a bare "Send reminders".
 */
export async function WhoOwesPanel({ associationId }: { associationId: string }) {
  // allSettled, not all: this component has no error boundary of its own,
  // so an unhandled rejection here would bubble to the dashboard layout's
  // and replace the period tables below too, not just this panel.
  const [packetsResult, lastRemindedResult] = await Promise.allSettled([
    buildReminderPackets(associationId),
    getLastRemindedByEmail(associationId),
  ])

  if (packetsResult.status === 'rejected') {
    console.error('WhoOwesPanel: buildReminderPackets failed', {
      message: errorMessage(packetsResult.reason),
    })
    // Not `return null`: null is what "nobody owes anything" also renders
    // as, and a manager can't tell "clean" apart from "we couldn't check"
    // if both look like an empty page. The heading stays up so the section
    // reads as present-but-broken, not absent.
    return (
      <Card>
        <div className="border-b border-border bg-background/50 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Who owes</p>
        </div>
        <div className="p-4">
          <Alert variant="error">Couldn&rsquo;t load who owes — refresh to try again.</Alert>
        </div>
      </Card>
    )
  }

  const { packets, skipped } = packetsResult.value
  if (packets.length === 0) return null

  // Degrade rather than disappear: losing the last-reminded lookup only
  // costs the "Reminded Xd ago" annotations, not the whole panel. But an
  // empty map here must not be read as "confirmed nobody was reminded
  // recently" — reminderHistoryUnavailable is what keeps the per-row
  // labels below from asserting a clean history they don't actually have.
  let lastReminded = new Map<string, string>()
  let reminderHistoryUnavailable = false
  if (lastRemindedResult.status === 'fulfilled' && lastRemindedResult.value.ok) {
    lastReminded = lastRemindedResult.value.lastReminded
  } else {
    reminderHistoryUnavailable = true
    // queries.ts already logs the query error on its own ok:false path;
    // only a promise rejection (thrown outside that function) is unlogged
    // so far and needs recording here.
    if (lastRemindedResult.status === 'rejected') {
      console.error('WhoOwesPanel: getLastRemindedByEmail failed', {
        message: errorMessage(lastRemindedResult.reason),
      })
    }
  }

  const pastDueCount = packets.filter((p) => p.pastDueTotal > 0).length
  const totalOutstanding = packets.reduce((s, p) => s + p.totalDue, 0)
  const totalPastDue = packets.reduce((s, p) => s + p.pastDueTotal, 0)
  const cutoff = Date.now() - RECENT_REMINDER_DAYS * 86_400_000

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Who owes</p>
          <p className="text-xs text-muted">
            {packets.length} {packets.length === 1 ? 'owner' : 'owners'} ·{' '}
            {usd.format(totalOutstanding)} outstanding
            {totalPastDue > 0 ? ` · ${usd.format(totalPastDue)} past due` : ''}
          </p>
        </div>
        {pastDueCount > 0 ? (
          <SendRemindersDialog
            emails={null}
            variant="primary"
            label={`Send ${pastDueCount} reminder${pastDueCount === 1 ? '' : 's'}`}
          />
        ) : (
          // Disabled rather than hidden: everyone here owes something, so a
          // vanishing button reads as a bug. The label says why it is off.
          <Button disabled>No one is past due</Button>
        )}
      </div>

      {reminderHistoryUnavailable ? (
        <div className="border-b border-border px-4 py-2">
          <Alert variant="warning">
            Couldn&rsquo;t check reminder history — the labels below may not reflect reminders
            already sent.
          </Alert>
        </div>
      ) : null}

      <ul className="divide-y divide-border">
        {packets.map((p) => {
          const at = lastReminded.get(p.email) ?? null
          const recent = at !== null && Date.parse(at) >= cutoff
          return (
            <li key={p.email} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{p.ownerName}</p>
                <p className="text-xs text-muted">
                  {p.properties.length}{' '}
                  {p.properties.length === 1 ? 'property' : 'properties'}
                  {at
                    ? ` · ${agoLabel(at)}`
                    : reminderHistoryUnavailable
                      ? ' · Reminder history unknown'
                      : ''}
                </p>
              </div>
              <span className="font-mono text-sm text-foreground">{usd.format(p.totalDue)}</span>
              {p.pastDueTotal > 0 ? (
                <Badge variant="destructive" size="sm">
                  {p.oldestDaysLate}d late
                </Badge>
              ) : (
                <Badge variant="outline" size="sm">
                  current
                </Badge>
              )}
              <SendRemindersDialog
                emails={[p.email]}
                label={reminderHistoryUnavailable ? 'Remind — history unknown' : recent ? 'Remind again' : 'Remind'}
              />
            </li>
          )
        })}
      </ul>

      {skipped.length > 0 ? (
        <p className="border-t border-border px-4 py-2 text-xs text-muted">
          {skipped.length} {skipped.length === 1 ? 'owner has' : 'owners have'} no email on file and
          cannot be reminded: {skipped.map((s) => s.ownerName).join(', ')}
        </p>
      ) : null}
    </Card>
  )
}
