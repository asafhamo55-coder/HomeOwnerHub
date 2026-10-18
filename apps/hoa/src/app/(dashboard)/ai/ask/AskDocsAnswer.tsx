'use client'

import { Badge } from '@homeowner-portal/ui'
import { AnswerCard } from '@/components/knowledge/AskUI'
import { GOVERNING_TYPE_LABELS, type AnswerConfidence } from '@/lib/status/knowledge'

interface Citation {
  chunkId: string
  documentId: string
  docType: string
  section: string | null
}

interface ToolCall {
  name: string
  args: Record<string, unknown>
  result: unknown
}

/**
 * The /api/ai/ask-community response. `toolCalls` is always present;
 * `citations` / `confidence` / `runId` only when the agent searched the
 * governing docs (lib/community-qa/agent.ts).
 */
export interface AskCommunityResponse {
  answer: string
  toolCalls: ToolCall[]
  steps: number
  citations?: Citation[]
  confidence?: AnswerConfidence
  runId?: string
}

const DOCS_TOOL = 'search_governing_docs'

/** Tool names are snake_case identifiers; show them as words. */
function toolLabel(name: string): string {
  const words = name.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * One answer view for both kinds of answer (BL-072). It used to branch on
 * `toolCalls !== undefined` — always true, since the route always sends
 * it — so a governing-docs answer never showed its "Cited sections". Now
 * each part renders when the response carries it: citations when the docs
 * were searched, data lookups when the database was.
 */
export function AskDocsAnswer({ question, response }: { question: string; response: AskCommunityResponse }) {
  const dataCalls = response.toolCalls.filter((tc) => tc.name !== DOCS_TOOL)
  const searchedDocs = response.citations !== undefined

  const footer =
    dataCalls.length > 0 || response.runId ? (
      <span className="flex flex-wrap gap-x-3 gap-y-1">
        {dataCalls.length > 0 ? (
          <span>Answered from your records. Verify figures on the source page before acting on them.</span>
        ) : null}
        {response.runId ? <span className="num">Reference {response.runId}</span> : null}
      </span>
    ) : undefined

  return (
    <AnswerCard
      question={question}
      answer={response.answer}
      confidence={response.confidence}
      meta={
        dataCalls.length > 0 ? (
          <Badge variant="neutral" className="num">
            {dataCalls.length} data {dataCalls.length === 1 ? 'lookup' : 'lookups'}
          </Badge>
        ) : undefined
      }
      citationsLabel="Cited sections"
      citations={
        searchedDocs
          ? (response.citations ?? []).map((c) => ({
              key: c.chunkId,
              label: GOVERNING_TYPE_LABELS[c.docType] ?? c.docType,
              title: c.section ?? 'Section not labelled',
            }))
          : undefined
      }
      footer={footer}
    >
      {dataCalls.length > 0 ? (
        <details className="group rounded-lg border border-border">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-foreground-secondary hover:bg-subtle">
            Data sources ({dataCalls.length})
          </summary>
          <ul className="space-y-1.5 border-t border-border p-3 text-xs text-muted">
            {dataCalls.map((tc, i) => (
              <li key={i}>
                <span className="font-medium text-foreground">{toolLabel(tc.name)}</span>
                {Object.keys(tc.args).length > 0 ? <span className="break-all"> · {JSON.stringify(tc.args)}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </AnswerCard>
  )
}
