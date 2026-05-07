import { analyzeImage } from '../agents/vision'

export interface PhotoAnalysisResult {
  violationDetected: boolean
  description: string
  possibleCCRViolations: string[]
}

export async function analyzeViolationPhoto(params: {
  imageUrl: string
  propertyAddress: string
}): Promise<PhotoAnalysisResult> {
  const question = `You are a HOA compliance inspector reviewing a photo of a property at ${params.propertyAddress}.

Describe what you see. Identify any potential CC&R violations such as:
- Prohibited items in front yard (vehicles, equipment, storage)
- Unapproved structures or modifications
- Landscaping violations
- Parking violations
- Trash/debris issues

Respond with JSON only:
{
  "violationDetected": true,
  "description": "What you see in plain language",
  "possibleCCRViolations": ["Specific possible violations as strings"]
}`

  const raw = await analyzeImage({ imageUrl: params.imageUrl, question })
  return JSON.parse(raw) as PhotoAnalysisResult
}
