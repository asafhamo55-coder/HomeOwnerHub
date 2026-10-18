import { NextResponse } from 'next/server'
import { z } from 'zod'
import { GoverningDocsRetrievalError, buildArcFacts, reviewArcRequest } from '@homeowner-portal/workflows/W37'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireOrgOwned, requireRouteMember } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { zDateOnly, zText, zUuid } from '@/lib/api/schemas'
import { logRouteFailure } from '@/lib/api/log'
import { RESIDENT_VISIBLE_TYPES } from '@/lib/resident-documents/visibility'
import { getResidentUnits } from '@/lib/resident'

// BL-024 — "Check my request against the rules" on /resident/arc/new.
// POST { unitId?, category, summary, scopeDescription, proposedStart?,
//        proposedCompletion?, contractorName?, contractorLicense? }
// → 200 { status, summary, confidence, rules, questions, missingInfo, disclaimer, runId }
// → error envelope (RC-1) otherwise.
//
// Advisory only: W37 in precheck mode never says approved/denied and
// refuses (status "no_rules") when nothing clearly applies. The request is
// reduced to buildArcFacts first — no name, unit, address, email or phone
// reaches the model, and only yes/no about the contractor and dates.

const Body = z.object({
  unitId: zUuid.nullable().optional(),
  category: z.enum(['paint', 'fence', 'deck_patio', 'roof', 'landscaping', 'addition', 'pool', 'solar', 'other']),
  summary: zText(200, 3),
  scopeDescription: zText(4000, 10),
  proposedStart: zDateOnly.nullable().optional(),
  proposedCompletion: zDateOnly.nullable().optional(),
  contractorName: zText(200).nullable().optional(),
  contractorLicense: zText(100).nullable().optional(),
})

const AI_UNAVAILABLE = 'The rules check isn’t available right now. You can still submit your application.'

export const POST = withRoute('ai.arc-precheck', async (request) => {
  // Resident-callable: this backs the resident ARC form. W37 reads with the
  // service role, so a resident is restricted to the resident-visible
  // document allowlist (as /api/ai/ask-docs is) and to their own home.
  const { orgId, role } = await requireRouteMember()
  const body = await parseJson(request, Body)
  const isBoard = role === 'admin' || role === 'board'

  let associationId: string | null = null
  if (body.unitId) {
    if (isBoard) {
      await requireOrgOwned('units', body.unitId, orgId)
    } else {
      const unit = (await getResidentUnits()).find((u) => u.unit_id === body.unitId)
      if (!unit) throw new ApiRouteError('not_found')
      associationId = unit.association_id
    }
  }
  const allowedDocTypes = isBoard ? undefined : [...RESIDENT_VISIBLE_TYPES.governing]

  let result: Awaited<ReturnType<typeof reviewArcRequest>>
  try {
    result = await reviewArcRequest(
      { mode: 'precheck', facts: buildArcFacts(body), associationId, allowedDocTypes },
      { organizationId: orgId },
    )
  } catch (err) {
    const cause = err instanceof Error ? err.cause : undefined
    logRouteFailure('ai.arc-precheck', cause ?? err, { orgId })
    if (cause instanceof GoverningDocsRetrievalError) throw new ApiRouteError('internal')
    throw new ApiRouteError('upstream_unavailable', AI_UNAVAILABLE)
  }

  // Belt and braces: a resident check must never cite a hidden doc type.
  if (allowedDocTypes && result.rules.some((r) => !allowedDocTypes.includes(r.docType))) {
    logRouteFailure('ai.arc-precheck.visibility', new Error('hidden_citation'), { orgId })
    throw new ApiRouteError('internal')
  }

  return NextResponse.json({
    status: result.status,
    summary: result.summary,
    confidence: result.confidence,
    rules: result.rules.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      docType: r.docType,
      section: r.section,
      point: r.point,
      status: r.status,
    })),
    questions: result.questions,
    missingInfo: result.missingInfo,
    disclaimer: result.disclaimer,
    runId: result.runId,
  })
})
