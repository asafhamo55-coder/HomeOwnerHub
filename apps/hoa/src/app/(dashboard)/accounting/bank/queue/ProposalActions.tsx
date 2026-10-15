'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { Alert, Button, Input } from '@homeowner-portal/ui'
import { approvePosting, rejectPosting } from '@/lib/approvals'

export function ProposalActions({ approvalRequestId }: { approvalRequestId: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'reject'>('idle')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'failed')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {mode === 'idle' ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => approvePosting({ approvalRequestId }))}
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Approve &amp; post
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode('reject')}>
            <X className="h-3 w-3" />
            Reject
          </Button>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-2 rounded-md border border-border bg-surface p-2">
          <label className="block text-xs">
            <span className="text-muted">Reason (required, kept in the audit trail)</span>
            <Input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1"
              placeholder="e.g. memo code belongs to a different unit"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setMode('idle')
                setError(null)
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || reason.trim().length === 0}
              onClick={() => run(() => rejectPosting({ approvalRequestId, reason }))}
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              Reject
            </Button>
          </div>
        </div>
      )}
      {error ? <Alert variant="error" className="text-xs">{error}</Alert> : null}
    </div>
  )
}
