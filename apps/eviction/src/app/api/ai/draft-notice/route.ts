import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  aiComplianceCheck,
  draftEvictionNotice,
  type AIComplianceFlags,
  type EvictionNoticeType,
} from '@homeownerhub/ai'
import { getCurrentOrg } from '@/lib/orgs'

const Schema = z.object({
  propertyAddress: z.string().trim().min(3),
  tenantName: z.string().trim().min(1),
  monthlyRent: z.number().min(0),
  daysUnpaid: z.number().int().min(0),
  county: z.string().trim().min(2),
  state: z.string().trim().length(2),
  noticeType: z.string().trim().min(2),
  landlordName: z.string().trim().min(1),
  tenantSituation: z.string().optional(),
})

interface ResponseBody {
  noticeDraft: string
  aiFlags: AIComplianceFlags | null
  warnings: string[]
}

// One round-trip per wizard run: AI edge-case check (only if the user
// described special circumstances) + AI notice draft. Both calls are
// independently wrapped — either or both can fail and the wizard still
// yields a usable result, just with warnings.
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
  if (!org) {
    return NextResponse.json({ error: 'no_org' }, { status: 403 })
  }

  const warnings: string[] = []
  let aiFlags: AIComplianceFlags | null = null

  // 1. AI edge-case check — only if the landlord noted special circumstances.
  const situation = parsed.data.tenantSituation?.trim()
  if (situation && situation.length > 0) {
    try {
      aiFlags = await aiComplianceCheck({
        county: parsed.data.county,
        state: parsed.data.state,
        daysUnpaid: parsed.data.daysUnpaid,
        tenantSituation: situation,
      })
    } catch (err) {
      console.warn('[draft-notice] AI compliance check failed', err)
      warnings.push(
        'AI edge-case review (SCRA / Section 8 / domestic violence) is offline. The county-specific rules still apply, but consider consulting counsel before filing.',
      )
    }
  }

  // 2. Notice draft.
  let noticeDraft: string
  try {
    noticeDraft = await draftEvictionNotice({
      tenantName: parsed.data.tenantName,
      propertyAddress: parsed.data.propertyAddress,
      county: `${parsed.data.county}, ${parsed.data.state}`,
      noticeType: parsed.data.noticeType as EvictionNoticeType,
      rentAmount: parsed.data.monthlyRent,
      daysUnpaid: parsed.data.daysUnpaid,
      landlordName: parsed.data.landlordName,
    })
  } catch (err) {
    console.warn('[draft-notice] AI notice draft failed', err)
    warnings.push(
      'AI notice drafting is offline. Use the editor below to write the notice yourself before approving.',
    )
    noticeDraft = `[AI notice drafting is unavailable.]

This notice serves as a ${parsed.data.noticeType.replace(/_/g, ' ')} for the property at ${parsed.data.propertyAddress}.

To: ${parsed.data.tenantName}
Outstanding rent: $${parsed.data.monthlyRent.toLocaleString()} (${parsed.data.daysUnpaid} days past due)

Cite the relevant ${parsed.data.county}, ${parsed.data.state} statute, list the cure period, list the consequences for non-cure, and finish with the landlord's signature block. Service method options: personal delivery, posting on the inside of the main entry door, certified mail (return receipt requested).`
  }

  const response: ResponseBody = { noticeDraft, aiFlags, warnings }
  return NextResponse.json(response)
}
