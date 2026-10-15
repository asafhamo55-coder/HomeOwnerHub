'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Input, useToast } from '@homeowner-portal/ui'
import { invitePlatformAdminFromForm, type FieldErrors } from '../_components/form-actions'

export function InvitePlatformAdminForm() {
  const router = useRouter()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await invitePlatformAdminFromForm(formData)
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {})
        if (result.error) setError(result.error)
        return
      }
      toast({
        tone: 'success',
        message: result.data.alreadyExisted
          ? `${result.data.email} is now a platform admin.`
          : `Invitation sent to ${result.data.email}.`,
      })
      formRef.current?.reset()
      router.refresh()
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" required error={fieldErrors.email}>
          <Input name="email" type="email" required placeholder="name@example.com" autoComplete="off" />
        </Field>
        <Field label="Note" optional hint="Saved to the audit log." error={fieldErrors.note}>
          <Input name="note" maxLength={200} placeholder="e.g. Support engineer" />
        </Field>
      </div>

      {error ? (
        <Alert variant="error" title="Couldn’t grant access">
          {error}
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" loading={isPending}>
          Grant access
        </Button>
      </div>
    </form>
  )
}
