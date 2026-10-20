'use client'

import { useEffect, useState, useTransition } from 'react'
import { Layers, Send, Undo2 } from 'lucide-react'
import { Alert, Button, Checkbox, Dialog, DialogContent, Field, Select, Textarea } from '@homeowner-portal/ui'
import { SAVED_REPLIES, fieldsUsed } from '@/lib/inbox/saved-replies'
import { batchBodyProblem } from '@/lib/inbox/batch/body'
import { sendBatchReply, undoBatchReply, type BatchSkipReason } from '@/lib/inbox/batch/actions'

export interface BatchGroupView {
  label: string
  threads: Array<{ id: string; subject: string | null; sender: string; snippet: string | null }>
}

// A batch body cannot carry a balance, so the one saved reply built on
// {{balance}} is not offered here.
const BATCH_SAVED_REPLIES = SAVED_REPLIES.filter((r) => !fieldsUsed(r.text).has('balance'))

const SKIP_TEXT: Record<BatchSkipReason, string> = {
  not_found: 'no longer in the inbox',
  not_open: 'closed or set to waiting',
  already_sending: 'a reply is already on its way',
  no_sender: 'no sender address to reply to',
  failed: 'couldn’t be queued — it’s left as a draft in its conversation',
}

/**
 * BL-101 A9 — "Similar questions" above the inbox list. Offers each group
 * of look-alike open threads (lib/inbox/batch/group.ts) one reply. The
 * board ticks the threads, writes or picks the reply, and confirms the
 * count; every reply then goes through the ordinary approve-and-send path.
 * Nothing sends without that confirm.
 */
export function BatchBanner({ groups }: { groups: BatchGroupView[] }) {
  const [active, setActive] = useState<BatchGroupView | null>(null)
  if (groups.length === 0) return null
  return (
    <section aria-label="Similar questions" className="space-y-2 border-b border-border bg-subtle/60 px-3 py-3 sm:px-4">
      {groups.map((g) => (
        <div key={g.threads[0]!.id} className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <Layers className="mr-1.5 inline size-4 text-muted" aria-hidden />
            <span className="font-medium">{g.threads.length} similar questions</span>
            <span className="text-muted"> · {g.label}</span>
          </p>
          <Button type="button" size="sm" variant="secondary" onClick={() => setActive(g)}>
            Answer all {g.threads.length}
          </Button>
        </div>
      ))}
      {active ? <BatchDialog key={active.threads[0]!.id} group={active} onClose={() => setActive(null)} /> : null}
    </section>
  )
}

type Step = 'compose' | 'confirm' | 'done'

