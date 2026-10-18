/**
 * A roster file (CSV or XLSX) → headings + rows of text cells. Pure; runs
 * in the browser so the file never has to be uploaded whole.
 *
 * Nothing in a cell is ever executed: CSV cells are text, and an XLSX
 * formula contributes only the value Excel saved with it (xlsx.ts).
 */
import { parseCsvTable } from '../import'
import { readFirstSheet, XlsxError, type SheetRow } from './xlsx'

export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_ROWS = 5000

export type ParsedRoster =
  | { ok: true; headers: string[]; rows: SheetRow[] }
  | { ok: false; error: string }

const fail = (error: string): ParsedRoster => ({ ok: false, error })

function decodeText(bytes: Uint8Array): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    // Excel on Windows saves "CSV" as Windows-1252, not UTF-8.
    text = new TextDecoder('windows-1252').decode(bytes)
  }
  return text.replace(/^﻿/, '')
}

export function parseRosterFile(name: string, bytes: Uint8Array): ParsedRoster {
  if (bytes.byteLength > MAX_FILE_BYTES) return fail('That file is over 5 MB. Split it into smaller files, or remove columns you don’t need.')
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  if (ext === 'xls') return fail('Old .xls files can’t be read. In Excel, choose File → Save As and save it as .xlsx or .csv.')
  if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'txt') return fail('Choose a .csv or .xlsx file.')
  if (bytes.byteLength === 0) return fail('That file is empty.')

  let table: SheetRow[]
  if (ext === 'xlsx') {
    try {
      table = readFirstSheet(bytes, MAX_ROWS + 1)
    } catch (err) {
      if (err instanceof XlsxError && err.message === 'too large') return fail('That workbook is too large to read. Save the roster sheet on its own as .csv.')
      return fail('We couldn’t read that workbook. Save it from Excel or Google Sheets as .xlsx or .csv and try again.')
    }
  } else {
    table = parseCsvTable(decodeText(bytes))
      .map((cells, i) => ({ n: i + 1, cells }))
      .filter((r) => r.cells.some((c) => c.trim() !== ''))
  }

  if (table.length === 0) return fail('That file is empty.')
  const [head, ...rows] = table
  if (rows.length === 0) return fail('That file has headings but no rows.')
  if (rows.length > MAX_ROWS) return fail('That file has more than 5,000 rows. Split it into smaller files and import each one.')

  const width = Math.max(head.cells.length, ...rows.map((r) => r.cells.length))
  const headers = Array.from({ length: width }, (_, i) => head.cells[i]?.trim() || `Column ${i + 1}`)
  return {
    ok: true,
    headers,
    rows: rows.map((r) => ({ n: r.n, cells: Array.from({ length: width }, (_, i) => r.cells[i] ?? '') })),
  }
}
