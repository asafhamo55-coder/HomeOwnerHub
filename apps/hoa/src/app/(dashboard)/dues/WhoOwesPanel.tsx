import { Badge, Button, Card } from '@homeowner-portal/ui'
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
    return null
  }

  const { packets, skipped } = packetsResult.value
  if (packets.length === 0) return null

  // Degrade rather than disappear: losing the last-reminded lookup only
  // costs the "Reminded Xd ago" annotations, not the whole panel.
  let lastReminded: Map<string, string>
  if (lastRemindedResult.status === 'fulfilled') {
    lastReminded = lastRemindedResult.value
  } else {
    console.error('WhoOwesPanel: getLastRemindedByEmail failed', {
      message: errorMessage(lastRemindedResult.reason),
    })
    lastReminded = new Map()
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
                  {at ? ` · ${agoLabel(at)}` : ''}
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
                label={recent ? 'Remind again' : 'Remind'}
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
