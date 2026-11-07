'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, useToast } from '@homeowner-portal/ui'
import { saveManagedBy } from '@/lib/managed-by-actions'
import { MANAGED_BY_HELP, MAX_MANAGED_BY_LENGTH } from '@/lib/managed-by'

/** The optional "Managed by" line shown at the bottom of emails and letters. */
export function ManagedByForm({
  associationId,
  associationName,
  initial,
}: {
  associationId: string
  associationName: string
  initial: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    start(async () => {
      const res = await saveManagedBy({ associationId, managedBy: value })
      if (res.ok) {
        toast({ tone: 'success', message: 'Saved.' })
        router.refresh()
        return
      }
      setError(res.error)
      setFieldErrors(res.fieldErrors ?? {})
    })
  }

  return (
    <Card id="managed-by">
      <CardHeader>
        <CardTitle>Managed by · {associationName}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <Field label="Managed by (optional)" hint={MANAGED_BY_HELP} error={fieldErrors.managedBy}>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={MAX_MANAGED_BY_LENGTH}
              placeholder="Managed by Homeside Property Management, (404) 555-0100"
              disabled={pending}
              className="min-h-11"
            />
          </Field>
          {error ? (
            <Alert variant="error" title="Couldn’t save">
              {error}
            </Alert>
          ) : null}
          <Button type="submit" size="lg" loading={pending}>
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
