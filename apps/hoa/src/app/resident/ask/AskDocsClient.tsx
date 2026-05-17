'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
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

const SAMPLE_QUESTIONS = [
  'How many pets can I have?',
  'When are dues due?',
  'Can I park my boat in the driveway?',
  'What approval do I need to paint my front door?',
]

export function AskDocsClient() {
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle',
  )
  const [response, setResponse] = useState<AskResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
              <span className="text-xs text-muted">
                Try:{' '}
                {SAMPLE_QUESTIONS.map((q, i) => (
                  <button
                    key={q}
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => setQuestion(q)}
                  >
                    {q}
                    {i < SAMPLE_QUESTIONS.length - 1 ? ', ' : ''}
                  </button>
                ))}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      {status === 'error' && errorMessage ? (
        <Alert variant="error" title="Couldn't answer">
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
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Citations
                </p>
                <ul className="space-y-1 text-xs">
                  {response.citations.map((c) => (
                    <li key={c.chunkId} className="flex items-center gap-2">
                      <Badge variant="outline" size="sm">{capitalize(c.docType)}</Badge>
                      <span className="font-mono">{c.section ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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
