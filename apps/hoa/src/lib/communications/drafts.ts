/**
 * BL-102 A9: autosaved composer drafts, with no migration.
 *
 * A draft is an ordinary `communications` row with `status = 'draft'` (an
 * allowed value since 0018). It never sends and never counts in results:
 *
 *   - nothing delivers a draft — the send path inserts its own row, and the
 *     scheduled dispatcher only claims `status = 'scheduled'`;
 *   - a draft has no `communication_recipients` rows, and every
 *     resident-facing reader keys on recipient rows or `status = 'sent'`;
 *   - the Communications list keeps drafts out of the main view and its
 *     delivery figures, under their own "Drafts" filter.
 *
 * The composer's full state lives in `audience_definition` as
 * `{ kind: 'draft', composer: <ComposerDraftState> }`. Nothing resolves an
 * audience from a draft row, so the marker kind is never read as one. The
 * board's real audience is built from this state only when they press Send.
 *
 * Pure. Nothing here logs (draft state holds names and addresses).
 */

export const DRAFT_STATE_VERSION = 1

/** The audience kinds the composer offers (AudienceStep's AudienceKind). */
const AUDIENCE_KINDS = [
  'everyone',
  'owners_only',
  'tenants_only',
  'late_on_dues',
  'open_violations',
  'board',
  'specific_property',
  'street',
  'follow_up',
  'manual_emails',
] as const
export type DraftAudienceKind = (typeof AUDIENCE_KINDS)[number]

/** Same list as send.ts and the communications_category_check (0044). */
const CATEGORIES = [
  'welcome',
  'dues',
  'meeting',
  'violation',
  'arc',
  'financial',
  'emergency',
  'announcement',
  'custom',
  'community',
] as const
export type DraftCategory = (typeof CATEGORIES)[number]

const CHANNELS = ['email', 'sms', 'portal'] as const

export interface DraftFollowUp {
  originalId: string
  originalSubject: string
  via: 'email' | 'text'
  subject: string
  bodyHtml: string
  unitIds: string[]
  ownersOnly: boolean
  spanishDropped: boolean
  missing: string[]
}

export interface ComposerDraftState {
  v: typeof DRAFT_STATE_VERSION
  step: number
  templateId: string
  baseCategory: DraftCategory
  audience: DraftAudienceKind
  selectedPropertyId: string
  checkedResidentIds: string[]
  checkedBoardIds: string[]
  manualContacts: { email: string; phone: string; name: string }[]
  selectedStreetKey: string
  streetOwnersOnly: boolean
  answers: Record<string, string | string[]>
  subject: string
  bodyHtml: string
  channels: string[]
  urgency: 'routine' | 'urgent'
  channelsTouched: boolean
  scheduledFor: string
  spanish: { subject: string; bodyHtml: string; viewed: boolean; sourceKey: string } | null
  officialNotice: boolean
  followUp: DraftFollowUp | null
}

/** Larger than any real message; stops a runaway payload, not a letter. */
export const MAX_DRAFT_BYTES = 256 * 1024

export const UNTITLED_DRAFT = 'Untitled draft'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

function str(v: unknown, max = 100_000): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function parseFollowUp(v: unknown): DraftFollowUp | null {
  if (!v || typeof v !== 'object') return null
  const f = v as Record<string, unknown>
  if (!isUuid(f.originalId)) return null
  const unitIds = strList(f.unitIds).filter(isUuid)
  if (unitIds.length === 0) return null
  return {
    originalId: f.originalId,
    originalSubject: str(f.originalSubject, 255),
    via: f.via === 'text' ? 'text' : 'email',
    subject: str(f.subject, 255),
    bodyHtml: str(f.bodyHtml),
    unitIds,
    ownersOnly: f.ownersOnly === true,
    spanishDropped: f.spanishDropped === true,
    missing: strList(f.missing),
  }
}

/**
 * Read a stored (or client-sent) draft back into composer state, dropping
 * anything malformed rather than trusting it. Null when it isn't a draft.
 */
