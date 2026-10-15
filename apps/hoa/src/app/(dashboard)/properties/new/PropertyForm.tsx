'use client'

import { useActionState, useRef } from 'react'
import Link from 'next/link'
import { Alert, Button, Card, CardContent, CardFooter, Field, Input, Textarea } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { createProperty, type PropertyActionState } from '@/lib/properties'

const initial: PropertyActionState = {}

export function PropertyForm() {
  const [state, action, pending] = useActionState(createProperty, initial)
  const f = state.fieldErrors ?? {}
  const notesRef = useRef<HTMLTextAreaElement>(null)

  return (
    <Card>
      <form action={action} noValidate>
        <CardContent className="space-y-5 pt-5">
          <Field label="Address" required error={f.address}>
            <Input
              name="address"
              required
              autoFocus
              autoComplete="street-address"
              placeholder="123 Main Street"
              disabled={pending}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Unit / Lot #" optional error={f.unit_number}>
              <Input name="unit_number" placeholder="A-12" disabled={pending} />
            </Field>
            <Field label="Owner name" optional error={f.owner_name}>
              <Input name="owner_name" autoComplete="off" disabled={pending} />
            </Field>
            <Field label="Owner email" optional error={f.owner_email}>
              <Input name="owner_email" type="email" autoComplete="off" disabled={pending} />
            </Field>
            <Field label="Owner phone" optional error={f.owner_phone}>
              <Input name="owner_phone" type="tel" autoComplete="off" disabled={pending} />
            </Field>
          </div>

          <Field
            label="Notes"
            optional
            hint="Anything the board should remember. Not shown to residents."
            error={f.notes}
            labelAside={
              <AiRewriteButton textareaRef={notesRef} context="Internal property notes for the HOA board" disabled={pending} />
            }
          >
            <Textarea
              ref={notesRef}
              name="notes"
              rows={3}
              placeholder="Side gate needs lock replaced. Owner travels frequently."
              disabled={pending}
            />
          </Field>

          {state.error ? (
            <Alert variant="error" title="Couldn’t save">
              {state.error}
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end">
          <Button asChild variant="ghost">
            <Link href="/properties">Cancel</Link>
          </Button>
          <Button type="submit" loading={pending}>
            Add property
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
