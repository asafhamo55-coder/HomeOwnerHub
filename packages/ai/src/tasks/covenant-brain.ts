import { runReason } from '../agents/reason'

export interface CovenantMatch {
  ccrSection: string
  violationType: string
  severity: 'low' | 'medium' | 'high'
  confidence: 'high' | 'medium' | 'low'
}

export async function covenantBrainAnalyze(params: {
  violationDescription: string
  parsedCCRText: string
  propertyAddress: string
}): Promise<CovenantMatch> {
  return runReason<CovenantMatch>([
    {
      role: 'user',
      content: `You are a HOA compliance expert. Match this violation to the correct CC&R section.

CC&R Document (excerpt):
${params.parsedCCRText.slice(0, 8000)}

Property: ${params.propertyAddress}
Violation: ${params.violationDescription}

Respond with JSON only:
{
  "ccrSection": "Section X.X(x) — Title",
  "violationType": "short type name",
  "severity": "low|medium|high",
  "confidence": "high|medium|low"
}`,
    },
  ])
}
