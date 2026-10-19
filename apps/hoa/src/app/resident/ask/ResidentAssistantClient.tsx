'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, Send, Sparkles } from 'lucide-react'
import { Button, Textarea, cn } from '@homeowner-portal/ui'
import { apiErrorMessage } from '@/lib/api/client'
import { CopilotMessage, type Citation, type Confidence, type Message } from '@/components/copilot/CopilotMessage'
import { HANDOFF_LABEL, handoffHref, type Handoff } from '@/lib/resident-assistant/handoff'

// BL-096 — the resident assistant chat on /resident/ask. Reuses the board
// Copilot's message bubbles (CopilotMessage); the backend is
// /api/ai/resident-assistant.
//
// The conversation lives in this tab's sessionStorage only: it survives a
// refresh or a trip to the Pay screen, and is gone when the tab closes.
// The server keeps none of it.

interface AssistantMessage extends Message {
  handoffs?: Handoff[]
}

interface AssistantResponse {
  answer: string
  citations?: Citation[]
  confidence?: Confidence
  handoffs?: Handoff[]
  docsUnanswered?: boolean
}

export const STARTER_QUESTIONS = [
  'What do I owe?',
  'Can I paint my front door?',
  'Where’s my ARC request?',
  'When is the next meeting?',
]

const MIN_LENGTH = 2
/** Turns of history sent with each message (the route caps it too). */
const HISTORY_TURNS = 12
const FAILED_REPLY = "I couldn't answer that just now. Please try again in a moment."

function load(key: string): AssistantMessage[] {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return (parsed as AssistantMessage[]).filter(
      (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && !m.pending,
    )
  } catch {
    return []
  }
}

function save(key: string, messages: AssistantMessage[]) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(messages.filter((m) => !m.pending)))
  } catch {
    // private mode / quota: the chat still works, it just won't survive a refresh
  }
}

export function ResidentAssistantClient({ storageKey }: { storageKey: string }) {
  const [messages, setMessages] = React.useState<AssistantMessage[]>([])
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [hydrated, setHydrated] = React.useState(false)
  const endRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null)

  React.useEffect(() => {
    setMessages(load(storageKey))
    setHydrated(true)
  }, [storageKey])

  React.useEffect(() => {
    if (hydrated) save(storageKey, messages)
  }, [hydrated, storageKey, messages])

  React.useEffect(() => {
    if (messages.length > 0) endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages])

  const canSend = draft.trim().length >= MIN_LENGTH && !sending

  async function send(text: string) {
    const question = text.trim()
    if (question.length < MIN_LENGTH || sending) return
    const userMsg: AssistantMessage = { id: makeId(), role: 'user', content: question }
    const pendingId = makeId()
    // Only answered turns go back as history; a failed reply is not context.
    const history = [...messages, userMsg]
      .filter((m) => !m.pending && !m.error && m.content)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))

    setMessages((prev) => [...prev, userMsg, { id: pendingId, role: 'assistant', content: '', pending: true }])
    setDraft('')
    setSending(true)

    const replace = (next: AssistantMessage) => setMessages((prev) => prev.map((m) => (m.id === pendingId ? next : m)))
    try {
      const res = await fetch('/api/ai/resident-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })
      const json: unknown = await res.json().catch(() => null)
      if (!res.ok || !json) {
        replace({ id: pendingId, role: 'assistant', content: FAILED_REPLY, error: apiErrorMessage(json, 'The assistant is unavailable right now.') })
        return
      }
      const data = json as AssistantResponse
      replace({
        id: pendingId,
        role: 'assistant',
        content: data.answer,
        citations: data.citations,
        confidence: data.citations && data.citations.length > 0 ? data.confidence : undefined,
        handoffs: data.handoffs ?? [],
      })
    } catch {
      replace({ id: pendingId, role: 'assistant', content: FAILED_REPLY, error: 'Check your connection and try again.' })
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends on a keyboard; on a phone the return key inserts a line
    // and the Send button sends.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault()
      if (canSend) void send(draft)
    }
  }

  return (
    <div className="space-y-4">
      <div role="log" aria-live="polite" aria-label="Conversation" className="space-y-3">
        {messages.length === 0 ? (
          <Starters
            onPick={(q) => {
              void send(q)
            }}
            disabled={sending}
          />
        ) : (
          messages.map((m) => (
            <div key={m.id} className="space-y-2">
              <CopilotMessage message={m} />
              {m.role === 'assistant' && m.handoffs && m.handoffs.length > 0 ? <Handoffs handoffs={m.handoffs} /> : null}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form
        className="space-y-2 rounded-2xl border border-border bg-surface p-3 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSend) void send(draft)
        }}
      >
        <label htmlFor="resident-assistant-input" className="sr-only">
          Your question
        </label>
        <Textarea
          id="resident-assistant-input"
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about your dues, requests or community rules…"
          rows={2}
          maxLength={2000}
          className="resize-none text-base sm:text-sm"
          disabled={sending}
        />
        <div className="flex items-center justify-between gap-2">
          {messages.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={sending}
              onClick={() => {
                setMessages([])
                inputRef.current?.focus()
              }}
            >
              New chat
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="sm" disabled={!canSend} loading={sending} icon={<Send aria-hidden />}>
            Send
          </Button>
        </div>
      </form>

      <p className="text-center text-xs text-muted">
        Not legal advice — the board decides. Answers about rules cite your community’s documents. The assistant can
        only see your own account, and never changes anything for you.
      </p>
    </div>
  )
}

function Starters({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-accent-subtle text-accent-fg">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <p className="text-sm text-muted">
        Ask about your balance, your requests, upcoming meetings or your community’s rules.
      </p>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {STARTER_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            className={cn(
              'min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-left text-sm text-foreground',
              'transition-colors duration-fast hover:border-border-strong hover:bg-subtle',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
            )}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function Handoffs({ handoffs }: { handoffs: Handoff[] }) {
  return (
    <div className="ml-1 max-w-[85%] space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {handoffs.map((h) => (
          <Link
            key={h.action}
            href={handoffHref(h)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-fg hover:bg-primary/90"
          >
            {HANDOFF_LABEL[h.action]}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted">Opens the form with this filled in. You review it and send it yourself.</p>
    </div>
  )
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
