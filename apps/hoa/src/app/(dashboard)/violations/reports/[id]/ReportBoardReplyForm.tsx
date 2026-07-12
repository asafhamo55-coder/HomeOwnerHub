'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button, Textarea } from '@homeowner-portal/ui'
import { postViolationReportMessage } from '@/lib/board-review'

export function ReportBoardReplyForm({ reportId }: { reportId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [internal, setInternal] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    const body = String(formData.get('body') ?? '').trim()
    if (!body) return

    startTransition(async () => {
      const result = await postViolationReportMessage({ reportId, body, internal })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
      const form = document.getElementById('report-board-reply-form') as HTMLFormElement | null
      form?.reset()
      setInternal(false)
    })
  }

  return (
    <form id="report-board-reply-form" action={handleSubmit} className="space-y-3">
      <Textarea
        name="body"
        rows={3}
        required
        minLength={1}
        maxLength={4000}
        placeholder={
          internal
            ? 'Internal note (only visible to the board)…'
            : 'Message the reporter (e.g. ask for more detail)…'
        }
      />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
            className="rounded border-border"
          />
          Internal note (not visible to reporter)
        </label>
        <Button type="submit" disabled={isPending} size="sm">
          <Send className="h-3.5 w-3.5" />
          {isPending ? 'Sending…' : internal ? 'Add note' : 'Send reply'}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  )
}
