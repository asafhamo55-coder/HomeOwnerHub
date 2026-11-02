'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Field, Input, Textarea, useToast } from '@homeowner-portal/ui'
import { responseErrorMessage } from '@/lib/api/client'
import {
  BOARD_BODY_MAX,
  BOARD_REPORT_MAX,
  BOARD_TITLE_MAX,
  type BoardAction,
} from '@/lib/community-board/rules'

// Client pieces of the community board. Each one posts to /api/community-board/*
// and refreshes the page. Plain words, large buttons (text is 14px or more).

async function send(path: string, payload: unknown): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/community-board/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return { ok: false, error: await responseErrorMessage(res, 'That did not work. Please try again.') }
    return { ok: true, body: await res.json().catch(() => ({})) }
  } catch {
    return { ok: false, error: 'We could not reach the server. Check your connection and try again.' }
  }
}

export function NewThreadForm({ associationId, basePath }: { associationId: string; basePath: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function submit(fd: FormData) {
    setError(null)
    const title = String(fd.get('title') ?? '').trim()
    const body = String(fd.get('body') ?? '').trim()
    if (title.length < 3) return setError('Give your topic a short title.')
    if (!body) return setError('Write your message first.')
    start(async () => {
      const r = await send('threads', { associationId, title, body })
      if (!r.ok) return setError(r.error)
      formRef.current?.reset()
      toast({ tone: 'success', message: 'Your topic is posted.' })
      const id = (r.body as { threadId?: string }).threadId
      router.push(id ? `${basePath}/${id}` : basePath)
      router.refresh()
    })
  }

  return (
    <form ref={formRef} action={submit} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">Start a new topic</h2>
      <Field label="Title" error={null}>
        <Input name="title" maxLength={BOARD_TITLE_MAX} disabled={pending} />
      </Field>
      <Field label="Your message" error={error}>
        <Textarea name="body" rows={4} maxLength={BOARD_BODY_MAX} disabled={pending} />
      </Field>
      <p className="text-sm text-foreground-secondary">Only people in your community and its board can read this.</p>
      <Button type="submit" loading={pending}>
        Post topic
      </Button>
    </form>
  )
}

export function ReplyForm({ threadId }: { threadId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function submit(fd: FormData) {
    setError(null)
    const body = String(fd.get('body') ?? '').trim()
    if (!body) return setError('Write your reply first.')
    start(async () => {
      const r = await send('posts', { threadId, body })
      if (!r.ok) return setError(r.error)
      formRef.current?.reset()
      toast({ tone: 'success', message: 'Your reply is posted.' })
      router.refresh()
    })
  }

  return (
    <form ref={formRef} action={submit} className="space-y-3">
      <Field label="Your reply" error={error}>
        <Textarea name="body" rows={3} maxLength={BOARD_BODY_MAX} disabled={pending} />
      </Field>
      <Button type="submit" loading={pending}>
        Post reply
      </Button>
    </form>
  )
}

export function ReportButton({ postId, already }: { postId: string; already: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (already) return <span className="text-sm text-foreground-secondary">You reported this. The board will look at it.</span>
  if (!open) {
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Report this post
      </Button>
    )
  }

  function submit(fd: FormData) {
    setError(null)
    const reason = String(fd.get('reason') ?? '').trim()
    if (!reason) return setError('Tell the board what is wrong.')
    start(async () => {
      const r = await send('reports', { postId, reason })
      if (!r.ok) return setError(r.error)
      toast({ tone: 'success', message: 'Thank you. The board will look at this post.' })
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <form action={submit} className="space-y-2">
      <Field label="What is wrong with this post?" error={error}>
        <Textarea name="reason" rows={2} maxLength={BOARD_REPORT_MAX} disabled={pending} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          Send report
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** One board moderation action (hide, show, close, reopen, settle a report). */
export function ModerateButton({
  action,
  target,
  label,
}: {
  action: BoardAction
  target: { postId?: string; threadId?: string; reportId?: string }
  label: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  function run() {
    start(async () => {
      const r = await send('moderate', { action, ...target })
      if (!r.ok) return toast({ tone: 'error', message: r.error })
      toast({ tone: 'success', message: 'Done.' })
      router.refresh()
    })
  }

  return (
    <Button type="button" variant="secondary" loading={pending} onClick={run}>
      {label}
    </Button>
  )
}
