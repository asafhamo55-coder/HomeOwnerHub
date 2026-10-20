'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { ClipboardList, FileSignature, Link2, ShieldAlert, UserCog } from 'lucide-react'
import { Alert, Button, Dialog, DialogContent, Field, Input, Select, Textarea, cn } from '@homeowner-portal/ui'
import { CopyButton } from '@/components/resident/CopyButton'
import {
  createTicketFromThread,
  fileContactUpdateFromThread,
  linkExistingRecord,
  listLinkCandidates,
  type TicketFromThreadField,
} from '@/lib/inbox/convert/actions'
import { TICKET_CATEGORIES, TICKET_CATEGORY_LABEL, type TicketCategory } from '@/lib/inbox/convert/ack'
import type { ContactPrefill, LinkCandidate, TicketPrefill } from '@/lib/inbox/convert/model'
import type { ContactField } from '@/lib/contact-updates/model'
import { INSERT_MESSAGE, dispatchInsertIntoReply, type InsertResult } from '@/lib/inbox/reply-insert'
import { useFocusFirstOnChange } from '@/components/ui/useFocusFirstOnChange'

/**
 * BL-101 A4 — "Create from this email". In the thread header, beside
 * Forward, for the reason ForwardButton documents: it must be reachable in
 * every draft state.
 *
 * Every prefill is computed on the server from the newest inbound message
 * (lib/inbox/convert/model.ts: fixed templates and keyword rules, no AI)
 * and the board checks it before anything is written. Nothing here sends
 * an email or SMS: the acknowledgement line is shown with "Insert into
 * reply" (puts it into the open draft's body, client-side, for the board
 * to review and approve like any edit) and a Copy button.
 */

export interface ConvertMenuProps {
  threadId: string
  /** The thread is filed under a home (tickets, contact updates and links need one). */
  filed: boolean
  /** The sender is verified for that home (contact updates need it). */
  senderVerified: boolean
  /** BL-105: the email failed SPF/DKIM/DMARC, so its From can't be trusted. */
  senderUnauthenticated?: boolean
  ticket: TicketPrefill
  contact: ContactPrefill
  /** The reply line carrying the absolute link to the resident's prefilled ARC form. */
  arcAck: string
  violationHref: string
}

type View = 'menu' | 'ticket' | 'contact' | 'arc' | 'link' | 'done'

interface Done {
  message: string
  warning?: string
  ack?: string
  href?: { label: string; to: string }
}

const LINK_TYPE_LABEL: Record<LinkCandidate['type'], string> = {
  ticket: 'Ticket',
  arc_request: 'ARC',
  violation: 'Violation',
}

