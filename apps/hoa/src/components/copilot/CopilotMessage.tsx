'use client'

import { Badge, cn } from '@homeowner-portal/ui'

// Shared message shape — kept here so Copilot.tsx and any future consumer
// import the same contract. Mirrors the AskResponse type in
// (dashboard)/ai/ask/AskDocsClient.tsx so we stay 1:1 with the
// /api/ai/ask-docs contract.

export type Role = 'user' | 'assistant'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface Citation {
  chunkId: string
  documentId: string
  docType: string
  section: string | null
}

export interface Message {
  id: string
  role: Role
  content: string
  citations?: Citation[]
  confidence?: Confidence
  runId?: string
  /** assistant placeholder waiting on the network */
  pending?: boolean
  /** small muted detail line (used for error context) */
  error?: string
}

export function CopilotMessage({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-fg shadow-sm">
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
      </div>
    )
  }

  // Assistant
  if (message.pending) {
    return (
      <div className="flex justify-start">
        <div
          className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface px-3 py-2.5 text-sm shadow-sm"
          aria-live="polite"
          aria-label="Copilot is thinking"
        >
          <span className="inline-flex items-center gap-1">
            <Dot delay="0ms" />
            <Dot delay="150ms" />
            <Dot delay="300ms" />
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2 rounded-2xl rounded-bl-sm border border-border bg-surface px-3 py-2 text-sm shadow-sm">
        <p className="whitespace-pre-wrap leading-relaxed text-foreground">
          {message.content}
        </p>

        {message.citations && message.citations.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
            {message.citations.map((c) => (
              <Badge
                key={c.chunkId}
                variant="outline"
                className="gap-1 text-[10px] font-normal"
              >
                <span className="font-medium">{capitalize(c.docType)}</span>
                <span className="text-muted">{c.section ?? '—'}</span>
              </Badge>
            ))}
          </div>
        ) : null}

        {message.confidence ? (
          <p
            className={cn(
              'text-[10px] font-medium uppercase tracking-wide',
              message.confidence === 'HIGH' && 'text-emerald-700',
              message.confidence === 'MEDIUM' && 'text-amber-700',
              message.confidence === 'LOW' && 'text-muted',
            )}
          >
            Confidence: {message.confidence}
          </p>
        ) : null}

        {message.error ? (
          <p className="text-[10px] text-muted/80">{message.error}</p>
        ) : null}
      </div>
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-muted"
      style={{ animationDelay: delay }}
      aria-hidden
    />
  )
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s
}
