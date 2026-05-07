import { runMain } from '../agents/main'

// Schema-aligned slugs (eviction_cases_notice_type_check enforces these
// exact values). humanizeNoticeType() maps them to the legal label that
// goes into the AI prompt.
export type EvictionNoticeType = '3day_pay_or_quit' | '30day_vacate' | 'just_cause'

export async function draftEvictionNotice(params: {
  tenantName: string
  propertyAddress: string
  county: string
  noticeType: EvictionNoticeType
  rentAmount: number
  daysUnpaid: number
  landlordName: string
}): Promise<string> {
  return runMain(
    [
      {
        role: 'user',
        content: `Draft a formal ${humanizeNoticeType(params.noticeType)} eviction notice for ${params.county}.

Tenant: ${params.tenantName}
Property: ${params.propertyAddress}
Monthly rent: $${params.rentAmount}
Days unpaid: ${params.daysUnpaid}
Landlord: ${params.landlordName}

Requirements:
- Use the legally required language for ${params.county}.
- Include a verbatim statutory citation block (e.g., "Texas Property Code §24.005").
- Leave the date line blank (the landlord will fill in on service).
- Include a service-method checklist at the bottom (personal delivery / posting / certified mail).
- Plain text only. No markdown.`,
      },
    ],
    { temperature: 0.1, max_tokens: 1200 },
  )
}

export function humanizeNoticeType(t: EvictionNoticeType): string {
  switch (t) {
    case '3day_pay_or_quit':
      return '3-Day Notice to Pay or Quit'
    case '30day_vacate':
      return '30-Day Notice to Vacate'
    case 'just_cause':
      return 'Just Cause Notice'
  }
}
