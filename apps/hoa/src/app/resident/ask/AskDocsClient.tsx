'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, HelpCircle, Sparkles } from 'lucide-react'
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

interface Citation {
  chunkId: string
  documentId: string
  docType: string
  section: string | null
}

type RecommendationAction = 'arc' | 'report_violation' | 'ticket'

interface Recommendation {
  action: RecommendationAction
  text: string
}

interface AskResponse {
  answer: string
  confidence: Confidence
  citations: Citation[]
  clarification?: string | null
  recommendation?: Recommendation | null
  runId: string
}

// Each recommended action maps to a real page in the resident portal.
const ACTION_META: Record<
  RecommendationAction,
  { label: string; href: string }
> = {
  arc: { label: 'Start an ARC application', href: '/resident/arc/new' },
  report_violation: {
    label: 'Report a concern to the board',
    href: '/resident/report-violation',
  },
  ticket: { label: 'Open a support ticket', href: '/resident/tickets' },
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
              <AiRewriteButton
                value={question}
                onChange={setQuestion}
                context="Resident question to the governing-docs AI — rephrase for clarity"
                disabled={status === 'loading'}
              />
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
            {response.answer ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {response.answer}
              </p>
            ) : null}

            {response.clarification ? (
              <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-600">
                  <HelpCircle className="h-3.5 w-3.5" />
                  One quick clarification
                </p>
                <p className="text-sm leading-relaxed">
                  {response.clarification}
                </p>
                <p className="text-xs text-muted">
                  Add that detail to your question above and ask again for a
                  more precise answer.
                </p>
              </div>
            ) : null}

            {response.recommendation &&
            ACTION_META[response.recommendation.action] ? (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  Recommended next step
                </p>
                <p className="text-sm leading-relaxed">
                  {response.recommendation.text}
                </p>
                <Link
                  href={ACTION_META[response.recommendation.action].href}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {ACTION_META[response.recommendation.action].label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : null}

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
