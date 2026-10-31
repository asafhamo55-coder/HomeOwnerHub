'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Printer, Send } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ChoiceGroup,
  Fieldset,
  Radio,
  useToast,
} from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import { DraftPrintBanner, usePrintGate } from '@/components/print/PrintGate'
import { valueOf, type CertificateField, type FieldValues } from '@/lib/properties/estoppel/model'
import { recordLetterPrinted, saveLetterToApprovals } from '@/lib/collections/letters/actions'
import { StateLawCheckPanel } from '@/components/compliance/StateLawCheckPanel'
import { blockingFindings, resolveOverrides, type DriftCode, type OverrideReason } from '@/lib/compliance/statute-drift'
import {
  CA_IMPORTANT_NOTICE,
  CA_RIGHTS,
  FL_INTENT_BODY,
  FL_LATE_NOTICE_BODY,
  GA_CONDO_PRE_FORECLOSURE_BODY,
  GA_CONDO_PRE_FORECLOSURE_QUOTES,
  GA_FEE_NOTICE_BODY,
  GA_FEE_NOTICE_QUOTES,
  TX_CURE_DAYS,
  gaForeclosureLaw,
} from '@/lib/collections/letters/law'
import {
  LETTER_META,
  buildLetter,
  dueDatesLabel,
  kindsFor,
  letterBlanks,
  letterBlocked,
  letterJurisdiction,
  letterLawCheck,
  letterMeta,
  letterProblems,
  letterTotals,
  usdCents,
  type Letter,
  type LetterEvent,
  type LetterInput,
  type LetterKind,
  type PrintedLetterRecord,
} from '@/lib/collections/letters/model'
import type { LetterPayload } from '@/lib/collections/letters/proposal'
import { isGaCondo } from '@/lib/ga-condo/law'
import { Blank, BlankInput } from '../estoppel/EstoppelCertificate'

export interface LetterRequestView {
  id: string
  proposedAt: string
  payload: LetterPayload
}

/**
 * The collections letter (BL-089). Three states:
 *   draft    — pick the letter, fill each BLANK, tick "I've verified these
 *              figures", Save to approvals. A waiting-period refusal is
 *              shown instead of the letter's save button.
 *   pending  — the saved letter, read-only, until a board member decides
 *              it in Approvals.
 *   approved — the approved letter with Print / Save as PDF. The print
 *              records the collections event and an audit row first
 *              (server action, figures re-checked), then arms the
 *              letter and opens the browser's print dialog. Only the
 *              letter prints; a browser print (Cmd+P) in any state
 *              shows a DRAFT banner instead.
 * Nothing is emailed or texted at any point.
 */
export function CollectionsLetter({
  input,
  today,
  events,
  pending,
  approved,
  printed = [],
}: {
  input: LetterInput
  today: string
  events: LetterEvent[]
  pending: LetterRequestView | null
  approved: LetterRequestView | null
  /** BL-130: the case's letters already printed, for the state law check. */
  printed?: PrintedLetterRecord[]
}) {
  const [drafting, setDrafting] = useState(false)
  if (pending) return <Pending input={input} today={today} events={events} printed={printed} request={pending} />
  if (approved && !drafting) return <Approved input={input} today={today} events={events} printed={printed} request={approved} onDraftNew={() => setDrafting(true)} />
  return <Draft input={input} today={today} events={events} printed={printed} />
}

// ─── draft ───────────────────────────────────────────────────────────

