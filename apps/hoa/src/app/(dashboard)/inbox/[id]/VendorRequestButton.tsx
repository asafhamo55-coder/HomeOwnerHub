'use client'

import { useState, useTransition } from 'react'
import { Sparkles, Wrench } from 'lucide-react'
import { Alert, Button, Dialog, DialogContent, Field, Input, cn } from '@homeowner-portal/ui'
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
      <Button variant="secondary" icon={<Wrench aria-hidden />} onClick={() => setOpen(true)}>
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
    <Dialog open onOpenChange={(next) => (next || pending ? null : onClose())}>
      <DialogContent
        title="What do you need from this vendor?"
        description="This starts a separate conversation with the vendor. The resident’s email is not forwarded, so a reply-all can never reach the owner."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              {skipped.length > 0 ? 'Close' : 'Cancel'}
            </Button>
            {skipped.length === 0 ? (
              <Button loading={pending} onClick={submit} icon={<Sparkles aria-hidden />}>
                Draft the email
              </Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium text-foreground">Request type</legend>
            <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
              {INTENTS.map((option) => {
                const selected = intent === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setIntent(option.value)}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected
                        ? 'border-primary bg-primary-subtle'
                        : 'border-border bg-surface hover:border-border-strong hover:bg-subtle',
                    )}
                  >
                    <span className="block text-sm font-medium text-foreground">{option.label}</span>
                    <span className="block text-xs text-muted">{option.hint}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          {intent === 'other' ? (
            <Field label="What should we ask them to do?">
              <Input
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="e.g. find out if it's the roof or their own plumbing"
              />
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Send to" hint="Separate several addresses with commas.">
              <Input
                type="text"
                inputMode="email"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="vendor@example.com"
              />
            </Field>
            <Field label="Needed by" optional>
              <Input type="date" value={neededBy} onChange={(event) => setNeededBy(event.target.value)} />
            </Field>
          </div>

          {error ? <Alert variant="error">{error}</Alert> : null}
          {skipped.length > 0 ? (
            <Alert variant="warning">
              Drafted, but these files did not fit the 15MB limit and are not attached:{' '}
              {skipped.join(', ')}
            </Alert>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
