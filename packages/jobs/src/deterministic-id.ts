import { createHash } from 'node:crypto'

/**
 * A stable uuid for a namespaced key: SHA-256 of `key`, formatted as an
 * RFC 9562 version-8 ("custom") UUID so it is a valid `uuid` value.
 *
 * Used as a communications primary key so "has this already been sent?" is
 * answered atomically by the insert itself — a 23505 on the primary key
 * means another attempt already owns the send. No new table, column or
 * unique index needed (dues reminders BL-013, month-end report BL-073).
 */
export function deterministicUuid(key: string): string {
  const hex = createHash('sha256').update(key).digest('hex')
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return [hex.slice(0, 8), hex.slice(8, 12), `8${hex.slice(13, 16)}`, `${variant}${hex.slice(17, 20)}`, hex.slice(20, 32)].join(
    '-',
  )
}
