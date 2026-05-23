'use client'

import { useState } from 'react'
import { Database, FileText, Sparkles, RotateCcw } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Textarea,
} from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
type Mode = 'docs' | 'community'

interface Citation {
  chunkId: string
  documentId: string
  docType: string
  section: string | null
}

interface AskResponse {
  answer: string
  confidence: Confidence
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
  'How long can I park a guest car on the street?',
  'Are short-term rentals like Airbnb allowed?',
]

const COMMON_QUESTIONS_COMMUNITY = [
  'How many properties are leased vs owner-occupied?',
  'Who is overdue on dues?',
  'How many open violations do we have?',
  'Who owns 829 Pistace Ct?',
  'When was our last board meeting?',
]

export function AskDocsClient() {
  const [mode, setMode] = useState<Mode>('docs')
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle',
  )
  const [response, setResponse] = useState<AskResponse | CommunityResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function isCommunityResponse(r: AskResponse | CommunityResponse): r is CommunityResponse {
    return (r as CommunityResponse).toolCalls !== undefined
  }

  function switchMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    handleClear()
  }

  const commonQuestions =
    mode === 'community' ? COMMON_QUESTIONS_COMMUNITY : COMMON_QUESTIONS_DOCS

  function handleClear() {
    setQuestion('')
    setStatus('idle')
    setResponse(null)
    setErrorMessage(null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (question.trim().length < 3) return
    setStatus('loading')
    setErrorMessage(null)
    setResponse(null)

    try {
      const endpoint = mode === 'community' ? '/api/ai/ask-community' : '/api/ai/ask-docs'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })
      const json = await res.json()

      if (!res.ok) {
        const err = json as { error: string; message?: string }
        setErrorMessage(err.message ?? err.error)
        setStatus('error')
        return
      }

      setResponse(json as AskResponse | CommunityResponse)
      setStatus('done')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error')
      setStatus('error')
    }
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle — pick what the AI grounds its answer in. */}
      <div className="inline-flex rounded-lg border border-border bg-card p-1 text-sm">
        <button
          type="button"
          onClick={() => switchMode('docs')}
          aria-pressed={mode === 'docs'}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
            mode === 'docs'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted hover:text-foreground'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          Governing docs
        </button>
        <button
          type="button"
          onClick={() => switchMode('community')}
          aria-pressed={mode === 'community'}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
            mode === 'community'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted hover:text-foreground'
          }`}
        >
          <Database className="h-3.5 w-3.5" />
          Community data
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Your question
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                mode === 'community'
                  ? 'e.g. Who is overdue on dues? How many leased properties?'
                  : 'e.g. Can I install a satellite dish on my roof?'
              }
              rows={3}
              disabled={status === 'loading'}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                loading={status === 'loading'}
                disabled={question.trim().length < 3}
              >
                Ask
              </Button>
              <AiRewriteButton
                value={question}
                onChange={setQuestion}
                context="Question to the governing-docs AI — rephrase for clarity"
                disabled={status === 'loading'}
              />
              {status !== 'idle' ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClear}
                  disabled={status === 'loading'}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Clear
                </Button>
              ) : null}
            </div>

            <div className="space-y-1.5 border-t border-border pt-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-fg">
                Common questions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {commonQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-fg hover:border-primary hover:text-muted disabled:opacity-50"
                    onClick={() => setQuestion(q)}
                    disabled={status === 'loading'}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {status === 'error' && errorMessage ? (
        <Alert variant="error" title="Couldn&apos;t answer">
          {errorMessage}
        </Alert>
      ) : null}

      {status === 'done' && response && isCommunityResponse(response) ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Answer</CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {response.toolCalls.length} tool call{response.toolCalls.length === 1 ? '' : 's'} · {response.steps} step{response.steps === 1 ? '' : 's'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{response.answer}</p>

            {response.toolCalls.length > 0 ? (
              <details className="space-y-1.5 border-t border-border pt-3">
                <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-fg">
                  Data sources ({response.toolCalls.length})
                </summary>
                <ul className="mt-2 space-y-1.5 text-xs text-muted-fg">
                  {response.toolCalls.map((tc, i) => (
                    <li key={i} className="rounded border border-border bg-card/50 px-2 py-1.5">
                      <span className="font-mono text-foreground">{tc.name}</span>
                      {Object.keys(tc.args).length > 0 ? (
                        <span className="text-muted"> ({JSON.stringify(tc.args)})</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ) : status === 'done' && response && !isCommunityResponse(response) ? (
        <DocsAnswer response={response as AskResponse} />
      ) : null}
    </div>
  )
}

// Docs-mode answer card. Pulled out into a sub-component so the type
// narrowing on `response` doesn't leak across branches in the parent.
function DocsAnswer({ response }: { response: AskResponse }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Answer</CardTitle>
          <ConfidenceBadge confidence={response.confidence} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {response.answer}
        </p>

        {response.citations.length > 0 ? (
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">
              Citations
            </p>
            <ul className="space-y-1 text-xs text-muted-fg">
              {response.citations.map((c) => (
                <li key={c.chunkId} className="flex items-center gap-2">
                  <Badge variant="outline">{capitalize(c.docType)}</Badge>
                  <span className="font-mono">{c.section ?? '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-mono text-muted-fg/70">
            run id: {response.runId}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const variant: 'success' | 'warning' | 'outline' =
    confidence === 'HIGH'
      ? 'success'
      : confidence === 'MEDIUM'
        ? 'warning'
        : 'outline'
  return <Badge variant={variant}>{confidence}</Badge>
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s
}
