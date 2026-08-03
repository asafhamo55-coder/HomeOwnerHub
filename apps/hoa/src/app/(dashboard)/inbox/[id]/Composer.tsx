'use client'

import { useEffect, useState } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { hasUnfilledBlanks } from '@/lib/inbox/draft/blanks'
import type { ThreadDraft } from '@/lib/inbox/queries'
import { RecipientFields } from './RecipientFields'
import { AMBER_BOX, BLANK_KIND_LABELS } from './draft-ui'

export interface ApproveInput {
  subject: string
  body: string
  to: string[]
  cc: string[]
}

interface Props {
  draft: ThreadDraft
  pending: boolean
  actionError: string | null
  onApprove: (input: ApproveInput) => void
}

export function Composer({ draft, pending, actionError, onApprove }: Props) {
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

  // Computed from the LIVE edits, not the stored arrays — this is what makes
  // filling a blank or adding a recipient enable Approve immediately, and
  // removing it re-disable. approveDraft re-checks all of it server-side;
  // this is the affordance, not the guarantee.
  const blocked = hasUnfilledBlanks(subject) || hasUnfilledBlanks(body) || to.length === 0

  return (
    <section className="mt-4 space-y-3 rounded-md border border-border p-3">
      {draft.grounded === false ? (
        <p className={AMBER_BOX}>
          {draft.groundingNote ??
            'No governing document or property record matched this question — this draft contains no facts.'}
        </p>
      ) : null}

      <RecipientFields to={to} cc={cc} onToChange={setTo} onCcChange={setCc} disabled={pending} />

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="w-full rounded-md border border-border bg-background p-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Message
        </label>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={10}
          className="w-full rounded-md border border-border bg-background p-2 text-sm"
        />
      </div>

      {draft.blanks.length > 0 ? (
        <ul className="space-y-1">
          {draft.blanks.map((blank, index) => (
            <li key={`${blank.kind}-${index}`} className={AMBER_BOX}>
              <span className="font-semibold">{BLANK_KIND_LABELS[blank.kind] ?? blank.kind}: </span>
              {blank.prompt}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Label + quote together, always — a quote shown without its source is
          what a board member is supposed to check. */}
      {draft.citations.length > 0 ? (
        <ul className="space-y-1 border-t border-border pt-2 text-xs">
          {draft.citations.map((citation) => (
            <li key={citation.refId}>
              <span className="font-semibold text-foreground">{citation.label}</span>
              <span className="text-muted">{` — "${citation.quote}"`}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {actionError ? <Alert variant="error">{actionError}</Alert> : null}

      <div>
        <Button
          type="button"
          size="sm"
          disabled={blocked}
          loading={pending}
          onClick={() => onApprove({ subject, body, to, cc })}
        >
          Approve and send
        </Button>
        {blocked ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {to.length === 0
              ? 'Add at least one recipient before sending.'
              : 'Fill in or remove every highlighted blank before sending.'}
          </p>
        ) : null}
      </div>
    </section>
  )
}
