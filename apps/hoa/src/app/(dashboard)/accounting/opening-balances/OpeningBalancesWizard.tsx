'use client'

/**
 * BL-126: the opening-balance wizard. Four steps, all in the browser until
 * the last:
 *   1. start date and the bank balance of each fund;
 *   2. what each home owed (paste, a CSV file, the roster import's
 *      balances, or a CINC aging report previewed on the server), checked
 *      line by line against this association's homes;
 *   3. prepaid assessments and unpaid bills (optional);
 *   4. review: the journal entry, balanced per fund, and the charges.
 * "Send to Approvals" calls proposeOpeningBalances, which rebuilds the same
 * entry on the server and files it. Nothing here posts.
 */
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Send, Upload } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DataTable,
  Field,
  Input,
  Kpi,
  Textarea,
  WizardStepper,
  useToast,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import {
  buildOpeningEntry,
  centsToUsd,
  parseCents,
  parseHomeBalances,
  rosterBalancesText,
  type BooksUnitRow,
  type OpeningBooks,
  type OpeningInput,
  type OpeningLine,
} from '@/lib/accounting/opening-balances/model'
import { clearRosterBalances, readRosterBalances, type RosterBalance } from '@/lib/accounting/opening-balances/handoff'
import { proposeOpeningBalances } from '@/lib/accounting/opening-balances/actions'
import type { OpeningPeriod } from '@/lib/accounting/opening-balances/load'
import { CincAgingImport, type CincAgingUse } from './CincAgingImport'

const STEPS = [
  { id: 'bank', label: 'Bank balances' },
  { id: 'homes', label: 'Homes' },
  { id: 'other', label: 'Other balances' },
  { id: 'review', label: 'Review' },
]

type Step = 0 | 1 | 2 | 3

/** Field text → cents; blank is 0. Null when it isn't a non-negative amount. */
function amountOf(text: string): number | null {
  if (text.trim() === '') return 0
  const c = parseCents(text)
  return c === null || c < 0 ? null : c
}

const MAX_FILE_BYTES = 2 * 1024 * 1024

