'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button, Checkbox, Field, Textarea, useToast } from '@homeowner-portal/ui'

type SendResult = { ok: true } | { ok: false; error: string }

/**
 * Reply box for a board-review thread: message the resident, or flip to an
 * internal note. ⌘/Ctrl+Enter sends. The error lands under the field.
 */
export function ReplyComposer({
  onSend,
  residentLabel,
}: {
  onSend: (body: string, internal: boolean) => Promise<SendResult>
  /** "resident" or "reporter" — used in copy. */
  residentLabel: string
}) {
  const router = useRouter()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [internal, setInternal] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const body = String(new FormData(form).get('body') ?? '').trim()
    if (!body) {
      setError('Write a message first.')
      return
    }
    startTransition(async () => {
      const result = await onSend(body, internal)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast({ tone: 'success', message: internal ? 'Internal note added.' : `Reply sent to the ${residentLabel}.` })
      form.reset()
      setInternal(false)
      router.refresh()
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <Field
        label={internal ? 'Internal note' : `Reply to the ${residentLabel}`}
        hint={internal ? 'Only the board sees this.' : `The ${residentLabel} sees this in their portal. ⌘/Ctrl+Enter to send.`}
        error={error}
      >
        <Textarea
          name="body"
          rows={3}
          maxLength={4000}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              formRef.current?.requestSubmit()
            }
          }}
          placeholder={internal ? 'Notes for other board members…' : `Write to the ${residentLabel}…`}
        />
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Checkbox
          checked={internal}
          onChange={(e) => setInternal(e.target.checked)}
          label="Internal note"
          description={`Hidden from the ${residentLabel}`}
        />
        <Button type="submit" loading={isPending} variant="secondary"icon={<Send aria-hidden />}>
          {internal ? 'Add note' : 'Send reply'}
        </Button>
      </div>
    </form>
  )
}
