'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { NotebookPen } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTrigger, Field, Textarea, useToast } from '@homeowner-portal/ui'
import { logPropertyNote } from '@/lib/property-events'
import { NOTE_MAX, checkNote } from '@/lib/properties/note'

/**
 * "Log note": a dated note in the home's Activity (property_events
 * 'note'). For the phone call or the conversation at the mailbox that
 * otherwise lives in someone's head. Append-only, like the rest of the
 * history.
 */
export function LogNoteDialog({ propertyId }: { propertyId: string }) {
  const router = useRouter()
  const toast = useToast()
  const formId = `log-note-${useId().replace(/:/g, '')}`
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const checked = checkNote(note)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await logPropertyNote(propertyId, checked.note)
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast({ tone: 'success', message: 'Note added to the activity.' })
      setNote('')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" icon={<NotebookPen aria-hidden />}>
          Log note
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Log a note"
        description="It goes into this home’s Activity with today’s date and your name. Notes can’t be edited later."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              Save note
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} noValidate>
          <Field label="Note" required error={error}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} rows={5} autoFocus disabled={pending} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  )
}
