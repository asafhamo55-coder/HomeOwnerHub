import Link from 'next/link'
import { AlertTriangle, BookOpen, Link2, MessagesSquare, ShieldAlert, UserCheck } from 'lucide-react'
import { StatusPill } from '@homeowner-portal/ui'
import { cureDate } from '@/lib/inbox/account-context'
import type { HomeAccount } from '@/lib/inbox/account-context'
import type { ThreadRailContext, LinkedRecordType } from '@/lib/inbox/thread-context'
import { formatShortDate } from '@/lib/format-datetime'
import { formatDay, usd } from '@/lib/money/format'

/**
 * BL-101 A1 — the context rail's new sections. Server-rendered from
 * `getThreadRailContext`. A section that failed to load says so in warning
 * text, never as its empty state ("None", "$0.00"), which would be a lie.
 */

function Label({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{children}</h2>
}

function CouldNotLoad({ what }: { what: string }) {
  return <p className="text-xs font-medium text-warning">{what} couldn&apos;t load</p>
}

const dollars = (cents: number) => usd(cents / 100)
const words = (s: string) => s.replace(/_/g, ' ')

/** "From: Pat (owner) at 12 Example Ct", or the not-a-resident warning. */
export function SenderLine({ rail, address }: { rail: ThreadRailContext; address: string }) {
  const { check, resident } = rail.sender
  if (check.verified) {
    return (
      <div className="space-y-1">
        <p className="flex items-start gap-1.5 text-xs text-foreground-secondary">
          <UserCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
          <span>
            From:{' '}
            <strong className="font-semibold text-foreground">
              {resident ? `${resident.name} (${words(resident.role)})` : 'a resident'}
            </strong>{' '}
            at {address}
          </span>
        </p>
        {/* BL-105: no SPF/DKIM/DMARC result either way. Today's behaviour,
            plus a nudge to be careful with change requests. */}
        {check.auth === 'none' ? (
          <p className="pl-5 text-xs text-muted">
            The address matches, but this email had no sender authentication result, so it can&apos;t be
            confirmed. Check before changing contact details.
          </p>
        ) : null}
      </div>
    )
  }
  if (check.reason === 'not_filed') return null
  if (check.reason === 'sender_unauthenticated') {
    return (
      <p
        role="status"
        className="flex items-start gap-1.5 rounded-md bg-danger-subtle px-2 py-1.5 text-xs font-medium text-danger"
      >
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Unverified sender: this email failed its authentication check (SPF/DKIM/DMARC), so it may not be
          from the address it shows. Account details are left out of drafts and saved replies, and no
          contact update can be filed from it.
        </span>
      </p>
    )
  }
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-warning-subtle px-2 py-1.5 text-xs font-medium text-warning">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        {check.reason === 'check_failed'
          ? "Couldn't check the sender against this home's residents."
          : 'Sender is not a resident of this home.'}{' '}
        AI drafts leave account details blank.
      </span>
    </p>
  )
}

