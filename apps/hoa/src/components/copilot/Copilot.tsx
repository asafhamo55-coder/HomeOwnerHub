'use client'

import * as React from 'react'
import { Send, Sparkles, X } from 'lucide-react'
import { Button, Textarea, cn } from '@homeowner-portal/ui'
import { CopilotMessage, type Citation, type Confidence, type Message } from './CopilotMessage'

// Right-side persistent copilot. Mounted once in DashboardProviders so it
// survives soft navigations across all (dashboard)/* routes.
//
// Backend: /api/ai/ask-community — the tool-using agent that can both
// (a) search the governing docs via W1 RAG and (b) query the live HOA
// database (units, dues, violations, meetings, etc.). The LLM picks
// which tools to call per question.
//
// citations + confidence are populated only when the agent's answer
// pulled from governing docs; pure data answers ("how many properties")
// come back without them — the UI degrades cleanly.

interface AskResponse {
  answer: string
  confidence?: Confidence
  citations?: Citation[]
  runId?: string
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result: unknown }>
  steps?: number
}

const STORAGE_KEY = 'hoa.copilot.open'
const MIN_QUESTION_LENGTH = 3
const MAX_TEXTAREA_ROWS = 5
const MIN_TEXTAREA_ROWS = 2

const SAMPLE_QUESTIONS = [
  'Can I paint my front door red?',
  'How many pets am I allowed?',
  'When are HOA dues due each month?',
  'How long can I park a guest car on the street?',
]

export function Copilot() {
  // Default to closed so existing users aren't surprised. We hydrate the
  // persisted preference in a useEffect to avoid an SSR/CSR mismatch.
  const [open, setOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)

  const listRef = React.useRef<HTMLDivElement | null>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  // Hydrate persisted open state.
  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY)
      if (v === '1') setOpen(true)
    } catch {
      // ignore — private mode etc.
    }
  }, [])

  // Persist open state.
  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
    } catch {
      // ignore
    }
  }, [open])

  // Auto-scroll to the bottom whenever the message list grows or a pending
  // bubble flips state.
  React.useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  const canSend = draft.trim().length >= MIN_QUESTION_LENGTH && !sending

  async function send(question: string) {
    const trimmed = question.trim()
    if (trimmed.length < MIN_QUESTION_LENGTH || sending) return

    const userId = makeId()
    const placeholderId = makeId()

    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', content: trimmed },
      { id: placeholderId, role: 'assistant', content: '', pending: true },
    ])
    setDraft('')
    setSending(true)

    try {
      const res = await fetch('/api/ai/ask-community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      })
      const json = (await res.json()) as
        | AskResponse
        | { error: string; message?: string }

      if (!res.ok) {
        const err = json as { error: string; message?: string }
        replaceMessage(placeholderId, {
          id: placeholderId,
          role: 'assistant',
          content:
            "I couldn't answer that — please try again or use the full Ask the Docs page.",
          error: err.message ?? err.error,
        })
      } else {
        const data = json as AskResponse
        replaceMessage(placeholderId, {
          id: placeholderId,
          role: 'assistant',
          content: data.answer,
          citations: data.citations,
          confidence: data.confidence,
          runId: data.runId,
        })
      }
    } catch (err) {
      replaceMessage(placeholderId, {
        id: placeholderId,
        role: 'assistant',
        content:
          "I couldn't answer that — please try again or use the full Ask the Docs page.",
        error: err instanceof Error ? err.message : 'Network error',
      })
    } finally {
      setSending(false)
    }
  }

  function replaceMessage(id: string, next: Message) {
    setMessages((prev) => prev.map((m) => (m.id === id ? next : m)))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSend) void send(draft)
    }
  }

  function handleClear() {
    setMessages([])
  }

  // Collapsed strip — narrow vertical rail. Mirrors the right-anchored
  // floating-UI pattern used by Toast (`fixed right-4 z-50`), but one z-layer
  // below the toast viewport so toasts always win.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open copilot"
        title="Open copilot"
        className={cn(
          'group fixed right-3 top-1/2 z-30 hidden -translate-y-1/2 md:flex',
          'h-24 w-10 flex-col items-center justify-center gap-2 rounded-l-xl rounded-r-md',
          'border border-border bg-surface text-muted shadow-md',
          'transition-all hover:text-foreground hover:shadow-lg hover:w-11',
        )}
      >
        <Sparkles className="h-4 w-4 text-primary" aria-hidden />
        <span className="text-[10px] font-medium uppercase tracking-wider [writing-mode:vertical-rl]">
          Copilot
        </span>
      </button>
    )
  }

  return (
    <aside
      role="complementary"
      aria-label="Copilot"
      className={cn(
        'fixed right-3 top-3 bottom-3 z-30 hidden w-96 md:flex',
        'flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl',
        'animate-slide-in-right',
      )}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">Copilot</h2>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Ask anything about your community&apos;s rules.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={handleClear}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted hover:bg-background hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close copilot"
            className="rounded p-1 text-muted hover:bg-background hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      {/* Message list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 ? (
          <EmptyState
            onPick={(q) => {
              setDraft(q)
              textareaRef.current?.focus()
            }}
          />
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <CopilotMessage key={m.id} message={m} />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-surface p-3">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your rules… (Enter to send, Shift+Enter for newline)"
          rows={MIN_TEXTAREA_ROWS}
          className="resize-none"
          style={{ maxHeight: `${MAX_TEXTAREA_ROWS * 1.6}rem` }}
          disabled={sending}
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[10px] text-muted">
            Answers cite your community&apos;s docs.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => void send(draft)}
            disabled={!canSend}
            loading={sending}
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            Send
          </Button>
        </div>
      </div>
    </aside>
  )
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-5 w-5 text-primary" aria-hidden />
      </div>
      <p className="text-sm text-muted">
        Ask a question about your community&apos;s rules. I&apos;ll cite the
        section.
      </p>
      <div className="flex w-full flex-col gap-1.5">
        {SAMPLE_QUESTIONS.slice(0, 3).map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className={cn(
              'w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-foreground',
              'transition-colors hover:border-primary/40 hover:bg-surface',
            )}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function makeId(): string {
  // crypto.randomUUID may not exist in very old browsers; fall back safely.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
