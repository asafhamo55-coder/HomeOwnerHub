'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone, Printer } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Input,
  Textarea,
  useToast,
} from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import { DraftPrintBanner, usePrintGate } from '@/components/print/PrintGate'
import { CA_NOTES, CA_PARTIAL_LABEL, FL_NOTES } from '@/lib/budget-notice/law'
import {
  blanksLeft,
  buildNotice,
  noticeHtml,
  parseSignedMoneyCents,
  type BudgetNoticeInput,
  type FieldValues,
  type NoticeField,
} from '@/lib/budget-notice/model'
import { BUDGET_NOTICE_WIZARD_HREF, sessionStore, writeBudgetNoticeDraft } from '@/lib/budget-notice/draft-handoff'

/**
 * The owner budget notice (BL-091). The board fills each BLANK the app
 * doesn't know, reads the preview, ticks "I’ve checked these figures",
 * then either prints it (or saves a PDF from the print dialog) or opens
 * it as a draft in the communications wizard. Both are disabled while any
 * BLANK is left. Nothing is sent from this page: the wizard's normal,
 * board-reviewed send is the only way the notice reaches owners.
 */
export function BudgetNotice({ input, today }: { input: BudgetNoticeInput; today: string }) {
  const router = useRouter()
  const toast = useToast()
  const [values, setValues] = useState<FieldValues>({})
  const [checked, setChecked] = useState(false)
  const gate = usePrintGate()

  const notice = useMemo(() => buildNotice(input, today), [input, today])
  const j = notice.jurisdiction
  const html = useMemo(() => noticeHtml(notice, input, values), [notice, input, values])
  const blanks = blanksLeft(notice.fields, values)
  const blankFields = notice.fields.filter((f) => f.value === null)
  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }))

  const blocked = blanks.length > 0 ? 'Fill in every BLANK first.' : !checked ? 'Tick “I’ve checked these figures” first.' : null

  function createDraft() {
    if (blocked) return
    const ok = writeBudgetNoticeDraft(sessionStore(), { budgetId: input.budgetId, subject: notice.subject, bodyHtml: html })
    if (!ok) {
      toast({ tone: 'error', title: 'Couldn’t open the draft', message: 'This browser blocked storing the draft. Use Print / Save as PDF instead, or allow site data and try again.' })
      return
    }
    router.push(BUDGET_NOTICE_WIZARD_HREF)
  }

  const w = notice.caWindow
  const f = notice.figures

  return (
    <div className="space-y-5">
      <div className="space-y-5 print:hidden">
        {f.otherLineCount > 0 ? (
          <Alert variant="warning" title="Some lines aren’t income or expense">
            {f.otherLineCount} budget line{f.otherLineCount === 1 ? ' is' : 's are'} on a balance-sheet account and left out of the notice and its totals.
          </Alert>
        ) : null}

        {j === 'CA' ? (
          <Alert variant="warning" title={CA_PARTIAL_LABEL}>
            The notice covers the pro forma operating budget and the board statements below. The items it lists under “Not included in this notice” must go out with it.
            {w ? (
              <span className="mt-1 block num">
                § 5300(a): distribute it between {formatDay(w.earliest)} and {formatDay(w.latest)} (30 to 90 days before the fiscal year ends on {formatDay(w.fiscalYearEnd)}).
                {w.status === 'late' ? ' Today is past that window.' : w.status === 'early' ? ' That window hasn’t opened yet.' : ''}
              </span>
            ) : null}
          </Alert>
        ) : null}

        {blankFields.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle as="h2">Fill in the blanks</CardTitle>
              <CardDescription>
                The app doesn’t hold these facts. Each one shows as a BLANK in the notice, and it can’t be printed or drafted until all are filled in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {blankFields.map((fl) => (
                <BlankInput key={fl.key} field={fl} value={values[fl.key] ?? ''} onChange={(v) => set(fl.key, v)} />
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <DraftPrintBanner armed={gate.printArmed} />
      <article
        aria-label="Budget notice preview"
        className={`${gate.docClass} space-y-3 rounded-lg border border-border bg-surface p-5 text-sm text-foreground print:border-0 print:p-0 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:pt-2 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_small]:text-xs [&_small]:text-foreground-secondary [&_td]:border-b [&_td]:border-border/60 [&_td]:py-1 [&_td]:pr-3 [&_th]:border-b [&_th]:border-border [&_th]:py-1 [&_th]:font-medium [&_th]:text-foreground-secondary [&_.budget-notice-blank]:rounded [&_.budget-notice-blank]:bg-warning-subtle [&_.budget-notice-blank]:px-1 [&_.budget-notice-blank]:font-mono [&_.budget-notice-blank]:text-warning`}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <div className="space-y-3 print:hidden">
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          {(j === 'FL' ? FL_NOTES : j === 'CA' ? CA_NOTES : ['This notice makes no claim about any state statute. Check your governing documents for what owners must receive.']).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        {blanks.length > 0 ? (
          <Alert variant="warning" title={`${blanks.length} BLANK${blanks.length === 1 ? '' : 's'} left`}>
            {blanks.join('; ')}.
          </Alert>
        ) : null}
        <Checkbox
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          label="I’ve checked these figures"
          description="The categories, totals, per-home assessment and every line I filled in match the budget the board adopted and our governing documents."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" icon={<Printer aria-hidden />} onClick={() => !blocked && gate.print()} disabled={blocked !== null}>
            Print / Save as PDF
          </Button>
          <Button type="button" variant="secondary" icon={<Megaphone aria-hidden />} onClick={createDraft} disabled={blocked !== null}>
            Create announcement draft
          </Button>
        </div>
        <p className="text-sm text-muted">
          {blocked ??
            'Nothing is sent from this page. The draft opens in New message, where you pick the audience, review it and send it the usual way.'}
        </p>
      </div>
    </div>
  )
}

function BlankInput({ field, value, onChange }: { field: NoticeField; value: string; onChange: (v: string) => void }) {
  if (field.kind === 'textarea') {
    return (
      <Field label={field.label} required hint={field.hint}>
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} maxLength={2000} />
      </Field>
    )
  }
  return (
    <Field
      label={field.label}
      required
      hint={field.hint}
      error={field.kind === 'signed_money' && value.trim() && parseSignedMoneyCents(value) === null ? 'Enter an amount, like 2500 or -1500.' : undefined}
    >
      <Input value={value} inputMode={field.kind === 'signed_money' ? 'decimal' : undefined} onChange={(e) => onChange(e.target.value)} maxLength={300} />
    </Field>
  )
}
