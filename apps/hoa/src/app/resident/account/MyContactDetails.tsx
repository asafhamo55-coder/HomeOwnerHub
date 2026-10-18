'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Lock, Pencil, Send } from 'lucide-react'
import { Alert, Badge, Button, Field, Input, useToast } from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import { requestContactUpdate } from '@/lib/contact-updates/actions'
import { FIELD_LABEL, checkContactForm, type ContactField, type MyContact } from '@/lib/contact-updates/model'
import { Panel, SectionLabel } from '@/components/resident/screen'

// PR-10: "My contact details" on /resident/account. Shows what the HOA has
// on file for each home and lets the resident ask the board to change
// their phone, the email notices go to, and their mailing address. A
// change is a request (the board approves it in /approvals); nothing
// claims to be saved before then.

export interface MyContactDetailsProps {
  /** null = the details couldn't load. */
  homes: MyContact[] | null
  signInEmail: string | null
  /** Read-only while an admin views as this resident. */
  readOnly?: boolean
  /** Start with this home's form open (previews). */
  initialEditing?: string | null
  initialErrors?: Partial<Record<ContactField, string>>
}

export function MyContactDetails({ homes, signInEmail, readOnly = false, initialEditing = null, initialErrors }: MyContactDetailsProps) {
  const [editing, setEditing] = useState<string | null>(initialEditing)

  return (
    <section className="space-y-2.5" aria-labelledby="my-contact-heading">
      <div id="my-contact-heading">
        <SectionLabel>My contact details</SectionLabel>
      </div>
      {homes === null ? (
        <Alert variant="error" title="Couldn’t load your contact details">
          Your details are safe — they just didn’t load. Refresh the page to try again.
        </Alert>
      ) : homes.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted">There’s no home linked to your account yet, so there are no contact details to show.</p>
        </Panel>
      ) : (
        homes.map((h) =>
          editing === h.unitId ? (
            <ContactForm key={h.unitId} home={h} initialErrors={initialErrors} onDone={() => setEditing(null)} />
          ) : (
            <ContactCard key={h.unitId} home={h} showHome={homes.length > 1} signInEmail={signInEmail} readOnly={readOnly} onEdit={() => setEditing(h.unitId)} />
          ),
        )
      )}
    </section>
  )
}

function Value({ label, value, empty }: { label: string; value: string | null; empty: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className={value ? 'min-w-0 break-words text-sm text-foreground sm:text-right' : 'text-sm text-muted sm:text-right'}>{value ?? empty}</dd>
    </div>
  )
}

