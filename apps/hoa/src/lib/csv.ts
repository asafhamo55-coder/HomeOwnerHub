// CSV serialisation for downloads (RFC 4180) with an Excel/Sheets
// formula-injection guard.
//
// Text cells beginning with =, +, -, @, tab or CR are read as formulas by
// spreadsheet apps, so they get a leading single quote. Real numbers are
// written as-is — a negative amount must stay a number, not become text.
//
// The ONLY CSV writer in apps/hoa (BL-045): the list exports and the
// data-export zip all use it, and src/csv-ratchet.test.ts fails if a file
// serves CSV or escapes cells without it.

const FORMULA_START = /^[=+\-@\t\r]/
const NEEDS_QUOTES = /[",\n\r]/

// A plain negative decimal such as "-300.00" is a number, not a formula.
// Money is written as fixed-2 text, so it must stay a number in the sheet.
const PLAIN_NEGATIVE_NUMBER = /^-\d+(\.\d+)?$/

function guardText(s: string): string {
  return FORMULA_START.test(s) && !PLAIN_NEGATIVE_NUMBER.test(s) ? `'${s}` : s
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

/**
 * Browser only: save a csvDocument() as a file. For CSVs built in the page
 * (the roster import's template and error rows); server routes stream
 * their own response instead.
 */
export function downloadCsvFile(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
