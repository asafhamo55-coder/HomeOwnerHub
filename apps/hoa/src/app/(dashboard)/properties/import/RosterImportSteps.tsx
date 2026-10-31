'use client'

/**
 * The steps of the board roster import, as plain presentational pieces
 * (props in, callbacks out) so each renders on its own in tests and in
 * the static previews. State and server calls live in RosterImport.tsx.
 */
import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, FileSpreadsheet, Upload } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ChoiceGroup,
  Field,
  Fieldset,
  Kpi,
  Radio,
  Select,
  StatusPill,
  TableScroll,
  cn,
} from '@homeowner-portal/ui'
import { usd } from '@/lib/money/format'
import { saveRosterBalances } from '@/lib/accounting/opening-balances/handoff'
import { PRESET_LABELS, ROSTER_FIELDS, type ColumnMapping, type RosterFieldKey, type RosterPreset } from '@/lib/properties/roster/fields'
import type { ClassifiedRow, RosterMode, RosterSummary, RowStatus } from '@/lib/properties/roster/classify'
import type { RowResult } from '@/lib/properties/roster/commit'
import { importedEmailCount } from '@/lib/properties/roster/next-steps'
import type { SheetRow } from '@/lib/properties/roster/xlsx'

/**
 * BL-126: the import's balances go nowhere on their own. This link opens
 * the opening-balance wizard and hands it the file's balances through this
 * tab's sessionStorage (never the server), so step 2 can fill them in.
 */
function OpeningBalancesLink({ classified }: { classified: ClassifiedRow[] }) {
  const save = () =>
    saveRosterBalances(
      classified
        .filter((c) => c.row.balance !== null && c.row.balance !== 0)
        .map((c) => ({ address: c.row.address, unit: c.row.unit, balance: c.row.balance as number })),
    )
  return (
    <Link href="/accounting/opening-balances" onClick={save} className="font-medium text-primary underline-offset-2 hover:underline">
      Enter opening balances
    </Link>
  )
}

export interface AssociationChoice {
  id: string
  name: string
}

const NONE = '__none__'

export const STATUS_LABEL: Record<RowStatus, string> = {
  new: 'New home',
  update: 'Update',
  duplicate: 'Skipped',
  error: 'Error',
}
const STATUS_TONE: Record<RowStatus, 'success' | 'info' | 'neutral' | 'danger'> = {
  new: 'success',
  update: 'info',
  duplicate: 'neutral',
  error: 'danger',
}

// ─── 1. Upload ──────────────────────────────────────────────────────

