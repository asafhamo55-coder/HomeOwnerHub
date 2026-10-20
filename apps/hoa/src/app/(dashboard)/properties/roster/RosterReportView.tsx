import { Download } from 'lucide-react'
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, DataTable, StatusPill, type DataTableColumn } from '@homeowner-portal/ui'
import { formatDay, plural, usd } from '@/lib/money/format'
import {
  CA_OPT_OUT_CHECK,
  CONTACT_WARNING,
  RECORDS_COPY_NOTICE,
  ownerRosterLaw,
  recordsCopyLaw,
  voterListLaw,
  type LawNote,
} from '@/lib/properties/statutory-roster/law'
import {
  MAILING_SOURCE_LABEL,
  SHARING_OPT_OUT_STORED,
  reportAsOf,
  rosterCsvHref,
  type OwnerRosterRow,
  type RecordsRow,
  type RosterReport,
  type VoterRow,
} from '@/lib/properties/statutory-roster/model'
import { PrintRosterButton } from './PrintRosterButton'

/**
 * The roster or voter list as it appears on screen and on paper. Pure
 * presentation: the page loads and builds the report (model.ts). The
 * action row never prints; the header, warning, table and law notes do.
 */
export function RosterReportView({
  report,
  associationName,
  states,
  generatedOn,
}: {
  report: RosterReport
  associationName: string | null
  /** States among the homes, for the law notes. */
  states: string[]
  /** The association's today, printed on the page. */
  generatedOn: string
}) {
  const asOf = reportAsOf(report)
  const title = report.kind === 'owners' ? 'Owner roster' : report.kind === 'voters' ? 'Voter list' : 'Owner roster — records-request copy'
  const homes = report.kind === 'owners' ? report.roster.counts.homes : report.kind === 'voters' ? report.list.counts.homes : report.copy.counts.homes
  const lawFor = report.kind === 'owners' ? ownerRosterLaw : report.kind === 'voters' ? voterListLaw : recordsCopyLaw
  const notes = states.map(lawFor).filter((n): n is LawNote => n !== null)

  return (
    <section aria-labelledby="roster-heading" className="space-y-4 print:space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="roster-heading" className="text-lg font-semibold text-foreground">
            {title}
            {associationName ? <span className="font-normal text-foreground-secondary"> · {associationName}</span> : null}
          </h2>
          <p className="num text-sm text-muted">
            As of {formatDay(asOf)} · {plural(homes, 'home')} · made {formatDay(generatedOn)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button asChild variant="secondary">
            {/* Plain anchor: a Link would prefetch the file. */}
            <a href={rosterCsvHref(report.kind, asOf)}>
              <Download aria-hidden />
              Download CSV
            </a>
          </Button>
          <PrintRosterButton />
        </div>
      </div>

      {report.kind === 'owners' ? (
        <Alert variant="warning" title="Board only: personal contact information">
          {CONTACT_WARNING}
        </Alert>
      ) : report.kind === 'voters' ? (
        <Alert variant="warning" title="Board only: past-due balances">
          This list shows which homes are behind on dues. Keep it with the board. To post a list of voters, leave out
          the past-due columns.
        </Alert>
      ) : (
        <RecordsAlerts report={report} />
      )}

      {report.kind === 'owners' ? (
        <OwnerSummary report={report} />
      ) : report.kind === 'voters' ? (
        <VoterSummary report={report} />
      ) : (
        <RecordsSummary report={report} />
      )}

      {report.kind === 'owners' ? (
        <OwnerTable rows={report.roster.rows} />
      ) : report.kind === 'voters' ? (
        <VoterTable rows={report.list.rows} />
      ) : (
        <RecordsTable rows={report.copy.rows} />
      )}

      {notes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h3">What the law says</CardTitle>
            <CardDescription>Citations as text. Not legal advice.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {notes.map((n) => (
              <div key={n.state} className="space-y-1.5">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                  {n.title}
                  {n.verified ? null : <StatusPill tone="warning" label="Verify" />}
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground-secondary">
                  {n.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted">
          We don’t have your state’s roster or voting rules on file. Check your governing documents and state statute
          for what the roster must hold and who may see it.
        </p>
      )}
    </section>
  )
}

function OwnerSummary({ report }: { report: Extract<RosterReport, { kind: 'owners' }> }) {
  const c = report.roster.counts
  const propertyAddress = c.homes - c.mailingOnFile
  return (
    <ul className="space-y-1 text-sm text-foreground-secondary">
      <li className="num">
        {plural(c.owners, 'owner')} across {plural(c.homes, 'home')}.
      </li>
      {c.noOwner > 0 ? (
        <li className="num text-warning">
          {plural(c.noOwner, 'home has', 'homes have')} no owner on record on this date.
        </li>
      ) : null}
      {c.fromHomeRecord > 0 ? (
        <li className="num">
          {plural(c.fromHomeRecord, 'owner comes', 'owners come')} from the home’s own record, which has no
          ownership dates, so they are today’s owner whatever the date.
        </li>
      ) : null}
      {propertyAddress > 0 ? (
        <li className="num">
          {plural(propertyAddress, 'home shows its', 'homes show their')} property address as the mailing
          address: no other mailing address is on file.
        </li>
      ) : null}
    </ul>
  )
}

function VoterSummary({ report }: { report: Extract<RosterReport, { kind: 'voters' }> }) {
  const { counts, quorum } = report.list
  return (
    <div className="space-y-3">
      <ul className="space-y-1 text-sm text-foreground-secondary">
        <li className="num">
          {plural(counts.totalVotes, 'vote')}: one per home. Your association has no
          voting rule stored here, so every home counts once. If your governing documents allocate votes differently,
          use them instead.
        </li>
        {counts.noOwner > 0 ? (
          <li className="num text-warning">
            {plural(counts.noOwner, 'home has', 'homes have')} no owner on record on this date. The vote
            still belongs to the home.
          </li>
        ) : null}
        {counts.mayBeSuspended > 0 ? (
          <li className="num">
            {plural(counts.mayBeSuspended, 'home is', 'homes are')} more than 90 days past due and
            may be suspended, but only if the board voted the suspension at a properly noticed meeting. Nothing is
            suspended here.
          </li>
        ) : null}
      </ul>
      {quorum ? (
        <Card variant="subtle">
          <CardContent className="space-y-1 pt-5 text-sm text-foreground-secondary">
            <p className="num">
              <span className="font-medium text-foreground">Quorum (Florida default, {quorum.pct}%):</span>{' '}
              {quorum.needed.toLocaleString()} of {quorum.totalVotes.toLocaleString()} votes.
            </p>
            {counts.mayBeSuspended > 0 ? (
              <p className="num">
                If the board has suspended all {plural(counts.mayBeSuspended, 'flagged home')}:{' '}
                {quorum.ifAllFlaggedSuspended.needed.toLocaleString()} of {quorum.ifAllFlaggedSuspended.totalVotes.toLocaleString()}.
              </p>
            ) : null}
            <p>Your bylaws may set a lower quorum. Theirs is the number to use.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function PropertyCell({ row }: { row: Pick<OwnerRosterRow, 'address' | 'unitNumber' | 'lotNumber'> }) {
  return (
    <div className="min-w-0">
      <p className="break-words font-medium text-foreground">{row.address}</p>
      {row.unitNumber || row.lotNumber ? (
        <p className="text-xs text-muted">
          {[row.unitNumber ? `Unit ${row.unitNumber}` : null, row.lotNumber ? `Lot ${row.lotNumber}` : null].filter(Boolean).join(' · ')}
        </p>
      ) : null}
    </div>
  )
}

function OwnersCell({ row }: { row: OwnerRosterRow }) {
  if (row.owners.length === 0) return <span className="text-warning">No owner on record on this date</span>
  return (
    <div className="space-y-1">
      <ul className="space-y-0.5">
        {row.owners.map((o) => (
          <li key={`${o.name}-${o.since ?? ''}`} className="break-words">
            <span className="text-foreground">{o.name}</span> <span className="num text-muted">({o.share})</span>
            {o.since ? <span className="num block text-xs text-muted">since {formatDay(o.since)}</span> : null}
          </li>
        ))}
      </ul>
      {row.ownerSource === 'home_record' ? <p className="text-xs text-muted">From the home’s record (no ownership dates)</p> : null}
      {row.sharesWarning ? <p className="text-xs text-warning">{row.sharesWarning}</p> : null}
    </div>
  )
}

const contactList = (row: OwnerRosterRow, pick: 'email' | 'phone') => {
  const items = row.owners.filter((o) => o[pick])
  if (items.length === 0) return <span className="text-muted">None on file</span>
  return (
    <ul className="space-y-0.5">
      {items.map((o) => (
        <li key={`${o.name}-${pick}`} className="break-all">
          {o[pick]}
          {row.owners.length > 1 ? <span className="block text-xs text-muted">{o.name}</span> : null}
        </li>
      ))}
    </ul>
  )
}

function OwnerTable({ rows }: { rows: OwnerRosterRow[] }) {
  const columns: DataTableColumn<OwnerRosterRow>[] = [
    { key: 'home', header: 'Property', cell: (r) => <PropertyCell row={r} />, mobilePrimary: true },
    { key: 'owners', header: 'Owners (share)', cell: (r) => <OwnersCell row={r} /> },
    {
      key: 'mailing',
      header: 'Mailing address',
      cell: (r) => (
        <div className="min-w-0">
          <p className="break-words">{r.mailing.text}</p>
          {r.mailing.source === 'property_address' ? <p className="text-xs text-muted">{MAILING_SOURCE_LABEL.property_address}</p> : null}
        </div>
      ),
    },
    { key: 'email', header: 'Email', cell: (r) => contactList(r, 'email') },
    { key: 'phone', header: 'Phone', cell: (r) => contactList(r, 'phone') },
  ]
  return <DataTable columns={columns} rows={rows} rowKey={(r) => r.propertyId} caption="Owner roster" mobile="cards" density="compact" empty={<p className="p-5 text-sm text-muted">No homes on file yet.</p>} />
}

function VoterTable({ rows }: { rows: VoterRow[] }) {
  const columns: DataTableColumn<VoterRow>[] = [
    { key: 'home', header: 'Property', cell: (r) => <PropertyCell row={r} />, mobilePrimary: true },
    { key: 'owners', header: 'Eligible owners', cell: (r) => <OwnersCell row={r} /> },
    { key: 'votes', header: 'Votes', numeric: true, cell: (r) => r.votes },
    {
      key: 'pastDue',
      header: 'Past due',
      numeric: true,
      cell: (r) =>
        r.delinquency.daysPastDue > 0 ? (
          <span>
            {usd(r.delinquency.pastDueCents / 100)}
            <span className="block text-xs text-muted">
              {plural(r.delinquency.daysPastDue, 'day')}
            </span>
          </span>
        ) : (
          <span className="text-muted">None</span>
        ),
    },
    {
      key: 'flag',
      header: 'Flag',
      cell: (r) =>
        r.flag === 'may_be_suspended' ? (
          <div className="space-y-1">
            <StatusPill tone="warning" label="May be suspended" />
            <p className="text-xs text-muted">Only if the board voted it (§ 720.305(5))</p>
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ]
  return <DataTable columns={columns} rows={rows} rowKey={(r) => r.propertyId} caption="Voter list" mobile="cards" density="compact" empty={<p className="p-5 text-sm text-muted">No homes on file yet.</p>} />
}

// ─── Records-request copy ──────────────────────────────────────────────

function RecordsAlerts({ report }: { report: Extract<RosterReport, { kind: 'records' }> }) {
  const needsOptOutCheck = !SHARING_OPT_OUT_STORED && report.copy.counts.caHomes > 0
  return (
    // Board guidance, not part of the copy handed over: never printed.
    <div className="space-y-3 print:hidden">
      <Alert variant="info" title="Copy for an owner’s records request">
        {RECORDS_COPY_NOTICE}
      </Alert>
      {needsOptOutCheck ? (
        <Alert variant="warning" title="Check California opt-outs before you release this">
          {CA_OPT_OUT_CHECK}
        </Alert>
      ) : null}
    </div>
  )
}

function RecordsSummary({ report }: { report: Extract<RosterReport, { kind: 'records' }> }) {
  const c = report.copy.counts
  return (
    <ul className="space-y-1 text-sm text-foreground-secondary print:hidden">
      <li className="num">
        {plural(c.owners, 'owner')} across {plural(c.homes, 'home')}.
      </li>
      {c.noOwner > 0 ? (
        <li className="num text-warning">
          {plural(c.noOwner, 'home has', 'homes have')} no owner on record on this date.
        </li>
      ) : null}
      {c.emailsLeftOut > 0 ? (
        <li className="num">
          {plural(c.emailsLeftOut, 'email address on file is', 'email addresses on file are')} left out of this copy.
        </li>
      ) : null}
      {c.ownersWithheld > 0 ? (
        <li className="num">
          {plural(c.ownersWithheld, 'owner who opted out is', 'owners who opted out are')} left off (Civ. Code § 5220).
        </li>
      ) : null}
    </ul>
  )
}

function RecordsTable({ rows }: { rows: RecordsRow[] }) {
  const columns: DataTableColumn<RecordsRow>[] = [
    { key: 'home', header: 'Property', cell: (r) => <PropertyCell row={r} />, mobilePrimary: true },
    {
      key: 'owners',
      header: 'Owners',
      cell: (r) =>
        r.ownerNames.length === 0 ? (
          <span className="text-warning">No owner on record on this date</span>
        ) : (
          <ul className="space-y-0.5">
            {r.ownerNames.map((n, i) => (
              <li key={`${n}-${i}`} className="break-words text-foreground">
                {n}
              </li>
            ))}
          </ul>
        ),
    },
    {
      key: 'mailing',
      header: 'Mailing address',
      cell: (r) => (
        <div className="min-w-0">
          <p className="break-words">{r.mailing.text}</p>
          {r.mailing.source === 'property_address' ? <p className="text-xs text-muted">{MAILING_SOURCE_LABEL.property_address}</p> : null}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      cell: (r) =>
        r.emails.length > 0 ? (
          <ul className="space-y-0.5">
            {r.emails.map((e) => (
              <li key={e} className="break-all">
                {e}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted">{r.emailNote ? 'Not shared' : '—'}</span>
        ),
    },
  ]
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.propertyId}
      caption="Owner roster — records-request copy"
      mobile="cards"
      density="compact"
      empty={<p className="p-5 text-sm text-muted">No homes on file yet.</p>}
    />
  )
}
