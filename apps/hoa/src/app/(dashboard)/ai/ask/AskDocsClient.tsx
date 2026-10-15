'use client'

import { useState } from 'react'
import { Database, FileText } from 'lucide-react'
import { Badge, TabGroup, TabList, Tab } from '@homeowner-portal/ui'
import {
  AnswerCard,
  AskComposer,
  AskError,
  SuggestedQuestions,
  Thinking,
} from '@/components/knowledge/AskUI'
import { GOVERNING_TYPE_LABELS, type AnswerConfidence } from '@/lib/status/knowledge'

type Mode = 'docs' | 'community'

interface Citation {
  chunkId: string
  documentId: string
  docType: string
  section: string | null
}

interface AskResponse {
  answer: string
  confidence: AnswerConfidence
  citations: Citation[]
  runId: string
}

interface CommunityToolCall {
  name: string
  args: Record<string, unknown>
  result: unknown
}

interface CommunityResponse {
  answer: string
  toolCalls: CommunityToolCall[]
  steps: number
}

const COMMON_QUESTIONS_DOCS = [
  'Can I paint my front door red?',
  'How many pets am I allowed?',
  'When are HOA dues due each month?',
  'Are short-term rentals like Airbnb allowed?',
]

const COMMON_QUESTIONS_COMMUNITY = [
  'How many properties are leased vs owner-occupied?',
  'Who is overdue on dues?',
  'How many open violations do we have?',
  'When was our last board meeting?',
]

function isCommunityResponse(r: AskResponse | CommunityResponse): r is CommunityResponse {
  return (r as CommunityResponse).toolCalls !== undefined
}

/** Tool names are snake_case identifiers; show them as words. */
function toolLabel(name: string): string {
  const words = name.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function AskDocsClient() {
  const [mode, setMode] = useState<Mode>('docs')
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [response, setResponse] = useState<AskResponse | CommunityResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function switchMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    handleClear()
  }

  function handleClear() {
    setQuestion('')
    setStatus('idle')
    setResponse(null)
    setErrorMessage(null)
  }

  async function ask() {
    const q = question.trim()
    if (q.length < 3) return
    setStatus('loading')
    setErrorMessage(null)
    setResponse(null)
    setAsked(q)

    try {
      // Both modes route to /api/ai/ask-community — the tool-using agent
      // picks search_governing_docs vs. the DB tools per question. The
      // mode toggle is a UX hint about what KIND of answer the user
      // expects (and seeds the suggestions), not a separate backend.
      const res = await fetch('/api/ai/ask-community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const json = await res.json().catch(() => null)

      if (!res.ok || !json) {
        const err = (json ?? {}) as { error?: string; message?: string }
        setErrorMessage(
          err.message ?? err.error ?? 'The assistant is unavailable right now. Try again in a minute.',
        )
        setStatus('error')
        return
      }

      setResponse(json as AskResponse | CommunityResponse)
      setStatus('done')
    } catch {
      setErrorMessage('Network error — check your connection and try again.')
      setStatus('error')
    }
  }

  const commonQuestions = mode === 'community' ? COMMON_QUESTIONS_COMMUNITY : COMMON_QUESTIONS_DOCS

  return (
    <div className="space-y-6">
      <TabGroup variant="segmented" value={mode} onValueChange={(v) => switchMode(v as Mode)}>
        <TabList aria-label="What to ask about">
          <Tab value="docs">
            <FileText className="size-4" aria-hidden />
            Governing docs
          </Tab>
          <Tab value="community">
            <Database className="size-4" aria-hidden />
            Community data
          </Tab>
        </TabList>
      </TabGroup>

      <AskComposer
        value={question}
        onChange={setQuestion}
        onSubmit={ask}
        pending={status === 'loading'}
        placeholder={
          mode === 'community'
            ? 'Ask about your community — e.g. who is overdue on dues?'
            : 'Ask about your governing documents — e.g. can I install a satellite dish?'
        }
        rewriteContext="Question to the governing-docs AI — rephrase for clarity"
      />

      {status === 'idle' ? (
        <SuggestedQuestions questions={commonQuestions} onPick={setQuestion} />
      ) : null}

      {status === 'loading' ? (
        <Thinking
          what={mode === 'community' ? 'Looking through your community records…' : 'Searching your governing documents…'}
        />
      ) : null}

      {status === 'error' && errorMessage ? <AskError message={errorMessage} onRetry={ask} /> : null}

      {status === 'done' && response ? (
        isCommunityResponse(response) ? (
          <AnswerCard
            question={asked}
            answer={response.answer}
            meta={
              <Badge variant="neutral" className="num">
                {response.toolCalls.length} data {response.toolCalls.length === 1 ? 'lookup' : 'lookups'}
              </Badge>
            }
            footer={
              <span>
                Answered from your records. Verify figures on the source page before acting on them.
              </span>
            }
          >
            {response.toolCalls.length > 0 ? (
              <details className="group rounded-lg border border-border">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-foreground-secondary hover:bg-subtle">
                  Data sources ({response.toolCalls.length})
                </summary>
                <ul className="space-y-1.5 border-t border-border p-3 text-xs text-muted">
                  {response.toolCalls.map((tc, i) => (
                    <li key={i}>
                      <span className="font-medium text-foreground">{toolLabel(tc.name)}</span>
                      {Object.keys(tc.args).length > 0 ? (
                        <span className="break-all"> · {JSON.stringify(tc.args)}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </AnswerCard>
        ) : (
          <AnswerCard
            question={asked}
            answer={response.answer}
            confidence={response.confidence}
            citationsLabel="Cited sections"
            citations={response.citations.map((c) => ({
              key: c.chunkId,
              label: GOVERNING_TYPE_LABELS[c.docType] ?? c.docType,
              title: c.section ?? 'Section not labelled',
            }))}
            footer={<span className="num">Reference {response.runId}</span>}
          />
        )
      ) : null}
    </div>
  )
}
