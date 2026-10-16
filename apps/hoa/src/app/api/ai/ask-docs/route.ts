import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  GoverningDocsRetrievalError,
  queryGoverningDocs,
} from '@homeowner-portal/workflows/W1'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireOrgOwned, requireRouteMember } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { zText, zUuid } from '@/lib/api/schemas'
import { logRouteFailure } from '@/lib/api/log'
import { RESIDENT_VISIBLE_TYPES } from '@/lib/resident-documents/visibility'

// W1 — Governing Docs Brain endpoint.
// POST { question: string, associationId?: string | null }
// → 200 { answer, confidence, citations, clarification?, recommendation?, runId }
// → error envelope (RC-1) otherwise.
//
// The runId points at the ai_runs row that captured the call.

const Body = z.object({
  question: zText(2000, 3),
  associationId: zUuid.nullable().optional(),
})

const AI_UNAVAILABLE = 'The AI service is not reachable right now. Try again shortly.'

export const POST = withRoute('ai.ask-docs', async (request) => {
  // Resident-callable: this backs the resident Ask page (resident/ask). W1
  // reads with the service role, which skips the 0063 resident RLS, so a
  // non-board caller is restricted below to the resident-visible document
  // allowlist (lib/resident-documents/visibility.ts) — not just the org.
  const { orgId, role } = await requireRouteMember()
  const body = await parseJson(request, Body)
  const associationId = body.associationId ?? null
  if (associationId) await requireOrgOwned('associations', associationId, orgId)

  // Default-deny: only admin/board see every governing document.
  const isBoard = role === 'admin' || role === 'board'
  const allowedDocTypes = isBoard ? undefined : RESIDENT_VISIBLE_TYPES.governing

  let result: Awaited<ReturnType<typeof queryGoverningDocs>>
  try {
    result = await queryGoverningDocs(body.question, {
      organizationId: orgId,
      associationId,
      allowedDocTypes,
    })
  } catch (err) {
    const cause = err instanceof Error ? err.cause : undefined
    logRouteFailure('ai.ask-docs', cause ?? err, { orgId })
    // A database read failing is ours (500); anything else is the model.
    if (cause instanceof GoverningDocsRetrievalError) throw new ApiRouteError('internal')
    throw new ApiRouteError('upstream_unavailable', AI_UNAVAILABLE)
  }

  // Belt and braces: a resident answer must never cite a hidden doc type.
  if (allowedDocTypes && result.citations.some((c) => !allowedDocTypes.includes(c.docType))) {
    logRouteFailure('ai.ask-docs.visibility', new Error('hidden_citation'), { orgId })
    throw new ApiRouteError('internal')
  }

  return NextResponse.json({
    answer: result.answer,
    confidence: result.confidence,
    citations: result.citations.map((c) => ({
      chunkId: c.chunkId,
      documentId: c.documentId,
      docType: c.docType,
      section: c.section,
    })),
    clarification: result.clarification ?? null,
    recommendation: result.recommendation ?? null,
    runId: result.runId,
  })
})
