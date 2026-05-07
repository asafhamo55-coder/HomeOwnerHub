import { runMain } from '../agents/main'

export async function draftViolationLetter(params: {
  propertyAddress: string
  ownerName: string
  violationDescription: string
  ccrSection: string
  hoaName: string
  curePeriodDays: number
  fineAmount: number
}): Promise<string> {
  return runMain(
    [
      {
        role: 'user',
        content: `Write a formal HOA violation letter. Professional but respectful tone.

HOA: ${params.hoaName}
Property: ${params.propertyAddress}
Owner: ${params.ownerName}
Violation: ${params.violationDescription}
CC&R Section: ${params.ccrSection}
Cure period: ${params.curePeriodDays} days from date of service
Daily fine if uncured: $${params.fineAmount}/day

Requirements:
- Do not include a date line (manager will add when serving)
- Include full signature block for HOA Manager
- Plain text, no markdown
- 3 paragraphs: (1) violation notice, (2) required action, (3) consequences`,
      },
    ],
    { temperature: 0.2, max_tokens: 800 },
  )
}
