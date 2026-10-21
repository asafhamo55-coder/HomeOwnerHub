'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Field, Input, StatusPill, useToast, type StatusTone } from '@homeowner-portal/ui'
import { markDirectorCertified, saveDirectorCertification } from '@/lib/compliance/director-cert-actions'
import type { DirectorCertTone } from '@/lib/compliance/director-certs'

/** BL-139: one pill colour per status, shared by Members, the handover kit and the dashboard card. */
export const DIRECTOR_CERT_PILL: Record<DirectorCertTone, StatusTone> = {
  not_recorded: 'neutral',
  pending: 'info',
  due_soon: 'warning',
  overdue: 'danger',
  certified: 'success',
  renewal_soon: 'warning',
  expired: 'danger',
}

export function DirectorCertPill({ tone, label }: { tone: DirectorCertTone; label: string }) {
  return <StatusPill tone={DIRECTOR_CERT_PILL[tone]} label={label} size="sm" />
}

/** "Mark certified": records today as the certificate date. */
export function MarkDirectorCertifiedButton({ memberId, name }: { memberId: string; name: string }) {
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      aria-label={`Mark ${name} certified today`}
      onClick={() =>
        startTransition(async () => {
          const res = await markDirectorCertified({ memberId })
          if (!res.ok) {
            toast({ tone: 'error', title: 'Not saved', message: res.error })
            return
          }
          toast({ tone: 'success', message: 'Marked certified today. Keep the certificate on file.' })
          router.refresh()
        })
      }
    >
      {pending ? 'Saving…' : 'Mark certified'}
    </Button>
  )
}

export interface DirectorCertFormValues {
  electedOn: string
  certifiedOn: string
  documentUrl: string
}

/** Election date, certificate date and where the certificate is filed, for one board member. */
export function DirectorCertForm({
  memberId,
  name,
  initial,
  onDone,
}: {
  memberId: string
  name: string
  initial: DirectorCertFormValues
  onDone: () => void
}) {
  const toast = useToast()
  const router = useRouter()
  const [values, setValues] = useState(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const set = (key: keyof DirectorCertFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  function save(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await saveDirectorCertification({
        memberId,
        electedOn: values.electedOn,
        certifiedOn: values.certifiedOn || null,
        documentUrl: values.documentUrl || null,
      })
      if (!res.ok) {
        setFieldErrors(res.fieldErrors ?? {})
        toast({ tone: 'error', title: 'Not saved', message: res.error })
        return
      }
      setFieldErrors({})
      toast({ tone: 'success', message: `Saved for ${name}.` })
      onDone()
      router.refresh()
    })
  }

  return (
    <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2" aria-label={`Certification for ${name}`}>
      <Field label="Elected or appointed on" required error={fieldErrors.electedOn}>
        <Input type="date" value={values.electedOn} onChange={set('electedOn')} />
      </Field>
      <Field label="Certificate date" optional error={fieldErrors.certifiedOn} hint="The completion date on the certificate.">
        <Input type="date" value={values.certifiedOn} onChange={set('certifiedOn')} />
      </Field>
      <Field
        label="Where the certificate is filed"
        optional
        error={fieldErrors.documentUrl}
        hint="A link to the certificate in Documents, or another https:// link."
        className="sm:col-span-2"
      >
        <Input value={values.documentUrl} onChange={set('documentUrl')} maxLength={500} placeholder="/documents/…" />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
