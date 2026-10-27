'use client'

import { useMemo, useState, useTransition } from 'react'
import { Printer } from 'lucide-react'
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
  Field,
  Fieldset,
  Input,
  Radio,
  Select,
  Textarea,
  useToast,
} from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import { DraftPrintBanner, usePrintGate } from '@/components/print/PrintGate'
import { recordEstoppelPrinted } from '@/lib/properties/estoppel/actions'
import {
  CA_DOCUMENTS_NOT_GENERATED,
  CA_NOTES,
  CA_PARTIAL_LABEL,
  FL_CITATION,
  FL_DELIVERY_LABELS,
  FL_FEE_NOTES,
  GA_CITATION,
  GA_CONDO_CITATION,
  GA_CONDO_FEE_NOTES,
  GA_CONDO_NOTES,
  GA_FEE_NOTES,
  GA_NOTES,
  TX_CITATION,
  TX_DOCUMENTS_NOT_GENERATED,
  TX_FEE_NOTES,
  TX_NOTES,
  TX_PARTIAL_LABEL,
  type FlDelivery,
} from '@/lib/properties/estoppel/law'
import {
  FREQUENCY_LABELS,
  blanksLeft,
  buildCertificate,
  checkFee,
  parseMoneyCents,
  printSnapshot,
  requestProblem,
  statuteAnswers,
  statuteProblem,
  usdCents,
  valueOf,
  violationDisclosure,
  type CertificateField,
  type OpenViolation,
  type EstoppelInput,
  type FieldValues,
  type Certificate,
  type Jurisdiction,
} from '@/lib/properties/estoppel/model'

const FEE_NOTES: Partial<Record<Jurisdiction, string[]>> = { FL: FL_FEE_NOTES, TX: TX_FEE_NOTES, GA: GA_FEE_NOTES }
const BUSINESS_DAY_STATES: Jurisdiction[] = ['FL', 'TX', 'GA']

/**
 * The estoppel / resale certificate (BL-087). The board enters the
 * request, fills each BLANK the app doesn't know, ticks "I've verified
 * these figures", then prints or saves it as a PDF from the browser's
 * print dialog. The print button records an audit row first (server
 * action, figures re-checked there against the ones on this page) and
 * is disabled while any BLANK is left. Only that button arms the
 * certificate for print: a browser print (Cmd+P) shows a DRAFT banner
 * instead. Nothing is emailed. Only the certificate itself prints.
 */
