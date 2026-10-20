'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, BookOpen, Send } from 'lucide-react'
import { Alert, Button, Field, Input, Textarea } from '@homeowner-portal/ui'
import { hasUnfilledBlanks, UNDO_WINDOW_SECONDS } from '@/lib/inbox/draft/blanks'
import { INBOX_APPROVE_CLOSE_EVENT, INBOX_EDIT_EVENT } from '@/lib/inbox/keys'
import { INBOX_INSERT_EVENT, insertIntoBody, type InsertDetail } from '@/lib/inbox/reply-insert'
import type { DraftAttachment, ThreadDraft } from '@/lib/inbox/queries'
import { AttachmentPicker } from './AttachmentPicker'
import { RecipientFields } from './RecipientFields'
import { SavedReplyPicker } from './SavedReplyPicker'
import { AMBER_BOX, BLANK_KIND_LABELS } from './draft-ui'

export interface ApproveInput {
  subject: string
  body: string
  to: string[]
  cc: string[]
}

export interface ApproveOptions {
  /** BL-101 A3: close the thread once the reply is queued. */
  closeThread: boolean
}

interface Props {
  draft: ThreadDraft
  pending: boolean
  actionError: string | null
  onApprove: (input: ApproveInput, options: ApproveOptions) => void
  /**
   * A reply on a thread: offer "Approve and send" (closes the thread, the
   * default) beside "Approve, keep open". Off for compose and forwards,
   * which send exactly as before.
   */
  canClose?: boolean
  attachments: DraftAttachment[]
  threadFiles: Array<{ id: string; fileName: string; sizeBytes: number }>
  libraryFiles: Array<{ id: string; name: string; type: string; sizeBytes: number }>
  /**
   * A fixed acknowledgement line to put into the body once this draft
   * opens (`/inbox/[id]?insert=violation`, lib/inbox/reply-insert.ts).
   * Client-side only: it is an edit like any other and sends only on
   * Approve.
   */
  insertOnOpen?: string | null
  /** The thread a reply answers: turns on "Saved replies" (BL-101 A5). */
  threadId?: string | null
}

const HEADING: Record<ThreadDraft['kind'], string> = {
  reply: 'Draft reply',
  forward: 'Forward',
  new: 'New message',
}

