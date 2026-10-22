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
  ChoiceGroup,
  Field,
  Fieldset,
  Input,
  Radio,
  StatusPill,
  Switch,
  useToast,
} from '@homeowner-portal/ui'
import { formatStamp } from '@/lib/money/format'
import { saveLateFeePolicy } from '@/lib/late-fees/actions'
import { NO_LOADED_RULE_NOTE, type LateFeeLaw } from '@/lib/late-fees/law'
import type { LateFeePolicy } from '@/lib/late-fees/policy'

interface Values {
  enabled: boolean
  mode: 'percent' | 'flat'
  percent: string
  flat: string
  graceDays: string
  excludeFines: boolean
  declarationAttested: boolean
  declarationRef: string
}

export function toValues(p: LateFeePolicy): Values {
  return {
    enabled: p.enabled,
    mode: p.mode,
    percent: p.percentBps ? String(p.percentBps / 100) : '',
    flat: p.flatCents ? (p.flatCents / 100).toFixed(2) : '',
    graceDays: String(p.graceDays),
    excludeFines: p.excludeFines,
    declarationAttested: p.declarationAttested,
    declarationRef: p.declarationRef ?? '',
  }
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

export function LateFeePolicyForm({
  initial,
  saved,
  updatedAt,
  law,
  initialFieldErrors = {},
}: {
  initial: LateFeePolicy
  saved: boolean
  updatedAt: string | null
  law: LateFeeLaw | null
  /** For previews and tests; the form sets these itself after a save. */
  initialFieldErrors?: Record<string, string>
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Values>(() => toValues(initial))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>(initialFieldErrors)

  const set = <K extends keyof Values>(key: K, v: Values[K]) => {
    setValues((prev) => ({ ...prev, [key]: v }))
    if (fieldErrors[key]) setFieldErrors(({ [key]: _gone, ...rest }) => rest)
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const res = await saveLateFeePolicy(values)
      if (!res.ok) {
        setFieldErrors(res.fieldErrors ?? {})
        if (!res.fieldErrors) toast({ tone: 'error', message: res.error })
        return
      }
      setFieldErrors({})
      toast({
        tone: 'success',
        message: res.policy.enabled
          ? 'Saved. Late fees follow this policy from tonight.'
          : 'Saved. No late fees are charged while this is off.',
      })
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Late-fee policy</CardTitle>
          <CardDescription>
            Each night HomeownerHub can add one late fee to a charge that is still unpaid after its due date and your
            grace period. It only does this under a policy the board saves here. Until then, no late fee is charged.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {saved && values.enabled ? (
              <StatusPill tone="success" label="On — late fees follow this policy" />
            ) : (
              <StatusPill tone="neutral" label="Off — no late fees are charged" />
            )}
            {saved && updatedAt ? <span>Last saved {formatStamp(updatedAt)}</span> : null}
          </div>

          <Switch
            label="Charge late fees"
            description="Off means no late fee is added to any charge."
            checked={values.enabled}
            onChange={(e) => set('enabled', e.currentTarget.checked)}
          />

          <Fieldset legend="Late fee amount" error={fieldErrors.mode}>
            <ChoiceGroup orientation="horizontal">
              <Radio
                name="late-fee-mode"
                label="Percent of the late amount"
                value="percent"
                checked={values.mode === 'percent'}
                onChange={() => set('mode', 'percent')}
              />
              <Radio
                name="late-fee-mode"
                label="Flat amount"
                value="flat"
                checked={values.mode === 'flat'}
                onChange={() => set('mode', 'flat')}
              />
            </ChoiceGroup>
          </Fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            {values.mode === 'percent' ? (
              <Field label="Percent" error={fieldErrors.percent} hint="Of the amount still unpaid on the charge.">
                <Input
                  value={values.percent}
                  onChange={(e) => set('percent', e.currentTarget.value)}
                  inputMode="decimal"
                  placeholder="5"
                  autoComplete="off"
                />
              </Field>
            ) : (
              <Field label="Flat amount" error={fieldErrors.flat}>
                <Input
                  value={values.flat}
                  onChange={(e) => set('flat', e.currentTarget.value)}
                  inputMode="decimal"
                  prefix="$"
                  placeholder="25.00"
                  autoComplete="off"
                />
              </Field>
            )}
            <Field
              label="Grace period (days)"
              error={fieldErrors.graceDays}
              hint="Days after the due date before a charge is late."
            >
              <Input
                value={values.graceDays}
                onChange={(e) => set('graceDays', e.currentTarget.value)}
                inputMode="numeric"
                placeholder="15"
                autoComplete="off"
              />
            </Field>
          </div>

          <Checkbox
            label="Exclude fines"
            description="Recommended. Late fees apply to dues and special assessments only. Late fees, collection costs and lien fees never get a late fee."
            checked={values.excludeFines}
            onChange={(e) => set('excludeFines', e.currentTarget.checked)}
          />
          <p className="text-sm text-muted">One late fee per charge. It is never repeated or added on top of another late fee.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Your declaration and the law</CardTitle>
          <CardDescription>
            {law
              ? `${law.stateName}: ${law.citation}. HomeownerHub refuses a policy above this limit and cuts each fee to it.`
              : NO_LOADED_RULE_NOTE}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {law ? (
            <figure className="space-y-2 rounded-md border border-border bg-surface p-3 text-sm">
              {law.quotes.map((q) => (
                <blockquote key={q} className="italic">
                  “{q}”
                </blockquote>
              ))}
              <figcaption className="text-muted">
                {law.citation}. In practice: at most {money(law.floorCents)} or {law.percent}% of the late amount,
                whichever is greater, on each charge
                {law.minGraceDays > 0 ? `, and not before ${law.minGraceDays} days after the due date` : ''}.
              </figcaption>
            </figure>
          ) : null}
          <Checkbox
            label="Our declaration or bylaws provide for a late charge"
            description={
              law?.requiresInstrument
                ? `${law.stateName} allows a late charge only if your declaration provides for one. Required to turn late fees on.`
                : 'Required to turn late fees on.'
            }
            checked={values.declarationAttested}
            onChange={(e) => set('declarationAttested', e.currentTarget.checked)}
          />
          {fieldErrors.declarationAttested ? (
            <p role="alert" className="text-sm text-danger">
              {fieldErrors.declarationAttested}
            </p>
          ) : null}
          <Field
            label="Where it says so"
            optional={!values.enabled}
            error={fieldErrors.declarationRef}
            hint="For example: Declaration, Article VI, Section 3."
          >
            <Input
              value={values.declarationRef}
              onChange={(e) => set('declarationRef', e.currentTarget.value)}
              maxLength={120}
              autoComplete="off"
            />
          </Field>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          <Button type="submit" loading={pending} icon={<Save aria-hidden />}>
            Save late-fee policy
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
