/**
 * Read-side rendering of a communication for the staff-facing history.
 *
 * The send pipeline stores the *template* on `communications.subject` /
 * `body_html` and renders it per recipient at delivery time
 * (send.ts → renderTemplateStrict). That is correct for sending and
 * useless for reading: the history list showed staff
 * `{{association_name_text}} dues — {{amount_summary}}` rather than
 * anything a resident ever received.
 *
 * Merge fields split cleanly in two, and the split is what this module
 * is built around:
 *
 *  - **Association-level** — `association_name`, `association_name_text`.
 *    Identical for every recipient of every campaign, so they can be
 *    resolved exactly at read time, including for messages sent long
 *    before `rendered_subject` existed.
 *
 *  - **Per-recipient** — `amount_summary`, `owner_name`, `dues_table`…
 *    (see merge-bag.ts and dues-reminders/actions.ts). Different for
 *    every reader, so a single summary line cannot show a value at all.
 *    These become a short human label and are reported back, so the UI
 *    can mark the row "Personalized" rather than implying one value.
 *
 * For subjects sent after migration 0050 the exact delivered string is
 * on `communication_recipients.rendered_subject`; pickDisplaySubject
 * prefers it and only falls back to labels. Bodies are always resolved
 * this way — storing a rendered body per recipient would mean a copy of
 * the dues charge table (`dues_table`) per owner, megabytes a campaign.
 */

/** Fields whose value is the same for every recipient, so a summary can
 *  show the real thing. Both spellings exist because the send path
 *  escapes one for HTML and leaves the other raw for plain text. */
const ASSOCIATION_FIELDS = new Set(['association_name', 'association_name_text'])

/**
 * Short labels for fields that vary per recipient. Kept as nouns so they
 * read as prose in a subject line — "Madison Park dues — amount due" —
 * rather than as a leftover variable name.
 *
 * An unlisted field is not an error: it falls back to its de-underscored
 * name, which is usually close enough. This map only exists to make the
 * fields we ship today read well.
 */
export const PERSONALIZED_FIELD_LABEL: Record<string, string> = {
  amount_summary: 'amount due',
  dues_table: 'dues table',
  dues_text: 'dues table',
  owner_name: 'owner',
  owner_name_text: 'owner',
  recipient_name: 'recipient',
  unit_id: 'unit',
  unit_address: 'property',
  lease_meter_html: 'lease meter',
}

/** Mirrors templates.ts PLACEHOLDER_RE — same syntax, different intent. */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export interface DisplayContext {
  associationName: string
}

export interface DisplayResult {
  text: string
  /** Field names that had to be labelled because they vary per reader. */
  personalizedFields: string[]
}

function labelFor(field: string): string {
  return PERSONALIZED_FIELD_LABEL[field] ?? field.replace(/_/g, ' ')
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Resolve a plain-text template — a subject line — for display.
 * Never throws: a history row must render even when the template
 * references a field nobody supplies any more.
 */
export function resolveForDisplay(source: string, ctx: DisplayContext): DisplayResult {
  const personalized = new Set<string>()
  const text = source.replace(PLACEHOLDER_RE, (_m, field: string) => {
    if (ASSOCIATION_FIELDS.has(field)) return ctx.associationName
    personalized.add(field)
    return labelFor(field)
  })
  return { text, personalizedFields: [...personalized] }
}

export interface DisplayHtmlResult {
  html: string
  personalizedFields: string[]
}

/**
 * Same resolution for the stored body HTML shown on the detail page.
 *
 * Values are escaped before insertion because the caller hands the
 * result to dangerouslySetInnerHTML: the association name is
 * staff-entered free text, and the raw send path only escapes it for
 * campaigns that opt in (dues supplies its own escaped
 * `association_name`). Escaping here keeps the preview safe regardless.
 *
 * The chip markup is ours and the field name is constrained to
 * [a-zA-Z0-9_] by the placeholder pattern, so neither can inject.
 *
 * Styling rides on Tailwind utilities written literally here rather than
 * a `.merge-chip` rule in a stylesheet: JIT scans this file, so the chip
 * needs no shared CSS to own. `merge-chip` is kept purely as a stable
 * hook for tests and for anyone who later wants to restyle it.
 */
export function resolveHtmlForDisplay(
  source: string,
  ctx: DisplayContext,
): DisplayHtmlResult {
  const personalized = new Set<string>()
  const html = source.replace(PLACEHOLDER_RE, (_m, field: string) => {
    if (ASSOCIATION_FIELDS.has(field)) return escapeHtml(ctx.associationName)
    personalized.add(field)
    return (
      `<span class="merge-chip rounded bg-muted/15 px-1 py-0.5 text-[0.9em] italic text-muted" ` +
      `title="Personalized — each recipient saw their own value here">` +
      `${escapeHtml(labelFor(field))}</span>`
    )
  })
  return { html, personalizedFields: [...personalized] }
}

export interface PickDisplaySubjectArgs extends DisplayContext {
  /** The template as persisted on `communications.subject`. */
  subject: string
  /** `rendered_subject` from every recipient row, nulls included —
   *  a row whose render threw never got one. */
  renderedSubjects: (string | null)[]
}

export interface DisplaySubject extends DisplayResult {
  /** True when this is the literal string recipients received, rather
   *  than a template with per-recipient fields labelled. */
  exact: boolean
}

/**
 * The subject to show for a whole communication.
 *
 * Only claims `exact` when every recipient that got a subject got the
 * *same* one. A dues campaign to five owners has five different
 * subjects; showing the first would quietly attribute one owner's
 * balance to the campaign as a whole.
 */
export function pickDisplaySubject({
  subject,
  associationName,
  renderedSubjects,
}: PickDisplaySubjectArgs): DisplaySubject {
  const distinct = new Set(renderedSubjects.filter((s): s is string => Boolean(s)))
  if (distinct.size === 1) {
    return { text: [...distinct][0], personalizedFields: [], exact: true }
  }
  return { ...resolveForDisplay(subject, { associationName }), exact: false }
}
