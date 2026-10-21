import * as React from 'react'
import type { ElectionJurisdiction } from '@/lib/elections/law'

/**
 * BL-141 printables: the paper ballot, the two envelope labels, the
 * inspector's record (CA) or the tellers' tally sheet. Server-rendered from
 * candidate NAMES, the seats and the inspectors only. The ballot never
 * names, addresses or numbers the voter (CA § 5115(c)); the outer envelope
 * is where the voter signs. Printed from the browser; nothing is sent from
 * the app.
 */

export interface BallotHeader {
  associationName: string | null
  meetingLabel: string
  meetingDate: string
}

const sheet = 'space-y-4 break-after-page rounded-lg border border-border p-6 print:rounded-none print:border-0 print:p-0'

function Title({ header, children }: { header: BallotHeader; children: React.ReactNode }) {
  return (
    <header className="space-y-1">
      <h2 className="text-lg font-semibold text-foreground">
        {header.associationName ? `${header.associationName} — ` : ''}
        {children}
      </h2>
      <p className="text-sm text-foreground-secondary">
        {header.meetingLabel} · {header.meetingDate}
      </p>
    </header>
  )
}

export function Ballot({
  header,
  candidates,
  seats,
  jurisdiction,
}: {
  header: BallotHeader
  candidates: string[]
  seats: number | null
  jurisdiction: ElectionJurisdiction
}) {
  const secret = jurisdiction === 'CA'
  return (
    <section aria-label="Ballot" className={sheet}>
      <Title header={header}>{secret ? 'Official secret ballot' : 'Official ballot'}: election of directors</Title>
      <p className="text-sm font-medium text-foreground">
        {seats ? `Vote for up to ${seats} ${seats === 1 ? 'candidate' : 'candidates'}.` : 'Vote for up to ____ candidates.'} Mark the box next to each
        candidate you choose.
      </p>
      <ul className="space-y-3">
        {candidates.map((name) => (
          <li key={name} className="flex items-center gap-3 text-base">
            <span aria-hidden className="inline-block size-5 shrink-0 border-2 border-foreground" />
            {name}
          </li>
        ))}
      </ul>
      <div className="space-y-1 border-t border-border pt-3 text-sm text-foreground-secondary">
        {secret ? (
          <>
            <p>Do not sign this ballot or write your name, address or lot on it.</p>
            <p>Seal it in the blank inner envelope. Put that envelope in the outer envelope, sign the outer envelope in the upper left corner, and return it to the inspector of elections.</p>
            <p>The rules governing this election may be found here: ______________________________</p>
          </>
        ) : jurisdiction === 'FL' ? (
          <p>
            If you vote by absentee secret ballot (only where your governing documents allow it): don’t sign this ballot. Seal it in the blank inner
            envelope, and put that in the outer envelope with your name, lot and signature. Two ballots for one lot are both disqualified.
          </p>
        ) : (
          <p>Return this ballot as your association’s notice explains. Your bylaws decide whether ballots are signed or secret.</p>
        )}
      </div>
    </section>
  )
}

export function EnvelopeLabels({
  header,
  jurisdiction,
  inspectors,
}: {
  header: BallotHeader
  jurisdiction: ElectionJurisdiction
  inspectors: string[]
}) {
  const to = jurisdiction === 'CA' ? `Inspector${inspectors.length > 1 ? 's' : ''} of elections${inspectors.length ? `: ${inspectors.join(', ')}` : ''}` : 'The association, attention election tellers'
  return (
    <section aria-label="Envelope labels" className={sheet}>
      <Title header={header}>Envelope labels</Title>
      <p className="text-sm text-foreground-secondary">Cut along the lines and stick one of each on every ballot’s two envelopes.</p>
      <div className="grid gap-6 sm:grid-cols-2 print:grid-cols-2">
        <div className="space-y-2 border-2 border-dashed border-border-strong p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">Inner envelope</p>
          <p className="text-base font-semibold text-foreground">SECRET BALLOT</p>
          <p className="text-sm">Seal your ballot inside. Do not sign or write your name, address or lot on this envelope.</p>
        </div>
        <div className="space-y-3 border-2 border-dashed border-border-strong p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">Outer envelope (upper left corner)</p>
          <p className="text-sm">Signature: ______________________________</p>
          <p className="text-sm">Printed name: ___________________________</p>
          <p className="text-sm">Address or lot that entitles you to vote: ___________________</p>
          <p className="border-t border-border pt-2 text-sm font-medium">To: {to}</p>
        </div>
      </div>
    </section>
  )
}

export function TallySheet({
  header,
  candidates,
  jurisdiction,
  inspectors,
}: {
  header: BallotHeader
  candidates: string[]
  jurisdiction: ElectionJurisdiction
  inspectors: string[]
}) {
  const ca = jurisdiction === 'CA'
  const who = ca ? 'Inspector' : 'Teller'
  const people = inspectors.length > 0 ? inspectors : ['', '', '']
  return (
    <section aria-label={ca ? 'Inspector’s record' : 'Tally sheet'} className={sheet}>
      <Title header={header}>{ca ? 'Inspector of elections: record and tally' : 'Tally sheet'}</Title>
      {ca ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-foreground">Each inspector confirms they are independent:</p>
          <ul className="space-y-1">
            <li>☐ I am not a director, a candidate, or related to a director or a candidate.</li>
            <li>☐ I am not employed by or under contract to the association for paid work other than serving as inspector.</li>
          </ul>
          <p className="font-medium text-foreground">Count:</p>
          <ul className="space-y-1">
            <li>Memberships entitled to vote: ________</li>
            <li>Outer envelopes received: ________ Rejected (signature or eligibility): ________</li>
            <li>Ballots counted: ________ Counted in public at the meeting on: ______________</li>
          </ul>
        </div>
      ) : (
        <p className="text-sm text-foreground-secondary">Ballots received: ________ Ballots counted: ________ Ballots rejected: ________</p>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-strong text-left">
            <th scope="col" className="py-2 pr-2">Candidate</th>
            <th scope="col" className="py-2 pr-2">Tally</th>
            <th scope="col" className="w-24 py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((name) => (
            <tr key={name} className="break-inside-avoid border-b border-border">
              <td className="py-4 pr-2">{name}</td>
              <td className="py-4 pr-2" />
              <td className="py-4" />
            </tr>
          ))}
        </tbody>
      </table>
      <div className="space-y-3 pt-2 text-sm">
        {people.map((p, i) => (
          <p key={i}>
            {who} {i + 1}: {p || '______________________'} · Signature: ______________________ · Date: __________
          </p>
        ))}
      </div>
    </section>
  )
}
