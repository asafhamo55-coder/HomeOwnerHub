// W37 — ARC Review. Photo findings (BL-079).
//
// The board review can look at the photos and plans a resident attached and
// pull out objective, visible facts that bear on the rules retrieval found
// ("fence appears ~6 ft, wood, stained dark brown", "located in the front
// yard"). Each finding is tied to the photo it came from and is only ever
// low or medium confidence: a photo is evidence for the board to check,
// never a measurement.
//
// Privacy:
//   - the images go to the vision model out of band (never in the workflow
//     input, so ai_runs.input holds attachment ids and "Photo 1" labels, not
//     bytes or file names — a file name can carry a name or an address);
//   - the question carries no request text, only the kind of change and
//     short excerpts of the governing-document rules;
//   - code drops any finding that mentions a person or reads out an
//     address, and redacts contact details, whatever the prompt said.
// Nothing here logs a finding or the model's reply.

import { z } from 'zod'
import { MAX_IMAGES_PER_REQUEST } from '@homeowner-portal/ai'
import { redactContactPII } from '@homeowner-portal/ai/pii'

/** How many photos a review reads when ARC_REVIEW_MAX_PHOTOS is unset. */
export const ARC_PHOTO_DEFAULT_MAX = 3

/**
 * ARC_REVIEW_MAX_PHOTOS, clamped to 0..MAX_IMAGES_PER_REQUEST. 0 turns photo
 * reading off. Cost scales with the count: the vision model bills output at
 * 5x input, and every image adds input tokens.
 */
export function resolveArcReviewMaxPhotos(): number {
  const raw = process.env.ARC_REVIEW_MAX_PHOTOS?.trim()
  if (!raw) return ARC_PHOTO_DEFAULT_MAX
  const n = Number(raw)
  if (!Number.isInteger(n)) return ARC_PHOTO_DEFAULT_MAX
  return Math.max(0, Math.min(MAX_IMAGES_PER_REQUEST, n))
}

export const ArcPhotoRefSchema = z.object({
  attachmentId: z.string().uuid(),
  /** "Photo 1" — never the file name. */
  label: z.string().min(1).max(40),
})
export type ArcPhotoRef = z.infer<typeof ArcPhotoRefSchema>

export const ARC_PHOTO_CONFIDENCE = ['low', 'medium'] as const
export type ArcPhotoConfidence = (typeof ARC_PHOTO_CONFIDENCE)[number]

export const ArcPhotoFindingSchema = z.object({
  attachmentId: z.string().uuid(),
  photo: z.string(),
  finding: z.string(),
  confidence: z.enum(ARC_PHOTO_CONFIDENCE),
})
export type ArcPhotoFinding = z.infer<typeof ArcPhotoFindingSchema>

const MAX_RULE_EXCERPTS = 4
const RULE_EXCERPT_CHARS = 280
const MAX_PER_PHOTO = 3
const MAX_FINDINGS = 12
const MAX_FINDING_CHARS = 300

/** What the vision model is asked. No request text: the category and rule excerpts only. */
export function arcPhotoQuestion(categoryLabel: string, chunks: Array<{ text: string }>): string {
  const rules = chunks
    .slice(0, MAX_RULE_EXCERPTS)
    .map((c) => {
      const t = c.text.replace(/\s+/g, ' ').trim()
      return `- ${t.length > RULE_EXCERPT_CHARS ? `${t.slice(0, RULE_EXCERPT_CHARS)}…` : t}`
    })
    .join('\n')
  return `These photos or plans are attached to an architectural review application for this kind of change: ${categoryLabel}. A board will compare what they show with these rules from the community's documents:
${rules}

For EACH image, list up to 3 objective, visible facts that bear on those rules: what the structure or change is, its approximate size or height (only when something in the image makes it estimable), its material, its color or finish, and where it sits on the lot (front yard, side yard, rear yard) when that is visible.

RULES
- Describe only what is visible. Never guess at what is not shown.
- Do not identify, describe or mention people. If a person appears, ignore them.
- Do not read out house numbers, street names, names, license plates or any other text that identifies a person or an address.
- Do not say whether the rules are met. The board decides.
- "confidence" is "low" or "medium" only: "medium" when the fact is plainly visible, "low" when it is estimated. Sizes are usually "low".
- If an image shows nothing relevant, return no findings for it.
- One short sentence per finding.

Return JSON only:
{"findings": [{"index": 0, "finding": "Fence appears about 6 ft tall, wood, stained dark brown.", "confidence": "low"}]}

"index" is the image's position in the order given, starting at 0.`
}

// A finding that talks about a person is dropped, not edited: there is no
// safe partial version of "a woman is standing by the gate".
const PERSON_RE =
  /\b(person|persons|people|man|men|woman|women|child|children|kids?|boy|girl|baby|face|faces|resident|homeowner|owner|neighbou?rs?|someone|somebody|he|she|him|her|his|hers)\b/i
// Reading out an address or a plate identifies the home.
const ADDRESS_RE =
  /\b(house number|street number|address|license plate|licence plate|plate number)\b|\b\d{1,6}\s+[A-Z][A-Za-z]*\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|way|boulevard|blvd|circle|cir|place|pl|terrace|ter|trail|trl)\b/i

function stripFence(raw: string): string {
  const m = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return m ? m[1]! : raw.trim()
}

const RawSchema = z.object({
  findings: z.array(z.object({ index: z.number().int(), finding: z.unknown(), confidence: z.unknown() }).passthrough()),
})

/**
 * Map the model's indexed findings onto the photos they describe. An
 * out-of-range index is dropped rather than pinned on a neighbouring photo:
 * a finding attributed to the wrong photo is the one error a board member
 * cannot catch by looking. Exported for the unit suite.
 */
export function processArcPhotoFindings(raw: string, photos: ArcPhotoRef[]): ArcPhotoFinding[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripFence(raw))
  } catch {
    // Never log `raw`: it describes somebody's home.
    console.error('[W37] photo findings were not JSON', { responseLength: raw.length })
    return []
  }
  const result = RawSchema.safeParse(parsed)
  if (!result.success) {
    console.error('[W37] photo findings failed schema validation')
    return []
  }

  const perPhoto = new Map<number, number>()
  const seen = new Set<string>()
  const out: ArcPhotoFinding[] = []
  for (const item of result.data.findings) {
    const photo = photos[item.index]
    if (!photo || item.index < 0) continue
    if (typeof item.finding !== 'string') continue
    const text = redactContactPII(item.finding.replace(/\s+/g, ' ').trim()).slice(0, MAX_FINDING_CHARS)
    if (!text || PERSON_RE.test(text) || ADDRESS_RE.test(text)) continue
    const key = `${item.index}:${text.toLowerCase()}`
    if (seen.has(key)) continue
    const count = perPhoto.get(item.index) ?? 0
    if (count >= MAX_PER_PHOTO) continue
    seen.add(key)
    perPhoto.set(item.index, count + 1)
    out.push({
      attachmentId: photo.attachmentId,
      photo: photo.label,
      finding: text,
      // Never "high": a photo is evidence to check, not a measurement.
      confidence: item.confidence === 'medium' || item.confidence === 'high' ? 'medium' : 'low',
    })
    if (out.length >= MAX_FINDINGS) break
  }
  return out
}

/** max_tokens for the vision call, scaled to the batch (output bills at 5x input). */
export function arcPhotoMaxTokens(imageCount: number): number {
  return 150 * imageCount + 100
}
