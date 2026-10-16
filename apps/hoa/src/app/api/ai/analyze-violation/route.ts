import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  analyzeViolationPhoto,
  covenantBrainAnalyze,
  draftViolationLetter,
} from '@homeowner-portal/ai'
import {
  StatuteRuleRefusalError,
  applyStateRulesToDraft,
  selectStateRules,
  stateRulesPromptContext,
  type StateRuleSet,
  type StateRulesOutput,
} from '@homeowner-portal/workflows/W3-state-rules'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { zCents, zText, zUuid } from '@/lib/api/schemas'
import { MAX_LONG_TEXT, MAX_SHORT_TEXT } from '@/lib/api/limits'
import { logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const ROUTE = 'ai.analyze-violation'
const PHOTO_BUCKET = 'hoa-photos'
/** Long enough for the vision provider to fetch the image once. */
const SIGNED_URL_TTL_SECONDS = 10 * 60
/** The wizard caps a proposed first-notice fine at $1,000. */
const MAX_FINE_CENTS = 100_000

const Body = z.object({
  propertyId: zUuid,
  // R-22: the storage key /api/violations/photo returned, not a URL. The
  // route checks it sits under the caller's org and signs it itself, so a
  // client cannot point the vision provider at an arbitrary URL.
  photoStoragePath: zText(MAX_SHORT_TEXT, 1),
  manualDescription: zText(MAX_LONG_TEXT).optional(),
  curePeriodDays: z.number().int().min(1).max(180).default(14),
  // C-10 / RC-11: money on the wire is integer cents.
  fineAmountCents: zCents.max(MAX_FINE_CENTS).default(2500),
})

interface AnalysisResult {
  description: string
  violationType: string
  ccrSection: string | null
  severity: 'low' | 'medium' | 'high' | null
  confidence: 'high' | 'medium' | 'low' | null
  letterDraft: string
  warnings: string[]
  /** BL-019: the state rule set the letter was assembled under. */
  stateRules: StateRulesOutput | null
}

/** `${orgId}/<one safe file name>` — the shape /api/violations/photo writes. */
function isOrgPhotoPath(path: string, orgId: string): boolean {
  const prefix = `${orgId}/`
  if (!path.startsWith(prefix)) return false
  const name = path.slice(prefix.length)
  return /^[A-Za-z0-9._-]+$/.test(name) && !name.includes('..')
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)
}

