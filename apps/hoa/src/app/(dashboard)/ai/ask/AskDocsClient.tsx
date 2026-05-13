'use client'

import { useState } from 'react'
import { Sparkles, RotateCcw } from 'lucide-react'
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

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

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

const COMMON_QUESTIONS = [
  'Can I paint my front door red?',
  'How many pets am I allowed?',
  'When are HOA dues due each month?',
  'How long can I park a guest car on the street?',
  'Are short-term rentals like Airbnb allowed?',
]

export function AskDocsClient() {
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle',
  )
  const [response, setResponse] = useState<AskResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
      const res = await fetch('/api/ai/ask-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })
      const json = (await res.json()) as
        | AskResponse
        | { error: string; message?: string }

      if (!res.ok) {
        const err = json as { error: string; message?: string }
        setErrorMessage(err.message ?? err.error)
        setStatus('error')
        return
      }

      setResponse(json as AskResponse)
      setStatus('done')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error')
      setStatus('error')
    }
  }

  return (
    <div className="space-y-4">
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
              placeholder="e.g. Can I install a satellite dish on my roof?"
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
                {COMMON_QUESTIONS.map((q) => (
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

      {status === 'done' && response ? (
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
      ) : null}
    </div>
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
