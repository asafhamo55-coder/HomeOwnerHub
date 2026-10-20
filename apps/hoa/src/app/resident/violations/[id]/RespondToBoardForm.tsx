'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Send } from 'lucide-react'
import { Button, Field, Textarea, useToast } from '@homeowner-portal/ui'
import { respondToMyViolation } from '@/lib/violation-response-actions'
import { uploadAttachmentDirect } from '@/lib/upload-attachment'

// BL-129: the resident's answer to a violation on their home — text, plus
// an optional photo of the fix. The text is saved first; the photo then
// goes browser-direct to storage on the same thread (the 4.5 MB server
// body cap is why it never travels through the action).

export function RespondToBoardForm({ violationId, hasThread }: { violationId: string; hasThread: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    setPhotoError(null)
    const body = String(formData.get('body') ?? '').trim()
    if (!body) {
      setError('Write your response first.')
      return
    }
    const file = fileRef.current?.files?.[0] ?? null
    startTransition(async () => {
      const result = await respondToMyViolation(violationId, body)
      if (!result.ok) {
        setError(result.fieldErrors?.body ?? result.error)
        return
      }
      if (file) {
        const upload = await uploadAttachmentDirect('ticket', result.ticketId, file)
        if (!upload.ok) {
          setPhotoError(`Your response was sent, but the photo didn’t upload (${upload.error}). Attach it again below.`)
        }
      }
      formRef.current?.reset()
      setFileName(null)
      toast({ tone: 'success', message: 'Response sent to the board.' })
      router.refresh()
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-3">
      <Field
        label={hasThread ? 'Add to your response' : 'Your response'}
        hint="Say what you’ve done or plan to do, or why you disagree. The board sees this on the violation."
        error={error}
      >
        <Textarea
          name="body"
          rows={4}
          maxLength={4000}
          placeholder="For example: The trailer was moved on Saturday. Photo attached."
          disabled={isPending}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.heic"
            className="hidden"
            disabled={isPending}
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={isPending}
            icon={<Camera aria-hidden />}
          >
            {fileName ? 'Change photo' : 'Add a photo of the fix'}
          </Button>
          {fileName ? <p className="mt-1 truncate text-xs text-muted">{fileName}</p> : null}
        </div>
        <Button type="submit" loading={isPending} icon={<Send aria-hidden />}>
          Send to the board
        </Button>
      </div>
      {photoError ? (
        <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-foreground">{photoError}</p>
      ) : null}
    </form>
  )
}
