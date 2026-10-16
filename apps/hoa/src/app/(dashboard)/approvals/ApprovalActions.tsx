'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import { Button, ConfirmDialog, Dialog, DialogContent, Field, Textarea, useToast } from '@homeowner-portal/ui'
import { decideApproval } from '@/lib/approvals-inbox/actions'
import { decisionId, type InboxDecisionTarget } from '@/lib/approvals-inbox/model'

interface Copy {
  approveButton: string
  approveTitle: string
  approveDescription: (title: string, amountLabel: string | null) => string
  approveConfirm: string
  rejectTitle: string
  rejectConfirm: string
  rejectPlaceholder: string
}

const COPY: Record<InboxDecisionTarget['kind'], Copy> = {
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
  decision: InboxDecisionTarget | null
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
  const canApprove = kind !== 'vendor' || decision.canApprove

  async function approve() {
    const r = await decideApproval({ kind, id, decision: 'approve' })
    if (!r.ok) {
      toast({ tone: 'error', title: 'Couldn’t approve it', message: r.error })
    } else {
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
            <Field label="Reason" required hint="Kept in the audit trail." error={reasonError}>
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
