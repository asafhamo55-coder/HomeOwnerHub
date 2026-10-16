// CSV serialisation for downloads (RFC 4180) with an Excel/Sheets
// formula-injection guard.
//
// Text cells beginning with =, +, -, @, tab or CR are read as formulas by
// spreadsheet apps, so they get a leading single quote. Real numbers are
// written as-is — a negative amount must stay a number, not become text.
//
// Same rules as the csvEscape copies in the four list-export routes
// (properties, violations, leases, vendors); new exports use this module.

const FORMULA_START = /^[=+\-@\t\r]/
const NEEDS_QUOTES = /[",\n\r]/

function guardText(s: string): string {
  return FORMULA_START.test(s) ? `'${s}` : s
}

function quote(s: string): string {
  return NEEDS_QUOTES.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One CSV cell. null/undefined → empty; arrays → "a; b"; objects → JSON. */
export function csvCell(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) {
    return quote(guardText(value.map((v) => (v != null && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))).join('; ')))
  }
  if (typeof value === 'object') return quote(guardText(JSON.stringify(value)))
  return quote(guardText(String(value)))
}

export function csvLine(values: readonly unknown[]): string {
  return values.map(csvCell).join(',')
}

/** A whole file: UTF-8 BOM (so Excel reads accents), CRLF line endings. */
export function csvDocument(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return '﻿' + [header, ...rows].map((r) => csvLine(r) + '\r\n').join('')
}
