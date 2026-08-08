'use client'

import { useState, useTransition } from 'react'
import { Alert, Button, Input } from '@homeowner-portal/ui'
import { draftVendorRequest } from '@/lib/inbox/draft/actions'
import type { VendorRequestIntent } from '@homeowner-portal/workflows'
import type { ThreadDraft } from '@/lib/inbox/queries'

/**
 * "Request from vendor" — the entry point to W34.
 *
 * Sits in the thread header beside Forward, and for the same reason
 * ForwardButton documents: `getLatestDraft` returns the newest draft whatever
 * its status, so anything living inside DraftPanel is unreachable once a
 * reply has been sent — which is exactly when a board member turns to a
 * vendor.
 *
 * Unlike Forward, this does NOT displace the thread's draft: a vendor request
 * is threadless (`thread_id` NULL), so it is not "the thread's latest draft"
 * at all and cannot bury a queued reply's Undo countdown. It therefore has no
 * BLOCKED_REASON map. The action still refuses on its own terms.
 */

const INTENTS: Array<{ value: VendorRequestIntent; label: string; hint: string }> = [
  { value: 'inspect_quote', label: 'Inspect & quote', hint: 'Look at it and price the fix' },
  { value: 'emergency', label: 'Emergency', hint: 'Active damage or a safety hazard' },
  { value: 'schedule', label: 'Schedule work', hint: 'Book already-agreed work' },
  { value: 'warranty', label: 'Warranty claim', hint: 'A problem with their own prior work' },
  { value: 'bid', label: 'Get a bid', hint: 'Invite pricing on defined work' },
  { value: 'other', label: 'Other…', hint: 'Describe it yourself' },
]

export function VendorRequestButton({
  threadId,
  vendorEmail,
  draftStatus,
}: {
  threadId: string
  /** Primary email of the vendor filed against this thread, when there is one. */
  vendorEmail: string | null
  draftStatus: ThreadDraft['status'] | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="max-w-56 space-y-1 text-right">
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Request from vendor
      </Button>
      {open ? (
        <VendorRequestDialog
          threadId={threadId}
          vendorEmail={vendorEmail}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {/* Referenced so the prop stays honest if a future state does need to
          block; today a threadless draft displaces nothing. */}
      {draftStatus === 'sending' ? (
        <p className="text-xs text-muted">A reply is sending on this thread.</p>
      ) : null}
    </div>
  )
}

function VendorRequestDialog({
  threadId,
  vendorEmail,
  onClose,
}: {
  threadId: string
  vendorEmail: string | null
  onClose: () => void
}) {
  const [intent, setIntent] = useState<VendorRequestIntent>('inspect_quote')
  const [instruction, setInstruction] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [to, setTo] = useState(vendorEmail ?? '')
  const [error, setError] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    setSkipped([])
    startTransition(async () => {
      const result = await draftVendorRequest({
        threadId,
        intent,
        // Only meaningful for 'other'; sent as null otherwise so the prompt
        // does not render an INSTRUCTION block the board did not write.
        freeTextInstruction: intent === 'other' ? instruction.trim() || null : null,
        neededBy: neededBy || null,
        toEmails: to.split(',').map((value) => value.trim()),
      })

      if ('error' in result) {
        setError(result.error)
        return
      }

      // Files that did not fit the 15MB budget are named, never silently
      // dropped — the board member has to know the vendor is not getting the
      // photo. The draft itself is fine, so this is not an error state.
      if (result.skippedAttachments.length > 0) {
        setSkipped(result.skippedAttachments)
        return
      }

      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-3 rounded-md border border-border bg-background p-4 text-left">
        <p className="text-sm font-semibold text-foreground">What do you need from this vendor?</p>

        <div className="grid grid-cols-2 gap-2">
          {INTENTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setIntent(option.value)}
              className={`rounded-md border p-2 text-left text-xs ${
                intent === option.value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted'
              }`}
            >
              <span className="block font-medium text-foreground">{option.label}</span>
              <span className="block">{option.hint}</span>
            </button>
          ))}
        </div>

        {intent === 'other' ? (
          <label className="block space-y-1">
            <span className="text-xs text-muted">What should we ask them to do?</span>
            <Input
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="e.g. find out if it's the roof or their own plumbing"
            />
          </label>
        ) : null}

        <label className="block space-y-1">
          <span className="text-xs text-muted">Send to</span>
          <Input
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="vendor@example.com"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-muted">Needed by (optional)</span>
          <Input
            type="date"
            value={neededBy}
            onChange={(event) => setNeededBy(event.target.value)}
          />
        </label>

        <p className="text-xs text-muted">
          The resident&rsquo;s email is not forwarded. This starts a separate conversation with the
          vendor, so a reply-all can never reach the owner.
        </p>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {skipped.length > 0 ? (
          <Alert variant="warning">
            Drafted, but these files did not fit the 15MB limit and are not attached:{' '}
            {skipped.join(', ')}
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose} disabled={pending}>
            {skipped.length > 0 ? 'Close' : 'Cancel'}
          </Button>
          {skipped.length === 0 ? (
            <Button size="sm" loading={pending} onClick={submit}>
              Draft the email
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
