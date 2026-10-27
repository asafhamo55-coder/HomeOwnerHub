'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, useToast } from '@homeowner-portal/ui'
import { saveBoardContacts } from '@/lib/association-contacts-actions'
import { BOARD_CONTACTS_NOTICE, MAX_BOARD_CONTACTS, type BoardContact } from '@/lib/association-contacts'

const EMPTY: BoardContact = { label: '', name: '', phone: '', email: '', emergencyLine: '' }

/**
 * Board and emergency contacts for one association. The board picks what
 * residents see on their home page; the notice below says so plainly.
 */
export function BoardContactsForm({
  associationId,
  associationName,
  initial,
}: {
  associationId: string
  associationName: string
  initial: BoardContact[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [rows, setRows] = useState<BoardContact[]>(initial)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function update(i: number, patch: Partial<BoardContact>) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    start(async () => {
      const res = await saveBoardContacts({ associationId, contacts: rows })
      if (res.ok) {
        toast({ tone: 'success', message: 'Contacts saved.' })
        router.refresh()
        return
      }
      setError(res.error)
      setFieldErrors(res.fieldErrors ?? {})
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Board and emergency contacts · {associationName}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <Alert variant="info" title="Residents will see these">
            {BOARD_CONTACTS_NOTICE}
          </Alert>

          {rows.length === 0 ? (
            <p className="text-sm text-muted">No contacts yet. Residents see nothing until you add one.</p>
          ) : null}

          {rows.map((row, i) => {
            const err = (k: string) => fieldErrors[`contacts.${i}.${k}`]
            return (
              <fieldset key={i} className="space-y-3 rounded-lg border border-border p-3">
                <legend className="px-1 text-sm font-semibold text-foreground">Contact {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Role or label" error={err('label')} hint="For example President, Property manager or Gate.">
                    <Input
                      value={row.label}
                      onChange={(e) => update(i, { label: e.target.value })}
                      maxLength={60}
                      disabled={pending}
                    />
                  </Field>
                  <Field label="Name" error={err('name')}>
                    <Input value={row.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={100} disabled={pending} />
                  </Field>
                  <Field label="Phone" error={err('phone')}>
                    <Input
                      type="tel"
                      inputMode="tel"
                      value={row.phone}
                      onChange={(e) => update(i, { phone: e.target.value })}
                      maxLength={40}
                      disabled={pending}
                    />
                  </Field>
                  <Field label="Email" error={err('email')}>
                    <Input
                      type="email"
                      value={row.email}
                      onChange={(e) => update(i, { email: e.target.value })}
                      maxLength={200}
                      disabled={pending}
                    />
                  </Field>
                </div>
                <Field
                  label="Emergency line"
                  error={err('emergencyLine')}
                  hint="Optional. A gate, after-hours or emergency number, like “After hours: 555 0100”."
                >
                  <Input
                    value={row.emergencyLine}
                    onChange={(e) => update(i, { emergencyLine: e.target.value })}
                    maxLength={120}
                    disabled={pending}
                  />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                >
                  Remove contact {i + 1}
                </Button>
              </fieldset>
            )
          })}

          {fieldErrors.contacts ? (
            <p role="alert" className="text-sm text-danger">
              {fieldErrors.contacts}
            </p>
          ) : null}
          {error ? (
            <Alert variant="error" title="Couldn’t save">
              {error}
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending || rows.length >= MAX_BOARD_CONTACTS}
              onClick={() => setRows((r) => [...r, { ...EMPTY }])}
            >
              Add a contact
            </Button>
            <Button type="submit" loading={pending}>
              Save contacts
            </Button>
          </div>
          {rows.length >= MAX_BOARD_CONTACTS ? (
            <p className="text-sm text-muted">You can list up to {MAX_BOARD_CONTACTS} contacts.</p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}
