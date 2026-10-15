'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button, Field, Textarea, useToast } from '@homeowner-portal/ui'
import { addTicketMessage } from '@/lib/resident-tickets'
import { addArcMessage, addViolationReportMessage } from '@/lib/resident-submissions'

// One reply composer for every resident thread (ticket, ARC application,
// concern). The message error is shown on the field itself; success is a
// toast plus a refreshed thread.

const ACTIONS = {
  ticket: addTicketMessage,
  arc: addArcMessage,
  concern: addViolationReportMessage,
} as const

export function ReplyComposer({
  kind,
  id,
  placeholder = 'Write a message to the board…',
}: {
  kind: keyof typeof ACTIONS
  id: string
  placeholder?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    const body = String(formData.get('body') ?? '').trim()
    if (!body) {
      setError('Write a message first.')
      return
    }
    startTransition(async () => {
      const result = await ACTIONS[kind](id, body)
      if (!result.ok) {
        setError(result.error)
        return
      }
      formRef.current?.reset()
      toast({ tone: 'success', message: 'Message sent to the board.' })
      router.refresh()
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-3">
      <Field label="Message" hideLabel error={error}>
        <Textarea name="body" rows={3} maxLength={4000} placeholder={placeholder} disabled={isPending} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={isPending} icon={<Send aria-hidden />}>
          Send
        </Button>
      </div>
    </form>
  )
}