export function EstoppelCertificate({ input, today }: { input: EstoppelInput; today: string }) {
  const toast = useToast()
  const [requestDate, setRequestDate] = useState(today)
  const [delivery, setDelivery] = useState<FlDelivery>('electronic')
  const [expedited, setExpedited] = useState(false)
  const [values, setValues] = useState<FieldValues>({})
  const [verified, setVerified] = useState(false)
  const [isPending, startTransition] = useTransition()
  const gate = usePrintGate()

  const reqProblem = requestProblem({ requestDate, issueDate: today })
  const req = { requestDate: reqProblem ? today : requestDate, issueDate: today, delivery, expedited }
  const cert = useMemo(() => buildCertificate(input, req), [input, req.requestDate, req.issueDate, req.delivery, req.expedited])
  const j = cert.jurisdiction
  const feeCents = parseMoneyCents(values.fee ?? '')
  // BL-155: a Georgia condominium asks about the Condominium Act and cites § 44-3-109(d).
  const answers = statuteAnswers(j, values, cert.gaCondo)
  const fee = checkFee(j, cert.deadlines, cert.figures, req, feeCents, answers, cert.gaCondo)
  const statute = statuteProblem(j, answers, cert.gaCondo)
  const blanks = blanksLeft(cert.fields, values)
  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }))

  const blocked =
    reqProblem ?? statute ?? (blanks.length > 0 ? 'Fill in every BLANK first.' : fee.problem ?? (!verified ? 'Tick “I’ve verified these figures” first.' : null))

  function print() {
    if (blocked || feeCents === null) return
    startTransition(async () => {
      // The figures this page shows: the server refuses if the books moved.
      const res = await recordEstoppelPrinted({ propertyId: input.propertyId, requestDate, delivery, expedited, feeCents, figures: printSnapshot(cert), statute: answers })
      if (!res.ok) {
        toast({ tone: 'error', message: res.error })
        return
      }
      // Armed only now, after the audit row is written.
      gate.print()
    })
  }

  const blankFields = cert.fields.filter((f) => f.value === null)

  return (
    <div className="space-y-5">
      <div className="space-y-5 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle as="h2">The request</CardTitle>
            <CardDescription>
              {j === 'FL'
                ? 'The deadline counts from the day the association received the request.'
                : j === 'CA'
                  ? 'The deadline counts from the day the request was mailed or delivered.'
                  : j === 'TX'
                    ? 'The deadline counts from the day the written request, and any proof of the requestor’s authority you asked for, was received and verified.'
                    : j === 'GA'
                      ? 'The deadline counts from the day the written request reached the association’s registered office.'
                      : 'When the request came in. Check your governing documents for any deadline.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Request received on" required error={reqProblem ?? undefined}>
              <Input type="date" value={requestDate} max={today} onChange={(e) => setRequestDate(e.target.value)} />
            </Field>
            {j === 'FL' ? (
              <>
                <Fieldset legend="How it will be delivered">
                  <ChoiceGroup>
                    {(Object.keys(FL_DELIVERY_LABELS) as FlDelivery[]).map((d) => (
                      <Radio
                        key={d}
                        name="delivery"
                        value={d}
                        checked={delivery === d}
                        onChange={() => setDelivery(d)}
                        label={FL_DELIVERY_LABELS[d]}
                        description={d === 'mail' ? '35-day effective period' : '30-day effective period'}
                      />
                    ))}
                  </ChoiceGroup>
                </Fieldset>
                <Checkbox
                  checked={expedited}
                  onChange={(e) => setExpedited(e.target.checked)}
                  label="Requested on an expedited basis"
                  description="Allows the extra expedited fee only if it is delivered within 3 business days of the request."
                />
              </>
            ) : null}
            <DeadlineSummary cert={cert} />
          </CardContent>
        </Card>

        {blankFields.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle as="h2">Fill in the blanks</CardTitle>
              <CardDescription>The app doesn’t hold these facts. Each one shows as a BLANK on the certificate, and it can’t be printed until all are filled in.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {blankFields.map((f) => (
                <BlankInput key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
              ))}
              {fee.cap ? (
                <div className="space-y-1 text-sm text-foreground-secondary">
                  <p className="num font-medium text-foreground">
                    Fee cap for this certificate: {usdCents(fee.cap.totalCents)}
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {fee.cap.lines.map((l) => (
                      <li key={l.label} className="num">
                        {l.label}: {usdCents(l.cents)}
                      </li>
                    ))}
                    {((cert.gaCondo ? GA_CONDO_FEE_NOTES : FEE_NOTES[j]) ?? []).map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {statute ? <Alert variant="error" title="This statement doesn’t apply">{statute}</Alert> : null}
              {fee.problem ? <Alert variant="error" title="Check the fee">{fee.problem}</Alert> : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <DraftPrintBanner armed={gate.printArmed} />
      <CertificateDocument cert={cert} input={input} values={values} printClass={gate.docClass} />

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
          description="The balance, charges, dates, violations and fee match the association’s books. The association may be bound by these amounts."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" icon={<Printer aria-hidden />} onClick={print} disabled={blocked !== null || isPending} loading={isPending}>
            Print / Save as PDF
          </Button>
          {blocked ? <p className="text-sm text-muted">{blocked}</p> : <p className="text-sm text-muted">Nothing is emailed. Save it as a PDF from the print dialog to send it yourself.</p>}
        </div>
      </div>
    </div>
  )
}

function DeadlineSummary({ cert }: { cert: Certificate }) {
  const d = cert.deadlines
  if (!d.responseDue) return null
  return (
    <div className="space-y-1 text-sm text-foreground-secondary">
      <p className="num">
        <span className="font-medium text-foreground">Respond by {formatDay(d.responseDue)}</span> — {d.responseRule}.
      </p>
      {d.holidaysSkipped.length > 0 ? (
        <p className="num">Skips weekends and {d.holidaysSkipped.map((h) => `${h.name} (${formatDay(h.day)})`).join(', ')}.</p>
      ) : BUSINESS_DAY_STATES.includes(cert.jurisdiction) ? (
        <p>Skips weekends and federal holidays. Allow for any other day your office is closed.</p>
      ) : null}
      {d.expeditedDue ? <p className="num">Expedited delivery: by {formatDay(d.expeditedDue)} (3 business days).</p> : null}
      {d.effectiveThrough ? (
        <p className="num">
          Effective {d.effectiveDays} days from issue, through {formatDay(d.effectiveThrough)}.
        </p>
      ) : null}
      {d.late ? (
        <Alert variant="warning" title="Past the deadline">
          {cert.jurisdiction === 'FL'
            ? 'Today is after the 10-business-day deadline, so no fee may be charged for this certificate (§ 720.30851(4)).'
            : cert.jurisdiction === 'TX'
              ? 'Today is after the 10-business-day deadline, so no fee may be charged for this certificate (§ 207.003(c-1)).'
              : cert.jurisdiction === 'GA' && cert.gaCondo
                ? 'Today is after the 5-business-day deadline. Under § 44-3-109(d) the assessment lien is extinguished as to the buyer’s or lender’s interest in this transaction. Ask your association’s attorney.'
                : cert.jurisdiction === 'GA'
                ? 'Today is after the 5-business-day deadline. Under § 44-3-232(d) the assessment lien is extinguished as to the buyer’s or lender’s interest in this transaction. Ask your association’s attorney.'
                : 'Today is after the 10-day deadline in § 4530(a)(1).'}
        </Alert>
      ) : null}
      {d.expeditedMissed ? <p className="text-warning">It’s past 3 business days, so the expedited fee no longer applies.</p> : null}
    </div>
  )
}

/** One BLANK's input. Shared with the collections letter (BL-089). */
export function BlankInput({ field, value, onChange }: { field: CertificateField; value: string; onChange: (v: string) => void }) {
  if (field.kind === 'yesno' || field.kind === 'yesno_detail') {
    const choice = value === 'No' ? 'No' : value.startsWith('Yes') ? 'Yes' : ''
    const detail = value.startsWith('Yes:') ? value.slice(4).replace(/^ /, '') : ''
    return (
      <Fieldset legend={field.label} hint={field.hint}>
        <ChoiceGroup>
          <Radio name={field.key} value="No" checked={choice === 'No'} onChange={() => onChange('No')} label="No" />
          <Radio name={field.key} value="Yes" checked={choice === 'Yes'} onChange={() => onChange(`Yes: ${detail}`)} label="Yes" />
        </ChoiceGroup>
        {choice === 'Yes' && field.kind === 'yesno_detail' ? (
          <Field label="Details" required>
            <Input value={detail} onChange={(e) => onChange(`Yes: ${e.target.value}`)} maxLength={300} />
          </Field>
        ) : null}
      </Fieldset>
    )
  }
  if (field.kind === 'frequency') {
    return (
      <Field label={field.label} required hint={field.hint}>
        <Select
          value={value}
          onValueChange={onChange}
          placeholder="Choose"
          options={Object.values(FREQUENCY_LABELS).map((l) => ({ value: l, label: `Per ${l}` }))}
        />
      </Field>
    )
  }
  if (field.kind === 'textarea') {
    return (
      <Field label={field.label} required hint={field.hint}>
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} maxLength={1000} />
      </Field>
    )
  }
  return (
    <Field
      label={field.label}
      required
      hint={field.hint}
      error={field.kind === 'money' && value.trim() && parseMoneyCents(value) === null ? 'Enter an amount, like 250 or 250.00.' : undefined}
    >
      <Input value={value} inputMode={field.kind === 'money' ? 'decimal' : undefined} onChange={(e) => onChange(e.target.value)} maxLength={300} />
    </Field>
  )
}

// ─── the printed document ───────────────────────────────────────────

export function Blank({ label }: { label: string }) {
  return <span className="rounded bg-warning-subtle px-1 font-mono text-warning">[[BLANK: {label}]]</span>
}

function Line({ field, values }: { field: CertificateField | undefined; values: FieldValues }) {
  if (!field) return null
  const v = valueOf(field, values)
  return (
    <div className="grid gap-1 py-1.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] print:grid-cols-[2fr_3fr]">
      <dt className="text-foreground-secondary">{field.label}</dt>
      <dd className="whitespace-pre-wrap break-words text-foreground">{v ?? <Blank label={field.label} />}</dd>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-1.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] print:grid-cols-[2fr_3fr]">
      <dt className="text-foreground-secondary">{label}</dt>
      <dd className="break-words text-foreground">{children}</dd>
    </div>
  )
}

function Items({ items, empty, flag }: { items: { id: string; dueDate: string; label: string; remainingCents: number; withinEffectivePeriod?: boolean }[]; empty: string; flag?: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-foreground-secondary">
            <th className="py-1 pr-3 font-medium">Due</th>
            <th className="py-1 pr-3 font-medium">Item</th>
            <th className="py-1 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-border/60">
              <td className="num py-1 pr-3">{formatDay(i.dueDate)}</td>
              <td className="py-1 pr-3">
                {i.label}
                {flag && i.withinEffectivePeriod ? <span className="ml-1 text-xs text-muted">({flag})</span> : null}
              </td>
              <td className="num py-1 text-right">{usdCents(i.remainingCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ViolationList({ items }: { items: OpenViolation[] }) {
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5">
      {items.map((v) => (
        <li key={v.id}>
          {v.description || 'Violation'}
          <span className="num text-xs text-foreground-secondary">
            {v.noticeSentAt ? ` — notice sent ${formatDay(v.noticeSentAt)}` : v.noticed ? ' — notice recorded, date not on file' : ' — no notice recorded'}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function CertificateDocument({ cert, input, values, printClass }: { cert: Certificate; input: EstoppelInput; values: FieldValues; printClass: string }) {
  const j = cert.jurisdiction
  const f = cert.figures
  const d = cert.deadlines
  const field = (key: string) => cert.fields.find((x) => x.key === key)
  const violations = violationDisclosure(j, f)
  const title =
    j === 'FL'
      ? 'Estoppel Certificate'
      : j === 'CA'
        ? 'Statement of Assessments and Unpaid Amounts'
        : j === 'TX'
          ? 'Resale Certificate'
          : j === 'GA'
            ? 'Statement of Amounts Due'
            : 'Account Status Certificate'
  const subtitle =
    j === 'FL'
      ? `Issued under ${FL_CITATION}`
      : j === 'CA'
        ? 'For the resale disclosure under Cal. Civ. Code § 4525(a)(4)–(5)'
        : j === 'TX'
          ? `Issued under ${TX_CITATION}`
          : j === 'GA' && cert.gaCondo
            ? `Issued under ${GA_CONDO_CITATION} (Georgia Condominium Act)`
            : j === 'GA'
            ? `Issued under ${GA_CITATION} (Georgia Property Owners’ Association Act)`
            : 'Statement of the association’s records for this home'
  // Charges marked in the not-yet-due list: FL, the effective period; GA,
  // those due by the end of the five-business-day period (§ 44-3-232(d)).
  const flag = d.effectiveThrough ? 'due within the effective period' : j === 'GA' && !d.late ? 'due by the end of the 5-business-day period' : undefined
  const address = [input.address, input.unitNumber ? `Unit ${input.unitNumber}` : null].filter(Boolean).join(', ')

  return (
    <article aria-labelledby="estoppel-title" className={`space-y-5 rounded-lg border border-border bg-surface p-5 text-sm print:border-0 print:p-0 ${printClass}`}>
      <header className="space-y-1">
        {input.associationName ? <p className="text-foreground-secondary">{input.associationName}</p> : null}
        <h2 id="estoppel-title" className="text-xl font-semibold text-foreground">
          {title}
        </h2>
        <p className="text-foreground-secondary">{subtitle}</p>
        {j === 'CA' || j === 'TX' ? (
          <p className="rounded border border-warning bg-warning-subtle px-2 py-1 font-medium text-warning">{j === 'CA' ? CA_PARTIAL_LABEL : TX_PARTIAL_LABEL}</p>
        ) : null}
      </header>

      <dl className="divide-y divide-border/60">
        <Row label="Date of issuance">{formatDay(d.issueDate)}</Row>
        <Row label="Request received">{formatDay(d.requestDate)}</Row>
        {j === 'TX' ? <Row label="Prepared on">{formatDay(d.issueDate)}</Row> : null}
        {d.effectiveThrough ? (
          <Row label="Effective period">
            {d.effectiveDays} days ({d.effectiveDays === 35 ? 'sent by regular mail' : 'hand delivered or sent by e-mail'}), through {formatDay(d.effectiveThrough)}
          </Row>
        ) : null}
        <Line field={field('requestor')} values={values} />
        <Line field={field('owners')} values={values} />
        <Row label="Property address">{address || '—'}</Row>
        <Line field={field('parcel')} values={values} />
        {j === 'FL' ? <Line field={field('parking')} values={values} /> : null}
        {j === 'FL' && f.collections?.withAttorney ? <Line field={field('attorney')} values={values} /> : null}
        <Line field={field('fee')} values={values} />
      </dl>

      <section className="space-y-2">
        <h3 className="font-semibold text-foreground">Assessment information</h3>
        <dl className="divide-y divide-border/60">
          <Row label="Regular periodic assessment">
            {valueOf(field('regularAmount')!, values) ?? <Blank label="Regular assessment amount" />} per{' '}
            {valueOf(field('frequency')!, values) ?? <Blank label="Regular assessment frequency" />}
          </Row>
          <Line field={field('paidThrough')} values={values} />
          <Line field={field('nextDue')} values={values} />
          <Row label={f.creditOnAccountCents > 0 ? 'Current balance owed on the date of issuance, before credit' : 'Current balance owed on the date of issuance'}>
            <span className="num font-semibold">{usdCents(f.currentBalanceCents)}</span>
            {f.pastDueCents > 0 ? <span className="num block text-xs text-foreground-secondary">of which {usdCents(f.pastDueCents)} is past due</span> : null}
          </Row>
          {f.creditOnAccountCents > 0 ? (
            <>
              <Row label="Credit on account, not applied to a charge">
                <span className="num">{usdCents(f.creditOnAccountCents)}</span>
              </Row>
              <Row label="Total due after credit">
                <span className="num font-semibold">{usdCents(f.totalDueAfterCreditCents)}</span>
              </Row>
            </>
          ) : null}
        </dl>
        <h4 className="pt-2 font-medium text-foreground">Itemized amounts owed on the date of issuance</h4>
        <Items items={f.owedItems} empty="Nothing is owed on the date of issuance." />
        {f.unappliedCents !== 0 ? (
          <p className="num text-foreground-secondary">
            Payments and credits not applied to a charge: {usdCents(f.unappliedCents)}.
          </p>
        ) : null}
        <h4 className="pt-2 font-medium text-foreground">
          Charges not yet due{flag ? ` (those ${flag} are marked)` : ''}
        </h4>
        <Items items={f.notYetDue} empty="No charges are billed for a later date." flag={flag} />
        <p className="num text-foreground-secondary">Total not yet due: {usdCents(f.notYetDueCents)}.</p>
        {j === 'FL' && d.effectiveThrough ? (
          <p className="text-xs text-muted">
            Amounts that come due during the effective period are listed as billed. Delinquent amounts are assumed to remain delinquent (§ 720.30851(1)(h)5).
          </p>
        ) : null}
        <h4 className="pt-2 font-medium text-foreground">Special assessments</h4>
        <Items items={f.specials} empty="No special assessments are unpaid." />
        {j === 'CA' ? <Line field={field('approvedChanges')} values={values} /> : null}
        {j === 'TX' ? (
          <dl className="divide-y divide-border/60">
            <Line field={field('approvedSpecials')} values={values} />
            <Line field={field('capitalExpenditures')} values={values} />
            <Line field={field('reserves')} values={values} />
          </dl>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-foreground">Other information</h3>
        <dl className="divide-y divide-border/60">
          <Line field={field('transferFee')} values={values} />
          <Row label={violations.label}>
            {violations.listed.length === 0 ? (
              'No'
            ) : (
              <>
                Yes ({violations.listed.length})
                <ViolationList items={violations.listed} />
              </>
            )}
          </Row>
          {violations.boardCheck.length > 0 ? (
            <div data-testid="violations-board-check" className="my-1.5 space-y-1 rounded border border-warning bg-warning-subtle px-3 py-2 print:hidden">
              <p className="font-medium text-warning">
                {violations.boardCheckLabel} ({violations.boardCheck.length})
              </p>
              <ViolationList items={violations.boardCheck} />
              <p className="text-xs text-foreground-secondary">{violations.boardCheckHint}</p>
            </div>
          ) : null}
          {j === 'FL' ? (
            <>
              <Line field={field('transferApproval')} values={values} />
              <Line field={field('firstRefusal')} values={values} />
              <Line field={field('otherAssociations')} values={values} />
              <Line field={field('insurance')} values={values} />
            </>
          ) : null}
          {j === 'TX' ? (
            <>
              <Line field={field('knownViolations')} values={values} />
              <Line field={field('firstRefusal')} values={values} />
              <Line field={field('judgments')} values={values} />
              <Line field={field('lawsuits')} values={values} />
              <Line field={field('governmentNotices')} values={values} />
              <Line field={field('adminTransferFee')} values={values} />
              <Line field={field('transferFees')} values={values} />
              <Line field={field('managingAgent')} values={values} />
              <Line field={field('foreclosure')} values={values} />
            </>
          ) : null}
          {j === 'GA' && cert.gaCondo ? (
            <>
              <Line field={field('condoAct')} values={values} />
              <Line field={field('instrumentFee')} values={values} />
            </>
          ) : j === 'GA' ? (
            <>
              <Line field={field('poaAct')} values={values} />
              <Line field={field('instrumentFee')} values={values} />
            </>
          ) : null}
          <Row label="Payment plan">
            {f.activePlan ? (
              <span className="num">
                Active: {usdCents(Math.round(f.activePlan.installmentAmount * 100))} × {f.activePlan.installmentCount} from {formatDay(f.activePlan.startDate)} (total {usdCents(Math.round(f.activePlan.totalAmount * 100))})
              </span>
            ) : (
              'None active'
            )}
          </Row>
          <Row label="Collections">{f.collections ? `${f.collections.stage}${f.collections.attorneyFirm ? ` (${f.collections.attorneyFirm})` : ''}` : 'Not in collections'}</Row>
        </dl>
      </section>

      {j === 'CA' ? (
        <section className="space-y-2">
          <h3 className="font-semibold text-foreground">Not included: documents the § 4525 packet also requires</h3>
          <ul className="list-disc space-y-1 pl-5 text-foreground-secondary">
            {CA_DOCUMENTS_NOT_GENERATED.map((doc) => (
              <li key={doc.cite}>
                <span className="font-medium text-foreground">{doc.cite}</span> {doc.text}
              </li>
            ))}
          </ul>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
            {CA_NOTES.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {j === 'TX' ? (
        <section className="space-y-2">
          <h3 className="font-semibold text-foreground">Not included: documents § 207.003 also requires</h3>
          <ul className="list-disc space-y-1 pl-5 text-foreground-secondary">
            {TX_DOCUMENTS_NOT_GENERATED.map((doc) => (
              <li key={doc.cite}>
                <span className="font-medium text-foreground">{doc.cite}</span> {doc.text}
              </li>
            ))}
          </ul>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
            {TX_NOTES.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {j === 'GA' ? (
        <section className="space-y-2">
          <h3 className="font-semibold text-foreground">About this statement</h3>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
            {(cert.gaCondo ? GA_CONDO_NOTES : GA_NOTES).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3 pt-2">
        <dl>
          <Line field={field('signer')} values={values} />
        </dl>
        <p className="pt-6 text-foreground-secondary">Signature: ______________________________</p>
        {j === 'generic' ? (
          <p className="text-xs text-muted">This certificate states what the association’s records show on the date of issuance. It makes no claim about any state statute.</p>
        ) : null}
      </section>
    </article>
  )
}