export function ConvertMenu(props: ConvertMenuProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="max-w-56 text-right">
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Create from email
      </Button>
      {open ? <ConvertDialog {...props} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

function ConvertDialog({ onClose, ...p }: ConvertMenuProps & { onClose: () => void }) {
  const [view, setView] = useState<View>('menu')
  const [done, setDone] = useState<Done | null>(null)
  const [pending, startTransition] = useTransition()
  const bodyRef = useFocusFirstOnChange(view)

  const finish = (d: Done) => {
    setDone(d)
    setView('done')
  }

  const titles: Record<View, string> = {
    menu: 'Create from this email',
    ticket: 'Create a ticket',
    contact: 'Update contact details',
    arc: 'Send an ARC application link',
    link: 'Link an existing record',
    done: 'Done',
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose()
      }}
    >
      <DialogContent
        size="md"
        title={titles[view]}
        description={view === 'menu' ? 'Turn this email into a record. You check everything before it is saved.' : undefined}
      >
        <div ref={bodyRef}>
        {view === 'menu' ? (
          <MenuView {...p} onPick={setView} />
        ) : view === 'ticket' ? (
          <TicketView {...p} pending={pending} startTransition={startTransition} onBack={() => setView('menu')} onDone={finish} />
        ) : view === 'contact' ? (
          <ContactView {...p} pending={pending} startTransition={startTransition} onBack={() => setView('menu')} onDone={finish} />
        ) : view === 'arc' ? (
          <ArcView arcAck={p.arcAck} onBack={() => setView('menu')} />
        ) : view === 'link' ? (
          <LinkView threadId={p.threadId} pending={pending} startTransition={startTransition} onBack={() => setView('menu')} onDone={finish} />
        ) : done ? (
          <DoneView done={done} onClose={onClose} />
        ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Option({
  icon,
  title,
  hint,
  blocked,
  onClick,
  href,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  blocked?: string | null
  onClick?: () => void
  href?: string
}) {
  const body = (
    <>
      <span className="mt-0.5 shrink-0 text-muted [&>svg]:size-4">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted">{blocked ?? hint}</span>
      </span>
    </>
  )
  const cls = cn(
    'flex w-full gap-2.5 rounded-lg border border-border p-3 text-left no-underline transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    blocked ? 'cursor-not-allowed opacity-60' : 'hover:bg-subtle',
  )
  if (href && !blocked) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" className={cls} disabled={Boolean(blocked)} onClick={onClick}>
      {body}
    </button>
  )
}

function MenuView({
  filed,
  senderVerified,
  senderUnauthenticated,
  violationHref,
  onPick,
}: ConvertMenuProps & { onPick: (v: View) => void }) {
  const needsHome = filed ? null : 'File this email under a home first.'
  return (
    <div className="space-y-2">
      <Option
        icon={<ClipboardList aria-hidden />}
        title="Create a ticket"
        hint="A board ticket on this home, prefilled from the email."
        blocked={needsHome}
        onClick={() => onPick('ticket')}
      />
      <Option
        icon={<ShieldAlert aria-hidden />}
        title="Report a violation"
        hint="Opens the violation wizard with the home and the email's text filled in."
        href={violationHref}
      />
      <Option
        icon={<FileSignature aria-hidden />}
        title="Send an ARC application link"
        hint="A link to the resident's own ARC form, prefilled. They submit it."
        onClick={() => onPick('arc')}
      />
      <Option
        icon={<UserCog aria-hidden />}
        title="Update contact details"
        hint="Files the change for approval in Approvals → Contact updates."
        blocked={
          needsHome ??
          (senderVerified
            ? null
            : senderUnauthenticated
              ? 'This email failed its sender authentication check.'
              : 'The sender isn’t on file for this home.')
        }
        onClick={() => onPick('contact')}
      />
      <Option
        icon={<Link2 aria-hidden />}
        title="Link an existing record"
        hint="A ticket, ARC application or violation already on this home."
        blocked={needsHome}
        onClick={() => onPick('link')}
      />
    </div>
  )
}

type Transition = (cb: () => Promise<void>) => void

function Footer({ onBack, pending, submit, label }: { onBack: () => void; pending: boolean; submit?: () => void; label?: string }) {
  return (
    <div className="flex justify-end gap-2 border-t border-border pt-4">
      <Button variant="ghost" onClick={onBack} disabled={pending}>
        Back
      </Button>
      {submit ? (
        <Button loading={pending} onClick={submit}>
          {label}
        </Button>
      ) : null}
    </div>
  )
}

function TicketView({
  threadId,
  ticket,
  pending,
  startTransition,
  onBack,
  onDone,
}: ConvertMenuProps & { pending: boolean; startTransition: Transition; onBack: () => void; onDone: (d: Done) => void }) {
  const [category, setCategory] = useState<TicketCategory>(ticket.category)
  const [subject, setSubject] = useState(ticket.subject)
  const [description, setDescription] = useState(ticket.description)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<TicketFromThreadField, string>>>({})

  function submit() {
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const r = await createTicketFromThread({ threadId, category, subject, description })
      if (!r.ok) {
        setError(r.error)
        setFieldErrors(r.fieldErrors ?? {})
        return
      }
      onDone({ message: r.message, warning: r.warning, ack: r.ack, href: { label: 'Open ticket', to: `/tickets/${r.ticketId}` } })
    })
  }

  return (
    <div className="space-y-4">
      <Field label="Category" required error={fieldErrors.category}>
        <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
          {TICKET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {TICKET_CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Subject" required error={fieldErrors.subject}>
        <Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Description" required error={fieldErrors.description} hint="The resident's own words from the email. Edit as needed.">
        <Textarea rows={6} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <p className="text-xs text-muted">
        The ticket is filed by you, so the resident won&apos;t see it in their portal. Nothing is sent to them.
      </p>
      {error && Object.keys(fieldErrors).length === 0 ? <Alert variant="error">{error}</Alert> : null}
      <Footer onBack={onBack} pending={pending} submit={submit} label="Create ticket" />
    </div>
  )
}

function ContactView({
  threadId,
  contact,
  pending,
  startTransition,
  onBack,
  onDone,
}: ConvertMenuProps & { pending: boolean; startTransition: Transition; onBack: () => void; onDone: (d: Done) => void }) {
  const [values, setValues] = useState<Record<ContactField, string>>({ ...contact })
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ContactField, string>>>({})
  const set = (f: ContactField) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [f]: e.target.value }))

  function submit() {
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const r = await fileContactUpdateFromThread({ threadId, ...values })
      if (!r.ok) {
        setError(r.error)
        setFieldErrors(r.fieldErrors ?? {})
        return
      }
      onDone({ message: r.message, warning: r.warning, ack: r.ack, href: { label: 'Open Approvals', to: '/approvals' } })
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-secondary">
        Only filled-in fields are asked for. Nothing on file changes until a board member approves it.
      </p>
      <Field label="Phone" optional error={fieldErrors.phone}>
        <Input type="tel" value={values.phone} onChange={set('phone')} />
      </Field>
      <Field label="New email" optional error={fieldErrors.email}>
        <Input type="email" value={values.email} onChange={set('email')} />
      </Field>
      <Field label="Mailing address" optional error={fieldErrors.mailing}>
        <Input value={values.mailing} onChange={set('mailing')} />
      </Field>
      {error && Object.keys(fieldErrors).length === 0 ? <Alert variant="error">{error}</Alert> : null}
      <Footer onBack={onBack} pending={pending} submit={submit} label="File for approval" />
    </div>
  )
}

