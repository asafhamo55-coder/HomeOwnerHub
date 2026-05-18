/**
 * Merge-field rendering for communication templates.
 *
 * Supports `{{ field_name }}` and `{{field_name}}` syntax. Field lookup
 * is case-sensitive against a flat string-keyed bag. Missing fields
 * default to an empty string and are reported back to the caller so the
 * UI can warn ("3 fields had no value: owner_phone, due_date, late_fee").
 *
 * Intentionally NOT a full template engine — no logic, no loops. Comms
 * templates that need conditional copy live in separate template rows.
 */

export type MergeBag = Record<string, string | number | null | undefined>

export interface RenderResult {
  rendered: string
  missingFields: string[]
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function renderTemplate(source: string, bag: MergeBag): RenderResult {
  const missing = new Set<string>()
  const rendered = source.replace(PLACEHOLDER_RE, (_match, name: string) => {
    const value = bag[name]
    if (value === undefined || value === null || value === '') {
      missing.add(name)
      return ''
    }
    return String(value)
  })
  return { rendered, missingFields: [...missing] }
}

/** Strict variant — throws when a field is missing. Used by the send
 *  pipeline so a half-baked message never leaves the system. */
export function renderTemplateStrict(source: string, bag: MergeBag): string {
  const { rendered, missingFields } = renderTemplate(source, bag)
  if (missingFields.length > 0) {
    throw new Error(`missing merge fields: ${missingFields.join(', ')}`)
  }
  return rendered
}

/** Extract the field names a template references. Used by the template
 *  editor to populate the `variables` jsonb column automatically. */
export function extractMergeFields(source: string): string[] {
  const fields = new Set<string>()
  let match: RegExpExecArray | null
  const re = new RegExp(PLACEHOLDER_RE)
  while ((match = re.exec(source)) !== null) {
    fields.add(match[1])
  }
  return [...fields].sort()
}
