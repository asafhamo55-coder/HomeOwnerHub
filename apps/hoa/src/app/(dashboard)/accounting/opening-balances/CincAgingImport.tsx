'use client'

/**
 * BL-031 remainder: step 2's "Import a CINC aging report". Uploads the CSV
 * to previewCincAging (board-only, a dry run: nothing is saved), shows
 * every row matched to a home or listed as unmatched, with totals, and
 * lets the board re-map the columns. "Use these balances" hands the
 * matched homes to the wizard, which proposes them through Approvals.
 */
import * as React from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { Alert, Button, DataTable, Kpi, type DataTableColumn } from '@homeowner-portal/ui'
import { csvDocument, downloadCsvFile } from '@/lib/csv'
import { centsToUsd } from '@/lib/accounting/opening-balances/model'
import { AGING_MAX_FILE_BYTES, UNMATCHED_HEADER, unmatchedRows, type AgingMapping, type AgingMatch } from '@/lib/accounting/opening-balances/cinc-aging'
import { previewCincAging, type CincAgingPreview } from '@/lib/accounting/opening-balances/cinc-actions'

export interface CincAgingUse {
  rows: AgingMatch[]
  creditCents: number
  zero: number
}

type Ok = Extract<CincAgingPreview, { ok: true }>

const ROLE_LABELS: Array<[keyof AgingMapping, string]> = [
  ['account', 'Account number'],
  ['address', 'Property address'],
  ['unit', 'Unit or lot'],
  ['total', 'Balance'],
]

const MATCH_COLUMNS: DataTableColumn<AgingMatch>[] = [
  { key: 'line', header: 'Line', cell: (r) => <span className="num">{r.line}</span> },
  { key: 'home', header: 'Home', mobilePrimary: true, cell: (r) => r.label },
  { key: 'via', header: 'Matched by', cell: (r) => (r.via === 'account' ? 'Account number' : 'Address') },
  { key: 'amount', header: 'Balance', numeric: true, cell: (r) => centsToUsd(r.cents) },
]

const SHOWN = 100

