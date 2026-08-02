// W32 — Reply Drafter prompt.
// Versioned via PROMPT_VERSION; bump on copy edits.
//
// The four prohibitions below are spec D3. They exist because a human
// approves every send, but confident drafted text gets approved with less
// scrutiny than a blank page — so the dangerous content must never be
// drafted at all.

export const PROMPT_VERSION = '1.0.0'

export const REPLY_DRAFTER_SYSTEM = `You draft replies to residents on behalf of a homeowners association.

You are given: the conversation so far, numbered source fragments, optional
background context, and the association's own past replies (as fragments)
as examples of house voice.

RULES

1. Every factual claim must cite a fragment from SOURCES by its exact refId.
   If you cannot cite it, do not write it.
2. Never invent a refId. Only refIds present in the SOURCES section exist.
3. The BACKGROUND section (if present) is an AI-generated summary from
   another system, not a source document. You may read it to understand
   context, but you may NEVER quote it, cite it, or attribute anything in
   the draft to it. It has no refId because it is not citable. Treat it the
   way you would treat a colleague's hallway paraphrase: useful for your own
   orientation, never repeated as fact.
4. NEVER write any of the following. Emit a blank instead:
   - money: waiving or reducing a fee, payment plans, refunds, credits
   - enforcement: dismissing a violation, approving or denying an ARC
     request, granting an extension
   - legal: what a statute or the CC&Rs "require", who is liable, what
     happens if the resident does not comply. You MAY quote a document
     verbatim with a citation. You MAY NOT say what it means.
   - other_resident: naming or describing any other household
5. Match the voice of the past replies: their greeting, sign-off, sentence
   length and formality. Do not imitate their facts.
6. If no fragment is relevant to what the resident asked, write only a brief
   acknowledgement confirming receipt and committing to follow up, set
   grounded=false, and cite nothing.

OUTPUT
Return JSON only:
{
  "subject": string,
  "body": string,
  "citations": [{"refId": string, "quote": string, "label": string}],
  "blanks": [{"kind": "money"|"enforcement"|"legal"|"other_resident", "prompt": string}],
  "grounded": boolean,
  "groundingNote": string | null
}

Where a blank belongs in the body, write [[BLANK: <kind>]] on its own line.`

export interface ReplyDrafterUserContext {
  threadSubject: string | null
  messages: Array<{ direction: 'inbound' | 'outbound'; from: string; text: string }>
  fragments: Array<{ refId: string; label: string; text: string }>
  degraded: string[]
  aiContext: { governingDocs: string | null; stateLaw: string | null }
}

export function buildReplyDrafterUserPrompt(input: ReplyDrafterUserContext): string {
  const conversation = input.messages
    .map((m) => `[${m.direction === 'outbound' ? 'HOA' : 'RESIDENT'}] ${m.from}:\n${m.text}`)
    .join('\n\n---\n\n')

  const sources =
    input.fragments.length === 0
      ? '(none — no relevant source was found)'
      : input.fragments
          .map((f) => `refId: ${f.refId}\nlabel: ${f.label}\n${f.text}`)
          .join('\n\n---\n\n')

  // Naming what failed to load matters: without it the model treats an
  // absent balance as a zero balance and tells a resident they owe nothing.
  const missing =
    input.degraded.length > 0
      ? `\n\nUNAVAILABLE (do not assume a value for these; do not mention them):\n${input.degraded.join(', ')}`
      : ''

  // Kept in its own section, physically separated from SOURCES, with no
  // refId anywhere near it — this is W1's/W30's own synthesized answer,
  // not a document. See REPLY_DRAFTER_SYSTEM rule 3: never quote or cite
  // this section. Only rendered when at least one side has content.
  const backgroundLines: string[] = []
  if (input.aiContext.governingDocs) {
    backgroundLines.push(`Governing-docs assistant said: ${input.aiContext.governingDocs}`)
  }
  if (input.aiContext.stateLaw) {
    backgroundLines.push(`State-law assistant said: ${input.aiContext.stateLaw}`)
  }
  const background =
    backgroundLines.length > 0
      ? `\n\nBACKGROUND (AI-generated summary, NOT a source — do not quote, do not cite, no refId exists for this section):\n${backgroundLines.join('\n')}`
      : ''

  return `SUBJECT: ${input.threadSubject ?? '(none)'}\n\nCONVERSATION:\n${conversation}\n\nSOURCES:\n${sources}${background}${missing}`
}
