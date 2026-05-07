import { runReason } from '../agents/reason'

export interface ParsedCCRDocument {
  documentTitle: string
  sections: Array<{
    number: string
    title: string
    summary: string
  }>
}

export async function parseCCRDocument(params: {
  rawText: string
}): Promise<ParsedCCRDocument> {
  return runReason<ParsedCCRDocument>(
    [
      {
        role: 'user',
        content: `Extract the structure of this HOA CC&R / bylaws / rules document. Return JSON.

Document text (first 12,000 chars):
${params.rawText.slice(0, 12_000)}

Respond JSON only:
{
  "documentTitle": "string",
  "sections": [
    { "number": "4.2(b)", "title": "Front Yard Equipment", "summary": "1-2 sentences" }
  ]
}`,
      },
    ],
    { max_tokens: 2000 },
  )
}
