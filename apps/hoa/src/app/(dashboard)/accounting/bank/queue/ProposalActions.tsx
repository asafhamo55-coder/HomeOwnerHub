'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, X } from 'lucide-react'
import { Button, Dialog, DialogContent, Field, Textarea, useToast } from '@homeowner-portal/ui'
import { approvePosting, rejectPosting } from '@/lib/approvals'

/**
 * Approve or reject one W18 proposed posting. Approve posts the receipt and
 * marks the assessment paid; reject needs a reason (kept on the audit
 * trail), asked for in a dialog instead of an inline field that reflowed
 * the queue.
 */
export function ProposalActions({ approvalRequestId, summary }: { approvalRequestId: string; summary: string }) {
  const router = useRouter()
  const toast = useToast()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()

  function approve() {
    startTransition(async () => {
      const r = await approvePosting({ approvalRequestId })
      if (!r.ok) toast({ tone: 'error', title: 'Couldn’t post it', message: r.error ?? 'The posting failed.' })
      else toast({ tone: 'success', message: 'Approved and posted to the ledger.' })
      router.refresh()
    })
  }

  function reject(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) {
      setReasonError('Say why, so the next person understands the decision.')
      return
    }
    startTransition(async () => {
      const r = await rejectPosting({ approvalRequestId, reason: reason.trim() })
      if (!r.ok) {
        toast({ tone: 'error', title: 'Couldn’t reject it', message: r.error ?? 'The rejection failed.' })
        return
      }
      setRejecting(false)
      toast({ tone: 'success', message: 'Rejected. The deposit is back in the matching queue.' })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button size="sm" variant="ghost" icon={<X aria-hidden />} onClick={() => setRejecting(true)} disabled={pending}>
        Reject
      </Button>
      <Button size="sm" variant="secondary" icon={<Check aria-hidden />} onClick={approve} loading={pending && !rejecting}>
        Approve &amp; post
      </Button>
      <Dialog open={rejecting} onOpenChange={(next) => !pending && setRejecting(next)}>
        <DialogContent
          title="Reject this match?"
          description={summary}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRejecting(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" form={`reject-${approvalRequestId}`} variant="destructive" loading={pending}>
                Reject match
              </Button>
            </>
          }
        >
          <form id={`reject-${approvalRequestId}`} onSubmit={reject}>
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
    </div>
  )
}
