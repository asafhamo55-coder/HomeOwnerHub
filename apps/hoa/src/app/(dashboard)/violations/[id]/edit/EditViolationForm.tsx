'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, CardContent, useToast } from '@homeowner-portal/ui'
import { updateViolation } from '@/lib/violations'

interface Props {
  violationId: string
  defaultValues: {
    description: string
    violationType: string
    ccrSection: string
    severity: 'low' | 'medium' | 'high'
    curePeriodDays: number
    fineAmount: number
  }
}

export function EditViolationForm({ violationId, defaultValues }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateViolation({
        violationId,
        description: fd.get('description') as string,
        violationType: fd.get('violationType') as string,
        ccrSection: (fd.get('ccrSection') as string) || null,
        severity: (fd.get('severity') as 'low' | 'medium' | 'high') || null,
        curePeriodDays: Number(fd.get('curePeriodDays')),
        fineAmount: Number(fd.get('fineAmount')),
      })
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Violation updated.' })
      router.push(`/violations/${violationId}`)
    })
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Description" name="description" defaultValue={defaultValues.description} required multiline />
          <Field label="Violation type" name="violationType" defaultValue={defaultValues.violationType} required />
          <Field label="CC&R section" name="ccrSection" defaultValue={defaultValues.ccrSection} />
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Severity</label>
              <select
                name="severity"
                defaultValue={defaultValues.severity}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <Field label="Cure period (days)" name="curePeriodDays" type="number" defaultValue={String(defaultValues.curePeriodDays)} />
            <Field label="Fine amount ($)" name="fineAmount" type="number" defaultValue={String(defaultValues.fineAmount)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  name,
  defaultValue,
  required,
  type = 'text',
  multiline,
}: {
  label: string
  name: string
  defaultValue?: string
  required?: boolean
  type?: string
  multiline?: boolean
}) {
  const cls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground'
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">{label}</label>
      {multiline ? (
        <textarea name={name} defaultValue={defaultValue} required={required} rows={3} className={cls} />
      ) : (
        <input name={name} type={type} defaultValue={defaultValue} required={required} className={cls} />
      )}
    </div>
  )
}
