'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Send, X } from 'lucide-react'
import { Alert, Button, Field, Fieldset, Input, Select, Textarea, useToast } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { createLawUpdate, type StatuteRow } from '@/lib/state-law'

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: '', label: 'No topic' },
  { value: 'meetings', label: 'Meetings & elections' },
  { value: 'assessments', label: 'Assessments & dues' },
  { value: 'fines', label: 'Fines & enforcement' },
  { value: 'foreclosure', label: 'Liens & foreclosure' },
  { value: 'records', label: 'Records & access' },
  { value: 'architectural', label: 'Architectural review' },
  { value: 'fair_housing', label: 'Fair housing' },
  { value: 'amendments', label: 'Amendments & governance' },
]

export function NewUpdateForm({
  statutes,
  statutesFailed = false,
}: {
  statutes: StatuteRow[]
  statutesFailed?: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [actionItems, setActionItems] = useState<string[]>([''])
  const summaryRef = useRef<HTMLTextAreaElement>(null)

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
    setFieldErrors({})
    const headline = String(formData.get('headline') ?? '').trim()
    const summary = String(formData.get('summary') ?? '').trim()
    const category = String(formData.get('category') ?? '').trim() || null
    const effectiveDate = String(formData.get('effective_date') ?? '').trim() || null
    const sourceUrl = String(formData.get('source_url') ?? '').trim() || null
    const relatedStatuteId = String(formData.get('related_statute_id') ?? '').trim() || null

    const cleanedActionItems = actionItems.map((a) => a.trim()).filter((a) => a.length > 0)

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
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
          setFieldErrors(result.fieldErrors)
        } else {
          setError(result.error)
        }
        return
      }
      toast({ tone: 'success', message: 'Update posted.' })
      router.push('/legal')
    })
  }

  const fe = fieldErrors

  return (
    <form action={handleSubmit} className="space-y-6">
      <Field label="Headline" required hint="Short and scannable — what changed?" error={fe.headline}>
        <Input
          name="headline"
          required
          maxLength={200}
          placeholder="FL SB 4-D — structural inspections required by Dec 31"
          disabled={isPending}
        />
      </Field>

      <Field
        label="Summary"
        required
        hint="One to three paragraphs of plain English. The board reads this — write for them."
        error={fe.summary}
        labelAside={
          <AiRewriteButton
            textareaRef={summaryRef}
            context="Plain-English summary of a state-law change for HOA boards — preserve statute citations, dates, and effective deadlines exactly"
            disabled={isPending}
          />
        }
      >
        <Textarea
          ref={summaryRef}
          name="summary"
          rows={6}
          required
          minLength={20}
          maxLength={4000}
          placeholder="Florida SB 4-D requires associations governing buildings of three stories or more to complete a Structural Integrity Reserve Study…"
          disabled={isPending}
        />
      </Field>

      <Fieldset legend="Action items" hint="Steps a board can act on. Optional." error={fe.action_items}>
        <ul className="space-y-2">
          {actionItems.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              <Field label={`Action item ${i + 1}`} hideLabel className="flex-1">
                <Input
                  value={item}
                  onChange={(e) => updateActionItem(i, e.target.value)}
                  placeholder="Schedule a structural inspection with a licensed engineer"
                  maxLength={300}
                  disabled={isPending}
                />
              </Field>
              {actionItems.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeActionItem(i)}
                  aria-label={`Remove action item ${i + 1}`}
                  icon={<X aria-hidden />}
                />
              ) : null}
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" onClick={addActionItem} icon={<Plus aria-hidden />}>
          Add action item
        </Button>
      </Fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Topic" optional error={fe.category}>
          <Select name="category" defaultValue="" disabled={isPending}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Effective date" optional error={fe.effective_date}>
          <Input name="effective_date" type="date" disabled={isPending} />
        </Field>
      </div>

      <Field
        label="Source URL"
        optional
        hint="The statute, a press release, or the law-firm post that explains the change."
        error={fe.source_url}
      >
        <Input
          name="source_url"
          type="url"
          inputMode="url"
          placeholder="https://www.flsenate.gov/Session/Bill/2022/4D"
          disabled={isPending}
        />
      </Field>

      <Field
        label="Related statute"
        optional
        hint={
          statutesFailed
            ? 'Couldn’t load the statute list, so this can’t be linked right now. You can still post the update.'
            : 'Link the update to the section it changes, if there is one.'
        }
        error={fe.related_statute_id}
      >
        <Select name="related_statute_id" defaultValue="" disabled={isPending || statutesFailed}>
          <option value="">None</option>
          {statutes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code_citation} — {s.title}
            </option>
          ))}
        </Select>
      </Field>

      {error ? (
        <Alert variant="error" title="Couldn’t post the update">
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button asChild variant="secondary">
          <Link href="/legal/updates">Cancel</Link>
        </Button>
        <Button type="submit" loading={isPending} icon={<Send aria-hidden />}>
          Post update
        </Button>
      </div>
    </form>
  )
}
