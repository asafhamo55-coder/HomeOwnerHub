import { z } from 'zod'

/**
 * Board and emergency contacts the board chooses to publish to residents.
 *
 * STORAGE. No migration: the list lives in
 * associations.compliance_settings[BOARD_CONTACTS_KEY], next to the other
 * keys, and every write keeps them. Writes are board/admin only (RLS policy
 * associations_update, 0063, plus the role check in the server action).
 * Residents can read the association row, so this is exactly what they see.
 *
 * Pure (zod only) so the unit tests need no database.
 */

export const BOARD_CONTACTS_KEY = 'board_contacts'

/** Few on purpose: this is a short card, not a directory. */
export const MAX_BOARD_CONTACTS = 8

export const BOARD_CONTACTS_NOTICE =
  'Everyone in your HOA, including every resident, will see these contacts on their home page. Only add details you are happy to share.'

const text = (max: number, what: string) =>
  z.string().trim().max(max, `${what} must be ${max} characters or fewer.`)

export const boardContactSchema = z
  .object({
    label: text(60, 'The role or label').min(1, 'Add a role or label, like President or Gate.'),
    name: text(100, 'The name').default(''),
    phone: text(40, 'The phone number')
      .default('')
      .refine((v) => v === '' || /^[0-9+().\-\sx#]+$/.test(v), 'Use digits, spaces, + ( ) - only.')
      .refine((v) => v === '' || (v.match(/\d/g)?.length ?? 0) >= 7, 'A phone number needs at least 7 digits.'),
    email: text(200, 'The email')
      .default('')
      .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address.'),
    /** A gate, after-hours or emergency line. Shown as its own line. */
    emergencyLine: text(120, 'The emergency line').default(''),
  })
  .refine((c) => c.name !== '' || c.phone !== '' || c.email !== '' || c.emergencyLine !== '', {
    message: 'Add a name, phone, email or emergency line.',
    path: ['name'],
  })

export type BoardContact = z.output<typeof boardContactSchema>
export type BoardContactInput = z.input<typeof boardContactSchema>

export const saveBoardContactsSchema = z.object({
  associationId: z.string().uuid(),
  contacts: z.array(boardContactSchema).max(MAX_BOARD_CONTACTS, `Add at most ${MAX_BOARD_CONTACTS} contacts.`),
})

export type SaveBoardContactsInput = z.input<typeof saveBoardContactsSchema>

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/**
 * The contacts stored in compliance_settings, for display. Tolerant: an
 * entry that does not validate is dropped rather than failing the page, and
 * the list is capped.
 */
export function readBoardContacts(complianceSettings: unknown): BoardContact[] {
  const raw = asObject(complianceSettings)?.[BOARD_CONTACTS_KEY]
  if (!Array.isArray(raw)) return []
  const out: BoardContact[] = []
  for (const item of raw) {
    const p = boardContactSchema.safeParse(item)
    if (p.success) out.push(p.data)
    if (out.length >= MAX_BOARD_CONTACTS) break
  }
  return out
}

/** compliance_settings with the contacts replaced; every other key kept. */
export function withBoardContacts(complianceSettings: unknown, contacts: BoardContact[]): Record<string, unknown> {
  return { ...(asObject(complianceSettings) ?? {}), [BOARD_CONTACTS_KEY]: contacts }
}

/** Digits (and a leading +) only, for a tel: link. */
export function telHref(phone: string): string {
  const t = phone.trim()
  return `tel:${t.startsWith('+') ? '+' : ''}${t.replace(/\D/g, '')}`
}
