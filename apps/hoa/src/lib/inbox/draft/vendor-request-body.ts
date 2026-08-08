/**
 * Renders W34's structured output into the plain-text body a board member
 * reviews and a vendor receives.
 *
 * Pure helpers, no `'use server'` — same reason as blanks.ts and forward.ts:
 * a `'use server'` module may export only async functions, and the composer
 * is a client component that needs to render a preview.
 *
 * Why the body is assembled here rather than returned as one blob by the
 * model (spec D6): the numbered "What we need" block is the entire point of
 * this feature. Making it a structural guarantee means it cannot quietly
 * degrade into a paragraph on exactly the drafts where the request is
 * complicated — which are the ones where the vendor most needs it numbered.
 * It also makes the rendering unit-testable without a model.
 */

import type { VendorRequestComposerOutput } from '@homeowner-portal/workflows'

/**
 * Sections with no content are omitted entirely rather than rendered with an
 * empty value. An "Access:" heading followed by nothing reads to the vendor
 * as a drafting mistake, and invites a phone call asking what was meant.
 */
export function buildVendorRequestBody(
  output: VendorRequestComposerOutput,
  signature: string,
): string {
  const sections: string[] = [output.greeting, output.situation]

  // `asks` is `.min(1)` in the schema, so this heading always has content
  // under it. Numbered rather than bulleted: a vendor replying about item 2
  // can say "item 2".
  sections.push(
    ['What we need:', ...output.asks.map((ask, i) => `  ${i + 1}. ${ask.text}`)].join('\n'),
  )

  if (output.accessNotes) {
    sections.push(`Access: ${output.accessNotes}`)
  }

  if (output.attachmentDigest.length > 0) {
    sections.push(
      [
        'Attached:',
        ...output.attachmentDigest.map((a) => `  - ${a.fileName} — ${a.finding}`),
      ].join('\n'),
    )
  }

  sections.push(signature)

  // Blank markers ([[BLANK: money]] etc.) arrive already inline in the
  // model's own field text. This renderer neither injects nor strips them,
  // and deliberately does not know they exist: `hasUnfilledBlanks` reads the
  // finished body and blocks approve while any remain, so a marker that
  // survives into here is doing exactly its job.
  return sections.join('\n\n')
}
