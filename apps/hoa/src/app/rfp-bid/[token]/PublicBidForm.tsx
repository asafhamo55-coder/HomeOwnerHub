'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, Plus, Trash2 } from 'lucide-react'
import { Button, Input, Textarea } from '@homeowner-portal/ui'
import { apiErrorMessage } from '@/lib/api/client'
import {
  BID_LONG_TEXT,
  BID_MAX_LINES,
  BID_SHORT_TEXT,
  buildBidPayload,
  describeIssues,
  type BidLineDraft,
} from './bid-payload'

const emptyLine = (): BidLineDraft => ({
  description: '',
  quantity: '',
  unitPrice: '',
  notes: '',
})

export function PublicBidForm({ token }: { token: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [lines, setLines] = useState<BidLineDraft[]>([emptyLine()])
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  function updateLine(i: number, patch: Partial<BidLineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((prev) => (prev.length >= BID_MAX_LINES ? prev : [...prev, emptyLine()]))
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(formData: FormData) {
    setError(null)
    setProblems([])

    // Same rules as the route, checked first so the vendor sees which field
    // is wrong instead of a bare "Some fields are missing or invalid."
    const built = buildBidPayload({
      totalAmount: String(formData.get('total_amount') ?? ''),
      paymentTerms: String(formData.get('payment_terms') ?? ''),
      warranty: String(formData.get('warranty') ?? ''),
      startDate: String(formData.get('start_date') ?? ''),
      completionDate: String(formData.get('completion_date') ?? ''),
      lines,
    })
    if (!built.ok) {
      setError('Fix the following before submitting:')
      setProblems(built.problems)
      return
    }
    const { payload, lineIndex } = built

    const body = new FormData()
    body.append('payload', JSON.stringify(payload))
    const bidFile = fileRef.current?.files?.[0]
    if (bidFile) body.append('file', bidFile)

    startTransition(async () => {
      const res = await fetch(`/api/rfp-bid/${token}/submit`, {
        method: 'POST',
        body,
      })
      if (!res.ok) {
        let errBody: unknown = null
        try {
          errBody = await res.json()
        } catch {
          // HTML or empty body: fall through to the generic message.
        }
        setError(apiErrorMessage(errBody, 'Submission failed. Try again in a moment.'))
        // A 400 validation_failed carries per-field issues; show them.
        setProblems(describeIssues(errBody, lineIndex))
        return
      }
      router.push(`/rfp-bid/${token}/submitted`)
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <section className="space-y-3">
        <SectionTitle>Pricing</SectionTitle>
        <Field label="Total bid amount ($)" required>
          <Input name="total_amount" inputMode="decimal" required placeholder="32500" />
        </Field>
        <Field label="Payment terms">
          <Input name="payment_terms" maxLength={BID_SHORT_TEXT} placeholder="Net 30, 50% deposit, etc." />
        </Field>
        <Field label="Warranty">
          <Input name="warranty" maxLength={BID_SHORT_TEXT} placeholder="1 year workmanship" />
        </Field>
      </section>

      <section className="space-y-3">
        <SectionTitle>Timeline</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Earliest start date">
            <Input name="start_date" type="date" />
          </Field>
          <Field label="Estimated completion">
            <Input name="completion_date" type="date" />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Line items</SectionTitle>
        <Helper>
          Break your bid into discrete items. Mirror the RFP line items
          where you can; add lines for anything excluded or extra.
        </Helper>
        <ul className="space-y-2">
          {lines.map((line, i) => (
            <li
              key={i}
              className="rounded-md border border-border bg-foreground/10 p-3"
            >
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <Input
                    aria-label={`Line ${i + 1} description`}
                    placeholder="Bi-weekly mowing"
                    maxLength={BID_SHORT_TEXT}
                    value={line.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                  />
                </div>
                <Input
                  aria-label={`Line ${i + 1} quantity`}
                  placeholder="Qty"
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                />
                <Input
                  aria-label={`Line ${i + 1} unit price`}
                  placeholder="Unit $"
                  inputMode="decimal"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                />
              </div>
              <div className="mt-2 flex items-start gap-2">
                <Textarea
                  rows={1}
                  aria-label={`Line ${i + 1} notes`}
                  placeholder="Notes (optional)"
                  maxLength={BID_LONG_TEXT}
                  value={line.notes}
                  onChange={(e) => updateLine(i, { notes: e.target.value })}
                />
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeLine(i)}
                    aria-label={`Remove line ${i + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addLine}
          disabled={lines.length >= BID_MAX_LINES}
        >
          <Plus className="h-3.5 w-3.5" />
          Add line item
        </Button>
      </section>

      <section className="space-y-3">
        <SectionTitle>Bid document (optional)</SectionTitle>
        <Helper>
          Upload your full proposal PDF if you have one. The HOA can
          download it during evaluation.
        </Helper>
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-4 text-center">
          <FileUp className="h-5 w-5 text-muted" />
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            {fileName ? 'Replace' : 'Choose file'}
          </Button>
          {fileName ? (
            <span className="line-clamp-1 max-w-full text-xs text-muted">{fileName}</span>
          ) : null}
        </div>
      </section>

      {error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <p>{error}</p>
          {problems.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Submitting…' : 'Submit bid'}
        </Button>
      </div>
    </form>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
      {children}
    </h2>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  )
}

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>
}
