'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Checkbox, Field, Input, Textarea } from '@homeowner-portal/ui'
import { attorneyAddNote, attorneyDraftLetter, attorneyUploadDocument } from '@/lib/professionals/actions'
import type { MatterRef } from '@/lib/professionals/model'

type Msg = { ok: boolean; text: string } | null

function useSubmit() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<Msg>(null)
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, reset: () => void) =>
    start(async () => {
      setMsg(null)
      const r = await fn()
      if (!r.ok) return setMsg({ ok: false, text: r.error ?? 'Something went wrong.' })
      reset()
      setMsg({ ok: true, text: done })
      router.refresh()
    })
  return { pending, msg, run }
}

/** A case note, or advice the board cites when it performs an override. */
export function NoteForm({ matter }: { matter: MatterRef }) {
  const { pending, msg, run } = useSubmit()
  const [body, setBody] = useState('')
  const [advice, setAdvice] = useState(false)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        run(() => attorneyAddNote({ matter, body, advice }), 'Sent to the board. It joins the matter once they approve it.', () => setBody(''))
      }}
      className="space-y-2"
    >
      <Field label="Note">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={4000} required />
      </Field>
      <Checkbox checked={advice} onChange={(e) => setAdvice(e.target.checked)} label="This is my advice (the board cites it if it overrides a check)" />
      {msg ? <Alert variant={msg.ok ? 'success' : 'error'}>{msg.text}</Alert> : null}
      <Button type="submit" size="sm" loading={pending}>
        Send note to the board
      </Button>
    </form>
  )
}

/** A draft letter. Nothing is sent: the board approves the draft. */
export function LetterForm({ matter }: { matter: MatterRef }) {
  const { pending, msg, run } = useSubmit()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        run(() => attorneyDraftLetter({ matter, subject, body }), 'Draft sent to the board. Nothing is mailed or emailed.', () => {
          setSubject('')
          setBody('')
        })
      }}
      className="space-y-2"
    >
      <Field label="Subject">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />
      </Field>
      <Field label="Letter">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={20000} required />
      </Field>
      {msg ? <Alert variant={msg.ok ? 'success' : 'error'}>{msg.text}</Alert> : null}
      <Button type="submit" size="sm" loading={pending}>
        Send draft to the board
      </Button>
    </form>
  )
}

export function UploadForm({ matter }: { matter: MatterRef }) {
  const { pending, msg, run } = useSubmit()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const fd = new FormData(form)
        fd.set('matterType', matter.type)
        fd.set('matterId', matter.id)
        run(() => attorneyUploadDocument(fd), 'Sent to the board. It is filed with the matter once they approve it.', () => form.reset())
      }}
      className="space-y-2"
    >
      <Field label="Document" hint="PDF, image, Word or Excel, up to 10 MB.">
        <Input name="file" type="file" required />
      </Field>
      {msg ? <Alert variant={msg.ok ? 'success' : 'error'}>{msg.text}</Alert> : null}
      <Button type="submit" size="sm" loading={pending}>
        Upload for the board
      </Button>
    </form>
  )
}