export function Composer({
  draft,
  pending,
  actionError,
  onApprove,
  canClose = false,
  attachments,
  threadFiles,
  libraryFiles,
  insertOnOpen = null,
  threadId = null,
}: Props) {
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.bodyText)
  const [to, setTo] = useState<string[]>(draft.toEmails)
  const [cc, setCc] = useState<string[]>(draft.ccEmails)

  // A new draft row (a fresh createDraft, or the same thread's draft moving
  // to a different id) must not keep stale edits. Keyed on the fields
  // themselves, not just draft.id, so a server-side edit landing under the
  // same row still reflects in the inputs.
  //
  // draft.toEmails/ccEmails are rebuilt by getLatestDraft on every server
  // render (`toEmails: data.to_emails ?? []`), so depending on the arrays
  // themselves fires this effect on unrelated revalidations of the same
  // page — the property rail's "File under property" is one — and silently
  // discards in-progress edits. Depend on their VALUES so it fires only on
  // real changes.
  useEffect(() => {
    setSubject(draft.subject)
    setBody(draft.bodyText)
    setTo(draft.toEmails)
    setCc(draft.ccEmails)
  }, [draft.id, draft.subject, draft.bodyText, draft.toEmails.join(','), draft.ccEmails.join(',')])

  // Where the board member last put the cursor in the message, so an
  // inserted line lands there. Recorded only on their own clicks and
  // keystrokes, and forgotten when the draft changes.
  const caret = useRef<number | null>(null)
  useEffect(() => {
    caret.current = null
  }, [draft.id])
  const rememberCaret = (event: { currentTarget: HTMLTextAreaElement }) => {
    caret.current = event.currentTarget.selectionStart
  }

  // A line asked for on open: once per draft. Runs after the reset above,
  // so it composes onto the fresh body instead of being overwritten.
  const insertedOnOpen = useRef<string | null>(null)
  useEffect(() => {
    if (!insertOnOpen || insertedOnOpen.current === draft.id) return
    insertedOnOpen.current = draft.id
    setBody((current) => insertIntoBody(current, insertOnOpen).body)
  }, [draft.id, insertOnOpen])

  // Computed from the LIVE edits, not the stored arrays — this is what makes
  // filling a blank or adding a recipient enable Approve immediately, and
  // removing it re-disable. approveDraft re-checks all of it server-side;
  // this is the affordance, not the guarantee.
  const noRecipients = to.length === 0
  const blanksLeft = hasUnfilledBlanks(subject) || hasUnfilledBlanks(body)
  const blocked = blanksLeft || noRecipients

  // Keyboard (BL-101 A3): "a" approves and closes, "e" puts the cursor in
  // the message. Both arrive as window events from InboxKeyboard. "a" goes
  // through the same `blocked` gate as the button, so a draft with a blank
  // or no recipient cannot be sent by keyboard either; approveDraft
  // re-checks everything server-side regardless.
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const latest = useRef({ blocked, pending, subject, body, to, cc, canClose, onApprove })
  latest.current = { blocked, pending, subject, body, to, cc, canClose, onApprove }
  useEffect(() => {
    function approveClose() {
      const now = latest.current
      if (now.blocked || now.pending) return
      now.onApprove(
        { subject: now.subject, body: now.body, to: now.to, cc: now.cc },
        { closeThread: now.canClose },
      )
    }
    function edit() {
      const field = bodyRef.current
      if (!field) return
      field.focus()
      field.setSelectionRange(field.value.length, field.value.length)
    }
    // "Insert into reply" from the convert menu (lib/inbox/reply-insert.ts).
    // Synchronous: the result is written onto the event for the sender.
    function insert(event: Event) {
      const detail = (event as CustomEvent<InsertDetail>).detail
      if (!detail || typeof detail.text !== 'string') return
      const now = latest.current
      if (now.pending) {
        detail.result = 'busy'
        return
      }
      const next = insertIntoBody(now.body, detail.text, caret.current)
      detail.result = next.result
      if (next.result === 'inserted') {
        latest.current = { ...now, body: next.body }
        setBody(next.body)
        caret.current = null
      }
    }
    window.addEventListener(INBOX_APPROVE_CLOSE_EVENT, approveClose)
    window.addEventListener(INBOX_EDIT_EVENT, edit)
    window.addEventListener(INBOX_INSERT_EVENT, insert)
    return () => {
      window.removeEventListener(INBOX_APPROVE_CLOSE_EVENT, approveClose)
      window.removeEventListener(INBOX_EDIT_EVENT, edit)
      window.removeEventListener(INBOX_INSERT_EVENT, insert)
    }
  }, [])

  return (
    <section aria-label={HEADING[draft.kind]} className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{HEADING[draft.kind]}</h2>
        <span className="text-xs text-muted">Nothing sends until you approve</span>
      </div>

      <div className="space-y-4 p-4">
        {draft.kind === 'reply' && draft.grounded === false ? (
          <p className={AMBER_BOX}>
            {draft.groundingNote ??
              'No governing document or property record matched this question — this draft contains no facts.'}
          </p>
        ) : null}

        <RecipientFields to={to} cc={cc} onToChange={setTo} onCcChange={setCc} disabled={pending} />

        <Field label="Subject">
          <Input
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            disabled={pending}
          />
        </Field>

        <Field label="Message">
          <Textarea
            ref={bodyRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onClick={rememberCaret}
            onKeyUp={rememberCaret}
            rows={12}
            disabled={pending}
            className="leading-relaxed"
          />
        </Field>

        {threadId && draft.kind === 'reply' ? <SavedReplyPicker threadId={threadId} disabled={pending} /> : null}

        {draft.blanks.length > 0 ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <AlertTriangle className="size-3.5 text-warning" aria-hidden />
              Decide these before sending
            </p>
            <ul className="space-y-1.5">
              {draft.blanks.map((blank, index) => (
                <li key={`${blank.kind}-${index}`} className={AMBER_BOX}>
                  <span className="font-semibold">{BLANK_KIND_LABELS[blank.kind] ?? blank.kind}: </span>
                  {blank.prompt}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Label + quote together, always — a quote shown without its source
            is what a board member is supposed to check. */}
        {draft.kind === 'reply' && draft.citations.length > 0 ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <BookOpen className="size-3.5 text-muted" aria-hidden />
              Sources
            </p>
            <ul className="space-y-1.5 text-xs">
              {draft.citations.map((citation) => (
                <li key={citation.refId} className="rounded-lg border border-border bg-subtle px-3 py-2">
                  <span className="font-semibold text-foreground">{citation.label}</span>
                  <span className="text-foreground-secondary">{` — “${citation.quote}”`}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <AttachmentPicker
          draftId={draft.id}
          attachments={attachments}
          threadFiles={threadFiles}
          libraryFiles={libraryFiles}
          disabled={pending}
        />

        {actionError ? <Alert variant="error">{actionError}</Alert> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="text-xs text-muted" aria-live="polite">
          {noRecipients
            ? 'Add at least one recipient before sending.'
            : blanksLeft
              ? 'Fill in or remove every highlighted blank before sending.'
              : `You can undo for ${UNDO_WINDOW_SECONDS} seconds after approving.`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canClose ? (
            <Button
              type="button"
              variant="secondary"
              disabled={blocked || pending}
              onClick={() => onApprove({ subject, body, to, cc }, { closeThread: false })}
            >
              Approve, keep open
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={blocked}
            loading={pending}
            icon={<Send aria-hidden />}
            onClick={() => onApprove({ subject, body, to, cc }, { closeThread: canClose })}
            title={canClose ? 'Sends the reply, closes this conversation and opens the next one (shortcut: a)' : undefined}
          >
            Approve and send
          </Button>
        </div>
      </div>
    </section>
  )
}
