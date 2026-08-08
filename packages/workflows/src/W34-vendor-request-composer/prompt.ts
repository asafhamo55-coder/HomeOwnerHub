// W34 — Vendor Request Composer prompt.
// Versioned via PROMPT_VERSION; bump on copy edits.
//
// The prohibitions in rules 2–6 exist for the reason W32's do: a human
// approves every send, but confident drafted text gets approved with less
// scrutiny than a blank page. The dangerous content must never be drafted.
//
// What is dangerous here differs from a resident reply. A vendor ACTS on
// this email. A fabricated dollar cap becomes an invoice; a fabricated
// deadline becomes an emergency call-out rate; a fabricated "go ahead"
// becomes work the board never authorized.

export const PROMPT_VERSION = '1.0.0'

/** What each intent is actually asking the vendor to do. */
const INTENT_BRIEF: Record<string, string> = {
  inspect_quote:
    'Ask the vendor to inspect the problem and send back a written quote. ' +
    'This is an assessment request, NOT authorization to perform any work.',
  emergency:
    'Ask the vendor to respond urgently to an active problem causing ongoing ' +
    'damage or a safety hazard. State what makes it urgent, using only facts ' +
    'from the conversation. Do NOT authorize spending to stop it.',
  schedule:
    'Ask the vendor to schedule already-agreed routine or recurring work. ' +
    'Do not re-describe the scope as if it were new work.',
  warranty:
    'Ask the vendor to address a problem with work THEY previously performed, ' +
    'under warranty. Reference the prior work only if it appears in the ' +
    'conversation or the documents.',
  bid: 'Invite the vendor to bid on defined work. Ask for pricing, timeline, ' +
    'and proof of insurance. Do not imply the job is already theirs.',
  other: 'Follow the INSTRUCTION section for what to ask. Every other rule still applies.',
}

export const VENDOR_REQUEST_SYSTEM = `You write work-request emails from a homeowners association board to a vendor (a contractor, landscaper, roofer, plumber, or similar).

You are given: the intent of the request, the conversation an owner had with
the board, the property the job is at, the vendor's record, and any text
extracted from documents attached to that conversation.

Your job is to turn all of that into a short, unambiguous work order. The
vendor has not seen the conversation and never will. They need: what is
wrong, where it is, what you want them to do, and by when.

RULES

1. Write ONLY facts stated in the CONVERSATION, the DOCUMENTS, the PHOTO
   FINDINGS, or the PROPERTY and VENDOR records. If it was not stated, do
   not write it. Do not infer a cause, a severity, or a history.
2. NEVER write a dollar amount, a budget, a cap, or a rate — not even one
   that appears in the documents as a prior estimate, when used as if it
   authorized this job. Write [[BLANK: money]] instead.
3. NEVER authorize work to proceed, approve a scope, or say the association
   will pay. Write [[BLANK: authority]] instead. An inspection request is
   not authorization to repair.
4. NEVER state how the vendor gets access to the property unless access is
   explicitly described in the CONVERSATION. You do not know whether someone
   will be home, where a key is, or what the gate code is. Write
   [[BLANK: access]] instead.
5. NEVER state a deadline the board did not give. If NEEDED BY is absent and
   the request implies timing, write [[BLANK: date]].
6. NEVER name the owner or resident, quote them, or include their phone
   number or email address. Refer to "the owner" or "the resident". The
   street address and unit ARE the job site — always include them when
   PROPERTY is present.
7. Every entry in "attachmentDigest" must be a finding you actually drew
   from DOCUMENTS or PHOTO FINDINGS, labelled with the exact fileName it
   came from. If you read nothing from a file, do not list it. If there are
   no documents, return an empty array.
8. The UNAVAILABLE section names sources that failed to load. Do not assume
   a value for them and do not mention them in the email.
9. Keep "situation" to 2–4 sentences. Keep "asks" to between 1 and 6 short
   imperative items. A vendor reads this on a phone in a truck.

OUTPUT
Return JSON only:
{
  "subject": string,
  "greeting": string,
  "situation": string,
  "asks": [{"text": string}],
  "accessNotes": string | null,
  "attachmentDigest": [{"fileName": string, "finding": string}],
  "blanks": [{"kind": "money"|"authority"|"access"|"date"|"scope", "prompt": string}],
  "confidence": "HIGH"|"MEDIUM"|"LOW"
}

Where a blank belongs in the text, write [[BLANK: <kind>]] inline at that
point, and add a matching entry to "blanks" whose "prompt" tells the board
member what to supply. Never leave a blank marker out of "blanks", and never
list a blank you did not place in the text.

"confidence" is LOW when the conversation did not clearly establish what is
wrong, MEDIUM when the problem is clear but its scope is not, HIGH when both
are clear.`

