import * as React from 'react'
import type { PrintableHome } from '@/lib/meeting-quorum/quorum'
import { KIT_DISCLAIMER, type ProxyLawNote } from '@/lib/meeting-quorum/law'

/**
 * BL-122 printables: the sign-in sheet and the per-home proxy form.
 * Server-rendered from PrintableHome rows, which carry names, addresses,
 * lots and shares only — never an email or a phone number. Printed from
 * the browser (Print / Save as PDF); nothing is sent from the app.
 */

export interface PrintHeader {
  associationName: string | null
  meetingLabel: string
  meetingDate: string
}

/** Blank rows at the end of the sheet for owners missing from the roster. */
export const SIGN_IN_BLANK_ROWS = 5

export function SignInSheet({ header, homes, showShares }: { header: PrintHeader; homes: PrintableHome[]; showShares: boolean }) {
  return (
    <section aria-label="Sign-in sheet" className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          {header.associationName ? `${header.associationName} — ` : ''}
          {header.meetingLabel} sign-in sheet
        </h2>
        <p className="text-sm text-foreground-secondary">
          {header.meetingDate} · One line per home · One vote per home unless your governing documents say otherwise
        </p>
      </header>
      {/* On a phone the seven columns are wider than the screen: scroll the
          table sideways inside its own box so the page itself never
          overflows. Print keeps the full-width, unscrolled sheet. */}
      <p data-scroll-hint className="text-xs text-muted sm:hidden print:hidden">Scroll sideways to see every column →</p>
      <div
        role="region"
        aria-label="Sign-in sheet table"
        tabIndex={0}
        className="max-w-full overflow-x-auto print:overflow-visible"
      >
        <table className="w-full min-w-[40rem] border-collapse text-sm print:min-w-0">
          <thead>
            <tr className="border-b border-border-strong text-left">
              <th scope="col" className="w-10 py-2 pr-2">#</th>
              <th scope="col" className="py-2 pr-2">Home</th>
              <th scope="col" className="w-16 py-2 pr-2">Lot</th>
              <th scope="col" className="py-2 pr-2">Owner(s) of record</th>
              <th scope="col" className="w-14 py-2 pr-2">Votes</th>
              <th scope="col" className="w-28 py-2 pr-2">In person / proxy</th>
              <th scope="col" className="w-56 py-2">Signature</th>
            </tr>
          </thead>
          <tbody>
            {homes.map((h, i) => (
              <tr key={h.propertyId} className="break-inside-avoid border-b border-border align-top">
                <td className="num py-3 pr-2">{i + 1}</td>
                <td className="py-3 pr-2">{h.home}</td>
                <td className="py-3 pr-2">{h.lot ?? '—'}</td>
                <td className="py-3 pr-2">
                  {h.owners.length === 0
                    ? 'No owner on record'
                    : h.owners.map((o, j) => (
                        <span key={j} className="block">
                          {o.name}
                          {showShares ? <span className="text-foreground-secondary"> ({o.share})</span> : null}
                        </span>
                      ))}
                </td>
                <td className="num py-3 pr-2">{h.votes}</td>
                <td className="py-3 pr-2">☐ In person ☐ Proxy</td>
                <td className="py-3" />
              </tr>
            ))}
            {Array.from({ length: SIGN_IN_BLANK_ROWS }, (_, i) => (
              <tr key={`blank-${i}`} className="break-inside-avoid border-b border-border">
                <td className="num py-4 pr-2">{homes.length + i + 1}</td>
                <td className="py-4" colSpan={6} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Line({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div className={`flex items-end gap-2 ${className}`}>
      <span className="shrink-0 text-sm">{label}</span>
      <span className="h-6 flex-1 border-b border-foreground" />
    </div>
  )
}

export function ProxyForm({ header, home, law }: { header: PrintHeader; home: PrintableHome; law: ProxyLawNote }) {
  const signers = home.owners.length > 0 ? home.owners : [{ name: '', share: '' }]
  return (
    <article aria-label={`Proxy form for ${home.home}`} className="break-after-page space-y-4 pb-8">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Proxy — {header.meetingLabel}</h2>
        <p className="text-sm text-foreground-secondary">{header.associationName ?? 'Homeowners’ association'}</p>
      </header>

      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="font-medium">Home</dt>
        <dd className="min-w-0 break-words">{home.home}</dd>
        <dt className="font-medium">Lot</dt>
        <dd>{home.lot ?? '—'}</dd>
        <dt className="font-medium">Owner(s)</dt>
        <dd className="min-w-0 break-words">{home.owners.length > 0 ? home.owners.map((o) => o.name).join(', ') : 'No owner on record'}</dd>
        <dt className="font-medium">Meeting date</dt>
        <dd>{header.meetingDate}</dd>
      </dl>
      {/* FL § 720.306(8)(a) needs the time and place on the proxy; harmless elsewhere. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Line label="Meeting time:" />
        <Line label="Place:" />
      </div>

      <p className="text-sm">
        I/We, the owner(s) of the home above, appoint the person named below as my/our proxy holder, to attend the meeting
        above and vote for this home{law.state === 'FL' ? ', including at any lawful adjournment of it' : ''}.
      </p>
      <Line label="Proxy holder’s name:" />

      <fieldset className="space-y-2 text-sm">
        <legend className="font-medium">Choose one</legend>
        <p>☐ <strong>General proxy</strong> — the proxy holder may vote on any matter as they see fit.</p>
        <p>
          ☐ <strong>Limited (directed) proxy</strong> — the proxy holder must vote as I/we direct
          {law.detachableDirections ? ' on the separate directions page attached to this form' : ' below'}.
        </p>
      </fieldset>
      {law.detachableDirections ? null : (
        <div className="space-y-3">
          <Line label="Directions:" />
          <Line label="" />
          <Line label="" />
        </div>
      )}

      {law.substitutionClause ? (
        <p className="text-sm">The proxy holder may appoint, in writing, a substitute to act in their place.</p>
      ) : null}
      {law.state === 'FL' ? (
        <p className="text-sm">
          This proxy is effective only for the meeting above, expires 90 days after the meeting date, and may be revoked at any
          time by the person who signed it.
        </p>
      ) : null}
      {law.formClauses.map((c) => (
        <p key={c} className="text-sm">
          {c}
        </p>
      ))}

      <div className="space-y-4 pt-2">
        {signers.map((o, i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem]">
            {o.name ? <p className="self-end text-sm">Owner: {o.name}</p> : <Line label="Owner:" />}
            <Line label="Signature:" />
            <Line label="Date:" />
          </div>
        ))}
      </div>

      <footer className="space-y-1 border-t border-border pt-3 text-xs text-foreground-secondary">
        <p className="font-medium">{law.title}</p>
        {law.lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
        <p>{KIT_DISCLAIMER}</p>
      </footer>

      {law.detachableDirections ? (
        <section aria-label="Voting directions" className="break-before-page space-y-3 pt-8">
          <h3 className="text-base font-semibold">Voting directions — detach and give to the proxy holder</h3>
          <p className="text-sm">
            {home.home} · {header.meetingLabel} · {header.meetingDate}
          </p>
          <Line label="Directions:" />
          <Line label="" />
          <Line label="" />
          <Line label="" />
        </section>
      ) : null}
    </article>
  )
}
