'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { Download, Eye, FileUp } from 'lucide-react'
import { Alert, Button, DataTable, Field, Input, useToast, type DataTableColumn } from '@homeowner-portal/ui'
import { commitBankImport, previewBankImport, type ImportPreviewResult, type ImportPreviewRow } from '@/lib/bank-import/actions'
import { problemRowsCsv } from '@/lib/bank-import/export'
import { downloadCsvFile } from '@/lib/csv'
import { formatDay, plural, usd } from '@/lib/money/format'

type Preview = Extract<ImportPreviewResult, { ok: true }>

const SAMPLE_COLUMNS: DataTableColumn<ImportPreviewRow>[] = [
  { key: 'date', header: 'Date', className: 'whitespace-nowrap text-muted', cell: (r) => formatDay(r.postedDate) },
  {
    key: 'description',
    header: 'Description',
    mobilePrimary: true,
    cell: (r) => <span className="block min-w-0 truncate">{r.description || 'No description'}</span>,
  },
  {
    key: 'amount',
    header: 'Amount',
    numeric: true,
    cell: (r) => (
      <span className={r.amountCents > 0 ? 'text-success' : 'text-foreground'}>
        {r.amountCents > 0 ? `+${usd(r.amountCents / 100)}` : usd(r.amountCents / 100)}
      </span>
    ),
  },
]

export function ImportStatementForm({ bankAccountId, maxMb, maxRows }: { bankAccountId: string; maxMb: number; maxRows: number }) {
  const router = useRouter()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function formFor(f: File, hash?: string): FormData {
    const form = new FormData()
    form.append('bankAccountId', bankAccountId)
    form.append('file', f)
    if (hash) form.append('fileHash', hash)
    return form
  }

  function choose(f: File | null) {
    setFile(f)
    setPreview(null)
    setError(null)
  }

  function runPreview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPreview(null)
    if (!file) {
      setError('Choose a statement file to import.')
      return
    }
    if (file.size > maxMb * 1024 * 1024) {
      setError(`The file is larger than ${maxMb} MB. Export a shorter date range and import it in parts.`)
      return
    }
    startTransition(async () => {
      const r = await previewBankImport(formFor(file))
      if (!r.ok) {
        setError(r.error)
        return
      }
      setPreview(r)
    })
  }

  function runImport() {
    if (!file || !preview) return
    startTransition(async () => {
      const r = await commitBankImport(formFor(file, preview.fileHash))
      if (!r.ok) {
        setError(r.error)
        setPreview(null)
        if (r.inserted) router.refresh()
        return
      }
      toast({
        tone: 'success',
        message: `Imported ${plural(r.inserted, 'transaction')}${r.duplicates ? `, skipped ${r.duplicates} already in` : ''}. Match them in the queue.`,
      })
      router.push('/accounting/bank/queue')
    })
  }

  const c = preview?.counts

  return (
    <div className="space-y-5">
      <form onSubmit={runPreview} noValidate className="space-y-4">
        <Field
          label="Statement file"
          required
          hint={`CSV, OFX or QFX downloaded from your bank. Up to ${maxMb} MB and ${maxRows.toLocaleString('en-US')} transactions per file.`}
        >
          <Input
            ref={inputRef}
            type="file"
            accept=".csv,.ofx,.qfx,text/csv,application/x-ofx"
            onChange={(e) => choose(e.currentTarget.files?.[0] ?? null)}
            disabled={pending}
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant={preview ? 'secondary' : 'default'} loading={pending && !preview} icon={<Eye aria-hidden />}>
            Preview import
          </Button>
        </div>
      </form>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {preview && c ? (
        <section aria-labelledby="preview-title" className="space-y-4">
          <h2 id="preview-title" className="text-lg font-semibold text-foreground">
            Preview: nothing is saved yet
          </h2>
          <ul className="grid gap-3 text-sm sm:grid-cols-3">
            <li className="rounded-lg border border-border p-3">
              <span className="num block text-2xl font-semibold text-foreground">{c.new}</span>
              New {c.new === 1 ? 'transaction' : 'transactions'}
            </li>
            <li className="rounded-lg border border-border p-3">
              <span className="num block text-2xl font-semibold text-foreground">{c.duplicates}</span>
              Already imported, skipped
            </li>
            <li className="rounded-lg border border-border p-3">
              <span className="num block text-2xl font-semibold text-foreground">{c.problems}</span>
              {c.problems === 1 ? 'Row' : 'Rows'} we couldn’t read
            </li>
          </ul>
          <p className="text-sm text-muted">
            Read as {preview.format === 'ofx' ? 'OFX' : `CSV (${preview.layout})`}
            {preview.span ? `, ${formatDay(preview.span.from)} to ${formatDay(preview.span.to)}` : ''}. New money in{' '}
            <span className="num">{usd(preview.newTotalCents.in / 100)}</span>, money out{' '}
            <span className="num">{usd(preview.newTotalCents.out / 100)}</span>.
          </p>

          {c.problems > 0 ? (
            <Alert
              variant="warning"
              title={`${plural(c.problems, 'row')} won’t be imported`}
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download aria-hidden />}
                  onClick={() => downloadCsvFile('statement-rows-not-imported.csv', problemRowsCsv(preview.problems))}
                >
                  Download these rows
                </Button>
              }
            >
              Usually totals, balance lines or notes from the bank. Check the download; add anything real by hand to the ledger.
            </Alert>
          ) : null}

          {c.new > 0 ? (
            <DataTable
              caption={c.new > preview.sample.length ? `First ${preview.sample.length} of ${c.new} new transactions` : 'New transactions'}
              density="compact"
              mobile="cards"
              columns={SAMPLE_COLUMNS}
              rows={preview.sample}
              rowKey={(r) => String(r.line)}
            />
          ) : (
            <Alert variant="info" title="Nothing new to import">
              Every readable row in this file is already in the account.{' '}
              <Link href="/accounting/bank/queue">Open the matching queue</Link>.
            </Alert>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                choose(null)
                if (inputRef.current) inputRef.current.value = ''
              }}
              disabled={pending}
            >
              Start over
            </Button>
            <Button onClick={runImport} loading={pending} disabled={c.new === 0} icon={<FileUp aria-hidden />}>
              {c.new > 0 ? `Import ${plural(c.new, 'transaction')}` : 'Import'}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
