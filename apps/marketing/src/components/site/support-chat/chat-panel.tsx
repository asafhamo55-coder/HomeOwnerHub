'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { SUPPORT_EMAIL } from '../../../lib/chat/facts'
import { MAX_MESSAGE_CHARS, MAX_USER_TURNS } from '../../../lib/chat/limits'
import { submitSupportRequest } from '../../../lib/chat/support-actions'

export const GREETING =
  'Hello. Ask me about pricing, features, signing in, importing your owner list or Georgia HOA law.'

export const SUGGESTIONS = [
  'How much does it cost?',
  'Can I import my owner list?',
  "How do Georgia's new HOA rules affect us?",
  "I can't sign in",
] as const

const UNAVAILABLE = 'The chat is not available yet. A person can help you instead. Please choose Talk to a person.'

interface Source {
  title: string
  url: string
}
interface Msg {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  offerPerson?: boolean
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

const ROLES = [
  { value: 'board', label: 'Board member' },
  { value: 'homeowner', label: 'Homeowner' },
  { value: 'looking', label: 'Just looking' },
] as const

export default function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<'chat' | 'person'>('chat')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [available, setAvailable] = useState(true)
  const [seed, setSeed] = useState('')

  // Ask once whether the chat is switched on, so a missing key shows a note up front.
  useEffect(() => {
    let live = true
    fetch('/api/chat')
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((j: { available?: boolean }) => live && setAvailable(j.available !== false))
      .catch(() => live && setAvailable(false))
    return () => {
      live = false
    }
  }, [])

  // Focus on open; Escape and the Tab trap while open.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => (input.current ?? dialog.current)?.focus(), 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialog.current) return
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hidden)
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      if (e.shiftKey && (active === first || !dialog.current.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !dialog.current.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, view])

  useEffect(() => {
    const el = list.current
    if (el && msgs.length > 0) el.scrollTop = el.scrollHeight
  }, [msgs, busy])

  const userTurns = msgs.filter((m) => m.role === 'user').length
  const atLimit = userTurns >= MAX_USER_TURNS

  const ask = useCallback(
    async (text: string) => {
      const q = text.trim().slice(0, MAX_MESSAGE_CHARS)
      if (!q || busy || userTurns >= MAX_USER_TURNS) return
      const next: Msg[] = [...msgs, { role: 'user', content: q }]
      setMsgs(next)
      setDraft('')
      setBusy(true)
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
        })
        const j = (await res.json().catch(() => ({}))) as {
          answer?: string
          sources?: Source[]
          offerPerson?: boolean
          error?: { code?: string; message?: string }
        }
        if (!res.ok) {
          const unavailable = res.status === 503
          if (unavailable) setAvailable(false)
          setMsgs([
            ...next,
            {
              role: 'assistant',
              content: unavailable ? UNAVAILABLE : (j.error?.message ?? 'Something went wrong. Please try again.'),
              offerPerson: true,
            },
          ])
        } else if (j.offerPerson || !j.answer) {
          setMsgs([
            ...next,
            {
              role: 'assistant',
              content: 'I could not find that on our site or in our help articles. A person can answer it.',
              offerPerson: true,
            },
          ])
        } else {
          setMsgs([...next, { role: 'assistant', content: j.answer, sources: j.sources ?? [] }])
        }
      } catch {
        setMsgs([...next, { role: 'assistant', content: 'I could not reach the chat. Please try again.', offerPerson: true }])
      } finally {
        setBusy(false)
      }
    },
    [busy, msgs, userTurns],
  )

  const lastQuestion = [...msgs].reverse().find((m) => m.role === 'user')?.content ?? ''

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={`fixed inset-0 z-[90] ${open ? 'flex' : 'hidden'} flex-col bg-surface text-foreground outline-none print:hidden md:inset-auto md:bottom-6 md:right-6 md:h-[600px] md:max-h-[calc(100dvh-3rem)] md:w-[400px] md:rounded-2xl md:border md:border-border md:shadow-xl`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 id={titleId} className="text-lg font-semibold">
          Help
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-base font-medium text-foreground-secondary hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Close
        </button>
      </header>

      {view === 'chat' ? (
        <>
          <div
            ref={list}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Conversation"
            className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3"
          >
            <Bubble role="assistant">{GREETING}</Bubble>
            {!available && msgs.length === 0 && (
              <p className="rounded-xl border border-border-strong px-4 py-2 text-base text-foreground">
                The chat is not available yet. You can still send your question to a person.
              </p>
            )}
            {msgs.length === 0 && (
              <ul className="space-y-1.5" aria-label="Suggested questions">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => ask(s)}
                      className="min-h-11 w-full rounded-xl border border-border-strong bg-surface px-4 py-1.5 text-left text-base leading-snug font-medium text-foreground hover:bg-primary-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {msgs.map((m, i) => (
              <div key={i}>
                <Bubble role={m.role}>{m.content}</Bubble>
                {m.sources && m.sources.length > 0 && (
                  <p className="mt-2 text-base text-muted">
                    From:{' '}
                    {m.sources.map((s, n) => (
                      <span key={s.url}>
                        {n > 0 && ', '}
                        <a
                          href={s.url}
                          {...(s.url.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                          className="font-medium text-primary underline underline-offset-2"
                        >
                          {s.title}
                        </a>
                      </span>
                    ))}
                  </p>
                )}
                {m.offerPerson && (
                  <button
                    type="button"
                    onClick={() => {
                      setSeed(lastQuestion)
                      setView('person')
                    }}
                    className="mt-2 min-h-11 rounded-xl bg-primary px-4 text-base font-semibold text-primary-fg hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Talk to a person
                  </button>
                )}
              </div>
            ))}
            {busy && (
              <p role="status" className="text-base text-muted">
                Looking that up...
              </p>
            )}
          </div>

          <div className="border-t border-border px-4 pb-3 pt-3">
            {atLimit ? (
              <p className="text-base text-foreground">This chat is long enough. Please talk to a person for anything else.</p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void ask(draft)
                }}
                className="flex items-end gap-2"
              >
                <label htmlFor={`${titleId}-q`} className="sr-only">
                  Your question
                </label>
                <textarea
                  id={`${titleId}-q`}
                  ref={input}
                  rows={1}
                  value={draft}
                  maxLength={MAX_MESSAGE_CHARS}
                  placeholder="Type your question"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void ask(draft)
                    }
                  }}
                  className="min-h-11 flex-1 resize-none rounded-xl border border-input bg-surface px-3 py-2 text-lg text-foreground placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  className="min-h-11 rounded-xl bg-primary px-4 text-base font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Send
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={() => {
                setSeed(lastQuestion)
                setView('person')
              }}
              className="mt-2 min-h-11 w-full rounded-xl border border-foreground px-4 text-base font-semibold text-foreground hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Talk to a person
            </button>
          </div>
        </>
      ) : (
        <PersonForm seed={seed} onBack={() => setView('chat')} />
      )}
    </div>
  )
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const mine = role === 'user'
  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
      <p
        className={
          'max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[17px] leading-snug ' +
          (mine ? 'bg-primary text-primary-fg' : 'bg-subtle text-foreground')
        }
      >
        {children}
      </p>
    </div>
  )
}

