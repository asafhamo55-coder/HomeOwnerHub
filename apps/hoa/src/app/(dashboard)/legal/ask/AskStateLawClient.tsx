'use client'

import { useState, useTransition } from 'react'
import { askStateLawAction } from '@/lib/state-law'
import {
  AnswerCard,
  AskComposer,
  AskError,
  SuggestedQuestions,
  Thinking,
} from '@/components/knowledge/AskUI'
import { STATE_NAMES, type AnswerConfidence, type SupportedStateCode } from '@/lib/status/knowledge'

interface Citation {
  chunkId: string
  statuteId: string
  codeCitation: string
  title: string
  category: string | null
}

interface AskResponse {
  answer: string
  confidence: AnswerConfidence
  citations: Citation[]
  disclaimer: string
  runId: string
}

const SAMPLE_QUESTIONS: Record<SupportedStateCode, string[]> = {
  GA: [
    'How much notice is required for an annual meeting?',
    'Can the board impose fines without a hearing?',
    'What rights do owners have to inspect HOA records?',
    'Can the HOA place a lien for unpaid assessments?',
  ],
  FL: [
    'When does a structural integrity reserve study have to be done?',
    'Can the HOA prevent me from displaying a US flag?',
    'How many owners are needed to recall a board member?',
    'How much notice is required before a fine hearing?',
  ],
  CA: [
    'What notice is required before levying a special assessment?',
    'What does Davis-Stirling say about open board meetings?',
    'Can the HOA prohibit short-term rentals?',
    'How long does the board have to respond to a records request?',
  ],
  TX: [
    'Can an HOA foreclose for unpaid assessments?',
    'What rights do owners have to solar panels?',
    'How does the Texas POA Act limit fines?',
    'What must be in a notice before a fine?',
  ],
}

export function AskStateLawClient({ state }: { state: SupportedStateCode }) {
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const [isPending, startTransition] = useTransition()
  const [response, setResponse] = useState<AskResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  function ask() {
    const q = question.trim()
    if (q.length < 3) return
    setError(null)
    setResponse(null)
    setAsked(q)
    startTransition(async () => {
      try {
        const result = await askStateLawAction(q)
        if (!result.ok) {
          setError(result.error)
          return
        }
        setResponse(result.data)
      } catch {
        setError('The assistant is unavailable right now. Try again in a minute.')
      }
    })
  }

  const idle = !isPending && !response && !error

  return (
    <div className="space-y-6">
      <AskComposer
        value={question}
        onChange={setQuestion}
        onSubmit={ask}
        pending={isPending}
        placeholder={`Ask about ${STATE_NAMES[state]} HOA law — e.g. how much notice is required for a special assessment?`}
        rewriteContext="Question to the state-law AI — rephrase for clarity"
      />

      {idle ? <SuggestedQuestions questions={SAMPLE_QUESTIONS[state] ?? []} onPick={setQuestion} /> : null}

      {isPending ? <Thinking what={`Searching ${STATE_NAMES[state]} statutes…`} /> : null}

      {error && !isPending ? <AskError message={error} onRetry={ask} /> : null}

      {response && !isPending ? (
        <AnswerCard
          question={asked}
          answer={response.answer}
          confidence={response.confidence}
          citationsLabel="Cited statutes"
          citations={response.citations.map((c) => ({
            key: c.chunkId,
            label: c.codeCitation,
            title: c.title,
            href: `/legal/browse/${c.statuteId}`,
          }))}
          footer={
            <span>
              {response.disclaimer} <span className="num">· Reference {response.runId}</span>
            </span>
          }
        />
      ) : null}
    </div>
  )
}
