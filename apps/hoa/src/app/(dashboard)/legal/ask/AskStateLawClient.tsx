'use client'

import { useState, useTransition } from 'react'
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
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { askStateLawAction } from '@/lib/state-law'

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

interface Citation {
  chunkId: string
  statuteId: string
  codeCitation: string
  title: string
  category: string | null
}

interface AskResponse {
  answer: string
  confidence: Confidence
  citations: Citation[]
  disclaimer: string
  runId: string
}

const SAMPLE_QUESTIONS: Record<string, string[]> = {
  GA: [
    'How much notice is required for an annual meeting?',
    'Can the board impose fines without a hearing?',
    'What rights do owners have to inspect HOA records?',
  ],
  FL: [
    'When does a structural integrity reserve study have to be done?',
    'Can the HOA prevent me from displaying a US flag?',
    'How many owners are needed to recall a board member?',
  ],
  CA: [
    'What notice is required before levying a special assessment?',
    "What does Davis-Stirling say about open board meetings?",
    'Can the HOA prohibit short-term rentals?',
  ],
  TX: [
    'Can an HOA foreclose for unpaid assessments?',
    'What rights do owners have to solar panels?',
    'How does the Texas POA Act limit fines?',
  ],
}

export function AskStateLawClient({ state }: { state: 'GA' | 'FL' | 'CA' | 'TX' }) {
  const [question, setQuestion] = useState('')
  const [isPending, startTransition] = useTransition()
  const [response, setResponse] = useState<AskResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (question.trim().length < 3) return
    setError(null)
    setResponse(null)
    startTransition(async () => {
      const result = await askStateLawAction(question.trim())
      if (!result.ok) {
        setError(result.error)
        return
      }
      setResponse(result.data)
    })
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
              placeholder="e.g. How much notice is required for a special assessment?"
              rows={3}
              disabled={isPending}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                loading={isPending}
                disabled={question.trim().length < 3}
              >
                Ask
              </Button>
              <AiRewriteButton
                value={question}
                onChange={setQuestion}
                context="Question to the state-law AI — rephrase for clarity"
                disabled={isPending}
              />
              <span className="text-xs text-muted">
                Try:{' '}
                {(SAMPLE_QUESTIONS[state] ?? []).map((q, i, arr) => (
                  <button
                    key={q}
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => setQuestion(q)}
                  >
                    {q}
                    {i < arr.length - 1 ? ', ' : ''}
                  </button>
                ))}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="error" title="Couldn't answer">
          {error}
        </Alert>
      ) : null}

      {response ? (
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
                      <Badge variant="outline" size="sm">
                        {c.codeCitation}
                      </Badge>
                      <a
                        href={`/legal/browse/${c.statuteId}`}
                        className="truncate text-muted hover:text-foreground hover:underline"
                      >
                        {c.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Alert variant="warning" title="Disclaimer">
              <span className="block text-xs">{response.disclaimer}</span>
            </Alert>

            <p className="text-[10px] font-mono text-muted/70">
              run id: {response.runId}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const variant: 'success' | 'warning' | 'outline' =
    confidence === 'HIGH' ? 'success' : confidence === 'MEDIUM' ? 'warning' : 'outline'
  return <Badge variant={variant}>{confidence}</Badge>
}
