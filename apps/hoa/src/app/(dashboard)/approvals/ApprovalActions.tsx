'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import { Button, ConfirmDialog, Dialog, DialogContent, Field, Textarea, useToast } from '@homeowner-portal/ui'
import { decideApproval } from '@/lib/approvals-inbox/actions'
import type { InboxDecisionTarget } from '@/lib/approvals-inbox/model'

/**
 * One row's decision buttons. Approve confirms first (a W18 approval posts
 * money; a vendor approval lets them take work). Reject — W18 only, the
 * only source whose module has a reject — asks for a reason, kept on the
 * approval_requests audit trail. Rows with no one-click decision get a
 * Review link to the module page.
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

  if (!decision) {
    return (
      <div className="flex justify-end">
        <Button asChild size="sm" variant="secondary" iconRight={<ChevronRight aria-hidden />}>
          <Link href={href}>Review</Link>
        </Button>
      </div>
    )
  }

  const id = decision.kind === 'w18' ? decision.approvalRequestId : decision.vendorId

  async function approve() {
    const r = await decideApproval({ kind: decision!.kind, id, decision: 'approve' })
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
      const r = await decideApproval({ kind: 'w18', id, decision: 'reject', reason: reason.trim() })
      if (!r.ok) {
        toast({ tone: 'error', title: 'Couldn’t reject it', message: r.error })
        return
      }
      setRejecting(false)
      toast({ tone: 'success', message: r.message })
      router.refresh()
    })
  }

  const isPosting = decision.kind === 'w18'

  return (
    <div className="flex flex-wrap justify-end gap-2 md:flex-nowrap">
      {isPosting ? (
        <Button size="sm" variant="ghost" icon={<X aria-hidden />} onClick={() => setRejecting(true)} disabled={pending}>
          Reject
        </Button>
      ) : null}
      <ConfirmDialog
        title={isPosting ? 'Approve and post this deposit?' : 'Approve this vendor?'}
        description={
          isPosting
            ? `${title}${amountLabel ? ` (${amountLabel})` : ''}. This posts a cash receipt to the ledger and marks the charge paid.`
            : `${title} becomes an active vendor and can be assigned work.`
        }
        confirmLabel={isPosting ? 'Approve & post' : 'Approve vendor'}
        onConfirm={approve}
        trigger={
          <Button size="sm" variant="secondary" icon={<Check aria-hidden />} disabled={pending}>
            {isPosting ? 'Approve & post' : 'Approve'}
          </Button>
        }
      />
      {isPosting ? (
        <Dialog open={rejecting} onOpenChange={(next) => !pending && setRejecting(next)}>
          <DialogContent
            title="Reject this match?"
            description={title}
            footer={
              <>
                <Button variant="ghost" onClick={() => setRejecting(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" form={`reject-${id}`} variant="destructive" loading={pending}>
                  Reject match
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
                  placeholder="The memo code belongs to a different unit."
                  disabled={pending}
                />
              </Field>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