function PersonForm({ seed, onBack }: { seed: string; onBack: () => void }) {
  const id = useId()
  const [state, setState] = useState<
    { status: 'idle' | 'sending' | 'sent' } | { status: 'error'; message: string; fieldErrors?: Record<string, string> }
  >({ status: 'idle' })
  const [copied, setCopied] = useState(false)

  const field =
    'min-h-11 w-full rounded-xl border border-input bg-surface px-3 py-2 text-lg text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring'
  const errs = state.status === 'error' ? (state.fieldErrors ?? {}) : {}

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL)
      setCopied(true)
    } catch {
      /* The address is selectable text; copying by hand still works. */
    }
  }

  if (state.status === 'sent') {
    return (
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6" role="status">
        <p className="text-lg font-semibold">Thank you. Your question was sent.</p>
        <p className="text-[17px] text-foreground-secondary">A person will reply to the email you gave us.</p>
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 rounded-xl border border-foreground px-4 text-base font-semibold hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Back to the chat
        </button>
      </div>
    )
  }

  return (
    <form
      className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
      onSubmit={async (e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        setState({ status: 'sending' })
        const res = await submitSupportRequest({
          name: String(f.get('name') ?? ''),
          email: String(f.get('email') ?? ''),
          question: String(f.get('question') ?? ''),
          role: String(f.get('role') ?? 'looking'),
          website: String(f.get('website') ?? ''),
        }).catch(() => ({ status: 'error' as const, message: `We could not send that. Please email ${SUPPORT_EMAIL} directly.` }))
        setState(res.status === 'sent' ? { status: 'sent' } : res)
      }}
    >
      <p className="text-[17px] text-foreground-secondary">Tell us what you need. A person will reply by email.</p>
      <div>
        <label htmlFor={`${id}-name`} className="mb-1 block text-base font-medium">
          Your name
        </label>
        <input id={`${id}-name`} name="name" autoComplete="name" required className={field} aria-invalid={Boolean(errs.name)} />
        {errs.name && <p className="mt-1 text-base text-danger">{errs.name}</p>}
      </div>
      <div>
        <label htmlFor={`${id}-email`} className="mb-1 block text-base font-medium">
          Your email
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          className={field}
          aria-invalid={Boolean(errs.email)}
        />
        {errs.email && <p className="mt-1 text-base text-danger">{errs.email}</p>}
      </div>
      <fieldset>
        <legend className="mb-1 text-base font-medium">I am a</legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r, i) => (
            <label
              key={r.value}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border-strong px-3 text-base has-[:checked]:border-primary has-[:checked]:bg-primary-subtle"
            >
              <input type="radio" name="role" value={r.value} defaultChecked={i === 2} className="h-5 w-5 accent-primary" />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${id}-q`} className="mb-1 block text-base font-medium">
          Your question
        </label>
        <textarea
          id={`${id}-q`}
          name="question"
          rows={4}
          required
          maxLength={2000}
          defaultValue={seed}
          className={field}
          aria-invalid={Boolean(errs.question)}
        />
        {errs.question && <p className="mt-1 text-base text-danger">{errs.question}</p>}
      </div>
      {/* Honeypot: hidden from people and from assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state.status === 'error' && !state.fieldErrors && (
        <p role="alert" className="text-base text-danger">
          {state.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={state.status === 'sending'}
          className="min-h-11 rounded-xl bg-primary px-5 text-base font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {state.status === 'sending' ? 'Sending...' : 'Send to a person'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 rounded-xl px-4 text-base font-medium hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Back
        </button>
      </div>
      <div className="rounded-xl bg-subtle p-3 text-base">
        <p className="mb-1">Or email us yourself:</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="select-all font-medium">{SUPPORT_EMAIL}</span>
          <button
            type="button"
            onClick={copy}
            className="min-h-11 rounded-lg border border-border-strong px-3 text-base font-medium hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {copied ? 'Copied' : 'Copy address'}
          </button>
        </div>
      </div>
    </form>
  )
}
