'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardFooter,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@homeowner-portal/ui'
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
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setErrors({})
    setFormError(null)
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
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) setErrors(result.fieldErrors)
        else setFormError(result.error)
        return
      }
      toast({ tone: 'success', message: 'Violation updated.' })
      router.push(`/violations/${violationId}`)
    })
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-4 pt-5">
          {formError ? <Alert variant="error">{formError}</Alert> : null}
          <Field label="Description" required error={errors.description} hint="What was observed, in plain words. The owner may see this.">
            <Textarea name="description" defaultValue={defaultValues.description} rows={3} maxLength={2000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Violation type" required error={errors.violationType} hint="e.g. Landscaping, Parking, Architectural">
              <Input name="violationType" defaultValue={defaultValues.violationType} />
            </Field>
            <Field label="CC&R section" optional error={errors.ccrSection} hint="e.g. Art. VII §3">
              <Input name="ccrSection" defaultValue={defaultValues.ccrSection} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Severity" error={errors.severity}>
              <Select name="severity" defaultValue={defaultValues.severity}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </Field>
            <Field label="Cure period" error={errors.curePeriodDays}>
              <Input
                name="curePeriodDays"
                type="number"
                inputMode="numeric"
                min={1}
                max={180}
                defaultValue={String(defaultValues.curePeriodDays)}
                suffix="days"
              />
            </Field>
            <Field label="Daily fine if uncured" error={errors.fineAmount}>
              <Input
                name="fineAmount"
                type="number"
                inputMode="decimal"
                min={0}
                max={1000}
                defaultValue={String(defaultValues.fineAmount)}
                prefix="$"
                suffix="/day"
              />
            </Field>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