export function CincAgingImport({ onUse }: { onUse: (use: CincAgingUse) => void }) {
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<Ok | null>(null)
  const [headers, setHeaders] = React.useState<string[] | null>(null)
  const [mapping, setMapping] = React.useState<AgingMapping | null>(null)

  const run = async (f: File, m: AgingMapping | null) => {
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', f)
      if (m) form.append('mapping', JSON.stringify(m))
      const r = await previewCincAging(form)
      if (!r.ok) {
        setPreview(null)
        setError(r.error)
        if (r.headers) setHeaders(r.headers)
        if (r.mapping) setMapping(r.mapping)
        return
      }
      setPreview(r)
      setHeaders(r.headers)
      setMapping(r.mapping)
    } catch {
      setError('Something went wrong reading the report. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const onFile = (f: File | undefined) => {
    setPreview(null)
    setHeaders(null)
    setMapping(null)
    setError(null)
    if (!f) return
    if (f.size > AGING_MAX_FILE_BYTES) {
      setError('That file is larger than 2 MB. Export just the account, address, unit and balance columns as a CSV.')
      return
    }
    if (!/\.(csv|txt)$/i.test(f.name)) {
      setError('Choose a .csv file. In Excel, use File › Save As › CSV.')
      return
    }
    setFile(f)
    void run(f, null)
  }

  const t = preview?.totals

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Moving from CINC Systems?</p>
        <p className="text-xs text-foreground-secondary">
          Upload the homeowner aging report as a CSV. Each row is matched to a home by address, or by account number when it equals the
          home’s unit or lot number. Nothing is saved: you see every match first.
        </p>
      </div>
      <Button variant="secondary" size="sm" asChild>
        <label className="cursor-pointer">
          <FileSpreadsheet aria-hidden />
          Upload a CINC aging report
          <input
            type="file"
            accept=".csv,.txt,text/csv"
            className="sr-only"
            onChange={(e) => {
              onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </Button>
      {busy ? <p className="text-xs text-muted">Reading the report…</p> : null}
      {error ? <p role="alert" className="text-xs font-medium text-danger">{error}</p> : null}

      {headers && mapping && file ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {ROLE_LABELS.map(([role, label]) => (
            <label key={role} className="flex flex-col gap-1 text-xs text-foreground-secondary">
              <span>{label}</span>
              <select
                className="h-8 rounded-md border border-border-strong bg-surface px-2 text-sm text-foreground"
                value={mapping[role]}
                disabled={busy}
                onChange={(e) => {
                  const next = { ...mapping, [role]: Number(e.currentTarget.value) }
                  setMapping(next)
                  void run(file, next)
                }}
              >
                <option value={-1}>None</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}

      {preview && t ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Kpi label="Homes matched" value={preview.matched.length.toLocaleString('en-US')} />
            <Kpi label="Owed by matched homes" value={centsToUsd(t.matchedCents)} />
            <Kpi label="Rows not matched" value={preview.unmatchedCount.toLocaleString('en-US')} />
            <Kpi label="Credits (prepaid)" value={centsToUsd(t.creditCents)} />
          </div>
          <p className="text-xs text-foreground-secondary">
            {preview.rowsRead.toLocaleString('en-US')} {preview.rowsRead === 1 ? 'row' : 'rows'} read; file total {centsToUsd(t.fileCents)}.
            {preview.zero > 0 ? ` ${preview.zero.toLocaleString('en-US')} with a zero balance left out.` : ''}
            {preview.credits > 0 ? ` ${preview.credits.toLocaleString('en-US')} in credit go to Prepaid assessments in step 3.` : ''}
            {preview.buckets.length > 0 && preview.mapping.total < 0 ? ' No balance column: each row’s aging columns are added up.' : ''}
          </p>
          {t.reconciles === false ? (
            <Alert variant="warning" title="The report’s total doesn’t match its rows">
              The report’s total row says {centsToUsd(t.reportCents ?? 0)}, but its home rows add up to {centsToUsd(t.fileCents)}. Check the
              columns above, or that the export is complete.
            </Alert>
          ) : t.reconciles === true ? (
            <p className="text-xs text-success">The rows add up to the report’s own total of {centsToUsd(t.reportCents ?? 0)}.</p>
          ) : null}

          {preview.unmatchedCount > 0 ? (
            <Alert variant="error" title={`${preview.unmatchedCount.toLocaleString('en-US')} ${preview.unmatchedCount === 1 ? 'row isn’t' : 'rows aren’t'} matched (${centsToUsd(t.unmatchedCents)})`}>
              <p>These are left out. Fix the home in Properties or the row in the file, then upload it again, or enter them by hand afterwards.</p>
              <ul className="mt-2 space-y-1">
                {preview.unmatched.slice(0, 50).map((u) => (
                  <li key={`${u.line}-${u.reason}`}>
                    <span className="num font-medium">Line {u.line}</span>
                    {u.account ? ` · #${u.account}` : ''}
                    {u.address ? ` · ${u.address}` : ''}
                    {u.unit ? `, ${u.unit}` : ''}
                    {u.cents !== null ? ` · ${centsToUsd(u.cents)}` : ''}: {u.reason}
                  </li>
                ))}
                {preview.unmatchedCount > 50 ? <li>…and {(preview.unmatchedCount - 50).toLocaleString('en-US')} more.</li> : null}
              </ul>
              <span className="mt-3 block">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => downloadCsvFile('cinc-aging-unmatched.csv', csvDocument(UNMATCHED_HEADER, unmatchedRows(preview.unmatched)))}
                >
                  <Download aria-hidden />
                  Download unmatched rows
                </Button>
              </span>
            </Alert>
          ) : null}

          {preview.matched.length > 0 ? (
            <>
              <DataTable
                caption="CINC aging rows matched to homes"
                mobile="cards"
                density="compact"
                maxHeight="20rem"
                columns={MATCH_COLUMNS}
                rows={preview.matched.slice(0, SHOWN)}
                rowKey={(r) => r.unitId}
              />
              {preview.matched.length > SHOWN ? (
                <p className="text-xs text-muted">
                  Showing the first {SHOWN}. All {preview.matched.length.toLocaleString('en-US')} are used.
                </p>
              ) : null}
            </>
          ) : null}

          <Button
            size="sm"
            disabled={preview.matched.length === 0 && preview.credits === 0}
            onClick={() => onUse({ rows: preview.matched, creditCents: t.creditCents, zero: preview.zero })}
          >
            Use these balances
          </Button>
        </div>
      ) : null}
    </div>
  )
}
