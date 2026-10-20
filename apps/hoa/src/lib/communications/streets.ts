/**
 * BL-102 A5: "Homes on Elm St" as an audience, from the address data the
 * HOA already has (units.address_line1). No migration.
 *
 * A street is parsed from each unit's first address line: the leading house
 * number and any trailing unit ("Apt 4", "#2") are dropped, and direction
 * words and street suffixes are normalized, so "123 N Elm Street" and
 * "45 North Elm St." both land on "N Elm St".
 *
 * A chosen street resolves to the existing `specific_units` audience with
 * those unit ids (./audience.ts), optionally owners only. The board sees
 * the count before Send, and the composer's preview shows a sample home.
 *
 * Pure apart from loadStreetOptions. Nothing here logs: street names are
 * address data.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { unitIdsOfDeletedProperties } from '@/lib/properties/lot'

const SUFFIX: Record<string, string> = {
  street: 'St', st: 'St', str: 'St',
  avenue: 'Ave', ave: 'Ave', av: 'Ave',
  road: 'Rd', rd: 'Rd',
  drive: 'Dr', dr: 'Dr',
  lane: 'Ln', ln: 'Ln',
  court: 'Ct', ct: 'Ct',
  place: 'Pl', pl: 'Pl',
  boulevard: 'Blvd', blvd: 'Blvd',
  circle: 'Cir', cir: 'Cir',
  terrace: 'Ter', ter: 'Ter',
  parkway: 'Pkwy', pkwy: 'Pkwy',
  trail: 'Trl', trl: 'Trl',
  highway: 'Hwy', hwy: 'Hwy',
  square: 'Sq', sq: 'Sq',
  loop: 'Loop',
  way: 'Way',
  run: 'Run',
  cove: 'Cv', cv: 'Cv',
  point: 'Pt', pt: 'Pt',
}

const DIRECTION: Record<string, string> = {
  north: 'N', n: 'N',
  south: 'S', s: 'S',
  east: 'E', e: 'E',
  west: 'W', w: 'W',
  northeast: 'NE', ne: 'NE',
  northwest: 'NW', nw: 'NW',
  southeast: 'SE', se: 'SE',
  southwest: 'SW', sw: 'SW',
}

/** Unit designators that start the trailing "Apt 4" part of a line. */
const UNIT_WORDS = new Set(['apt', 'apartment', 'unit', 'ste', 'suite', 'bldg', 'building', 'lot', 'fl', 'floor', 'rm', 'room'])

