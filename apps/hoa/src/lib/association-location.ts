import { z } from 'zod'

/**
 * The community's own city and ZIP, set once by the board.
 *
 * STORAGE. No migration: two keys inside associations.compliance_settings,
 * next to the others (every write keeps them). The associations table has a
 * state but no city or ZIP, and many rosters hold only the street line, so
 * the home photo route uses these to find each home on the map.
 *
 * Pure (zod only) so the unit tests need no database.
 */

export const COMMUNITY_CITY_KEY = 'community_city'
export const COMMUNITY_ZIP_KEY = 'community_zip'

export const COMMUNITY_LOCATION_HELP = 'Used to find each home on the map when a home’s address has only the street.'

export const saveCommunityLocationSchema = z.object({
  associationId: z.string().uuid(),
  city: z
    .string()
    .trim()
    .max(80, 'The city must be 80 characters or fewer.')
    .refine((v) => v === '' || /^[\p{L}][\p{L}\p{M}\s.'’-]*$/u.test(v), 'Use letters, spaces, . - and apostrophes only.')
    .default(''),
  zip: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{5}(-\d{4})?$/.test(v), 'Enter a 5-digit ZIP code, like 30067.')
    .default(''),
})

export type SaveCommunityLocationInput = z.input<typeof saveCommunityLocationSchema>

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** The stored city and ZIP, tolerant of anything malformed (empty strings). */
export function readCommunityLocation(complianceSettings: unknown): { city: string; zip: string } {
  const o = asObject(complianceSettings)
  const city = typeof o?.[COMMUNITY_CITY_KEY] === 'string' ? (o[COMMUNITY_CITY_KEY] as string).trim().slice(0, 80) : ''
  const zipRaw = typeof o?.[COMMUNITY_ZIP_KEY] === 'string' ? (o[COMMUNITY_ZIP_KEY] as string).trim() : ''
  return { city, zip: /^\d{5}(-\d{4})?$/.test(zipRaw) ? zipRaw : '' }
}

/** compliance_settings with the city and ZIP replaced; every other key kept. */
export function withCommunityLocation(complianceSettings: unknown, loc: { city: string; zip: string }): Record<string, unknown> {
  return { ...(asObject(complianceSettings) ?? {}), [COMMUNITY_CITY_KEY]: loc.city, [COMMUNITY_ZIP_KEY]: loc.zip }
}
