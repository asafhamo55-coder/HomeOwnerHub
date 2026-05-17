'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, Plus, Trash2 } from 'lucide-react'
import { Button, Input, Textarea } from '@homeowner-portal/ui'

interface BidLineDraft {
  description: string
  quantity: string
  unitPrice: string
  notes: string
}

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
  const [lines, setLines] = useState<BidLineDraft[]>([emptyLine()])
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  function updateLine(i: number, patch: Partial<BidLineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()])
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(formData: FormData) {
    setError(null)

    const totalRaw = String(formData.get('total_amount') ?? '').trim()
    const totalAmount = totalRaw ? Number(totalRaw.replace(/[^0-9.]/g, '')) : NaN
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      setError('Total bid amount is required and must be greater than zero.')
      return
    }

    const payloadLines = lines
      .map((l) => ({
        description: l.description.trim(),
        quantity: l.quantity ? Number(l.quantity.replace(/[^0-9.]/g, '')) : null,
        unit_price: l.unitPrice
          ? Number(l.unitPrice.replace(/[^0-9.]/g, ''))
          : null,
        notes: l.notes.trim() || null,
      }))
      .filter((l) => l.description.length > 0)

    const payload = {
      total_amount: totalAmount,
      payment_terms: String(formData.get('payment_terms') ?? '').trim() || null,
      warranty: String(formData.get('warranty') ?? '').trim() || null,
      start_date: String(formData.get('start_date') ?? '').trim() || null,
      completion_date: String(formData.get('completion_date') ?? '').trim() || null,
      line_items: payloadLines,
    }

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
        const errBody = (await res.json().catch(() => ({}))) as {
          message?: string
          error?: string
        }
        setError(errBody.message ?? errBody.error ?? 'Submission failed.')
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
          <Input name="payment_terms" placeholder="Net 30, 50% deposit, etc." />
        </Field>
        <Field label="Warranty">
          <Input name="warranty" placeholder="1 year workmanship" />
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
              className="rounded-md border border-border bg-muted/10 p-3"
            >
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <Input
                    placeholder="Bi-weekly mowing"
                    value={line.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                  />
                </div>
                <Input
                  placeholder="Qty"
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                />
                <Input
                  placeholder="Unit $"
                  inputMode="decimal"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                />
              </div>
              <div className="mt-2 flex items-start gap-2">
                <Textarea
                  rows={1}
                  placeholder="Notes (optional)"
                  value={line.notes}
                  onChange={(e) => updateLine(i, { notes: e.target.value })}
                />
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeLine(i)}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
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
          <FileUp className="h-5 w-5 text-muted-fg" />
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
            <span className="line-clamp-1 max-w-full text-xs text-muted-fg">{fileName}</span>
          ) : null}
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
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
    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-fg">
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
      <span className="text-sm font-medium text-muted">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  )
}

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-fg">{children}</p>
}
