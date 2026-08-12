import type { VisualBlockSpec } from '@/lib/email/visual-block'

/** How the email behaves, which determines what the composer must collect.
 *  See §4.1 of the design spec. */
export type TemplateShape = 'reminder' | 'invitation' | 'submission_request' | 'notice'

export type TemplateGenre =
  | 'conduct' | 'maintenance' | 'safety'
  | 'community-life' | 'governance' | 'seasonal' | 'family'

export type TemplateAudience = 'broadcast' | 'segment' | 'single_property'

export type QuestionType =
  | 'text' | 'textarea' | 'date' | 'time' | 'number' | 'select' | 'multiselect'

export interface TemplateQuestion {
  /** snake_case, and IS the merge field name. Draw from the shared
   *  vocabulary in Appendix B of the design spec — the same concept must
   *  use the same field name in every template. */
  id: string
  label: string
  type: QuestionType
  /** Required for select and multiselect, ignored otherwise. */
  options?: readonly string[]
  required: boolean
  /** Shown under the field. Use it to tell the board member what good
   *  looks like, not to restate the label. */
  help?: string
  /** Used when the question is optional and unanswered, so strict render
   *  still has a value. */
  fallback?: string
}

export interface CommunityTemplate {
  slug: string
  name: string
  description: string
  genre: TemplateGenre
  shape: TemplateShape
  audience: TemplateAudience
  /** Mid-tone hex; validated at registry load. */
  accentColor: string
  visual: VisualBlockSpec
  /** Both may contain {{ merge_field }} placeholders. */
  subject: string
  /** Inbox preview line. */
  preview: string
  /** Ordered body blocks. */
  body: BodyBlock[]
  questions: readonly TemplateQuestion[]
  /** Placeholders supplied by code at render time rather than by a question —
   *  e.g. the lease-cap occupancy figures, which come from the database. Listing
   *  a field here satisfies the validator without asking a board member for data
   *  the application already holds. */
  providedFields?: readonly string[]
  /** Rendered as a highlighted panel. The practical detail a resident needs. */
  callout?: string
  cta?: { label: string; urlField: string }
  /** Not rendered. Shown to the board member in the composer, and the
   *  reason several of these templates exist at all. */
  legalNote?: string
}

export type BodyBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'visual' }
  | { type: 'callout'; text: string }
  | { type: 'list'; items: string[] }