export function UploadStep({
  associations,
  associationId,
  onAssociation,
  onFile,
  onTemplate,
  error,
  busy = false,
}: {
  /** Non-empty only when the org has more than one community. */
  associations: AssociationChoice[]
  associationId: string | null
  onAssociation: (id: string) => void
  onFile: (file: File) => void
  onTemplate: () => void
  error?: string | null
  busy?: boolean
}) {
  const inputId = React.useId()
  const [dragging, setDragging] = React.useState(false)
  const needsCommunity = associations.length > 0 && !associationId
  const pick = (files: FileList | null) => {
    const f = files?.[0]
    if (f) onFile(f)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Choose your roster file</CardTitle>
        <CardDescription>
          One row per home: the address, and the owner’s name, email and phone if you have them. CSV or Excel (.xlsx), up to 5 MB and
          5,000 rows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {associations.length > 0 ? (
          <Field label="Community" required hint="Every home in this file is added to this community.">
            <Select
              value={associationId ?? undefined}
              onValueChange={onAssociation}
              placeholder="Choose a community"
              options={associations.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Field>
        ) : null}

        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (!needsCommunity && !busy) pick(e.dataTransfer.files)
          }}
          className={cn(
            'flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-strong bg-subtle p-6 text-center transition-colors duration-fast hover:border-primary',
            dragging && 'border-primary bg-primary-subtle',
            (needsCommunity || busy) && 'pointer-events-none opacity-60',
          )}
        >
          <Upload className="size-6 text-muted" aria-hidden />
          <span className="text-sm font-medium text-foreground">{busy ? 'Reading the file…' : 'Drop the file here, or choose one'}</span>
          <span className="text-xs text-muted">
            {needsCommunity ? 'Choose the community first.' : 'Formulas are never run: we read the values your spreadsheet saved.'}
          </span>
          <input
            id={inputId}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={needsCommunity || busy}
            onChange={(e) => {
              pick(e.target.files)
              e.target.value = ''
            }}
          />
        </label>

        {error ? (
          <Alert variant="error" title="Couldn’t use that file">
            {error}
          </Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground">Starting from scratch?</p>
            <p className="mt-1 text-xs text-muted">Fill in our template: one row per home, with an example to copy.</p>
            <Button variant="secondary" size="sm" className="mt-3 min-h-10 sm:min-h-0" onClick={onTemplate}>
              <Download aria-hidden />
              Download the template
            </Button>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground">Moving from CINC Systems?</p>
            <p className="mt-1 text-xs text-muted">
              Export the homeowner list as Excel or CSV and upload it as it is. We recognise its columns.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 2. Map columns ─────────────────────────────────────────────────

const GROUPS: Array<{ title: string; fields: RosterFieldKey[] }> = [
  { title: 'The home', fields: ['address', 'unit', 'city', 'state', 'zip', 'tenure'] },
  { title: 'The owner', fields: ['owner_name', 'owner_first_name', 'owner_last_name', 'owner_email', 'owner_phone'] },
  { title: 'Mailing address (if different)', fields: ['mailing_address', 'mailing_city', 'mailing_state', 'mailing_zip'] },
  { title: 'For reference only', fields: ['balance'] },
]
const FIELD = new Map(ROSTER_FIELDS.map((f) => [f.key, f]))

const HINTS: Partial<Record<RosterFieldKey, string>> = {
  tenure: 'Owner-occupied or rented. Fills homes whose tenure is unknown.',
  owner_first_name: 'Only used when there is no full-name column.',
  owner_last_name: 'Only used when there is no full-name column.',
  balance: 'Shown in the preview. The import never posts balances; enter them afterwards under Accounting › Opening balances.',
}

export function MappingStep({
  fileName,
  headers,
  rows,
  mapping,
  preset,
  detected,
  onMapping,
  onPreset,
  onBack,
  onNext,
  error,
  busy = false,
}: {
  fileName: string
  headers: string[]
  rows: SheetRow[]
  mapping: ColumnMapping
  preset: RosterPreset
  /** What auto-detect found, for the "looks like" note. */
  detected: RosterPreset
  onMapping: (m: ColumnMapping) => void
  onPreset: (p: RosterPreset) => void
  onBack: () => void
  onNext: () => void
  error?: string | null
  busy?: boolean
}) {
  const sample = (col: number | undefined) => {
    if (col === undefined) return null
    const v = rows.find((r) => (r.cells[col] ?? '').trim() !== '')?.cells[col]?.trim()
    return v ? (v.length > 40 ? `${v.slice(0, 40)}…` : v) : null
  }
  const options = [{ value: NONE, label: 'Not in this file' }, ...headers.map((h, i) => ({ value: String(i), label: h }))]
  const missingAddress = mapping.address === undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Match your columns</CardTitle>
        <CardDescription>
          <span className="inline-flex items-center gap-1.5">
            <FileSpreadsheet className="size-4" aria-hidden />
            <span className="break-all">{fileName}</span>
          </span>{' '}
          · {rows.length.toLocaleString('en-US')} {rows.length === 1 ? 'row' : 'rows'}. We matched what we could; check each one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Column layout" hint={detected === 'generic' ? 'Matched by column name.' : `This looks like a ${PRESET_LABELS[detected]}.`}>
            <Select
              value={preset}
              onValueChange={(v) => onPreset(v as RosterPreset)}
              options={(Object.keys(PRESET_LABELS) as RosterPreset[]).map((p) => ({ value: p, label: PRESET_LABELS[p] }))}
            />
          </Field>
        </div>

        {GROUPS.map((g) => (
          <section key={g.title} className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{g.title}</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.fields.map((key) => {
                const f = FIELD.get(key)!
                const col = mapping[key]
                const eg = sample(col)
                return (
                  <Field
                    key={key}
                    label={f.label}
                    required={'required' in f && f.required}
                    error={key === 'address' && missingAddress ? 'Choose the column with the property address.' : undefined}
                    // The balance note always shows: it is the one field the import ignores on purpose.
                    hint={key === 'balance' ? `${eg ? `e.g. ${eg}. ` : ''}${HINTS.balance}` : eg ? `e.g. ${eg}` : HINTS[key]}
                  >
                    <Select
                      value={col === undefined ? NONE : String(col)}
                      onValueChange={(v) => {
                        const next = { ...mapping }
                        if (v === NONE) delete next[key]
                        else {
                          // One column feeds one field.
                          for (const k of Object.keys(next) as RosterFieldKey[]) if (next[k] === Number(v)) delete next[k]
                          next[key] = Number(v)
                        }
                        onMapping(next)
                      }}
                      options={options}
                    />
                  </Field>
                )
              })}
            </div>
          </section>
        ))}

        {error ? (
          <Alert variant="error" title="Couldn’t check the rows">
            {error}
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft aria-hidden />
          Choose another file
        </Button>
        <Button onClick={onNext} loading={busy} disabled={missingAddress}>
          Check rows
        </Button>
      </CardFooter>
    </Card>
  )
}

// ─── 3. Dry run ─────────────────────────────────────────────────────

export const PREVIEW_ROW_LIMIT = 100
type Filter = 'all' | RowStatus

export function Counts({ summary, done = false }: { summary: RosterSummary; done?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label={done ? 'New homes added' : 'New homes'} value={summary.new.toLocaleString('en-US')} />
      <Kpi label={done ? 'Homes updated' : 'Updates'} value={summary.update.toLocaleString('en-US')} />
      <Kpi label="Skipped" value={summary.duplicate.toLocaleString('en-US')} hint="Already on file, or repeated" />
      <Kpi label="Errors" value={summary.error.toLocaleString('en-US')} hint={summary.error ? 'Not imported' : undefined} />
    </div>
  )
}

export function RowTable({
  rows,
  showBalance,
  filter,
  onFilter,
  counts,
}: {
  rows: Array<{ row: ClassifiedRow['row']; status: RowStatus; reason?: string }>
  showBalance: boolean
  filter: Filter
  onFilter: (f: Filter) => void
  counts: RosterSummary
}) {
  const shown = rows.filter((r) => filter === 'all' || r.status === filter)
  const chips: Array<[Filter, string, number]> = [
    ['all', 'All', counts.total],
    ['new', 'New', counts.new],
    ['update', 'Update', counts.update],
    ['duplicate', 'Skipped', counts.duplicate],
    ['error', 'Errors', counts.error],
  ]
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Show rows" className="flex flex-wrap gap-1.5">
        {chips.map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => onFilter(key)}
            className={cn(
              'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors duration-fast sm:min-h-8',
              filter === key ? 'border-primary bg-primary-subtle text-foreground' : 'border-border text-muted hover:bg-subtle hover:text-foreground',
            )}
          >
            {label}
            <span className="num text-xs">{n.toLocaleString('en-US')}</span>
          </button>
        ))}
      </div>
      <TableScroll className="rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">What Import will do with each row</caption>
          <thead className="bg-subtle text-left text-xs font-medium text-muted">
            <tr>
              <th scope="col" className="px-3 py-2">Row</th>
              <th scope="col" className="px-3 py-2">Property</th>
              <th scope="col" className="hidden px-3 py-2 md:table-cell">Owner</th>
              <th scope="col" className="px-3 py-2">Result</th>
              {showBalance ? (
                <th scope="col" className="hidden px-3 py-2 text-right md:table-cell">Balance</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.slice(0, PREVIEW_ROW_LIMIT).map(({ row, status, reason }) => (
              <tr key={row.row} className="align-top">
                <td className="num px-3 py-2 text-muted">{row.row}</td>
                <td className="px-3 py-2 md:min-w-40">
                  <span className="block text-foreground">{row.address || <span className="text-muted">No address</span>}</span>
                  {row.unit ? <span className="block text-xs text-muted">Unit / Lot {row.unit}</span> : null}
                  <span className="block text-xs text-muted md:hidden">{row.ownerName ?? row.ownerEmail ?? ''}</span>
                </td>
                <td className="hidden min-w-40 px-3 py-2 md:table-cell">
                  <span className="block text-foreground">{row.ownerName ?? <span className="text-muted">—</span>}</span>
                  {row.ownerEmail ? <span className="block break-all text-xs text-muted">{row.ownerEmail}</span> : null}
                </td>
                <td className="min-w-32 px-3 py-2 md:min-w-44">
                  <StatusPill tone={STATUS_TONE[status]} label={STATUS_LABEL[status]} size="sm" />
                  {reason ? <span className="mt-1 block text-xs text-muted">{reason}</span> : null}
                </td>
                {showBalance ? (
                  <td className="num hidden px-3 py-2 text-right text-muted md:table-cell">
                    {row.balance === null ? '—' : usd(row.balance)}
                  </td>
                ) : null}
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={showBalance ? 5 : 4} className="px-3 py-6 text-center text-sm text-muted">
                  No rows here.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableScroll>
      {shown.length > PREVIEW_ROW_LIMIT ? (
        <p className="text-xs text-muted">
          Showing the first {PREVIEW_ROW_LIMIT} of {shown.length.toLocaleString('en-US')} rows.
        </p>
      ) : null}
    </div>
  )
}

export function PreviewStep({
  classified,
  summary,
  mode,
  onMode,
  hasExisting,
  showBalance,
  onBack,
  onImport,
  onDownloadErrors,
  error,
  busy = false,
}: {
  classified: ClassifiedRow[]
  summary: RosterSummary
  mode: RosterMode
  onMode: (m: RosterMode) => void
  /** Some rows match a home already on file. */
  hasExisting: boolean
  showBalance: boolean
  onBack: () => void
  onImport: () => void
  onDownloadErrors: () => void
  error?: string | null
  busy?: boolean
}) {
  const [filter, setFilter] = React.useState<Filter>(summary.error > 0 ? 'error' : 'all')
  const modeName = `roster-mode-${React.useId().replace(/:/g, '')}`
  const toImport = summary.new + summary.update
  const balances = classified.filter((c) => c.row.balance !== null)
  const balanceTotal = balances.reduce((n, c) => n + (c.row.balance ?? 0), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Check before you import</CardTitle>
        <CardDescription>Nothing has been saved yet. This is what Import will do with each row.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Counts summary={summary} />

        <Fieldset
          legend="Homes already on file"
          hint={hasExisting ? 'Matched by address and unit number.' : 'None of the homes in this file are on file yet.'}
        >
          <ChoiceGroup>
            <Radio
              name={modeName}
              checked={mode === 'skip'}
              onChange={() => onMode('skip')}
              label="Skip them"
              description="Leave homes you already have exactly as they are."
            />
            <Radio
              name={modeName}
              checked={mode === 'update'}
              onChange={() => onMode('update')}
              label="Update them"
              description="Fill in the unit, city, state and ZIP, set an unknown tenure, and refresh the phone and name of an owner already on file. Other owners in the file are added."
            />
          </ChoiceGroup>
        </Fieldset>

        {showBalance ? (
          <Alert variant="info" title="Balances are for reference only">
            The file has balances for {balances.length.toLocaleString('en-US')} {balances.length === 1 ? 'home' : 'homes'} (
            {usd(balanceTotal)} in all). Import does not post them. After the import, carry them into the books with{' '}
            <OpeningBalancesLink classified={classified} />.
          </Alert>
        ) : null}

        <RowTable rows={classified} showBalance={showBalance} filter={filter} onFilter={setFilter} counts={summary} />

        {error ? (
          <Alert variant="error" title="Couldn’t start the import">
            {error}
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft aria-hidden />
          Back to columns
        </Button>
        <div className="flex flex-wrap gap-2">
          {summary.error > 0 ? (
            <Button variant="secondary" onClick={onDownloadErrors} disabled={busy}>
              <Download aria-hidden />
              Download rows with errors
            </Button>
          ) : null}
          <Button onClick={onImport} loading={busy} disabled={toImport === 0}>
            {toImport === 0 ? 'Nothing to import' : `Import ${toImport.toLocaleString('en-US')} ${toImport === 1 ? 'row' : 'rows'}`}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}

// ─── 4. Importing ───────────────────────────────────────────────────

export function ProgressStep({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 100 : Math.round((done / total) * 100)
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Importing…</CardTitle>
        <CardDescription>Keep this page open until it finishes. Homes are saved as it goes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div
          className="h-2 overflow-hidden rounded-full bg-subtle"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Import progress"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-fast" style={{ width: `${pct}%` }} />
        </div>
        <p className="num text-sm text-muted" aria-live="polite">
          Saved {done.toLocaleString('en-US')} of {total.toLocaleString('en-US')} rows
        </p>
      </CardContent>
    </Card>
  )
}

// ─── 5. Done ────────────────────────────────────────────────────────

/** The three things a board usually does next. Invite owners only when the file had emails. */
export function WhatsNext({ emailCount }: { emailCount: number }) {
  return (
    <section aria-labelledby="roster-next-h" className="space-y-2 rounded-xl border border-border bg-surface p-4">
      <h3 id="roster-next-h" className="text-sm font-semibold text-foreground">
        What’s next
      </h3>
      <ul className="space-y-1.5 text-sm">
        {emailCount > 0 ? (
          <li>
            <Link href="/settings/members" className="font-medium text-primary underline">
              Invite owners
            </Link>{' '}
            <span className="text-muted">
              ({emailCount.toLocaleString('en-US')} {emailCount === 1 ? 'row has' : 'rows have'} an email)
            </span>
          </li>
        ) : null}
        <li>
          <Link href="/dues" className="font-medium text-primary underline">
            Generate dues
          </Link>
        </li>
        <li>
          <Link href="/communications/announce" className="font-medium text-primary underline">
            Send your first announcement
          </Link>
        </li>
      </ul>
    </section>
  )
}

export function DoneStep({
  summary,
  results,
  classified,
  onDownloadErrors,
  onRestart,
}: {
  summary: RosterSummary
  results: RowResult[]
  classified: ClassifiedRow[]
  onDownloadErrors: () => void
  onRestart: () => void
}) {
  const [filter, setFilter] = React.useState<Filter>(summary.error > 0 ? 'error' : 'all')
  const byRow = new Map(classified.map((c) => [c.row.row, c.row]))
  const rows = results.flatMap((r) => {
    const row = byRow.get(r.row)
    return row ? [{ row, status: r.status, reason: r.reason }] : []
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Import finished</CardTitle>
        <CardDescription>
          {summary.error === 0
            ? 'Every row was handled. The homes are on the Properties list now.'
            : `${summary.error.toLocaleString('en-US')} ${summary.error === 1 ? 'row was' : 'rows were'} not imported. Download them, fix what each one says, and import that file again: rows already in are recognised, never doubled.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Counts summary={summary} done />
        {classified.some((c) => c.row.balance !== null && c.row.balance !== 0) ? (
          <Alert variant="info" title="Enter the balances in Accounting">
            The file had balances, and the import didn’t post them. Carry them into the books with{' '}
            <OpeningBalancesLink classified={classified} />: they are filled in for you.
          </Alert>
        ) : null}
        <RowTable rows={rows} showBalance={false} filter={filter} onFilter={setFilter} counts={summary} />
        <WhatsNext emailCount={importedEmailCount(classified, results)} />
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={onRestart}>
          Import another file
        </Button>
        <div className="flex flex-wrap gap-2">
          {summary.error > 0 ? (
            <Button variant="secondary" onClick={onDownloadErrors}>
              <Download aria-hidden />
              Download error rows (CSV)
            </Button>
          ) : null}
          <Button asChild>
            <Link href="/properties">View properties</Link>
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
