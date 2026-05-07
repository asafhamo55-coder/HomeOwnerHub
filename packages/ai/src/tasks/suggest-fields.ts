import { runReason } from '../agents/reason'

export interface FieldSuggestion {
  /** Field id, e.g. 'cure_period_days', 'fine_amount', 'severity'. */
  field: string
  /** Suggested value, stringified so the same shape works for numbers,
   *  enums, and short text. The caller parses it back. */
  value: string
  /** One-sentence rationale shown to the user as a tooltip / hint.
   *  Required so suggestions never look like magic. */
  reasoning: string
}

export interface SuggestFieldsInput {
  /** Wizard kind, drives which fields the model knows about. */
  kind: 'violation' | 'meeting' | 'eviction_case'
  /** What the user has already filled in. The model uses this as context. */
  partialState: Record<string, unknown>
  /** Specific fields the caller wants suggestions for. If empty, the model
   *  picks a sensible set based on the kind. */
  fields?: string[]
}

/**
 * Per-field AI recommendations for any wizard. Designed to be called on
 * focus / first-render, not on every keystroke. Returns a list of
 * { field, value, reasoning } that the wizard merges with the user's
 * existing state — the user can accept, edit, or dismiss each one.
 *
 * The reason agent (Qwen 2.5 14B, JSON mode) is the right fit: structured
 * output, low temperature, knows the wizard kinds.
 */
export async function suggestFieldValues(
  input: SuggestFieldsInput,
): Promise<FieldSuggestion[]> {
  const promptByKind: Record<SuggestFieldsInput['kind'], string> = {
    violation: `You are an HOA compliance expert. Suggest sensible defaults for a new violation report given what's known so far.

Typical fields:
  cure_period_days   integer 1-180, defaults: 7 (parking), 14 (general), 30 (architectural)
  fine_amount        integer 0-1000, typical $25-$100/day depending on severity
  severity           one of: low | medium | high
  violation_type     short string label like "front yard equipment", "trash placement"

Use the description and any other context to inform each suggestion. Be conservative: it's better to suggest a shorter cure period than too long.`,

    meeting: `You are an HOA board secretary. Suggest sensible defaults for new meeting minutes given what's known so far.

Typical fields:
  meeting_type       one of: board | annual | special | committee
  attendees          comma-separated list of attendee names if mentioned in transcript

Infer attendees from the transcript when names are clearly named (e.g. "Linda said...", "Treasurer report from John..."). Don't invent names.`,

    eviction_case: `You are a landlord-tenant attorney. Suggest sensible defaults for a new eviction case given what's known so far.

Typical fields:
  notice_type            one of: 3_day_pay_or_quit | 30_day_no_cause | cure_or_quit
  notice_served_method   one of: personal | posting | certified_mail
  cure_period_days       integer; for Texas residential nonpayment this is 3.

For Harris County TX residential nonpayment, default to 3_day_pay_or_quit + personal delivery.`,
  }

  const fieldsHint =
    input.fields && input.fields.length > 0
      ? `Suggest values specifically for: ${input.fields.join(', ')}.`
      : 'Suggest values for any field you have a confident default for.'

  const result = await runReason<{ suggestions: FieldSuggestion[] }>([
    {
      role: 'system',
      content: `${promptByKind[input.kind]}

Respond JSON only:
{
  "suggestions": [
    { "field": "cure_period_days", "value": "14", "reasoning": "Standard for general violations." }
  ]
}`,
    },
    {
      role: 'user',
      content: `Current wizard state (JSON):
${JSON.stringify(input.partialState, null, 2)}

${fieldsHint}`,
    },
  ])

  return Array.isArray(result?.suggestions) ? result.suggestions : []
}
