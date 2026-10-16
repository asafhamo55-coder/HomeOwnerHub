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
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const Schema = z.object({
  propertyId: z.string().uuid(),
  photoSignedUrl: z.string().url(),
  manualDescription: z.string().optional(),
  curePeriodDays: z.number().int().min(1).max(180).default(14),
  fineAmount: z.number().min(0).max(1000).default(25),
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

// The wizard's heavy lift. Three independent AI calls, each wrapped so that
// any failure degrades to a manual fallback rather than blowing up the page.
// A user with no AI provisioned at all still gets a usable wizard — they
// just write the letter themselves.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    )
  }

  const org = await getCurrentOrg()
  if (!org) return NextResponse.json({ error: 'no_org' }, { status: 403 })

  const supabase = await getSupabaseServerClient()

  // Confirm property visibility under RLS and grab the owner/address.
  const { data: property } = await supabase
    .from('hoa_properties')
    .select('address, owner_name')
    .eq('id', parsed.data.propertyId)
    .maybeSingle()
  if (!property) return NextResponse.json({ error: 'property_not_found' }, { status: 404 })

  // Find the most-recent CC&R doc with parsed text, if any.
  const { data: ccrDoc } = await supabase
    .from('hoa_documents')
    .select('parsed_text')
    .eq('type', 'ccr')
    .not('parsed_text', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const parsedCCRText = (ccrDoc?.parsed_text as string | null) ?? null

  const warnings: string[] = []
  const result: AnalysisResult = {
    description: parsed.data.manualDescription?.trim() ?? '',
    violationType: 'general',
    ccrSection: null,
    severity: null,
    confidence: null,
    letterDraft: '',
    warnings,
    stateRules: null,
  }

  // BL-019: the association's state picks the enforcement rules. A failed
  // lookup is surfaced as a warning, never silently treated as "no rules".
  const { rules, statuteText } = await loadStateRules(supabase, org.id, warnings)

  // 1. Vision agent.
  try {
    const photo = await analyzeViolationPhoto({
      imageUrl: parsed.data.photoSignedUrl,
      propertyAddress: (property.address as string) ?? '',
    })
    result.description = [photo.description, parsed.data.manualDescription]
      .filter((s) => s && s.trim())
      .join('. ')
  } catch (err) {
    console.warn('[analyze-violation] vision failed', err)
    warnings.push(
      'Photo analysis is offline. Edit the description below to describe what you observed.',
    )
    if (!result.description) {
      result.description = 'Violation observed at property — describe in detail before sending.'
    }
  }

  // 2. Covenant brain — only if we have CC&R text to ground it on.
  if (parsedCCRText && parsedCCRText.length > 200) {
    try {
      const match = await covenantBrainAnalyze({
        violationDescription: result.description,
        parsedCCRText,
        propertyAddress: (property.address as string) ?? '',
      })
      result.ccrSection = match.ccrSection
      result.violationType = match.violationType || 'general'
      result.severity = match.severity
      result.confidence = match.confidence
    } catch (err) {
      console.warn('[analyze-violation] covenant brain failed', err)
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
      propertyAddress: (property.address as string) ?? '',
      ownerName: ((property.owner_name as string) ?? 'Homeowner'),
      violationDescription: result.description,
      ccrSection: result.ccrSection ?? 'Section pending board review',
      hoaName: org.name,
      curePeriodDays: parsed.data.curePeriodDays,
      fineAmount: parsed.data.fineAmount,
      stateLawContext: rules ? stateRulesPromptContext(rules, 'first_notice') : undefined,
    })
  } catch (err) {
    console.warn('[analyze-violation] letter draft failed', err)
    warnings.push('Letter drafting is offline. Use the editor below to write the notice manually.')
    result.letterDraft = `[AI letter drafting is unavailable.]\n\nViolation observed: ${result.description}\nProperty: ${property.address}\nCC&R section: ${result.ccrSection ?? '—'}\nCure period: ${parsed.data.curePeriodDays} days\n\nWrite the formal notice in the editor below before approving.`
  }

  // Append the statutory notice paragraph (+ quotes that pass the W32
  // validator against the stored statute text). The wizard drafts a first
  // notice, which no state forbids; the proposed fine only adds warnings.
  if (rules) {
    try {
      const applied = applyStateRulesToDraft({
        rules,
        requestedAction: { step: 'first_notice', fineAmountCents: Math.round(parsed.data.fineAmount * 100) },
        modelNotice: result.letterDraft,
        statuteText,
        recommendedFineAmountCents: Math.round(parsed.data.fineAmount * 100),
      })
      result.letterDraft = applied.notice
      result.stateRules = applied.stateRules
      warnings.push(...applied.stateRules.warnings.filter((w) => !warnings.includes(w)))
      if (
        rules.fineCapOverride === 'health_safety_finding' &&
        rules.fineCapCents !== null &&
        parsed.data.fineAmount * 100 > rules.fineCapCents
      ) {
        warnings.push(
          `California caps a fine at $100 per violation unless the board makes a written health or safety finding at an open meeting. Lower the $${parsed.data.fineAmount} fine or record that finding first — verify against the statute.`,
        )
      }
    } catch (err) {
      if (!(err instanceof StatuteRuleRefusalError)) throw err
      warnings.push(...err.reasons)
    }
  }

  return NextResponse.json(result)
}

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
    console.warn(`[analyze-violation] association state read failed: ${error.code ?? 'error'}`)
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
  if (statuteErr) console.warn(`[analyze-violation] state_statutes read failed: ${statuteErr.code ?? 'error'}`)
  return { rules, statuteText: statute?.body ?? null }
}