function BatchDialog({ group, onClose }: { group: BatchGroupView; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(group.threads.map((t) => t.id)))
  const [body, setBody] = useState('')
  const [closeThreads, setCloseThreads] = useState(true)
  const [step, setStep] = useState<Step>('compose')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    queued: string[]
    skipped: Array<{ threadId: string; reason: BatchSkipReason }>
    sendAfter: string | null
  } | null>(null)
  const [undoNote, setUndoNote] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (step !== 'done') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [step])

  const count = selected.size
  const problem = batchBodyProblem(body)

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function applySaved(id: string) {
    const reply = BATCH_SAVED_REPLIES.find((r) => r.id === id)
    if (reply) setBody(`Hi {{first_name}},\n\n${reply.text}\n\n`)
  }

  function send() {
    setError(null)
    startTransition(async () => {
      const r = await sendBatchReply({ threadIds: [...selected], body, confirmCount: count, closeThreads })
      if (!r.ok) {
        setError(r.error)
        setStep('compose')
        return
      }
      setResult({ queued: r.queued, skipped: r.skipped, sendAfter: r.sendAfter })
      setStep('done')
    })
  }

  function undoAll() {
    if (!result || result.queued.length === 0) return
    startTransition(async () => {
      const r = await undoBatchReply({ draftIds: result.queued })
      if (!r.ok) {
        setUndoNote(r.error)
        return
      }
      setUndoNote(
        r.tooLate > 0
          ? `Stopped ${r.cancelled}. ${r.tooLate} had already sent.`
          : `Stopped all ${r.cancelled}. Nothing was sent.`,
      )
      setResult({ ...result, queued: [] })
    })
  }

  const secondsLeft = result?.sendAfter ? Math.max(0, Math.ceil((Date.parse(result.sendAfter) - now) / 1000)) : 0
  const subjectFor = (id: string) => group.threads.find((t) => t.id === id)?.subject ?? '(no subject)'

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        size="lg"
        title={step === 'done' ? 'Batch reply queued' : `Answer ${group.threads.length} similar questions`}
        description={
          step === 'done'
            ? undefined
            : 'One reply, sent separately to each resident you tick. Each email is addressed only to that resident.'
        }
      >
        {step === 'compose' ? (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">Conversations ({count} selected)</legend>
              <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
                {group.threads.map((t) => (
                  <li key={t.id}>
                    <Checkbox
                      checked={selected.has(t.id)}
                      onChange={(e) => toggle(t.id, e.currentTarget.checked)}
                      label={`${t.sender} · ${t.subject ?? '(no subject)'}`}
                      description={t.snippet ?? undefined}
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
            <Field label="Start from a saved reply" hint="Optional. It fills the message below for you to edit.">
              <Select
                placeholder="Pick a saved reply"
                onValueChange={applySaved}
                options={BATCH_SAVED_REPLIES.map((r) => ({ value: r.id, label: r.title }))}
              />
            </Field>
            <Field
              label="Message"
              required
              hint="{{first_name}} becomes each resident’s first name. Balances and other account details can’t go in a batch reply."
            >
              <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <Checkbox
              checked={closeThreads}
              onChange={(e) => setCloseThreads(e.currentTarget.checked)}
              label="Close these conversations after sending"
            />
            {body.trim() && problem ? <Alert variant="warning">{problem}</Alert> : null}
            {error ? <Alert variant="error">{error}</Alert> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" disabled={count < 2 || Boolean(problem)} onClick={() => setStep('confirm')}>
                Review and send
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'confirm' ? (
          <div className="space-y-4">
            <Alert variant="warning">
              Send this reply to {count} residents? Each gets their own email. Every reply waits 30 seconds before it
              sends, and you can undo them all in that time.
            </Alert>
            <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-foreground-secondary">
              {[...selected].map((id) => (
                <li key={id}>{subjectFor(id)}</li>
              ))}
            </ul>
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-subtle p-3 text-sm text-foreground">{body.trim()}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep('compose')} disabled={pending}>
                Back
              </Button>
              <Button type="button" icon={<Send aria-hidden />} loading={pending} onClick={send}>
                Send to {count} residents
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'done' && result ? (
          <div className="space-y-3">
            <Alert variant="success">
              {result.queued.length > 0
                ? `${result.queued.length} ${result.queued.length === 1 ? 'reply' : 'replies'} queued.${secondsLeft > 0 ? ` Sending in ${secondsLeft}s.` : ''}`
                : undoNote ?? 'No replies were queued.'}
            </Alert>
            {result.skipped.length > 0 ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">Not sent ({result.skipped.length}):</p>
                <ul className="list-disc space-y-0.5 pl-5 text-foreground-secondary">
                  {result.skipped.map((s) => (
                    <li key={s.threadId}>
                      {subjectFor(s.threadId)} — {SKIP_TEXT[s.reason]}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {undoNote && result.queued.length > 0 ? <Alert variant="error">{undoNote}</Alert> : null}
            <div className="flex justify-end gap-2">
              {result.queued.length > 0 && secondsLeft > 0 ? (
                <Button type="button" variant="secondary" icon={<Undo2 aria-hidden />} loading={pending} onClick={undoAll}>
                  Undo all
                </Button>
              ) : null}
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
