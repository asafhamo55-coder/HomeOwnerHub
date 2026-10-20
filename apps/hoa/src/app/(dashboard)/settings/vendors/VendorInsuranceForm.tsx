'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Fieldset,
  Input,
  StatusPill,
  useToast,
} from '@homeowner-portal/ui'
import type { VendorInsuranceSettings } from '@homeowner-portal/workflows/vendor-insurance'
import { formatStamp } from '@/lib/money/format'
import { saveVendorInsuranceSettings } from '@/lib/vendor-insurance-settings'

interface Values {
  coiRemindersEnabled: boolean
  glPerOccurrenceMin: string
  glAggregateMin: string
  workersCompRequired: boolean
  autoLiabilityMin: string
  umbrellaMin: string
}

const dollars = (n: number | null) => (n === null ? '' : n.toLocaleString('en-US'))

export function toValues(s: VendorInsuranceSettings): Values {
  return {
    coiRemindersEnabled: s.coiRemindersEnabled,
    glPerOccurrenceMin: dollars(s.minimums.glPerOccurrenceMin),
    glAggregateMin: dollars(s.minimums.glAggregateMin),
    workersCompRequired: s.minimums.workersCompRequired,
    autoLiabilityMin: dollars(s.minimums.autoLiabilityMin),
    umbrellaMin: dollars(s.minimums.umbrellaMin),
  }
}

export function VendorInsuranceForm({
  initial,
  configured,
  updatedAt,
  initialFieldErrors = {},
}: {
  initial: VendorInsuranceSettings
  configured: boolean
  updatedAt: string | null
  /** For previews and tests; the form sets these itself after a save. */
  initialFieldErrors?: Record<string, string>
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Values>(() => toValues(initial))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>(initialFieldErrors)

  const setText = (key: 'glPerOccurrenceMin' | 'glAggregateMin' | 'autoLiabilityMin' | 'umbrellaMin') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value
    setValues((prev) => ({ ...prev, [key]: v }))
    if (fieldErrors[key]) setFieldErrors(({ [key]: _gone, ...rest }) => rest)
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const res = await saveVendorInsuranceSettings(values)
      if (!res.ok) {
        setFieldErrors(res.fieldErrors ?? {})
        if (!res.fieldErrors) toast({ tone: 'error', message: res.error })
        return
      }
      setFieldErrors({})
      toast({ tone: 'success', message: 'Saved. Compliance checks, new RFP drafts and RFP invitations use these now.' })
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Insurance minimums</CardTitle>
          <CardDescription>
            The least coverage a vendor’s certificate of insurance must show. The compliance check marks a vendor
            Non-compliant below any of these, and every new RFP and RFP invitation lists them. Leave an amount blank for
            no minimum.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {configured && updatedAt ? <p className="text-sm text-muted">Last saved {formatStamp(updatedAt)}</p> : null}
          <Fieldset legend="General liability">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Per occurrence" optional error={fieldErrors.glPerOccurrenceMin}>
                <Input
                  value={values.glPerOccurrenceMin}
                  onChange={setText('glPerOccurrenceMin')}
                  inputMode="numeric"
                  prefix="$"
                  placeholder="1,000,000"
                  autoComplete="off"
                />
              </Field>
              <Field label="Aggregate" optional error={fieldErrors.glAggregateMin}>
                <Input
                  value={values.glAggregateMin}
                  onChange={setText('glAggregateMin')}
                  inputMode="numeric"
                  prefix="$"
                  placeholder="2,000,000"
                  autoComplete="off"
                />
              </Field>
            </div>
          </Fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Auto liability" optional error={fieldErrors.autoLiabilityMin} hint="Combined single limit.">
              <Input
                value={values.autoLiabilityMin}
                onChange={setText('autoLiabilityMin')}
                inputMode="numeric"
                prefix="$"
                placeholder="1,000,000"
                autoComplete="off"
              />
            </Field>
            <Field label="Umbrella" optional error={fieldErrors.umbrellaMin} hint="Umbrella or excess liability.">
              <Input
                value={values.umbrellaMin}
                onChange={setText('umbrellaMin')}
                inputMode="numeric"
                prefix="$"
                placeholder="2,000,000"
                autoComplete="off"
              />
            </Field>
          </div>
          <Checkbox
            label="Require workers’ compensation"
            description="A certificate that shows no workers’ comp coverage is Non-compliant."
            checked={values.workersCompRequired}
            onChange={(e) => {
              const checked = e.currentTarget.checked
              setValues((prev) => ({ ...prev, workersCompRequired: checked }))
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Insurance expiry reminders</CardTitle>
          <CardDescription>
            The board gets a notification 30 days and 7 days before a vendor’s certificate of insurance expires, and on
            the day it does. Nothing is emailed to the vendor automatically: open the vendor and choose Request updated
            certificate to review and send that email yourself. Expiring and expired certificates also show on the
            dashboard either way.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {values.coiRemindersEnabled ? (
              <StatusPill tone="success" label="On — the board is notified" />
            ) : (
              <StatusPill tone="neutral" label="Off — no notifications" />
            )}
          </div>
          <Checkbox
            label="Notify the board before vendor insurance expires"
            description="Turn off if your manager tracks renewals another way. The dashboard and vendor pages still show expiring certificates."
            checked={values.coiRemindersEnabled}
            onChange={(e) => {
              const checked = e.currentTarget.checked
              setValues((prev) => ({ ...prev, coiRemindersEnabled: checked }))
            }}
          />
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          <Button type="submit" loading={pending} icon={<Save aria-hidden />}>
            Save vendor settings
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
