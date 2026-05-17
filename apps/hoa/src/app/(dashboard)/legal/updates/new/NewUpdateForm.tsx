'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Send, Trash2 } from 'lucide-react'
import { Button, Input, Textarea } from '@homeowner-portal/ui'
import { createLawUpdate, type StatuteRow } from '@/lib/state-law'

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: '', label: '(none)' },
  { value: 'meetings', label: 'Meetings & elections' },
  { value: 'assessments', label: 'Assessments & dues' },
  { value: 'fines', label: 'Fines & enforcement' },
  { value: 'foreclosure', label: 'Liens & foreclosure' },
  { value: 'records', label: 'Records & access' },
  { value: 'architectural', label: 'Architectural review' },
  { value: 'fair_housing', label: 'Fair housing' },
  { value: 'amendments', label: 'Amendments & governance' },
]

export function NewUpdateForm({ statutes }: { statutes: StatuteRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [actionItems, setActionItems] = useState<string[]>([''])

  function addActionItem() {
    setActionItems((prev) => [...prev, ''])
  }
  function updateActionItem(i: number, value: string) {
    setActionItems((prev) => prev.map((a, idx) => (idx === i ? value : a)))
  }
  function removeActionItem(i: number) {
    setActionItems((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(formData: FormData) {
    setError(null)
    const headline = String(formData.get('headline') ?? '').trim()
    const summary = String(formData.get('summary') ?? '').trim()
    const category = String(formData.get('category') ?? '').trim() || null
    const effectiveDate = String(formData.get('effective_date') ?? '').trim() || null
    const sourceUrl = String(formData.get('source_url') ?? '').trim() || null
    const relatedStatuteId =
      String(formData.get('related_statute_id') ?? '').trim() || null

    const cleanedActionItems = actionItems
      .map((a) => a.trim())
      .filter((a) => a.length > 0)

    startTransition(async () => {
      const result = await createLawUpdate({
        headline,
        summary,
        actionItems: cleanedActionItems,
        category,
        effectiveDate,
        sourceUrl,
        relatedStatuteId,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push('/legal')
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <Field label="Headline" required>
        <Input
          name="headline"
          required
          maxLength={200}
          placeholder="FL SB 4-D — structural inspections required by Dec 31"
        />
        <Helper>Short, scannable. What changed?</Helper>
      </Field>

      <Field label="Summary" required>
        <Textarea
          name="summary"
          rows={6}
          required
          minLength={20}
          maxLength={4000}
          placeholder="Florida SB 4-D, signed May 26, 2022, requires HOAs and condo associations governing buildings of three stories or more to perform a Structural Integrity Reserve Study and milestone inspections..."
        />
        <Helper>1–3 paragraphs of plain English. The board reads this; write for them.</Helper>
      </Field>

      <section className="space-y-2">
        <span className="text-sm font-medium text-muted">Action items</span>
        <Helper>Bullets the board can act on. Each one optional.</Helper>
        <ul className="space-y-2">
          {actionItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <Input
                value={item}
                onChange={(e) => updateActionItem(i, e.target.value)}
                placeholder="Schedule structural inspection with licensed engineer before Dec 31, 2024"
                maxLength={300}
              />
              {actionItems.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeActionItem(i)}
                  aria-label="Remove action item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" size="sm" onClick={addActionItem}>
          <Plus className="h-3.5 w-3.5" />
          Add action item
        </Button>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <select
            name="category"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Effective date">
          <Input name="effective_date" type="date" />
        </Field>
      </div>

      <Field label="Source URL">
        <Input
          name="source_url"
          type="url"
          placeholder="https://www.flsenate.gov/Session/Bill/2022/4D"
        />
        <Helper>Statute text, press release, or the law firm post that explained the change.</Helper>
      </Field>

      <Field label="Related statute (optional)">
        <select
          name="related_statute_id"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">(none)</option>
          {statutes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code_citation} — {s.title}
            </option>
          ))}
        </select>
        <Helper>Link this update to the statute it changes, if applicable.</Helper>
      </Field>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          <Send className="h-4 w-4" />
          {isPending ? 'Posting…' : 'Post update'}
        </Button>
      </div>
    </form>
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
