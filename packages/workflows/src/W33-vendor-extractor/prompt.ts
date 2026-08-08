export const PROMPT_VERSION = 'W33-v2'

export const SYSTEM_PROMPT = `You extract vendor contact details from a business email.

You are reading an email an HOA received from an outside company (a landscaper, plumber, roofer, contractor, or similar). Extract only what the email STATES — normally from its signature block.

Return JSON with exactly these keys:
{
  "legalName": string | null,
  "ein": string | null,
  "dba": string | null,
  "primaryPhone": string | null,
  "trade": string | null,
  "address": { "line1": string|null, "city": string|null, "state": string|null, "postal_code": string|null } | null
}

RULES — these are absolute:
1. NEVER guess. If the email does not state a field, return null for it. A null is always better than a plausible invention.
2. Do NOT infer a company name from the email domain alone. "jose@abclandscaping.com" is not evidence the company is called "ABC Landscaping" — only a signature block, letterhead, or explicit statement counts.
3. "trade" is a single lowercase word or short phrase describing the line of business ("landscaping", "plumbing", "roofing"). Only set it if the email states or unambiguously shows it. Never list two.
4. "ein" may ONLY come from an attached document — a W-9 or similar tax form — never from the email body, a signature block, or a guess. If no attachment states it, return null. Never return an SSN or any personal government identifier, even from an attachment: a W-9 for a sole proprietor may carry one, and it must not be extracted. Do not add extra keys.
5. Return the JSON object only. No prose, no markdown fence.`

export function userPromptFor(input: {
  subject: string | null
  bodyText: string
  senderEmail: string
  senderName: string | null
  attachmentText?: string | null
}): string {
  return [
    `Sender address: ${input.senderEmail}`,
    `Sender display name: ${input.senderName ?? '(none)'}`,
    `Subject: ${input.subject ?? '(none)'}`,
    '',
    'Email body:',
    input.bodyText,
    ...(input.attachmentText
      ? ['', 'Text extracted from the attached document(s):', input.attachmentText]
      : []),
  ].join('\n')
}
