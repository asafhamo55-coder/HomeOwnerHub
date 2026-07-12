'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button, Textarea } from '@homeowner-portal/ui'
import { addArcMessage } from '@/lib/resident-submissions'

export function ArcReplyForm({ arcId }: { arcId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    const body = String(formData.get('body') ?? '').trim()
    if (!body) return

    startTransition(async () => {
      const result = await addArcMessage(arcId, body)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
      const form = document.getElementById('arc-reply-form') as HTMLFormElement | null
      form?.reset()
    })
  }

  return (
    <form id="arc-reply-form" action={handleSubmit} className="space-y-3">
      <Textarea
        name="body"
        rows={3}
        required
        minLength={1}
        maxLength={4000}
        placeholder="Ask a question or add details for the board…"
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending} size="sm">
          <Send className="h-3.5 w-3.5" />
          {isPending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  )
}
