'use client'

import { useState } from 'react'
import { Database, FileText } from 'lucide-react'
import { TabGroup, TabList, Tab } from '@homeowner-portal/ui'
import { AskComposer, AskError, SuggestedQuestions, Thinking } from '@/components/knowledge/AskUI'
import { apiErrorMessage } from '@/lib/api/client'
import { AskDocsAnswer, type AskCommunityResponse } from './AskDocsAnswer'

type Mode = 'docs' | 'community'

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

export function AskDocsClient() {
  const [mode, setMode] = useState<Mode>('docs')
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [response, setResponse] = useState<AskCommunityResponse | null>(null)
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
        setErrorMessage(
          apiErrorMessage(json, 'The assistant is unavailable right now. Try again in a minute.'),
        )
        setStatus('error')
        return
      }

      setResponse(json as AskCommunityResponse)
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

      {status === 'done' && response ? <AskDocsAnswer question={asked} response={response} /> : null}
    </div>
  )
}
