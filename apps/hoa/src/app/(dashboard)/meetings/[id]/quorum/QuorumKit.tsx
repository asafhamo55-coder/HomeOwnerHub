'use client'

import * as React from 'react'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { ClipboardCopy, FileText, Printer, Users } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  StatusPill,
  useToast,
} from '@homeowner-portal/ui'
import { updateQuorumKit } from '@/lib/meeting-quorum/actions'
import {
  chaseList,
  countQuorum,
  parseQuorumPct,
  type KitChange,
  type ProxyKind,
  type QuorumKit as Kit,
} from '@/lib/meeting-quorum/quorum'

export interface KitHomeView {
  propertyId: string
  home: string
  lot: string | null
  /** Contact shown on screen for the chase list only; never printed. */
  owners: Array<{ name: string; share: string; email: string | null; phone: string | null }>
  votes: number
}

/**
 * BL-122 — the quorum kit, on screen. The live counter, the quorum
 * percent, check-ins and proxies per home, and the chase list. Every tap
 * saves through updateQuorumKit and takes the kit the server wrote back.
 * Nothing here sends a message: the reminder is copied for the board.
 */
export function QuorumKit({
  meetingId,
  homes,
  initialKit,
  statuteQuorumPct,
  statuteTitle,
  reminder,
  asOf,
}: {
  meetingId: string
  homes: KitHomeView[]
  initialKit: Kit
  statuteQuorumPct: number | null
  statuteTitle: string | null
  reminder: { subject: string; body: string }
  asOf: string
}) {
  const toast = useToast()
  const [kit, setKit] = useState<Kit>(initialKit)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [pctText, setPctText] = useState(initialKit.quorumPct === null ? '' : String(initialKit.quorumPct))
  const [pctError, setPctError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [view, setView] = useState<'checkin' | 'chase'>('checkin')

  const count = useMemo(() => countQuorum(homes, kit), [homes, kit])
  const chase = useMemo(() => chaseList(homes, kit), [homes, kit])
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = view === 'chase' ? chase : homes
    if (!q) return list
    return list.filter((h) => h.home.toLowerCase().includes(q) || (h.lot ?? '').toLowerCase() === q || h.owners.some((o) => o.name.toLowerCase().includes(q)))
  }, [filter, view, chase, homes])

  function save(key: string, change: KitChange, done?: string) {
    setBusy(key)
    startTransition(async () => {
      const res = await updateQuorumKit(meetingId, change)
      setBusy(null)
      if (!res.ok) {
        toast({ tone: 'error', title: 'Not saved', message: res.error })
        return
      }
      setKit(res.kit)
      if (done) toast({ tone: 'success', message: done })
    })
  }

  function savePct(e: React.FormEvent) {
    e.preventDefault()
    const pct = parseQuorumPct(pctText)
    if (pct === null) {
      setPctError('Enter the quorum from your bylaws as a percent above 0 and up to 100, e.g. 25 or 33.33.')
      return
    }
    setPctError(null)
    save('pct', { kind: 'quorum_pct', pct }, `Quorum set to ${pct}% of the votes.`)
  }

  async function copyReminder() {
    try {
      await navigator.clipboard.writeText(`${reminder.subject}\n\n${reminder.body}`)
      toast({ tone: 'success', message: 'Reminder copied. Paste it into a message you send yourself.' })
    } catch {
      toast({ tone: 'error', title: 'Couldn’t copy', message: 'Your browser blocked the clipboard. Select the text below and copy it.' })
    }
  }

  const counterTone = count.reached === null ? 'neutral' : count.reached ? 'success' : 'warning'

  return (
    <div className="space-y-6">
      {/* Live counter */}
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex flex-wrap items-center gap-3">
            <Users className="size-4 text-muted" aria-hidden />
            Quorum
            <StatusPill
              tone={counterTone}
              label={
                count.reached === null
                  ? 'Enter the quorum %'
                  : count.reached
                    ? 'Quorum reached'
                    : `Short by ${count.shortBy?.toLocaleString()}`
              }
            />
          </CardTitle>
          <CardDescription>
            Present in person plus proxies received, each home counted once. One vote per home; owners as of {asOf}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-live="polite">
            <Stat label="Represented" value={`${count.representedVotes.toLocaleString()} of ${count.totalVotes.toLocaleString()}`} />
            <Stat
              label="Needed"
              value={count.needed === null ? '—' : count.needed.toLocaleString()}
              hint={count.pct === null ? 'Enter the quorum % below' : `${count.pct}% of ${count.totalVotes.toLocaleString()} votes`}
            />
            <Stat label="In person" value={count.presentVotes.toLocaleString()} />
            <Stat label="By proxy" value={count.proxyOnlyVotes.toLocaleString()} hint={`${count.proxiesReceived.toLocaleString()} proxies received`} />
          </dl>

          <form onSubmit={savePct} className="flex flex-wrap items-end gap-3">
            <Field
              label="Quorum (% of all votes)"
              required
              error={pctError}
              hint={
                statuteQuorumPct !== null && statuteTitle
                  ? `From your bylaws. ${statuteTitle} sets ${statuteQuorumPct}% unless your bylaws set a lower number.`
                  : 'From your bylaws or declaration.'
              }
              className="w-72"
            >
              <Input
                inputMode="decimal"
                placeholder="e.g. 25"
                value={pctText}
                onChange={(e) => setPctText(e.currentTarget.value)}
                disabled={pending && busy === 'pct'}
                aria-required
              />
            </Field>
            <Button type="submit" size="sm" disabled={pending && busy === 'pct'}>
              {busy === 'pct' ? 'Saving…' : 'Save quorum'}
            </Button>
          </form>
          {count.ignoredEntries > 0 ? (
            <p className="text-xs text-muted">
              {count.ignoredEntries} saved {count.ignoredEntries === 1 ? 'entry is' : 'entries are'} for homes no longer on the roster and
              {count.ignoredEntries === 1 ? ' isn’t' : ' aren’t'} counted.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Printables */}
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            <Printer className="size-4 text-muted" aria-hidden />
            Print
          </CardTitle>
          <CardDescription>Names and addresses only — no emails or phone numbers are printed.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href={`/meetings/${meetingId}/quorum/sign-in`}>
              <FileText className="size-4" aria-hidden />
              Sign-in sheet
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/meetings/${meetingId}/quorum/proxies`}>
              <FileText className="size-4" aria-hidden />
              Proxy forms (all homes)
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/meetings/${meetingId}/quorum/proxies?missing=1`}>
              <FileText className="size-4" aria-hidden />
              Proxy forms (no proxy yet)
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Homes */}
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex flex-wrap items-center gap-3">
            {view === 'chase' ? 'No proxy yet' : 'Check-in and proxies'}
            <Badge variant="neutral" className="num">
              {view === 'chase' ? chase.length : homes.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            {view === 'chase'
              ? 'Homes with no proxy and no check-in. Call or email them yourself — nothing is sent from here.'
              : 'Record a proxy when it arrives, and tap Present as owners sign in.'}
          </CardDescription>
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <div role="tablist" aria-label="Homes" className="flex gap-2">
              <Button role="tab" aria-selected={view === 'checkin'} size="sm" variant={view === 'checkin' ? 'default' : 'secondary'} onClick={() => setView('checkin')}>
                All homes
              </Button>
              <Button role="tab" aria-selected={view === 'chase'} size="sm" variant={view === 'chase' ? 'default' : 'secondary'} onClick={() => setView('chase')}>
                Chase list ({chase.length})
              </Button>
            </div>
            <Field label="Find a home" className="w-64">
              <Input value={filter} onChange={(e) => setFilter(e.currentTarget.value)} placeholder="Address, lot or owner" />
            </Field>
          </div>
        </CardHeader>

        {view === 'chase' ? (
          <div className="space-y-3 border-t border-border px-5 py-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={copyReminder} icon={<ClipboardCopy aria-hidden />}>
                Copy reminder text
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/communications/new">Open the message composer</Link>
              </Button>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-foreground-secondary">Show the reminder text</summary>
              <div className="mt-2 space-y-2 rounded-lg border border-border bg-subtle p-3 text-foreground">
                <p className="font-medium">{reminder.subject}</p>
                {reminder.body.split('\n\n').map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </details>
          </div>
        ) : null}

        {shown.length === 0 ? (
          <p className="border-t border-border px-5 py-6 text-sm text-muted">
            {view === 'chase' ? 'Every home has a proxy or has checked in.' : homes.length === 0 ? 'No homes on the roster yet.' : 'No home matches.'}
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {shown.map((h) => {
              const e = kit.homes[h.propertyId]
              const proxy = e?.proxy?.kind ?? null
              const present = Boolean(e?.presentAt)
              const rowBusy = pending && busy?.startsWith(h.propertyId)
              return (
                <li key={h.propertyId} className="flex flex-col gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {h.home}
                      {h.lot ? <span className="text-muted"> · Lot {h.lot}</span> : null}
                    </p>
                    <p className="text-xs text-foreground-secondary">
                      {h.owners.length === 0 ? 'No owner on record' : h.owners.map((o) => o.name).join(', ')}
                    </p>
                    {view === 'chase' ? (
                      <p className="text-xs text-muted print:hidden">
                        {h.owners
                          .flatMap((o) => [o.phone, o.email])
                          .filter((v): v is string => Boolean(v))
                          .join(' · ') || 'No phone or email on file'}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ProxyPicker
                      value={proxy}
                      disabled={rowBusy}
                      onChange={(kind) => save(`${h.propertyId}:proxy`, { kind: 'proxy', propertyId: h.propertyId, proxy: kind })}
                    />
                    <Button
                      size="sm"
                      variant={present ? 'default' : 'secondary'}
                      aria-pressed={present}
                      disabled={rowBusy}
                      onClick={() => save(`${h.propertyId}:present`, { kind: 'present', propertyId: h.propertyId, present: !present })}
                    >
                      {present ? 'Present ✓' : 'Present'}
                    </Button>
                    {view === 'chase' ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/meetings/${meetingId}/quorum/proxies?home=${h.propertyId}`}>Proxy form</Link>
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num text-xl font-semibold text-foreground">{value}</dd>
      {hint ? <dd className="text-xs text-foreground-secondary">{hint}</dd> : null}
    </div>
  )
}

function ProxyPicker({ value, disabled, onChange }: { value: ProxyKind | null; disabled?: boolean; onChange: (v: ProxyKind | null) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground-secondary">
      <span>Proxy</span>
      <select
        className="h-8 rounded-md border border-border-strong bg-surface px-2 text-sm text-foreground"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const v = e.currentTarget.value
          onChange(v === 'general' || v === 'limited' ? v : null)
        }}
      >
        <option value="">None</option>
        <option value="general">General</option>
        <option value="limited">Limited</option>
      </select>
    </label>
  )
}
