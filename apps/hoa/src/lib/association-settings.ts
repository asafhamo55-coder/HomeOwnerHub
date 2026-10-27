import { z } from 'zod'
import { complianceState } from '@/lib/compliance/state'
import { capSummary, lateFeeLaw, lateFeeStateOf } from '@/lib/late-fees/law'
import { US_STATES, isUsStateCode } from '@/lib/us-states'

/**
 * BL-176: Settings -> Association. Pure parts: the input schema and the
 * plain-language "What changes" list shown before a state or type change
 * is saved. Dependency-light on purpose so the unit tests render it
 * without a database.
 */

export const ASSOCIATION_TYPES = ['hoa', 'condo', 'coop'] as const
export type AssociationKind = (typeof ASSOCIATION_TYPES)[number]

export const ASSOCIATION_TYPE_LABEL: Record<AssociationKind, string> = {
  hoa: 'HOA',
  condo: 'Condominium',
  coop: 'Co-op',
}

const stateCode = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine(isUsStateCode, 'Pick a US state.')

export const updateAssociationSchema = z.object({
  associationId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(2, 'Give the association a name (2 to 200 characters).')
    .max(200, 'Give the association a name (2 to 200 characters).'),
  state: stateCode,
  type: z.enum(ASSOCIATION_TYPES),
  /** Blank or missing means "same as the state". */
  governingLawState: z
    .union([stateCode, z.literal(''), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
})

export type UpdateAssociationInput = z.input<typeof updateAssociationSchema>

export interface AssociationSnapshot {
  state: string | null
  governingLawState: string | null
  type: string | null
}

export interface ChangeItem {
  /** Short heading, e.g. "Late-fee cap". */
  topic: string
  /** Plain sentence of what happens. */
  text: string
}

export interface StateChangeSummary {
  changed: boolean
  items: ChangeItem[]
  /** Shown after the list: what is NOT rewritten. */
  unchanged: string[]
}

const NOT_REWRITTEN = [
  'Nothing already recorded is rewritten: dues, payments, violations, meetings and documents stay as they are.',
  'A saved late-fee policy stays saved. Open Late fees afterwards to check it against the new state’s cap.',
]

export function stateName(code: string | null | undefined): string {
  const c = (code ?? '').trim().toUpperCase()
  return US_STATES.find((s) => s.code === c)?.name ?? (c || 'no state')
}

function lawLine(state: string | null, type: string | null): string {
  const law = lateFeeLaw(state, type)
  return law ? `${law.citation}, ${capSummary(law)}` : 'no cap loaded (your governing documents decide)'
}

/**
 * What switches when an association moves from `from` to `to`. The
 * effective state is the governing-law state, else the state, exactly as
 * `complianceState` and `lateFeeStateOf` read it everywhere else.
 */
export function describeStateChange(from: AssociationSnapshot, to: AssociationSnapshot): StateChangeSummary {
  const fromEff = lateFeeStateOf({ state: from.state, governing_law_state: from.governingLawState })
  const toEff = lateFeeStateOf({ state: to.state, governing_law_state: to.governingLawState })
  const fromType = (from.type ?? 'hoa').toLowerCase()
  const toType = (to.type ?? 'hoa').toLowerCase()

  const stateChanged = fromEff !== toEff
  const typeChanged = fromType !== toType
  const items: ChangeItem[] = []
  if (!stateChanged && !typeChanged) return { changed: false, items, unchanged: [] }

  const fromCs = complianceState(from.governingLawState, from.state)
  const toCs = complianceState(to.governingLawState, to.state)
  const fromName = stateName(fromEff)
  const toName = stateName(toEff)

  if (stateChanged) {
    if (fromCs === 'GA' && toCs !== 'GA') {
      items.push({
        topic: 'Georgia SB 406',
        text: 'The Georgia SB 406 checks, the Georgia corporate registration gate and the Georgia deadlines stop applying.',
      })
    } else if (toCs === 'GA' && fromCs !== 'GA') {
      items.push({
        topic: 'Georgia SB 406',
        text: 'The Georgia SB 406 checks, the Georgia corporate registration gate and the Georgia deadlines start applying.',
      })
    }
    if (fromCs !== toCs && toCs !== null) {
      items.push({
        topic: 'Registration kit and deadlines',
        text: `The registration kit and the compliance calendar switch from ${fromCs ? fromName : 'no loaded state'} to ${toName} rules.`,
      })
    } else if (fromCs !== toCs) {
      items.push({
        topic: 'Registration kit and deadlines',
        text: `${toName} has no state rules loaded yet, so the registration kit and the state deadlines are hidden. Federal deadlines stay.`,
      })
    }
    if ((fromCs === 'GA') !== (toCs === 'GA')) {
      items.push({
        topic: 'Collections letters',
        text:
          toCs === 'GA'
            ? 'The Georgia notices before attorney’s fees and before foreclosure become available.'
            : 'The Georgia notices before attorney’s fees and before foreclosure are no longer offered.',
      })
    }
    items.push({
      topic: 'State Law answers',
      text: `State Law answers draw on ${toName} law instead of ${fromName}.`,
    })
  }

  if (typeChanged) {
    const label = ASSOCIATION_TYPE_LABEL[toType as AssociationKind] ?? toType
    items.push({
      topic: 'Condo vs HOA law',
      text:
        toCs === 'GA'
          ? toType === 'condo'
            ? 'Georgia: the Georgia Condominium Act applies instead of the Property Owners’ Association Act.'
            : 'Georgia: the Property Owners’ Association Act applies instead of the Georgia Condominium Act.'
          : `The association is treated as ${label}. Condo and HOA wording and rules switch where HomeownerHub has them.`,
    })
  }

  const fromLaw = lawLine(fromEff, fromType)
  const toLaw = lawLine(toEff, toType)
  if (fromLaw !== toLaw) {
    items.push({
      topic: 'Late-fee cap',
      text: `The late-fee cap changes from ${fromLaw} to ${toLaw}.`,
    })
  }

  return { changed: true, items, unchanged: NOT_REWRITTEN }
}

// Kept out of association-settings-actions.ts: a 'use server' file may only
// export async functions.
export const ASSOCIATION_SETTINGS_AUDIT_ACTION = 'association.settings_updated'

export const ADMIN_ONLY_DENIED = 'Only an admin of your HOA can change the association’s state or type.'
