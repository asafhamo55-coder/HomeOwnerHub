import { analyzeViolationPhoto } from './photo-analysis'
import { covenantBrainAnalyze } from './covenant-brain'
import { draftViolationLetter } from './draft-letter'
import type { CovenantMatch } from './covenant-brain'

export interface ViolationWorkflowResult {
  violationDescription: string
  ccrSection: string
  violationType: string
  severity: CovenantMatch['severity']
  confidence: CovenantMatch['confidence']
  letterDraft: string
}

// Three-agent chain: vision → reason → main. Returns a draft that MUST
// be passed through the BarBGate component before it can be sent.
export async function runViolationWorkflow(params: {
  photoUrl?: string
  manualDescription?: string
  propertyAddress: string
  ownerName: string
  hoaName: string
  parsedCCRText: string
  curePeriodDays: number
  fineAmount: number
}): Promise<ViolationWorkflowResult> {
  let violationDescription = params.manualDescription ?? ''

  if (params.photoUrl) {
    const photoResult = await analyzeViolationPhoto({
      imageUrl: params.photoUrl,
      propertyAddress: params.propertyAddress,
    })
    violationDescription = [photoResult.description, params.manualDescription]
      .filter(Boolean)
      .join('. ')
  }

  const ccrMatch = await covenantBrainAnalyze({
    violationDescription,
    parsedCCRText: params.parsedCCRText,
    propertyAddress: params.propertyAddress,
  })

  const letterDraft = await draftViolationLetter({
    propertyAddress: params.propertyAddress,
    ownerName: params.ownerName,
    violationDescription,
    ccrSection: ccrMatch.ccrSection,
    hoaName: params.hoaName,
    curePeriodDays: params.curePeriodDays,
    fineAmount: params.fineAmount,
  })

  return {
    violationDescription,
    ccrSection: ccrMatch.ccrSection,
    violationType: ccrMatch.violationType,
    severity: ccrMatch.severity,
    confidence: ccrMatch.confidence,
    letterDraft,
  }
}