export interface VendorRequestPromptContext {
  intent: string
  freeTextInstruction: string | null
  neededBy: string | null
  threadSubject: string | null
  messages: Array<{ direction: 'inbound' | 'outbound'; from: string; text: string }>
  property: { addressLine1: string; unitNumber: string | null } | null
  vendor: { legalName: string; dba: string | null; trades: string[] } | null
  attachmentText: string | null
  photoFindings: Array<{ fileName: string; finding: string }>
  degraded: string[]
}

export function buildVendorRequestUserPrompt(input: VendorRequestPromptContext): string {
  const brief = INTENT_BRIEF[input.intent] ?? INTENT_BRIEF.other

  // The owner's own words are the primary source for "what is wrong", so the
  // conversation is rendered in full — but labelled by ROLE, not by name.
  // Rule 6 forbids naming the resident, and handing the model their name in
  // a `from` field it is then told not to use is a trap worth not setting.
  // W32 renders `from` because a reply goes back to that person; here it
  // must not leave the building.
  const conversation = input.messages
    .map((m) => `[${m.direction === 'outbound' ? 'BOARD' : 'OWNER'}]\n${m.text}`)
    .join('\n\n---\n\n')

  const property = input.property
    ? `${input.property.addressLine1}${
        input.property.unitNumber ? `, unit ${input.property.unitNumber}` : ''
      }`
    : '(not identified — do not state an address)'

  const vendor = input.vendor
    ? `${input.vendor.legalName}${input.vendor.dba ? ` (dba ${input.vendor.dba})` : ''}${
        input.vendor.trades.length > 0 ? `\nTrades: ${input.vendor.trades.join(', ')}` : ''
      }`
    : '(not identified — open with a neutral greeting)'

  const documents = input.attachmentText
    ? `\n\nDOCUMENTS (text extracted from files attached to the conversation):\n${input.attachmentText}`
    : ''

  // Rendered only when non-empty so the model is never shown an empty
  // heading it might feel obliged to populate. Empty is the normal case
  // until the vision producer exists (spec D9).
  const photos =
    input.photoFindings.length > 0
      ? `\n\nPHOTO FINDINGS (what was observed in attached images):\n${input.photoFindings
          .map((p) => `${p.fileName}: ${p.finding}`)
          .join('\n')}`
      : ''

  // Naming what failed to load matters for the same reason it does in W32:
  // without it the model treats an absent address as no address rather than
  // an unconfirmed one, and sends a vendor to inspect an unnamed building.
  const missing =
    input.degraded.length > 0
      ? `\n\nUNAVAILABLE (do not assume a value for these; do not mention them):\n${input.degraded.join(', ')}`
      : ''

  const instruction =
    input.intent === 'other' && input.freeTextInstruction
      ? `\n\nINSTRUCTION (what the board wants from this vendor):\n${input.freeTextInstruction}`
      : ''

  const neededBy = input.neededBy
    ? `\n\nNEEDED BY: ${input.neededBy}`
    : '\n\nNEEDED BY: (not given — see rule 5)'

  return `INTENT: ${input.intent}
${brief}${instruction}${neededBy}

PROPERTY (the job site): ${property}

VENDOR (who you are writing to):
${vendor}

CONVERSATION SUBJECT: ${input.threadSubject ?? '(none)'}

CONVERSATION:
${conversation}${documents}${photos}${missing}`
}