export function OpeningBalancesWizard({
  books,
  units,
  periods,
  defaultCutover,
  defaultDueDate,
  openCharges,
  postedEntries,
}: {
  books: OpeningBooks
  units: BooksUnitRow[]
  periods: OpeningPeriod[]
  defaultCutover: string
  defaultDueDate: string
  openCharges: number
  postedEntries: number
}) {
  const router = useRouter()
  const toast = useToast()
  const [step, setStep] = React.useState<Step>(0)
  const [cutover, setCutover] = React.useState(defaultCutover)
  const [cash, setCash] = React.useState<Record<string, string>>({})
  const [homesText, setHomesText] = React.useState('')
  const [dueDate, setDueDate] = React.useState(defaultDueDate)
  const [prepaid, setPrepaid] = React.useState('')
  const [payables, setPayables] = React.useState<Record<string, string>>({})
  const [roster, setRoster] = React.useState<RosterBalance[] | null>(null)
  const [fileError, setFileError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [serverErrors, setServerErrors] = React.useState<string[]>([])
  // BL-031: balances taken from a CINC aging report replace the paste box.
  const [aging, setAging] = React.useState<CincAgingUse | null>(null)

  React.useEffect(() => {
    setRoster(readRosterBalances())
  }, [])

  const unitIds = React.useMemo(() => new Set(units.map((u) => u.id)), [units])
  const parsedHomes = React.useMemo(
    () =>
      aging
        ? { rows: aging.rows.map((r) => ({ line: r.line, unitId: r.unitId, label: r.label, cents: r.cents })), errors: [], zero: aging.zero }
        : parseHomeBalances(homesText, units),
    [aging, homesText, units],
  )
  const period = periods.find((p) => p.start_date <= cutover && cutover <= p.end_date) ?? null

  const cashErrors = books.funds.filter((f) => amountOf(cash[f.fundId] ?? '') === null).map((f) => f.fundId)
  const payableErrors = books.funds.filter((f) => amountOf(payables[f.fundId] ?? '') === null).map((f) => f.fundId)
  const prepaidCents = amountOf(prepaid)

  const input: OpeningInput = {
    cutoverDate: cutover,
    chargesDueDate: dueDate,
    cash: books.funds.map((f) => ({ fundId: f.fundId, cents: amountOf(cash[f.fundId] ?? '') ?? 0 })),
    homes: parsedHomes.rows.map((r) => ({ unitId: r.unitId, cents: r.cents })),
    prepaidCents: prepaidCents ?? 0,
    payables: books.funds.map((f) => ({ fundId: f.fundId, cents: amountOf(payables[f.fundId] ?? '') ?? 0 })),
  }
  const built = buildOpeningEntry(input, books, unitIds)

  const step0Ok = period !== null && cashErrors.length === 0
  const step1Ok = parsedHomes.errors.length === 0 && (parsedHomes.rows.length === 0 || (dueDate !== '' && dueDate >= cutover))
  const step2Ok = prepaidCents !== null && payableErrors.length === 0

  const onFile = async (file: File | undefined) => {
    setFileError(null)
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setFileError('That file is larger than 2 MB. Save just the home and amount columns as a CSV.')
      return
    }
    if (!/\.(csv|txt|tsv)$/i.test(file.name)) {
      setFileError('Choose a .csv file. In Excel, use File › Save As › CSV.')
      return
    }
    setHomesText(await file.text())
  }

  const useRoster = () => {
    if (!roster) return
    setHomesText(rosterBalancesText(roster))
    clearRosterBalances()
    setRoster(null)
  }

  const applyAging = (use: CincAgingUse) => {
    setAging(use)
    // A credit is money an owner paid ahead: suggest it as prepaid, never overwrite what was typed.
    if (use.creditCents > 0 && prepaid.trim() === '') setPrepaid((use.creditCents / 100).toFixed(2))
  }

  const submit = async () => {
    setBusy(true)
    setServerErrors([])
    try {
      const r = await proposeOpeningBalances(input)
      if (!r.ok) {
        setServerErrors(r.errors ?? [r.error])
        toast({ tone: 'error', title: 'Nothing was proposed', message: r.error })
        return
      }
      toast({ tone: 'success', message: r.message })
      router.refresh()
    } catch {
      toast({ tone: 'error', title: 'Nothing was proposed', message: 'Something went wrong. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const back = step > 0 ? (
    <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as Step)} disabled={busy}>
      <ArrowLeft aria-hidden />
      Back
    </Button>
  ) : (
    <span />
  )
  const next = (ok: boolean) => (
    <Button onClick={() => setStep((s) => (s + 1) as Step)} disabled={!ok}>
      Next
      <ArrowRight aria-hidden />
    </Button>
  )

  return (
    <div className="space-y-6">
      <WizardStepper steps={STEPS} currentIndex={step} vertical={false} />

      {step === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Start date and bank balances</CardTitle>
            <CardDescription>
              Use the statement balance for each fund’s bank account on the start date. The first day of the fiscal year is usually the
              easiest date: the old books close the day before.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field
              label="Start date"
              required
              hint="Balances are as of this date. It must fall in an open fiscal year."
              error={period ? undefined : 'No open fiscal year covers this date. Choose another, or open the year under Periods.'}
            >
              <Input type="date" value={cutover} onChange={(e) => setCutover(e.target.value)} className="max-w-xs" />
            </Field>
            {books.funds.map((f) => (
              <Field
                key={f.fundId}
                label={`${f.name} bank balance`}
                optional
                hint={`Posts to ${f.cash.label}. Leave blank if this fund has no bank account yet.`}
                error={cashErrors.includes(f.fundId) ? 'Enter an amount like 12,500.00.' : undefined}
              >
                <Input
                  inputMode="decimal"
                  prefix="$"
                  value={cash[f.fundId] ?? ''}
                  onChange={(e) => setCash({ ...cash, [f.fundId]: e.target.value })}
                  className="max-w-xs"
                />
              </Field>
            ))}
            {books.notes.map((n) => (
              <p key={n} className="text-xs text-muted">
                {n}
              </p>
            ))}
          </CardContent>
          <CardFooter className="justify-between gap-2">
            {back}
            {next(step0Ok)}
          </CardFooter>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">What each home owed</CardTitle>
            <CardDescription>
              One line per home that owed money on the start date: the home and the amount. Leave out homes that owed nothing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!books.ar ? (
              <Alert variant="warning" title="No receivable account">
                The chart of accounts has no 1100 Accounts Receivable in the Operating fund, so homeowner balances can’t be entered. Add it
                under Accounts, or skip this step.
              </Alert>
            ) : null}
            {aging ? (
              <Alert variant="info" title="Balances from your CINC aging report">
                Using {aging.rows.length.toLocaleString('en-US')} {aging.rows.length === 1 ? 'home' : 'homes'} matched from the report.
                {aging.creditCents > 0 ? ` Credits of ${centsToUsd(aging.creditCents)} are suggested as prepaid assessments in step 3.` : ''}
                <span className="mt-3 block">
                  <Button size="sm" variant="secondary" onClick={() => setAging(null)}>
                    Clear and enter balances another way
                  </Button>
                </span>
              </Alert>
            ) : null}
            {!aging && roster ? (
              <Alert variant="info" title="Balances from your roster import">
                Your roster import had balances for {roster.length.toLocaleString('en-US')} {roster.length === 1 ? 'home' : 'homes'}.
                <span className="mt-3 block">
                  <Button size="sm" variant="secondary" onClick={useRoster}>
                    Use the roster balances
                  </Button>
                </span>
              </Alert>
            ) : null}
            {!aging ? (
              <>
                <CincAgingImport onUse={applyAging} />
                <Field
                  label="Homes and amounts"
                  hint="Paste from a spreadsheet or type: home, amount — for example “12 Oak Street, 450.00” or “Unit 7, 1,200”. Columns address, unit, amount work too, with or without a heading row."
                >
                  <Textarea rows={8} value={homesText} onChange={(e) => setHomesText(e.target.value)} spellCheck={false} />
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" size="sm" asChild>
                    <label className="cursor-pointer">
                      <Upload aria-hidden />
                      Upload a CSV
                      <input
                        type="file"
                        accept=".csv,.txt,.tsv,text/csv"
                        className="sr-only"
                        onChange={(e) => {
                          void onFile(e.target.files?.[0])
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </Button>
                  {fileError ? <p role="alert" className="text-xs font-medium text-danger">{fileError}</p> : null}
                </div>
              </>
            ) : null}

            {aging || homesText.trim() !== '' ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Kpi label="Homes owing" value={parsedHomes.rows.length.toLocaleString('en-US')} />
                <Kpi label="Total owed" value={centsToUsd(parsedHomes.rows.reduce((n, r) => n + r.cents, 0))} />
                <Kpi label="Lines to fix" value={parsedHomes.errors.length.toLocaleString('en-US')} />
              </div>
            ) : null}

            {parsedHomes.errors.length > 0 ? (
              <Alert variant="error" title="Fix these lines to continue">
                <ul className="mt-1 space-y-1">
                  {parsedHomes.errors.slice(0, 50).map((e) => (
                    <li key={`${e.line}-${e.reason}`}>
                      <span className="num font-medium">Line {e.line}:</span> {e.reason}
                    </li>
                  ))}
                  {parsedHomes.errors.length > 50 ? <li>…and {(parsedHomes.errors.length - 50).toLocaleString('en-US')} more.</li> : null}
                </ul>
              </Alert>
            ) : null}
            {parsedHomes.zero > 0 ? (
              <p className="text-xs text-muted">
                {parsedHomes.zero.toLocaleString('en-US')} {parsedHomes.zero === 1 ? 'home owes' : 'homes owe'} nothing and{' '}
                {parsedHomes.zero === 1 ? 'is' : 'are'} left out.
              </p>
            ) : null}

            {parsedHomes.rows.length > 0 ? (
              <Field
                label="These balances are due on"
                required
                hint="Each home’s opening balance becomes one charge due on this date. Opening balances never get a late fee."
                error={dueDate !== '' && dueDate < cutover ? 'This can’t be before the start date.' : undefined}
              >
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="max-w-xs" />
              </Field>
            ) : null}
            {openCharges > 0 && parsedHomes.rows.length > 0 ? (
              <Alert variant="warning" title="Some charges are already on the books">
                There {openCharges === 1 ? 'is' : 'are'} already {openCharges.toLocaleString('en-US')} open{' '}
                {openCharges === 1 ? 'charge' : 'charges'} on homes. Leave out anything that is already billed here, or it will be owed twice.
              </Alert>
            ) : null}
          </CardContent>
          <CardFooter className="justify-between gap-2">
            {back}
            {next(step1Ok)}
          </CardFooter>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Other balances</CardTitle>
            <CardDescription>Optional. Skip this if nobody had paid ahead and no bills were unpaid on the start date.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field
              label="Prepaid assessments"
              optional
              hint={
                books.prepaid
                  ? `Dues owners paid before they were billed, in total. Posts to ${books.prepaid.label}.`
                  : 'The chart of accounts has no 2100 Prepaid Assessments account.'
              }
              error={prepaidCents === null ? 'Enter an amount like 300.00.' : undefined}
            >
              <Input inputMode="decimal" prefix="$" value={prepaid} onChange={(e) => setPrepaid(e.target.value)} className="max-w-xs" disabled={!books.prepaid} />
            </Field>
            {books.funds.map((f) => (
              <Field
                key={f.fundId}
                label={`Unpaid bills — ${f.name}`}
                optional
                hint={
                  books.payable
                    ? `Vendor bills received but not paid on the start date. Posts to ${books.payable.label}.`
                    : 'The chart of accounts has no 2010 Accounts Payable account.'
                }
                error={payableErrors.includes(f.fundId) ? 'Enter an amount like 1,250.00.' : undefined}
              >
                <Input
                  inputMode="decimal"
                  prefix="$"
                  value={payables[f.fundId] ?? ''}
                  onChange={(e) => setPayables({ ...payables, [f.fundId]: e.target.value })}
                  className="max-w-xs"
                  disabled={!books.payable}
                />
              </Field>
            ))}
          </CardContent>
          <CardFooter className="justify-between gap-2">
            {back}
            {next(step2Ok)}
          </CardFooter>
        </Card>
      ) : null}

      {step === 3 ? (
        <Review
          built={built}
          cutover={cutover}
          dueDate={dueDate}
          units={units}
          postedEntries={postedEntries}
          serverErrors={serverErrors}
          footer={
            <CardFooter className="justify-between gap-2">
              {back}
              <Button onClick={submit} loading={busy} disabled={!built.ok}>
                <Send aria-hidden />
                Send to Approvals
              </Button>
            </CardFooter>
          }
        />
      ) : null}
    </div>
  )
}

