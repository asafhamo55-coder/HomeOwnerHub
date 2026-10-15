'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Send } from 'lucide-react'
import { Button, Checkbox, Field, Textarea, useToast } from '@homeowner-portal/ui'
import { respondToTicket } from '@/lib/tickets'

export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [internal, setInternal] = useState(false)

  function handleSubmit(formData: FormData) {
    setBodyError(null)
    const body = String(formData.get('body') ?? '').trim()
    if (!body) {
      setBodyError(internal ? 'Write the note first.' : 'Write a reply first.')
      return
    }

    startTransition(async () => {
      const result = await respondToTicket({ ticketId, body, internal })
      if (!result.ok) {
        if (result.fieldErrors?.body) setBodyError(result.fieldErrors.body)
        else toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: internal ? 'Internal note added.' : 'Reply sent to the resident.' })
      router.refresh()
      formRef.current?.reset()
      setInternal(false)
    })
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="space-y-3"
      onKeyDown={(e) => {
        // ⌘/Ctrl+Enter sends, like every other composer.
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          formRef.current?.requestSubmit()
        }
      }}
    >
      <Field
        label={internal ? 'Internal note' : 'Reply to resident'}
        hint={
          internal
            ? 'Only the board sees internal notes.'
            : 'The resident sees this in their portal. ⌘/Ctrl + Enter sends.'
        }
        error={bodyError}
      >
        <Textarea
          name="body"
          rows={4}
          maxLength={4000}
          placeholder={internal ? 'What should the rest of the board know?' : 'Write your reply…'}
        />
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Checkbox
          checked={internal}
          onChange={(e) => setInternal(e.target.checked)}
          label="Internal note"
          description="Not visible to the resident"
        />
        <Button
          type="submit"
          loading={isPending}
          icon={internal ? <Lock aria-hidden /> : <Send aria-hidden />}
          className="self-end sm:self-auto"
        >
          {internal ? 'Add note' : 'Send reply'}
        </Button>
      </div>
    </form>
  )
}
