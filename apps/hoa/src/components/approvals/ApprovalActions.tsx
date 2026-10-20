'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import { Button, ConfirmDialog, Dialog, DialogContent, Field, Textarea, useToast } from '@homeowner-portal/ui'
import { decideApproval } from '@/lib/approvals-inbox/actions'
import { decisionId, type InboxDecisionTarget } from '@/lib/approvals-inbox/model'
import { trackEvent } from '@/lib/analytics/track'

interface Copy {
  approveButton: string
  approveTitle: string
  approveDescription: (title: string, amountLabel: string | null) => string
  approveConfirm: string
  rejectTitle: string
  rejectConfirm: string
  rejectPlaceholder: string
}

/** ARC reviews are decided by ArcReviewActions (the ARC actions), never here. */
type ApprovalTarget = Exclude<InboxDecisionTarget, { kind: 'arc' }>

const COPY: Record<ApprovalTarget['kind'], Copy> = {
  w18: {
    approveButton: 'Approve & post',
    approveTitle: 'Approve and post this deposit?',
    approveDescription: (title, amount) =>
      `${title}${amount ? ` (${amount})` : ''}. This posts a cash receipt to the ledger and marks the charge paid.`,
    approveConfirm: 'Approve & post',
    rejectTitle: 'Reject this match?',
    rejectConfirm: 'Reject match',
    rejectPlaceholder: 'The memo code belongs to a different unit.',
  },
  bill: {
    approveButton: 'Approve & enter',
    approveTitle: 'Approve and enter this bill?',
    approveDescription: (title, amount) =>
      `${title}${amount ? ` (${amount})` : ''}. This enters the bill and posts it to accounts payable (Dr expense, Cr AP) exactly as "Enter a bill" does. It does not pay the vendor.`,
    approveConfirm: 'Approve & enter',
    rejectTitle: 'Reject this bill?',
    rejectConfirm: 'Reject bill',
    rejectPlaceholder: 'Duplicate of a bill already entered.',
  },
  w3: {
    approveButton: 'Approve letter',
    approveTitle: 'Approve this violation letter?',
    approveDescription: (title) =>
      `${title}. The letter is filed as an open violation. Nothing is emailed or texted to the homeowner from here — record the notice on the violation once it goes out.`,
    approveConfirm: 'Approve letter',
    rejectTitle: 'Reject this draft?',
    rejectConfirm: 'Reject draft',
    rejectPlaceholder: 'The photo shows the neighbor’s lot, not this one.',
  },
  collections: {
    approveButton: 'Approve letter',
    approveTitle: 'Approve this collections letter?',
    approveDescription: (title, amount) =>
      `${title}${amount ? ` (${amount})` : ''}. The letter becomes ready to print on the property page. Nothing is emailed, texted or mailed from HomeownerHub — the board prints it and sends it.`,
    approveConfirm: 'Approve letter',
    rejectTitle: 'Reject this letter?',
    rejectConfirm: 'Reject letter',
    rejectPlaceholder: 'The owner paid on Friday; the check hasn’t posted yet.',
  },
  contact: {
    approveButton: 'Approve & update',
    approveTitle: 'Update these contact details?',
    approveDescription: (title) =>
      `${title}. The new details replace what is on file for this person on the home: their resident record, their ownership or lease, and the home's owner contact when it is theirs. They are told in their request.`,
    approveConfirm: 'Approve & update',
    rejectTitle: 'Reject this change?',
    rejectConfirm: 'Reject change',
    rejectPlaceholder: 'Please call the office so we can confirm the new number.',
  },
  vendor: {
    approveButton: 'Approve',
    approveTitle: 'Approve this vendor?',
    approveDescription: (title) => `${title} becomes an active vendor and can be assigned work.`,
    approveConfirm: 'Approve vendor',
    rejectTitle: 'Reject this vendor?',
    rejectConfirm: 'Reject vendor',
    rejectPlaceholder: 'No contractor license on file.',
  },
}

/**
 * One row's decision buttons. Approve confirms first (a W18 approval posts
 * money, a W3 approval files a violation, a vendor approval lets them take
 * work). Reject asks for a reason, kept on the module's own audit trail.
 * A vendor that cannot be approved yet gets Reject plus a Review link;
 * rows with no one-click decision get only the Review link.
 */
export function ApprovalActions({
  decision,
  title,
  amountLabel,
  href,
}: {
  decision: ApprovalTarget | null
  title: string
  amountLabel: string | null
  href: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()

  const review = (
    <Button asChild size="sm" variant="secondary" iconRight={<ChevronRight aria-hidden />}>
      <Link href={href}>Review</Link>
    </Button>
  )

  if (!decision) return <div className="flex justify-end">{review}</div>

  const kind = decision.kind
  const id = decisionId(decision)
  const copy = COPY[kind]
  const canApprove =
    decision.kind === 'vendor' || decision.kind === 'bill' || decision.kind === 'contact' ? decision.canApprove : true

  async function approve() {
    const r = await decideApproval({ kind, id, decision: 'approve' })
    if (!r.ok) {
      toast({ tone: 'error', title: 'Couldn’t approve it', message: r.error })
    } else {
      trackEvent('approval.decided', { kind, decision: 'approve' })
      toast({ tone: 'success', message: r.message })
    }
    router.refresh()
  }

  function reject(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) {
      setReasonError('Say why, so the next person understands the decision.')
      return
    }
    startTransition(async () => {
      const r = await decideApproval({ kind, id, decision: 'reject', reason: reason.trim() })
      if (!r.ok) {
        toast({ tone: 'error', title: 'Couldn’t reject it', message: r.error })
        return
      }
      setRejecting(false)
      trackEvent('approval.decided', { kind, decision: 'reject' })
      toast({ tone: 'success', message: r.message })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap justify-end gap-2 md:flex-nowrap">
      <Button size="sm" variant="ghost" icon={<X aria-hidden />} onClick={() => setRejecting(true)} disabled={pending}>
        Reject
      </Button>
      {canApprove ? (
        <ConfirmDialog
          title={copy.approveTitle}
          description={copy.approveDescription(title, amountLabel)}
          confirmLabel={copy.approveConfirm}
          onConfirm={approve}
          trigger={
            <Button size="sm" variant="secondary" icon={<Check aria-hidden />} disabled={pending}>
              {copy.approveButton}
            </Button>
          }
        />
      ) : (
        review
      )}
      <Dialog open={rejecting} onOpenChange={(next) => !pending && setRejecting(next)}>
        <DialogContent
          title={copy.rejectTitle}
          description={title}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRejecting(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" form={`reject-${id}`} variant="destructive" loading={pending}>
                {copy.rejectConfirm}
              </Button>
            </>
          }
        >
          <form id={`reject-${id}`} onSubmit={reject}>
            <Field label="Reason" required hint={kind === 'contact' ? 'The resident sees this in their request.' : 'Kept in the audit trail.'} error={reasonError}>
              <Textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  setReasonError(undefined)
                }}
                rows={3}
                maxLength={500}
                placeholder={copy.rejectPlaceholder}
                disabled={pending}
              />
            </Field>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