export function parseDraftState(raw: unknown): ComposerDraftState | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (s.v !== DRAFT_STATE_VERSION) return null

  const answers: Record<string, string | string[]> = {}
  if (s.answers && typeof s.answers === 'object' && !Array.isArray(s.answers)) {
    for (const [k, v] of Object.entries(s.answers as Record<string, unknown>)) {
      if (typeof v === 'string') answers[k] = v
      else if (Array.isArray(v)) answers[k] = strList(v)
    }
  }

  const manualContacts = Array.isArray(s.manualContacts)
    ? s.manualContacts
        .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
        .map((c) => ({ email: str(c.email, 320), phone: str(c.phone, 40), name: str(c.name, 200) }))
        .filter((c) => c.email || c.phone)
    : []

  let spanish: ComposerDraftState['spanish'] = null
  if (s.spanish && typeof s.spanish === 'object') {
    const sp = s.spanish as Record<string, unknown>
    spanish = {
      subject: str(sp.subject, 255),
      bodyHtml: str(sp.bodyHtml),
      viewed: sp.viewed === true,
      sourceKey: str(sp.sourceKey),
    }
  }

  const followUp = parseFollowUp(s.followUp)
  let audience = oneOf(s.audience, AUDIENCE_KINDS, 'everyone')
  // A follow-up audience without its homes can't be rebuilt.
  if (audience === 'follow_up' && !followUp) audience = 'everyone'

  const step = typeof s.step === 'number' && Number.isInteger(s.step) ? Math.min(Math.max(s.step, 0), 2) : 0

  return {
    v: DRAFT_STATE_VERSION,
    step,
    templateId: str(s.templateId, 200),
    baseCategory: oneOf(s.baseCategory, CATEGORIES, 'announcement'),
    audience,
    selectedPropertyId: isUuid(s.selectedPropertyId) ? s.selectedPropertyId : '',
    checkedResidentIds: strList(s.checkedResidentIds).filter(isUuid),
    checkedBoardIds: strList(s.checkedBoardIds).filter(isUuid),
    manualContacts,
    selectedStreetKey: str(s.selectedStreetKey, 300),
    streetOwnersOnly: s.streetOwnersOnly === true,
    answers,
    subject: str(s.subject, 255),
    bodyHtml: str(s.bodyHtml),
    channels: strList(s.channels).filter((c) => (CHANNELS as readonly string[]).includes(c)),
    urgency: s.urgency === 'urgent' ? 'urgent' : 'routine',
    channelsTouched: s.channelsTouched === true,
    scheduledFor: str(s.scheduledFor, 40),
    spanish,
    officialNotice: s.officialNotice === true,
    followUp,
  }
}

/**
 * Nothing worth keeping yet: no subject, no body, no answers. The composer
 * does not create a draft row for an untouched page.
 */
export function isDraftEmpty(s: Pick<ComposerDraftState, 'subject' | 'bodyHtml' | 'answers'>): boolean {
  const bodyText = s.bodyHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  const anyAnswer = Object.values(s.answers).some((v) => (Array.isArray(v) ? v.length > 0 : v.trim() !== ''))
  return s.subject.trim() === '' && bodyText === '' && !anyAnswer
}

/**
 * The communications columns a draft row stores. The listed columns are
 * only what the list shows; the composer resumes from `composer`.
 */
export function draftRowFields(s: ComposerDraftState): {
  category: DraftCategory
  subject: string
  body_html: string
  body_text: null
  channels: string[]
  audience_definition: { kind: 'draft'; composer: ComposerDraftState }
  audience_summary: null
  related_resource: null
  template_id: null
  scheduled_for: null
} {
  // An urgent message is filed as an emergency at send time; a draft keeps
  // the category the board picked, so it doesn't change on resume.
  const channels = s.channels.length > 0 ? s.channels : ['email']
  return {
    category: s.baseCategory,
    subject: s.subject.trim().slice(0, 255),
    body_html: s.bodyHtml,
    body_text: null,
    channels,
    audience_definition: { kind: 'draft', composer: s },
    audience_summary: null,
    // Drafts link to nothing and schedule nothing: a follow-up's link to its
    // original, the template and the send time are kept in `composer` and
    // applied only by the real send.
    related_resource: null,
    template_id: null,
    scheduled_for: null,
  }
}

/** The composer state stored on a draft row's audience_definition. */
export function draftStateFromRow(audienceDefinition: unknown): ComposerDraftState | null {
  if (!audienceDefinition || typeof audienceDefinition !== 'object') return null
  const def = audienceDefinition as { kind?: unknown; composer?: unknown }
  if (def.kind !== 'draft') return null
  return parseDraftState(def.composer)
}

/** The list's title for a draft: its subject, or "Untitled draft". */
export function draftTitle(subject: string): string {
  return subject.trim() || UNTITLED_DRAFT
}

/** "/communications/new?draft=<id>": where a draft is resumed. */
export function draftHref(id: string): string {
  return `/communications/new?draft=${id}`
}