// The wizard's heavy lift. Three independent AI calls, each wrapped so that
// any failure degrades to a manual fallback rather than blowing up the page.
// A user with no AI provisioned at all still gets a usable wizard — they
// just write the letter themselves.
//
// Board-only (RC-4, F-03 / R-02): every caller is the (dashboard) violation
// wizard, and this spends paid AI quota.
export const POST = withRoute(ROUTE, async (request: Request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const body = await parseJson(request, Body)
  if (!isOrgPhotoPath(body.photoStoragePath, orgId)) {
    throw new ApiRouteError('not_found', 'We could not find that photo. Upload it again.', {
      reason: 'photo_not_found',
    })
  }

  const supabase = await getSupabaseServerClient()

  // The property must be this org's (404 otherwise, the same answer for a
  // foreign id and a missing one).
  const { data: property, error: propertyErr } = await supabase
    .from('hoa_properties')
    .select('address, owner_name')
    .eq('id', body.propertyId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (propertyErr) {
    logRouteFailure(`${ROUTE}.property`, propertyErr, { orgId })
    throw new ApiRouteError('internal')
  }
  if (!property) {
    throw new ApiRouteError('not_found', 'We could not find that property.', { reason: 'property_not_found' })
  }

  const { data: orgRow, error: orgErr } = await supabase
    .from('orgs')
    .select('name')
    .eq('id', orgId)
    .maybeSingle()
  if (orgErr) {
    logRouteFailure(`${ROUTE}.org`, orgErr, { orgId })
    throw new ApiRouteError('internal')
  }
  const hoaName = (orgRow?.name as string | undefined) ?? 'Your homeowners association'

  const warnings: string[] = []
  const description = body.manualDescription ?? ''
  const address = (property.address as string | null) ?? ''
  const result: AnalysisResult = {
    description,
    violationType: 'general',
    ccrSection: null,
    severity: null,
    confidence: null,
    letterDraft: '',
    warnings,
    stateRules: null,
  }

  // Find the most-recent CC&R doc with parsed text, if any.
  const { data: ccrDoc, error: ccrErr } = await supabase
    .from('hoa_documents')
    .select('parsed_text')
    .eq('org_id', orgId)
    .eq('type', 'ccr')
    .not('parsed_text', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (ccrErr) logRouteFailure(`${ROUTE}.ccr`, ccrErr, { orgId })
  const parsedCCRText = (ccrDoc?.parsed_text as string | null) ?? null

  // BL-019: the association's state picks the enforcement rules. A failed
  // lookup is surfaced as a warning, never silently treated as "no rules".
  const { rules, statuteText } = await loadStateRules(supabase, orgId, warnings)

  // 1. Vision agent, on a URL this route signed for the org's own object.
  try {
    const { data: signed, error: signErr } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(body.photoStoragePath, SIGNED_URL_TTL_SECONDS)
    if (signErr || !signed?.signedUrl) throw signErr ?? new Error('no_signed_url')
    const photo = await analyzeViolationPhoto({ imageUrl: signed.signedUrl, propertyAddress: address })
    result.description = [photo.description, body.manualDescription]
      .filter((s) => s && s.trim())
      .join('. ')
  } catch (err) {
    logRouteFailure(`${ROUTE}.vision`, err, { orgId })
    warnings.push(
      'Photo analysis is offline. Edit the description below to describe what you observed.',
    )
    if (!result.description) {
      result.description = 'Violation observed at property — describe in detail before sending.'
    }
  }

  // 2. Covenant brain — only if we have CC&R text to ground it on.
  if (ccrErr) {
    warnings.push('Could not load your CC&Rs, so no section was matched. You can fill in the section by hand.')
  } else if (parsedCCRText && parsedCCRText.length > 200) {
    try {
      const match = await covenantBrainAnalyze({
        violationDescription: result.description,
        parsedCCRText,
        propertyAddress: address,
      })
      result.ccrSection = match.ccrSection
      result.violationType = match.violationType || 'general'
      result.severity = match.severity
      result.confidence = match.confidence
    } catch (err) {
      logRouteFailure(`${ROUTE}.covenant`, err, { orgId })
      warnings.push('CC&R section matching is offline. You can fill in the section by hand.')
    }
  } else {
    warnings.push(
      'No parsed CC&Rs found. Upload your CC&Rs and paste their text under Documents to enable section matching.',
    )
  }

  // 3. Letter draft.
  try {
    result.letterDraft = await draftViolationLetter({
      propertyAddress: address,
      ownerName: (property.owner_name as string | null) ?? 'Homeowner',
      violationDescription: result.description,
      ccrSection: result.ccrSection ?? 'Section pending board review',
      hoaName,
      curePeriodDays: body.curePeriodDays,
      fineAmount: body.fineAmountCents / 100,
      stateLawContext: rules ? stateRulesPromptContext(rules, 'first_notice') : undefined,
    })
  } catch (err) {
    logRouteFailure(`${ROUTE}.letter`, err, { orgId })
    warnings.push('Letter drafting is offline. Use the editor below to write the notice manually.')
    result.letterDraft = `[AI letter drafting is unavailable.]\n\nViolation observed: ${result.description}\nProperty: ${address}\nCC&R section: ${result.ccrSection ?? '—'}\nCure period: ${body.curePeriodDays} days\n\nWrite the formal notice in the editor below before approving.`
  }

  // Append the statutory notice paragraph (+ quotes that pass the W32
  // validator against the stored statute text). The wizard drafts a first
  // notice, which no state forbids; the proposed fine only adds warnings.
  // Any other throw reaches withRoute as a generic JSON 500.
  if (rules) {
    try {
      const applied = applyStateRulesToDraft({
        rules,
        requestedAction: { step: 'first_notice', fineAmountCents: body.fineAmountCents },
        modelNotice: result.letterDraft,
        statuteText,
        recommendedFineAmountCents: body.fineAmountCents,
      })
      result.letterDraft = applied.notice
      result.stateRules = applied.stateRules
      warnings.push(...applied.stateRules.warnings.filter((w) => !warnings.includes(w)))
      if (
        rules.fineCapOverride === 'health_safety_finding' &&
        rules.fineCapCents !== null &&
        body.fineAmountCents > rules.fineCapCents
      ) {
        warnings.push(
          `California caps a fine at $100 per violation unless the board makes a written health or safety finding at an open meeting. Lower the $${dollars(body.fineAmountCents)} fine or record that finding first — verify against the statute.`,
        )
      }
    } catch (err) {
      if (!(err instanceof StatuteRuleRefusalError)) throw err
      warnings.push(...err.reasons)
    }
  }

  return NextResponse.json(result)
})

type ServerClient = Awaited<ReturnType<typeof getSupabaseServerClient>>

async function loadStateRules(
  supabase: ServerClient,
  orgId: string,
  warnings: string[],
): Promise<{ rules: StateRuleSet | null; statuteText: string | null }> {
  const { data: assoc, error } = await supabase
    .from('associations' as never)
    .select('state')
    .eq('organization_id' as never, orgId)
    .order('name' as never, { ascending: true })
    .limit(1)
    .maybeSingle<{ state: string | null }>()
  if (error) {
    logRouteFailure(`${ROUTE}.association-state`, error, { orgId })
    warnings.push('Could not load your association’s state, so no state-law notice was added. Verify against your state’s statute before sending.')
    return { rules: null, statuteText: null }
  }
  const rules = selectStateRules(assoc?.state ?? null)
  if (!rules.citation || rules.quotes.length === 0 || !rules.state) return { rules, statuteText: null }
  const { data: statute, error: statuteErr } = await supabase
    .from('state_statutes' as never)
    .select('body')
    .eq('state' as never, rules.state)
    .eq('code_citation' as never, rules.citation)
    .is('superseded_at' as never, null)
    .limit(1)
    .maybeSingle<{ body: string }>()
  if (statuteErr) logRouteFailure(`${ROUTE}.state-statutes`, statuteErr, { orgId })
  return { rules, statuteText: statute?.body ?? null }
}
