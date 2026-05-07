import { runFast } from '../agents/fast'

// Cheap classifier used to route free-text user input (chat search, command
// palette) to the correct workflow. Intentionally narrow output — anything
// off-list maps to "unknown" and the UI shows a help prompt.
export type Intent =
  | 'create_violation'
  | 'create_eviction_case'
  | 'find_property'
  | 'find_violation'
  | 'view_dues'
  | 'unknown'

export async function classifyIntent(userInput: string): Promise<Intent> {
  const raw = await runFast(
    [
      {
        role: 'system',
        content:
          'Classify the user request into exactly one label: create_violation, create_eviction_case, find_property, find_violation, view_dues, unknown. Reply with the label only.',
      },
      { role: 'user', content: userInput },
    ],
    { max_tokens: 16 },
  )

  const label = raw.trim().toLowerCase().split(/\s+/)[0] ?? 'unknown'
  const allowed: Intent[] = [
    'create_violation',
    'create_eviction_case',
    'find_property',
    'find_violation',
    'view_dues',
    'unknown',
  ]
  return (allowed as string[]).includes(label) ? (label as Intent) : 'unknown'
}
