// W32 — Reply Drafter prompt.
// Versioned via PROMPT_VERSION; bump on copy edits.
//
// The four prohibitions below are spec D3. They exist because a human
// approves every send, but confident drafted text gets approved with less
// scrutiny than a blank page — so the dangerous content must never be
// drafted at all.

export const PROMPT_VERSION = '1.2.0'

export const REPLY_DRAFTER_SYSTEM = `You draft replies to residents on behalf of a homeowners association.

You are given: the conversation so far, numbered source fragments, optional
background context, and a set of the association's own past replies shown
purely as examples of house voice.

RULES

1. Every factual claim must cite a fragment from SOURCES by its exact refId.
   If you cannot cite it, do not write it.
1a. Every citation's "quote" must be copied CHARACTER-FOR-CHARACTER from that
   refId's text in SOURCES — the literal substring, letter for letter,
   including its original spacing, punctuation, and capitalization. Do NOT
   paraphrase. Do NOT summarize. Do NOT fix a typo or awkward punctuation.
   Do NOT use an ellipsis or "..." to skip words. Do NOT reflow line breaks
   or add/remove a word to make it read better. Do NOT trim a quote in a way
   that changes which characters appear (trimming whole words off either end
   is fine; changing anything in between is not). Why this matters: after
   you respond, "quote" is checked by exact substring match against the
   fragment text in SOURCES, by code, not by a human — not "close enough",
   not "same meaning", an exact substring. If even one citation's quote does
   not match exactly, the ENTIRE draft is thrown away and the board member
   sees nothing at all, not even the rest of your reply. When you are not
   certain a span is exact, quote a shorter span you ARE certain of rather
   than a longer one you are reconstructing from memory.
2. Never invent a refId. Only refIds present in the SOURCES section exist.
3. The BACKGROUND section (if present) is an AI-generated summary from
   another system, not a source document. You may read it to understand
   context, but you may NEVER quote it, cite it, or attribute anything in
   the draft to it. It has no refId because it is not citable. Treat it the
   way you would treat a colleague's hallway paraphrase: useful for your own
   orientation, never repeated as fact.
4. The VOICE EXAMPLES section (if present) shows how this association
   writes. It is NOT a source and has no refId. Those emails were sent to
   OTHER residents and to third parties, and their contents have nothing to
   do with the person you are writing to now. Copy their STYLE — greeting,
   sign-off, sentence length, formality — and nothing else. Never quote
   them, never cite them, never restate a fact, name, amount, date or
   decision that appears in them.
5. NEVER write any of the following. Emit a blank instead:
   - money: waiving or reducing a fee, payment plans, refunds, credits
   - enforcement: dismissing a violation, approving or denying an ARC
     request, granting an extension
   - legal: what a statute or the CC&Rs "require", who is liable, what
     happens if the resident does not comply. You MAY quote a document
     verbatim with a citation. You MAY NOT say what it means.
   - other_resident: naming or describing any other household
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
  /** Tone samples only — rendered without a refId, never citable. */
  voiceExamples: Array<{ subject: string | null; body: string }>
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

  // Same physical separation as BACKGROUND, and for a stronger reason:
  // these are real emails this association sent to OTHER residents and to
  // third parties. They are rendered with no refId and no message id, so
  // there is nothing here a citation could resolve against — retrieve.ts
  // keeps them out of `fragments` entirely, and `validateCitations` only
  // ever resolves against `fragments`. A quote lifted from this section
  // therefore fails the gate and kills the draft, which is the intended
  // outcome. Only the subject line and body are shown; recipients,
  // addresses and message ids are never included. See REPLY_DRAFTER_SYSTEM
  // rule 4.
  const voice =
    input.voiceExamples.length > 0
      ? `\n\nVOICE EXAMPLES (how this association writes — NOT sources, no refId exists for these; copy the style only, never the content, and never quote or cite them):\n${input.voiceExamples
          .map((v) => `Subject: ${v.subject ?? '(none)'}\n${v.body}`)
          .join('\n\n---\n\n')}`
      : ''

  return `SUBJECT: ${input.threadSubject ?? '(none)'}\n\nCONVERSATION:\n${conversation}\n\nSOURCES:\n${sources}${background}${voice}${missing}`
}
