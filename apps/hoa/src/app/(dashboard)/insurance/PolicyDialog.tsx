'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTrigger, Field, Input, Select, Textarea, useToast } from '@homeowner-portal/ui'
import { saveInsurancePolicy } from '@/lib/insurance/actions'
import { POLICY_KINDS, POLICY_KIND_LABELS, type InsurancePolicy, type PolicyKind } from '@/lib/insurance/model'

export interface Option {
  id: string
  name: string
}

interface Values {
  associationId: string
  kind: PolicyKind
  carrier: string
  policyNumber: string
  coverageLimit: string
  deductible: string
  premium: string
  effectiveOn: string
  expiresOn: string
  documentId: string
  notes: string
}

const dollars = (cents: number | null) => (cents === null ? '' : (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }))

function initialValues(p: InsurancePolicy | null, associations: Option[]): Values {
  return {
    associationId: p?.associationId ?? (associations.length === 1 ? associations[0]!.id : ''),
    kind: p?.kind ?? 'property',
    carrier: p?.carrier ?? '',
    policyNumber: p?.policyNumber ?? '',
    coverageLimit: dollars(p?.coverageLimitCents ?? null),
    deductible: dollars(p?.deductibleCents ?? null),
    premium: dollars(p?.premiumCents ?? null),
    effectiveOn: p?.effectiveOn ?? '',
    expiresOn: p?.expiresOn ?? '',
    documentId: p?.documentId ?? '',
    notes: p?.notes ?? '',
  }
}

/** Add a policy, or edit one. The server re-validates everything. */
export function PolicyDialog({
  policy,
  associations,
  documents,
}: {
  policy: InsurancePolicy | null
  associations: Option[]
  documents: Option[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Values>(() => initialValues(policy, associations))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const formId = `policy-${policy?.id ?? 'new'}`

  const set =
    <K extends keyof Values>(key: K) =>
    (v: Values[K]) => {
      setValues((prev) => ({ ...prev, [key]: v }))
      if (errors[key]) setErrors(({ [key]: _gone, ...rest }) => rest)
    }
  const text = (key: Exclude<keyof Values, 'kind'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    set(key)(e.currentTarget.value)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await saveInsurancePolicy({
        id: policy?.id ?? null,
        policy: {
          ...values,
          associationId: values.associationId || null,
          documentId: values.documentId || null,
          effectiveOn: values.effectiveOn || null,
        },
      })
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        if (!res.fieldErrors) toast({ tone: 'error', message: res.error })
        return
      }
      setErrors({})
      setOpen(false)
      toast({ tone: 'success', message: policy ? 'Policy updated.' : 'Policy added.' })
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        if (next) setValues(initialValues(policy, associations))
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        {policy ? (
          <Button variant="ghost" size="sm" icon={<Pencil aria-hidden />}>
            Edit
          </Button>
        ) : (
          <Button icon={<Plus aria-hidden />}>Add a policy</Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={policy ? 'Edit policy' : 'Add a policy'}
        description="From the policy’s declarations page. Amounts in dollars; leave any you don’t have blank."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              Save policy
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind of policy" required error={errors.kind}>
            <Select value={values.kind} onValueChange={(v) => set('kind')(v as PolicyKind)} disabled={pending}>
              {POLICY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {POLICY_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          {associations.length > 1 ? (
            <Field label="Association" optional error={errors.associationId}>
              <Select value={values.associationId} onValueChange={set('associationId')} disabled={pending}>
                <option value="">All associations</option>
                {associations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Insurance company" required error={errors.carrier}>
            <Input value={values.carrier} onChange={text('carrier')} disabled={pending} autoComplete="off" />
          </Field>
          <Field label="Policy number" optional error={errors.policyNumber}>
            <Input value={values.policyNumber} onChange={text('policyNumber')} disabled={pending} autoComplete="off" />
          </Field>
          <Field label="Coverage limit" optional error={errors.coverageLimit}>
            <Input value={values.coverageLimit} onChange={text('coverageLimit')} inputMode="decimal" prefix="$" disabled={pending} autoComplete="off" />
          </Field>
          <Field label="Deductible" optional error={errors.deductible}>
            <Input value={values.deductible} onChange={text('deductible')} inputMode="decimal" prefix="$" disabled={pending} autoComplete="off" />
          </Field>
          <Field label="Yearly premium" optional error={errors.premium}>
            <Input value={values.premium} onChange={text('premium')} inputMode="decimal" prefix="$" disabled={pending} autoComplete="off" />
          </Field>
          <Field label="Starts" optional error={errors.effectiveOn}>
            <Input type="date" value={values.effectiveOn} onChange={text('effectiveOn')} disabled={pending} />
          </Field>
          <Field label="Ends" required error={errors.expiresOn}>
            <Input type="date" value={values.expiresOn} onChange={text('expiresOn')} disabled={pending} required />
          </Field>
          <Field label="Policy document" optional error={errors.documentId} hint="Upload it under Documents first.">
            <Select value={values.documentId} onValueChange={set('documentId')} disabled={pending}>
              <option value="">None</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes" optional error={errors.notes} hint="Exclusions, the broker’s contact, anything to remember at renewal.">
              <Textarea value={values.notes} onChange={text('notes')} rows={3} disabled={pending} />
            </Field>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