function ArcView({ arcAck, onBack }: { arcAck: string; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-secondary">
        The board can&apos;t file an ARC application for a resident yet. Add this line to your reply: the link opens
        their own ARC form with the email&apos;s text filled in (contact details removed), and they submit it.
      </p>
      <AckBlock ack={arcAck} />
      <Footer onBack={onBack} pending={false} />
    </div>
  )
}

function LinkView({
  threadId,
  pending,
  startTransition,
  onBack,
  onDone,
}: {
  threadId: string
  pending: boolean
  startTransition: Transition
  onBack: () => void
  onDone: (d: Done) => void
}) {
  const [state, setState] = useState<{ loading: true } | { loading: false; error: string | null; candidates: LinkCandidate[] }>({
    loading: true,
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    listLinkCandidates(threadId)
      .then((r) => {
        if (!live) return
        setState(r.ok ? { loading: false, error: null, candidates: r.candidates } : { loading: false, error: r.error, candidates: [] })
      })
      .catch(() => live && setState({ loading: false, error: 'Couldn’t load this home’s records. Try again.', candidates: [] }))
    return () => {
      live = false
    }
  }, [threadId])

  function link(c: LinkCandidate) {
    setError(null)
    startTransition(async () => {
      const r = await linkExistingRecord({ threadId, type: c.type, id: c.id })
      if (!r.ok) {
        setError(r.error)
        return
      }
      onDone({ message: r.message })
    })
  }

  return (
    <div className="space-y-4">
      {state.loading ? (
        <p className="text-sm text-muted">Loading this home&apos;s records…</p>
      ) : state.error ? (
        <Alert variant="error">{state.error}</Alert>
      ) : state.candidates.length === 0 ? (
        <p className="text-sm text-muted">Nothing on this home that isn&apos;t linked already.</p>
      ) : (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto">
          {state.candidates.map((c) => (
            <li key={`${c.type}:${c.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span className="min-w-0 text-xs">
                <span className="text-muted">{LINK_TYPE_LABEL[c.type]}: </span>
                <span className="font-medium text-foreground">{c.label}</span>
                <span className="text-muted">{` · ${c.status.replace(/_/g, ' ')}`}</span>
              </span>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => link(c)}>
                Link
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Footer onBack={onBack} pending={pending} />
    </div>
  )
}

function AckBlock({ ack }: { ack: string }) {
  const [result, setResult] = useState<InsertResult | null>(null)
  return (
    <div className="space-y-2 rounded-lg border border-border bg-subtle p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Line for your reply</p>
      <p className="whitespace-pre-wrap break-words text-sm text-foreground">{ack}</p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={result === 'inserted'}
          onClick={() => setResult(dispatchInsertIntoReply(ack))}
        >
          {result === 'inserted' ? 'Added to reply' : 'Insert into reply'}
        </Button>
        <CopyButton value={ack} label="Copy the line for your reply" />
      </div>
      <p className={cn('text-xs', result === 'inserted' || result === 'already' ? 'text-success' : 'text-warning')} aria-live="polite">
        {result ? INSERT_MESSAGE[result] : null}
      </p>
    </div>
  )
}

function DoneView({ done, onClose }: { done: Done; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <Alert variant="success">{done.message}</Alert>
      {done.warning ? <Alert variant="warning">{done.warning}</Alert> : null}
      {done.ack ? <AckBlock ack={done.ack} /> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        {done.href ? (
          <Button variant="secondary" asChild>
            <Link href={done.href.to}>{done.href.label}</Link>
          </Button>
        ) : null}
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}