/** Balance, oldest open charge, last payment, payment plan. */
export function MoneyCard({ home, ledgerHref }: { home: HomeAccount; ledgerHref: string | null }) {
  const a = home.account
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Account</Label>
        {ledgerHref ? (
          <Link href={ledgerHref} className="text-xs font-medium text-primary">
            Open ledger
          </Link>
        ) : null}
      </div>
      {!a ? (
        <CouldNotLoad what="The ledger" />
      ) : (
        <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border text-sm">
          <Row label="Balance">
            {a.balanceCents > 0 ? (
              <StatusPill
                tone={a.pastDueCount > 0 ? 'danger' : 'warning'}
                label={`${dollars(a.balanceCents)}${a.pastDueCount > 0 ? ` · ${a.pastDueCount} past due` : ''}`}
              />
            ) : (
              <StatusPill tone="success" label="Current" />
            )}
          </Row>
          {a.openChargeCount > 0 ? (
            <Row label="Oldest open">
              {(() => {
                const oldest = [...a.openCharges].sort((x, y) => x.dueDate.localeCompare(y.dueDate))[0]
                return oldest ? `${oldest.type} · ${dollars(oldest.amountCents)} · due ${formatDay(oldest.dueDate)}` : '—'
              })()}
            </Row>
          ) : null}
          <Row label="Last payment">
            {a.lastPayment ? (
              `${dollars(a.lastPayment.amountCents)} · ${formatDay(a.lastPayment.date)}`
            ) : (
              <span className="text-muted">None on file</span>
            )}
          </Row>
          <Row label="Payment plan">
            {home.plan.visible ? (
              `${words(home.plan.plan.status)} · ${home.plan.plan.installments} × ${dollars(home.plan.plan.installmentCents)}`
            ) : (
              <span className="text-muted">None</span>
            )}
          </Row>
          {a.truncated ? (
            <p className="bg-surface px-3 py-2 text-xs text-warning">
              This ledger is very long; totals may be incomplete. Open the ledger to check.
            </p>
          ) : null}
          {home.chargesFrom ? (
            <p className="bg-surface px-3 py-2 text-xs text-muted">
              Since the sale on {formatDay(home.chargesFrom)}. The seller&apos;s earlier charges are left out of
              replies. Open the ledger to see the full history.
            </p>
          ) : null}
        </dl>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-surface px-3 py-2.5">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-xs text-foreground">{children}</dd>
    </div>
  )
}

/** Open violations on the home, each linked, with status and cure date. */
export function ViolationList({ home }: { home: HomeAccount }) {
  const r = home.requests
  return (
    <div className="space-y-2">
      <Label>Open violations</Label>
      {!r ? (
        <CouldNotLoad what="Violations" />
      ) : r.violationsOnMyHome.length === 0 ? (
        <p className="text-xs text-muted">None</p>
      ) : (
        <ul className="space-y-1.5">
          {r.violationsOnMyHome.map((v) => {
            const cure = cureDate(v.noticeSentAt, v.curePeriodDays)
            return (
              <li key={v.id}>
                <Link
                  href={`/violations/${v.id}`}
                  className="block rounded-lg border border-border px-3 py-2 text-xs no-underline hover:border-primary"
                >
                  <span className="font-medium text-foreground">{words(v.type)}</span>
                  <span className="text-muted">
                    {` · ${words(v.status)}`}
                    {cure ? ` · cure by ${formatDay(cure)}` : ''}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const LINK_TYPE_LABEL: Record<LinkedRecordType, string> = {
  ticket: 'Ticket',
  arc_request: 'ARC',
  violation: 'Violation',
  communication_thread: 'Message',
}

/** Linked records, past threads and matching governing-doc sections. */
export function ThreadConnections({ rail }: { rail: ThreadRailContext }) {
  return (
    <div className="space-y-4">
      {rail.linked.failed || rail.linked.items.length > 0 ? (
        <div className="space-y-2">
          <Label>Linked records</Label>
          {rail.linked.failed ? <CouldNotLoad what="Some linked records" /> : null}
          <ul className="space-y-1.5">
            {rail.linked.items.map((l) => (
              <li key={`${l.type}:${l.id}`} className="flex items-start gap-1.5 text-xs">
                <Link2 className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="text-muted">{LINK_TYPE_LABEL[l.type]}: </span>
                  {l.href ? (
                    <Link href={l.href} className="font-medium text-primary">
                      {l.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{l.label}</span>
                  )}
                  <span className="text-muted">{` · ${words(l.status)}`}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Earlier conversations</Label>
        {rail.pastThreads.failed ? <CouldNotLoad what="Some earlier conversations" /> : null}
        {rail.pastThreads.items.length === 0 ? (
          rail.pastThreads.failed ? null : <p className="text-xs text-muted">None from this home or sender</p>
        ) : (
          <ul className="space-y-1.5">
            {rail.pastThreads.items.map((t) => (
              <li key={t.id} className="flex items-start gap-1.5 text-xs">
                <MessagesSquare className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <Link href={`/inbox/${t.id}`} className="font-medium text-primary">
                    {t.subject ?? '(no subject)'}
                  </Link>
                  <span className="text-muted">
                    {t.lastMessageAt ? ` · ${formatShortDate(t.lastMessageAt)}` : ''}
                    {t.via === 'sender' ? ' · same sender' : t.via === 'both' ? ' · same sender and home' : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <Label>Matching documents</Label>
        {rail.docs.failed ? (
          <CouldNotLoad what="Matching documents" />
        ) : !rail.docs.drafted ? (
          <p className="text-xs text-muted">Shown once a reply is drafted.</p>
        ) : rail.docs.items.length === 0 ? (
          <p className="text-xs text-muted">No governing-document section matched this email.</p>
        ) : (
          <ul className="space-y-1.5">
            {rail.docs.items.map((d) => (
              <li key={d.refId} className="flex items-start gap-1.5 text-xs">
                <BookOpen className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <Link href="/documents/governing" className="font-medium text-primary">
                    {d.label}
                  </Link>
                  {d.documentTitle ? <span className="text-muted">{` · ${d.documentTitle}`}</span> : null}
                  {d.cited ? <span className="text-muted"> · quoted in draft</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
