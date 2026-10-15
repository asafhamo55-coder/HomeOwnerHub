'use client'

import * as React from 'react'
import { Send, Sparkles, X } from 'lucide-react'
import { Button, Textarea, cn } from '@homeowner-portal/ui'
import { CopilotMessage, type Citation, type Confidence, type Message } from './CopilotMessage'

// Board copilot. Three pieces share one open/closed state:
//
//   <CopilotProvider>  — in DashboardProviders, so the conversation and the
//                        open state survive soft navigations.
//   <CopilotTrigger/>  — a button in the AppShell top bar (no more floating
//                        side tab covering the right edge of the page).
//   <Copilot/>         — the panel, rendered INSIDE <AppShell> after
//                        <AppShellMain>. AppShell is a flex row, so at lg+
//                        the panel is an in-flow column and the page narrows
//                        to make room; it never covers content. Below lg it
//                        is an overlay (full-screen on phones).
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

interface CopilotState {
  open: boolean
  setOpen: (v: boolean) => void
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
}

const CopilotContext = React.createContext<CopilotState | null>(null)

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  // Default to closed; the persisted preference is hydrated in an effect
  // to avoid an SSR/CSR mismatch.
  const [open, setOpenState] = React.useState(false)
  const [messages, setMessages] = React.useState<Message[]>([])

  // Reopen on load only on desktop, where the panel sits beside the page.
  // On a phone it is full-screen, so auto-reopening would hide the page.
  React.useEffect(() => {
    try {
      if (
        window.localStorage.getItem(STORAGE_KEY) === '1' &&
        window.matchMedia('(min-width: 1024px)').matches
      ) {
        setOpenState(true)
      }
    } catch {
      // ignore — private mode etc.
    }
  }, [])

  const setOpen = React.useCallback((v: boolean) => {
    setOpenState(v)
    try {
      window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
    } catch {
      // ignore
    }
  }, [])

  const value = React.useMemo(
    () => ({ open, setOpen, messages, setMessages }),
    [open, setOpen, messages],
  )
  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
}

function useCopilot(): CopilotState {
  const ctx = React.useContext(CopilotContext)
  if (!ctx) throw new Error('Copilot components must be rendered inside <CopilotProvider>')
  return ctx
}

/** Top-bar toggle. Icon-only below xl, labelled from xl. */
export function CopilotTrigger() {
  const { open, setOpen } = useCopilot()
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls="copilot-panel"
      aria-label={open ? 'Close copilot' : 'Open copilot'}
      title="Copilot"
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        open
          ? 'bg-accent-subtle text-accent-fg'
          : 'text-foreground-secondary hover:bg-subtle hover:text-foreground',
      )}
    >
      <Sparkles className="size-4 shrink-0" aria-hidden />
      <span className="hidden xl:inline">Copilot</span>
    </button>
  )
}

export function Copilot() {
  const { open, setOpen, messages, setMessages } = useCopilot()
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)

  const listRef = React.useRef<HTMLDivElement | null>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  // Auto-scroll to the bottom whenever the message list grows or a pending
  // bubble flips state.
  React.useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, open])

  // Focus the composer when the panel opens; Esc closes it (unless a menu
  // or dialog already handled the key).
  React.useEffect(() => {
    if (!open) return
    textareaRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

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

  if (!open) return null

  return (
    <aside
      id="copilot-panel"
      aria-label="Copilot"
      className={cn(
        // Phone: full-screen. Tablet: right overlay. lg+: in-flow column
        // stretched to the page height (surface + border never stop short).
        'fixed inset-0 z-modal flex flex-col bg-surface',
        'md:inset-y-0 md:left-auto md:w-96 md:border-l md:border-border md:shadow-xl',
        'lg:relative lg:inset-auto lg:z-20 lg:shrink-0 lg:self-stretch lg:shadow-none',
        'animate-slide-in-right print:hidden',
      )}
    >
      {/* At lg+ this wrapper sticks to the viewport while the page scrolls. */}
      <div className="flex h-full min-h-0 flex-col pb-[env(safe-area-inset-bottom)] lg:sticky lg:top-0 lg:h-dvh">
        <header className="flex h-topbar shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent-fg">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold leading-tight text-foreground">Copilot</h2>
              <p className="truncate text-xs text-muted">Rules, records and numbers for your community</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {messages.length > 0 ? (
              <Button type="button" variant="ghost" size="xs" onClick={() => setMessages([])}>
                Clear
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setOpen(false)}
              aria-label="Close copilot"
              icon={<X aria-hidden />}
            />
          </div>
        </header>

        {/* Message list */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
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
        <div className="shrink-0 border-t border-border bg-surface p-3">
          <label htmlFor="copilot-composer" className="sr-only">
            Ask Copilot
          </label>
          <Textarea
            id="copilot-composer"
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your rules or records…"
            rows={MIN_TEXTAREA_ROWS}
            className="resize-none"
            style={{ maxHeight: `${MAX_TEXTAREA_ROWS * 1.6}rem` }}
            disabled={sending}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted">Enter to send · Shift+Enter for a new line</p>
            <Button
              type="button"
              size="sm"
              onClick={() => void send(draft)}
              disabled={!canSend}
              loading={sending}
              icon={<Send aria-hidden />}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-accent-subtle text-accent-fg">
        <Sparkles className="size-5" aria-hidden />
      </div>
      <p className="text-sm text-muted">
        Ask a question about your community&apos;s rules or records. Answers from the governing
        documents cite the section.
      </p>
      <div className="flex w-full flex-col gap-1.5">
        {SAMPLE_QUESTIONS.slice(0, 3).map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className={cn(
              'w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-foreground',
              'transition-colors duration-fast hover:border-border-strong hover:bg-subtle',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
