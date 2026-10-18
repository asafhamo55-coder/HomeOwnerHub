import { runCloud } from '../agents/cloud'

/**
 * BL-029 — the "Main changes vs last year" paragraph for the board packet.
 *
 * The same division of labour as the daily digest: the app computes every
 * figure and passes it in as finished text; the model only writes a short
 * paragraph around them. A reply containing any number that isn't in the
 * facts is rejected outright (acceptBudgetNarrative), so a model that does
 * its own arithmetic — or misremembers a figure — never reaches the board.
 */

export const MAX_BUDGET_NARRATIVE_CHARS = 700

export interface BudgetNarrativeInput {
  yearLabel: string
  fundName: string
  inflationPct: number
  /** Pre-formatted by the caller, e.g. '$122,714'. */
  totals: { income: string; expense: string; net: string; priorIncome: string; priorExpense: string }
  /** Pre-formatted, biggest first. */
  changes: { accountName: string; from: string; to: string; change: string }[]
}

export function budgetNarrativeFacts(input: BudgetNarrativeInput): string {
  const lines = [
    `Budget year: ${input.yearLabel} (${input.fundName})`,
    `Inflation assumption: +${input.inflationPct}%`,
    `Income: ${input.totals.income} (last year budget ${input.totals.priorIncome})`,
    `Expenses: ${input.totals.expense} (last year budget ${input.totals.priorExpense})`,
    `Surplus or deficit: ${input.totals.net}`,
    'Largest changes against last year’s budget:',
    ...(input.changes.length > 0
      ? input.changes.map((c) => `- ${c.accountName}: ${c.from} → ${c.to} (${c.change})`)
      : ['- none']),
  ]
  return lines.join('\n')
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/g
const numbersIn = (text: string) => new Set((text.match(NUMBER) ?? []).map((n) => n.replace(/,/g, '')))

function stripCodeFence(text: string): string {
  const fenced = /^```[a-z]*\s*\n([\s\S]*?)\n?```$/.exec(text.trim())
  return fenced ? fenced[1].trim() : text.trim()
}

/** The cleaned paragraph, or null to show the computed list on its own. */
export function acceptBudgetNarrative(raw: string | null | undefined, facts: string): string | null {
  if (raw === null || raw === undefined) return null
  const text = stripCodeFence(raw)
  if (text === '' || text.length > MAX_BUDGET_NARRATIVE_CHARS) return null
  const allowed = numbersIn(facts)
  for (const n of numbersIn(text)) if (!allowed.has(n)) return null
  return text
}

export async function generateBudgetNarrative(input: BudgetNarrativeInput): Promise<string | null> {
  const facts = budgetNarrativeFacts(input)
  const raw = await runCloud(
    'You write short, plain summaries of an HOA draft budget for the board packet. Do not calculate anything: use only the figures given, copied exactly, and add no other numbers or percentages.',
    `${facts}

Write ONE paragraph of 2–4 sentences, under ${MAX_BUDGET_NARRATIVE_CHARS} characters,
titled nothing, describing the main changes against last year's budget for the board.
Mention the largest changes by name. Plain text only, no bullets, no markdown.`,
    { max_tokens: 300 },
  )
  return acceptBudgetNarrative(raw, facts)
}