function ContactCard({
  home,
  showHome,
  signInEmail,
  readOnly,
  onEdit,
}: {
  home: MyContact
  showHome: boolean
  signInEmail: string | null
  readOnly: boolean
  onEdit: () => void
}) {
  const pending = home.pending
  const canEdit = home.editable.length > 0 && !pending && !readOnly
  return (
    <Panel className="space-y-3">
      {showHome ? <p className="text-sm font-semibold text-foreground">{home.label}</p> : null}
      <dl className="divide-y divide-border">
        <Value label={FIELD_LABEL.phone} value={home.current.phone} empty="None on file" />
        <Value label={FIELD_LABEL.email} value={home.current.email} empty="None on file" />
        <Value
          label={FIELD_LABEL.mailing}
          value={home.mailingUnknown ? null : home.current.mailing}
          empty={home.mailingUnknown ? 'Not shown here — ask the board' : 'Same as the home'}
        />
      </dl>
      {signInEmail ? <p className="text-xs text-muted">You sign in with {signInEmail}. That doesn’t change here.</p> : null}

      {pending ? (
        <div className="space-y-1.5 rounded-lg bg-warning-subtle px-3.5 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Clock className="size-4 shrink-0 text-warning" aria-hidden />
            Waiting for the board since {formatDay(pending.createdAt)}
          </p>
          <ul className="space-y-0.5 text-foreground-secondary">
            {(Object.keys(pending.request.changes) as ContactField[]).map((f) => (
              <li key={f} className="break-words">
                {FIELD_LABEL[f]}: {pending.request.changes[f] ?? (f === 'mailing' ? 'same as the home' : 'remove')}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            Nothing changes on file until the board approves it.{' '}
            <Link href={`/resident/tickets/${pending.ticketId}`} className="font-medium text-primary">
              Open the request
            </Link>
          </p>
        </div>
      ) : null}

      {home.editable.length === 0 ? (
        <p className="text-xs text-muted">Your contact details for this home are kept by the board. Send them a request to change them.</p>
      ) : home.emailLocked && !pending ? (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Your portal sign-in is matched to the email on file, so it can’t be changed here. Ask the board to change it.
        </p>
      ) : null}

      {canEdit ? (
        <Button variant="secondary" size="sm" icon={<Pencil aria-hidden />} onClick={onEdit} className="w-full sm:w-auto">
          Change my details
        </Button>
      ) : null}
    </Panel>
  )
}

function ContactForm({
  home,
  initialErrors,
  onDone,
}: {
  home: MyContact
  initialErrors?: Partial<Record<ContactField, string>>
  onDone: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ContactField, string>>>(initialErrors ?? {})
  const [phone, setPhone] = useState(home.current.phone ?? '')
  const [email, setEmail] = useState(home.current.email ?? '')
  const [mailing, setMailing] = useState(home.mailingUnknown ? '' : (home.current.mailing ?? ''))
  const can = (f: ContactField) => home.editable.includes(f)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    // Same checks as the server, under each field, before anything is sent.
    const checked = checkContactForm({ phone, email, mailing }, { requireEmail: can('email') && home.current.email !== null })
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors)
      return
    }
    setFieldErrors({})
    startTransition(async () => {
      const r = await requestContactUpdate({ unitId: home.unitId, phone, email, mailing })
      if (!r.ok) {
        if (r.fieldErrors && Object.keys(r.fieldErrors).length > 0) setFieldErrors(r.fieldErrors)
        else setError(r.error)
        return
      }
      toast({ tone: 'success', message: 'Sent to the board. Your details change once they approve it.' })
      onDone()
      router.refresh()
    })
  }

  return (
    <Panel>
      <form onSubmit={submit} noValidate aria-busy={pending} className="space-y-4">
        <p className="text-sm text-foreground-secondary">
          The board approves changes before they’re used for notices and mail{home.label ? ` for ${home.label}` : ''}.
        </p>
        <Field label={FIELD_LABEL.phone} optional error={fieldErrors.phone} hint="A US number, like (555) 123-4567.">
          <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} disabled={pending} />
        </Field>
        <Field
          label={FIELD_LABEL.email}
          error={fieldErrors.email}
          hint={can('email') ? 'Where the board emails notices. Your sign-in email stays the same.' : 'Matched to your portal sign-in, so the board changes this one.'}
        >
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            disabled={pending || !can('email')}
            maxLength={200}
          />
        </Field>
        {can('mailing') ? (
          <Field label={FIELD_LABEL.mailing} optional error={fieldErrors.mailing} hint="Only if your mail should go somewhere other than the home. Leave empty for the home’s address.">
            <Input autoComplete="street-address" value={mailing} onChange={(e) => setMailing(e.currentTarget.value)} disabled={pending} maxLength={300} placeholder="PO Box 12, Springfield, FL 32000" />
          </Field>
        ) : null}

        {error ? (
          <Alert variant="error" title="Couldn’t send your change">
            {error}
          </Alert>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} icon={<Send aria-hidden />}>
            Send to the board
          </Button>
        </div>
        <p className="text-xs text-muted">
          <Badge variant="neutral" size="sm">
            Needs approval
          </Badge>{' '}
          You’ll see it here while it waits.
        </p>
      </form>
    </Panel>
  )
}