function titleCase(word: string): string {
  if (/^\d/.test(word)) return word.toLowerCase() // "5th", "21st"
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/**
 * The street of an address line, normalized for display ("N Elm St"), or
 * null when there is no house number to strip or nothing left after it.
 * Requiring a leading house number keeps lines like "PO Box 12" or a bare
 * lot name from becoming a street.
 */
export function streetOf(addressLine1: string | null | undefined): string | null {
  if (!addressLine1) return null
  // Only the first part: "12 Elm St, Springfield" → "12 Elm St".
  let line = addressLine1.split(',')[0]?.trim() ?? ''
  // Drop a trailing "#4" / "# 4".
  line = line.replace(/\s*#\s*\S+$/, '')
  const words = line.split(/\s+/).filter(Boolean)
  // Leading house number: "123", "123A", "123-B", "12½".
  if (words.length < 2 || !/^\d+[\w½-]*$/.test(words[0])) return null
  const rest = words.slice(1).map((w) => w.replace(/[.,]+$/, ''))
  const cut = rest.findIndex((w) => UNIT_WORDS.has(w.toLowerCase()))
  const street = (cut === -1 ? rest : rest.slice(0, cut)).filter(Boolean)
  if (street.length === 0) return null
  const out = street.map((w, i) => {
    const lower = w.toLowerCase()
    // A direction word only at the start or end ("N Elm St", "Elm St NW").
    if ((i === 0 || i === street.length - 1) && DIRECTION[lower] && street.length > 1) return DIRECTION[lower]
    // A suffix only as the last word, so "Court St" keeps "Court".
    if (i === street.length - 1 && SUFFIX[lower]) return SUFFIX[lower]
    if (i === street.length - 2 && SUFFIX[lower] && DIRECTION[street[street.length - 1].toLowerCase()]) return SUFFIX[lower]
    return titleCase(w)
  })
  return out.join(' ')
}

/** Comparison key for a street name: case- and punctuation-free. */
export function streetKey(street: string): string {
  return street.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

export interface StreetOption {
  /** streetKey of the label. */
  key: string
  /** "Elm St". */
  label: string
  unitIds: string[]
  /** Homes on the street with a current owner on file. */
  ownerCount: number
}

export interface StreetUnit {
  id: string
  address_line1: string | null
}

/** Group units by street, largest street first, then by name. */
export function groupUnitsByStreet(units: readonly StreetUnit[], ownerUnitIds: ReadonlySet<string>): StreetOption[] {
  const byKey = new Map<string, { label: string; labels: Map<string, number>; unitIds: string[]; ownerCount: number }>()
  for (const u of units) {
    const street = streetOf(u.address_line1)
    if (!street) continue
    const key = streetKey(street)
    if (!key) continue
    let entry = byKey.get(key)
    if (!entry) {
      entry = { label: street, labels: new Map(), unitIds: [], ownerCount: 0 }
      byKey.set(key, entry)
    }
    entry.labels.set(street, (entry.labels.get(street) ?? 0) + 1)
    entry.unitIds.push(u.id)
    if (ownerUnitIds.has(u.id)) entry.ownerCount += 1
  }
  return [...byKey.entries()]
    .map(([key, e]) => {
      // The most common spelling wins the label.
      const label = [...e.labels.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
      return { key, label, unitIds: e.unitIds, ownerCount: e.ownerCount }
    })
    .sort((a, b) => b.unitIds.length - a.unitIds.length || a.label.localeCompare(b.label))
}

/**
 * Match a street the board typed (or the AI picked up) against the HOA's
 * streets. Exact on the normalized key first; then a typed name without a
 * suffix ("Elm") matches when exactly one street starts with it. Anything
 * ambiguous returns null so the board picks.
 */
export function matchStreet(typed: string | null | undefined, options: readonly StreetOption[]): StreetOption | null {
  if (!typed) return null
  const fakeLine = `1 ${typed.trim()}`
  const normalized = streetOf(fakeLine)
  const key = streetKey(normalized ?? typed)
  if (!key) return null
  const exact = options.find((o) => o.key === key)
  if (exact) return exact
  const prefix = options.filter((o) => o.key === key || o.key.startsWith(`${key} `))
  return prefix.length === 1 ? prefix[0] : null
}

/** "Homes on Elm St" / "Owners on Elm St". */
export function streetAudienceLabel(street: string, ownersOnly: boolean): string {
  return `${ownersOnly ? 'Owners' : 'Homes'} on ${street}`
}

/**
 * The HOA's streets, from the same unit roster resolveAudience uses
 * (deleted properties left out the same way). A failed read returns [] so
 * the composer simply offers no street option.
 */
export async function loadStreetOptions(
  db: SupabaseClient<Database>,
  associationId: string,
): Promise<StreetOption[]> {
  const { data: units, error } = await db
    .from('units')
    .select('id, address_line1')
    .eq('association_id', associationId)
  if (error || !units || units.length === 0) return []
  let rows = units as StreetUnit[]
  try {
    const deleted = await unitIdsOfDeletedProperties(db, rows.map((u) => u.id))
    rows = rows.filter((u) => !deleted.has(u.id))
  } catch {
    // Same as resolveAudience: a failed check keeps the roster as it was.
  }
  if (rows.length === 0) return []
  const { data: owners } = await db
    .from('ownerships')
    .select('unit_id')
    .in('unit_id', rows.map((u) => u.id))
    .is('valid_to', null)
  const ownerUnitIds = new Set(((owners ?? []) as Array<{ unit_id: string }>).map((o) => o.unit_id))
  return groupUnitsByStreet(rows, ownerUnitIds)
}