function Draft({ input, today, events, printed }: { input: LetterInput; today: string; events: LetterEvent[]; printed: PrintedLetterRecord[] }) {
  const router = useRouter()
  const toast = useToast()
  // BL-155: a Georgia condominium gets the Condominium Act's notice.
  const kinds = kindsFor(letterJurisdiction(input.state), isGaCondo(input.state, input.associationType))
  const [kind, setKind] = useState<LetterKind>(kinds[0]!)
  const [values, setValues] = useState<FieldValues>({})
  const [verified, setVerified] = useState(false)
  const [lawOverrides, setLawOverrides] = useState<Partial<Record<DriftCode, OverrideReason>>>({})
  const [isPending, startTransition] = useTransition()

  const letter = useMemo(() => buildLetter(input, kind, today, events, values), [input, kind, today, events, values])
  const law = useMemo(() => letterLawCheck(input, letter, values, events, printed), [input, letter, values, events, printed])
  const lawResolved = resolveOverrides(law, lawOverrides as Record<string, string>)
  const blanks = letterBlanks(letter, values)
  const problems = letterProblems(kind, values)
  const blocked = letterBlocked(letter, values, verified) ?? (lawResolved.ok ? null : lawResolved.error)
  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }))
  // The CA delinquency period changes which assessments are delinquent,
  // and so whether the letter can be drafted at all: it stays on screen
  // even while the waiting check refuses.
  const periodField = letter.fields.find((f) => f.key === 'delinquentDays' && f.value === null) ?? null
  const blankFields = letter.fields.filter((f) => f.value === null && f !== periodField)

  function save() {
    if (blocked) return
    startTransition(async () => {
      const res = await saveLetterToApprovals({ propertyId: input.propertyId, kind, values, verified, lawOverrides })
      if (!res.ok) {
        toast({ tone: 'error', title: 'Couldn’t save the letter', message: res.error })
        return
      }
      toast({ tone: 'success', message: res.message })
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle as="h2">Which letter</CardTitle>
          <CardDescription>
            {letter.jurisdiction === 'generic'
              ? 'This association isn’t in a state with a statutory notice here, so the letter is a plain past-due letter.'
              : letter.jurisdiction === 'GA'
                ? 'Georgia sets no form wording for these notices. Each one states what the statute requires and quotes the statute word for word. A plain past-due letter is also offered.'
                : `The ${letter.jurisdiction} notices follow the statute’s required wording. Each one also offers a plain past-due letter.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Fieldset legend="Letter">
            <ChoiceGroup>
              {kinds.map((k) => (
                <Radio
                  key={k}
                  name="letter-kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => {
                    setKind(k)
                    setVerified(false)
                    setLawOverrides({})
                  }}
                  label={letterMeta(k, today).label}
                  description={`${letterMeta(k, today).description}${letterMeta(k, today).citation ? ` (${letterMeta(k, today).citation})` : ''}`}
                />
              ))}
            </ChoiceGroup>
          </Fieldset>
        </CardContent>
      </Card>

      {periodField ? (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle as="h2">Delinquency period</CardTitle>
            <CardDescription>
              Civil Code § 5650(b) makes an assessment delinquent 15 days after it is due, unless your declaration sets a longer period. The letter lists only delinquent assessments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <BlankInput field={periodField} value={values[periodField.key] ?? ''} onChange={(v) => set(periodField.key, v)} />
            {problems
              .filter((p) => p.startsWith('Enter the delinquency period'))
              .map((p) => (
                <Alert key={p} variant="error" title="Check this entry">
                  {p}
                </Alert>
              ))}
          </CardContent>
        </Card>
      ) : null}

      <DraftPrintBanner armed={false} />

      {!letter.waiting.ok ? (
        <Alert variant="error" title="This letter can’t be drafted yet" className="print:hidden">
          {letter.waiting.reason}
        </Alert>
      ) : (
        <>
          <Facts letter={letter} />
          {blankFields.length > 0 ? (
            <Card className="print:hidden">
              <CardHeader>
                <CardTitle as="h2">Fill in the blanks</CardTitle>
                <CardDescription>The app doesn’t hold these facts. Each shows as a BLANK on the letter, and it can’t be saved or printed until all are filled in.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {blankFields.map((f) => (
                  <BlankInput key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
                ))}
                {problems.filter((p) => !p.startsWith('Enter the delinquency period')).map((p) => (
                  <Alert key={p} variant="error" title="Check this entry">
                    {p}
                  </Alert>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <LetterDocument letter={letter} input={input} values={values} printClass="print:hidden" />

          <StateLawCheckPanel
            check={law}
            overrides={lawOverrides}
            disabled={isPending}
            onOverride={(code, reason) =>
              setLawOverrides((prev) => {
                const next = { ...prev }
                if (reason) next[code as DriftCode] = reason
                else delete next[code as DriftCode]
                return next
              })
            }
          />

          <div className="space-y-3 print:hidden">
            {blanks.length > 0 ? (
              <Alert variant="warning" title={`${blanks.length} BLANK${blanks.length === 1 ? '' : 's'} left`}>
                {blanks.join('; ')}.
              </Alert>
            ) : null}
            <Checkbox
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
              label="I’ve verified these figures"
              description="The amounts, dates and entries match the association’s books."
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" icon={<Send aria-hidden />} onClick={save} disabled={blocked !== null || isPending} loading={isPending}>
                Save to approvals
              </Button>
              <p className="text-sm text-muted">
                {blocked ?? 'A board member approves it in Approvals; then print it here. Nothing is emailed.'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** What the letter is built from, and the dates it implies. On screen only. */
function Facts({ letter }: { letter: Letter }) {
  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle as="h2">How this letter is built</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-foreground-secondary">
        <p>
          The amounts come from this home’s ledger as of {formatDay(letter.letterDate)}: charges due before today that are not fully paid
          {letter.figures.creditCents !== 0 ? ', less payments not applied to a charge' : ''}.
        </p>
        {letter.waiting.ok && letter.waiting.note ? <p>{letter.waiting.note}</p> : null}
        {letter.deadline ? (
          <p className="num">
            {letter.deadline.label}: <span className="font-medium text-foreground">{formatDay(letter.deadline.day)}</span>.
          </p>
        ) : null}
        {letter.meta.mailing ? <p>{letter.meta.mailing}</p> : null}
        {letter.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
        <p>Printing records “{letter.meta.label}” on the collections case, dated the day it prints. If you mail it on a later day, add a note with the mailing date.</p>
      </CardContent>
    </Card>
  )
}

// ─── pending / approved ──────────────────────────────────────────────

function Pending({
  input,
  today,
  events,
  printed,
  request,
}: {
  input: LetterInput
  today: string
  events: LetterEvent[]
  printed: PrintedLetterRecord[]
  request: LetterRequestView
}) {
  const letter = useMemo(() => buildLetter(input, request.payload.kind, today, events, request.payload.values), [input, request.payload, today, events])
  const law = useMemo(() => letterLawCheck(input, letter, request.payload.values, events, printed), [input, letter, request.payload.values, events, printed])
  return (
    <div className="space-y-5">
      <Alert variant="info" title="Waiting for board approval" className="print:hidden">
        This {LETTER_META[request.payload.kind].label.toLowerCase()} was saved to Approvals. Once a board member approves it, come back here to print it.{' '}
        <Link href="/approvals?type=collections" className="font-medium text-primary">
          Open Approvals
        </Link>
      </Alert>
      <StateLawCheckPanel check={law} recorded={request.payload.lawOverrides ?? []} />
      <DraftPrintBanner armed={false} />
      <LetterDocument letter={letter} input={input} values={request.payload.values} printClass="print:hidden" />
    </div>
  )
}

function Approved({
  input,
  today,
  events,
  printed,
  request,
  onDraftNew,
}: {
  input: LetterInput
  today: string
  events: LetterEvent[]
  printed: PrintedLetterRecord[]
  request: LetterRequestView
  onDraftNew: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [verified, setVerified] = useState(false)
  const [isPending, startTransition] = useTransition()
  const gate = usePrintGate()
  const letter = useMemo(() => buildLetter(input, request.payload.kind, today, events, request.payload.values), [input, request.payload, today, events])
  const values = request.payload.values
  const totals = letterTotals(letter, values)
  const stale = totals.totalCents !== request.payload.totalCents
  // BL-130: the print gate re-runs the state law check; a blocking finding
  // the board did not override when it saved the letter stops the print.
  const law = useMemo(() => letterLawCheck(input, letter, values, events, printed), [input, letter, values, events, printed])
  const overridden = new Set((request.payload.lawOverrides ?? []).map((o) => o.code))
  const lawNew = blockingFindings(law).filter((f) => !overridden.has(f.code))
  const blocked = stale
    ? 'The account has changed since this letter was approved. Draft a new letter so the figures are current.'
    : lawNew.length > 0
      ? 'The state law check now finds a problem the board didn’t decide when this letter was approved. Draft a new letter so the board can review it.'
      : letterBlocked(letter, values, verified)

  function print() {
    if (blocked) return
    startTransition(async () => {
      const res = await recordLetterPrinted({ propertyId: input.propertyId, approvalRequestId: request.id, verified })
      if (!res.ok) {
        toast({ tone: 'error', title: 'Not printed', message: res.error })
        return
      }
      toast({ tone: 'success', message: res.message })
      // Armed only now: the collections event and audit row are recorded.
      gate.print()
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <Alert variant={stale ? 'warning' : 'success'} title={stale ? 'The account changed after approval' : 'Approved — ready to print'} className="print:hidden">
        {stale
          ? `Approved for ${usdCents(request.payload.totalCents)}; the ledger now gives ${totals.totalCents === null ? 'a different amount' : usdCents(totals.totalCents)}. This letter can’t be printed.`
          : 'The board approved this letter. Print it or save it as a PDF, then send it as the statute requires. Nothing is emailed.'}
      </Alert>
      {!stale ? <Facts letter={letter} /> : null}
      {!stale ? <StateLawCheckPanel check={law} recorded={request.payload.lawOverrides ?? []} /> : null}
      <DraftPrintBanner armed={gate.printArmed} />
      <LetterDocument letter={letter} input={input} values={values} printClass={gate.docClass} />
      <div className="space-y-3 print:hidden">
        {!stale ? (
          <Checkbox
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
            label="I’ve verified these figures"
            description="The amounts, dates and entries match the association’s books today."
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          {!stale ? (
            <Button type="button" icon={<Printer aria-hidden />} onClick={print} disabled={blocked !== null || isPending} loading={isPending}>
              Print / Save as PDF
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onDraftNew} disabled={isPending}>
            Draft a new letter instead
          </Button>
          {blocked && !stale ? <p className="text-sm text-muted">{blocked}</p> : null}
        </div>
      </div>
    </div>
  )
}

/**
 * BL-148: the Georgia statute text the notice rests on, verbatim (law.test.ts
 * checks each quote). BL-154: the notice before foreclosure quotes the
 * § 44-3-232(c) in force on its letter date. BL-155: a condominium's notice
 * quotes § 44-3-109 (lib/ga-condo/law.test.ts checks each quote).
 */
function GeorgiaQuotes({ kind, letterDate }: { kind: 'ga_fee_notice' | 'ga_pre_foreclosure' | 'ga_condo_pre_foreclosure'; letterDate: string }) {
  const quotes =
    kind === 'ga_fee_notice'
      ? GA_FEE_NOTICE_QUOTES
      : kind === 'ga_condo_pre_foreclosure'
        ? GA_CONDO_PRE_FORECLOSURE_QUOTES
        : gaForeclosureLaw(letterDate).quotes
  return (
    <section className="space-y-1 text-xs text-foreground-secondary">
      <h3 className="font-medium text-foreground">What the law says</h3>
      {quotes.map((q) => (
        <p key={q.quote}>
          {q.cite}: “{q.quote}”
        </p>
      ))}
    </section>
  )
}

// ─── the printed letter ──────────────────────────────────────────────

function Value({ field, values, fallback }: { field: CertificateField | undefined; values: FieldValues; fallback?: string }) {
  if (!field) return fallback ? <>{fallback}</> : null
  const v = valueOf(field, values)
  return v ? <span className="whitespace-pre-wrap">{v}</span> : <Blank label={field.label} />
}

function MoneyCell({ cents }: { cents: number | null }) {
  return <td className="num py-1 text-right">{cents === null ? '—' : usdCents(cents)}</td>
}

function AmountRow({ label, cents, children }: { label: React.ReactNode; cents?: number | null; children?: React.ReactNode }) {
  return (
    <tr className="border-b border-border/60">
      <td className="py-1 pr-3">{label}</td>
      {children ?? <MoneyCell cents={cents ?? null} />}
    </tr>
  )
}

function EnteredCell({ field, values }: { field: CertificateField | undefined; values: FieldValues }) {
  if (!field) return <td />
  const v = valueOf(field, values)
  return <td className="num py-1 text-right">{v ?? <Blank label={field.label} />}</td>
}

function LetterDocument({ letter, input, values, printClass }: { letter: Letter; input: LetterInput; values: FieldValues; printClass: string }) {
  const f = letter.figures
  const k = letter.kind
  const field = (key: string) => letter.fields.find((x) => x.key === key)
  const totals = letterTotals(letter, values)
  const association = valueOf(field('associationName')!, values) ?? '[[BLANK: Association name]]'
  const home = [input.address, input.unitNumber ? `Unit ${input.unitNumber}` : null].filter(Boolean).join(', ')
  const isFl = k === 'fl_late_notice' || k === 'fl_intent_to_lien'
  const rate = field('interestRate')

  const lines = [...f.assessmentLines, ...f.lateFeeLines, ...f.otherLines].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
  const total = (
    <tr className="border-t-2 border-foreground font-semibold">
      <td className="py-1 pr-3">{isFl ? 'TOTAL OUTSTANDING' : k === 'tx_delinquency' ? 'Total amount required to make the account current' : 'Total owed'}</td>
      <td className="num py-1 text-right">{totals.totalCents === null ? <Blank label="Total (fill in the amounts above)" /> : usdCents(totals.totalCents)}</td>
    </tr>
  )
  // BL-177: credit on account is shown beside the total, never netted into it.
  const accountCredit = input.unappliedCreditCents ?? 0
  const creditNote =
    accountCredit > 0 && totals.totalCents !== null ? (
      <>
        <AmountRow label="Credit on account, not applied to a charge" cents={accountCredit} />
        <tr className="font-semibold">
          <td className="py-1 pr-3">Total due after credit</td>
          <td className="num py-1 text-right">{usdCents(totals.totalCents - accountCredit)}</td>
        </tr>
      </>
    ) : null
  const credit = f.creditCents !== 0 ? <AmountRow label="Less payments and credits not applied to a charge" cents={f.creditCents} /> : null

  return (
    <article aria-labelledby="letter-title" className={`space-y-4 rounded-lg border border-border bg-surface p-5 text-sm print:border-0 print:p-0 ${printClass}`}>
      <header className="space-y-3">
        <p className="font-medium text-foreground">{association}</p>
        <p className="num text-foreground-secondary">{formatDay(letter.letterDate)}</p>
        <div className="text-foreground">
          <p>
            <Value field={field('owners')} values={values} />
          </p>
          {k === 'ga_pre_foreclosure' || k === 'ga_condo_pre_foreclosure' ? (
            <>
              <p>
                <Value field={field('lotAddress')} values={values} />
              </p>
              <p className="text-foreground-secondary">
                Also sent to: <Value field={field('designatedAddress')} values={values} />
              </p>
            </>
          ) : (
            <p>
              <Value field={field('mailingAddress')} values={values} />
            </p>
          )}
        </div>
        <h2 id="letter-title" className="pt-2 text-lg font-semibold text-foreground">
          {letter.meta.title}
        </h2>
        {isFl ? (
          <p className="text-foreground">
            RE: {k === 'fl_intent_to_lien' ? 'Parcel or (lot/block) ' : 'Parcel '}
            <Value field={field('parcel')} values={values} /> of {association}
            {home ? <span className="text-foreground-secondary"> ({home})</span> : null}
          </p>
        ) : (
          <p className="text-foreground">RE: {home || 'Your home'}</p>
        )}
      </header>

      {k === 'fl_late_notice' ? <p className="text-foreground">{FL_LATE_NOTICE_BODY(association)}</p> : null}
      {k === 'fl_intent_to_lien' ? <p className="text-foreground">{FL_INTENT_BODY(association)}</p> : null}
      {k === 'ca_pre_lien' ? (
        <div className="space-y-2 text-foreground">
          <p>
            Before the association records a lien on your separate interest to collect a debt that is past due under Civil Code § 5650, Civil Code § 5660 requires this notice. The
            association’s collection and lien enforcement procedures, and how the amount below is calculated:
          </p>
          <p className="pl-3">
            <Value field={field('procedures')} values={values} />
          </p>
          <p className="text-[14pt] font-bold uppercase leading-snug">{CA_IMPORTANT_NOTICE}</p>
        </div>
      ) : null}
      {k === 'tx_delinquency' ? (
        <p className="text-foreground">
          The association’s records show the following delinquent amounts on your account. This notice is given under Texas Property Code § 209.0064.
        </p>
      ) : null}
      {k === 'ga_fee_notice' ? <p className="text-foreground">{GA_FEE_NOTICE_BODY(association)}</p> : null}
      {k === 'ga_pre_foreclosure' ? <p className="text-foreground">{gaForeclosureLaw(letter.letterDate).body(association)}</p> : null}
      {k === 'ga_condo_pre_foreclosure' ? <p className="text-foreground">{GA_CONDO_PRE_FORECLOSURE_BODY(association)}</p> : null}
      {k === 'past_due' ? <p className="text-foreground">Our records show the following amounts past due on your account.</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {isFl ? (
              <>
                <AmountRow label={`Maintenance due (${dueDatesLabel(f.assessmentLines)})`} cents={f.assessmentsCents} />
                <AmountRow label="Late fee, if applicable" cents={f.lateFeesCents} />
                {credit}
                <AmountRow
                  label={
                    <>
                      Interest through (<Value field={field('interestThrough')} values={values} />) *
                    </>
                  }
                >
                  <EnteredCell field={field('interest')} values={values} />
                </AmountRow>
                {k === 'fl_intent_to_lien' ? (
                  <>
                    <AmountRow label="Certified mail charges">
                      <EnteredCell field={field('certifiedMail')} values={values} />
                    </AmountRow>
                    <AmountRow label="Other costs">
                      <EnteredCell field={field('otherCosts')} values={values} />
                    </AmountRow>
                  </>
                ) : null}
                {total}{creditNote}
              </>
            ) : k === 'ca_pre_lien' ? (
              <>
                <AmountRow label={`Delinquent assessments (${dueDatesLabel(f.assessmentLines)})`} cents={f.assessmentsCents} />
                <AmountRow label="Late charges" cents={f.lateFeesCents} />
                <AmountRow label="Fees and reasonable costs of collection">
                  <EnteredCell field={field('collectionCosts')} values={values} />
                </AmountRow>
                <AmountRow label="Reasonable attorney’s fees">
                  <EnteredCell field={field('attorneyFees')} values={values} />
                </AmountRow>
                <AmountRow label="Interest">
                  <EnteredCell field={field('interest')} values={values} />
                </AmountRow>
                {credit}
                {total}{creditNote}
              </>
            ) : (
              <>
                {lines.map((l) => (
                  <AmountRow key={l.id} label={`${l.label}, due ${formatDay(l.dueDate)}`} cents={l.remainingCents} />
                ))}
                {k === 'ga_pre_foreclosure' || k === 'ga_condo_pre_foreclosure' ? (
                  <AmountRow label="Interest">
                    <EnteredCell field={field('interest')} values={values} />
                  </AmountRow>
                ) : null}
                {credit}
                {total}{creditNote}
              </>
            )}
          </tbody>
        </table>
      </div>

      {isFl || k === 'ca_pre_lien' ? (
        <>
          {isFl ? (
            <p className="text-foreground">
              *Interest accrues at the rate of <Value field={rate} values={values} /> percent per annum.
            </p>
          ) : (
            <p className="text-foreground">
              Interest rate: <Value field={rate} values={values} /> percent per year.
            </p>
          )}
          <section className="space-y-1">
            <h3 className="font-medium text-foreground">Itemized charges</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {[...f.assessmentLines, ...f.lateFeeLines]
                    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
                    .map((l) => (
                      <AmountRow key={l.id} label={`${l.label}, due ${formatDay(l.dueDate)}`} cents={l.remainingCents} />
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {k === 'ca_pre_lien' ? (
        <ul className="list-disc space-y-1 pl-5 text-foreground">
          {CA_RIGHTS.map((r) => (
            <li key={r.cite}>{r.text}</li>
          ))}
        </ul>
      ) : null}

      {k === 'tx_delinquency' ? (
        <div className="space-y-2 text-foreground">
          <p className="font-medium">Options to avoid having your account turned over to a collection agent</p>
          <p>
            <Value field={field('paymentPlan')} values={values} />
          </p>
          <p className="num">
            You have {TX_CURE_DAYS} days to cure the delinquency before further collection action is taken: until {letter.deadline ? formatDay(letter.deadline.day) : '—'}.
          </p>
        </div>
      ) : null}

      {k === 'ga_pre_foreclosure' || k === 'ga_condo_pre_foreclosure' ? (
        <p className="text-foreground">
          Interest accrues at the rate of <Value field={rate} values={values} /> percent per year.
        </p>
      ) : null}

      {k === 'ga_fee_notice' ? (
        <section className="space-y-1 text-foreground">
          <h3 className="font-medium">Itemized list of reasonable attorney’s fees claimed</h3>
          <p>
            <Value field={field('attorneyFees')} values={values} />
          </p>
        </section>
      ) : null}

      {k === 'ga_fee_notice' || k === 'ga_pre_foreclosure' || k === 'ga_condo_pre_foreclosure' ? <GeorgiaQuotes kind={k} letterDate={letter.letterDate} /> : null}

      {k === 'past_due' ? (
        <p className="text-foreground">
          Please pay the total by <Value field={field('payBy')} values={values} />. If you have already paid, thank you, and please disregard this letter. If you would like to discuss a
          payment plan, contact the association.
        </p>
      ) : null}

      <section className="space-y-1 pt-4">
        <p className="text-foreground-secondary">Sincerely,</p>
        <p className="pt-6 text-foreground-secondary">
          <span aria-hidden className="block h-5 max-w-72 border-b border-current" />
        </p>
        <p className="text-foreground">
          <Value field={field('signer')} values={values} />
        </p>
        <p className="text-foreground-secondary">{association}</p>
      </section>
    </article>
  )
}