const LINE_COLUMNS: DataTableColumn<OpeningLine & { fund: string }>[] = [
  { key: 'account', header: 'Account', mobilePrimary: true, cell: (l) => l.label },
  { key: 'fund', header: 'Fund', cell: (l) => l.fund },
  { key: 'debit', header: 'Debit', numeric: true, cell: (l) => (l.debitCents > 0 ? centsToUsd(l.debitCents) : '') },
  { key: 'credit', header: 'Credit', numeric: true, cell: (l) => (l.creditCents > 0 ? centsToUsd(l.creditCents) : '') },
]

const CHARGE_COLUMNS: DataTableColumn<{ unitId: string; home: string; cents: number }>[] = [
  { key: 'home', header: 'Home', mobilePrimary: true, cell: (c) => c.home },
  { key: 'amount', header: 'Opening balance', numeric: true, cell: (c) => centsToUsd(c.cents) },
]

const SHOWN_CHARGES = 100

function Review({
  built,
  cutover,
  dueDate,
  units,
  postedEntries,
  serverErrors,
  footer,
}: {
  built: ReturnType<typeof buildOpeningEntry>
  cutover: string
  dueDate: string
  units: BooksUnitRow[]
  postedEntries: number
  serverErrors: string[]
  footer: React.ReactNode
}) {
  const byUnit = new Map(units.map((u) => [u.id, u]))
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Review</CardTitle>
        <CardDescription>
          This is exactly what a board member approves in Approvals. Nothing is posted until then, and it can be rejected there.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!built.ok ? (
          <Alert variant="error" title="These balances can’t be proposed yet">
            <ul className="mt-1 space-y-1">
              {built.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi label="Start date" value={cutover} />
              <Kpi label="Entry total" value={centsToUsd(built.entry.totalDebitCents)} />
              <Kpi label="Homes charged" value={built.entry.charges.length.toLocaleString('en-US')} />
            </div>
            {postedEntries > 0 ? (
              <Alert variant="warning" title="The ledger already has entries">
                {postedEntries.toLocaleString('en-US')} {postedEntries === 1 ? 'entry is' : 'entries are'} already posted. Make sure these
                balances don’t include anything they already recorded.
              </Alert>
            ) : null}
            <section className="space-y-2" aria-labelledby="opening-entry">
              <h3 id="opening-entry" className="text-sm font-semibold text-foreground">
                Journal entry
              </h3>
              <DataTable
                caption="Opening journal entry"
                mobile="cards"
                density="compact"
                columns={LINE_COLUMNS}
                rows={built.entry.lines.map((l) => ({ ...l, fund: built.entry.funds.find((f) => f.fundId === l.fundId)?.name ?? '' }))}
                rowKey={(l) => `${l.fundId}-${l.accountId}-${l.debitCents}-${l.creditCents}`}
              />
              <ul className="space-y-1 text-xs text-foreground-secondary">
                {built.entry.funds.map((f) => (
                  <li key={f.fundId}>
                    {f.name}: debits {centsToUsd(f.debitCents)} = credits {centsToUsd(f.creditCents)}.{' '}
                    {f.equityCents >= 0
                      ? `Fund balance opens at ${centsToUsd(f.equityCents)}.`
                      : `The fund owes more than it holds: fund balance opens at ${centsToUsd(f.equityCents)}.`}
                  </li>
                ))}
              </ul>
            </section>
            {built.entry.charges.length > 0 ? (
              <section className="space-y-2" aria-labelledby="opening-charges">
                <h3 id="opening-charges" className="text-sm font-semibold text-foreground">
                  Charges added to homes, due {dueDate}
                </h3>
                <DataTable
                  caption="Opening balance charges"
                  mobile="cards"
                  density="compact"
                  maxHeight="24rem"
                  columns={CHARGE_COLUMNS}
                  rows={built.entry.charges.slice(0, SHOWN_CHARGES).map((c) => {
                    const u = byUnit.get(c.unitId)
                    return { ...c, home: u ? (u.unit_number ? `${u.address_line1}, unit ${u.unit_number}` : u.address_line1) : 'Home' }
                  })}
                  rowKey={(c) => c.unitId}
                />
                {built.entry.charges.length > SHOWN_CHARGES ? (
                  <p className="text-xs text-muted">
                    Showing the first {SHOWN_CHARGES}. All {built.entry.charges.length.toLocaleString('en-US')} are in the proposal.
                  </p>
                ) : null}
              </section>
            ) : null}
            <p className="text-xs text-muted">
              After it is approved, correct any mistake with an entry in the <Link href="/accounting/ledger" className="font-medium text-primary">ledger</Link>{' '}
              or a charge on the home. The wizard proposes opening balances only once.
            </p>
          </>
        )}
        {serverErrors.length > 0 ? (
          <Alert variant="error" title="Nothing was proposed">
            <ul className="mt-1 space-y-1">
              {serverErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
      </CardContent>
      {footer}
    </Card>
  )
}
