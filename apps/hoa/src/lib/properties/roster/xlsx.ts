/**
 * A deliberately small .xlsx reader: the first worksheet's cell VALUES.
 *
 * An .xlsx is a zip of XML parts. This unzips only the four parts it needs
 * (with fflate, already a dependency) and reads them with plain string
 * scanning, so it runs the same in the browser and in tests with no DOM.
 *
 * Formulas are never evaluated: a formula cell contributes the value Excel
 * saved with it (`<v>`), or nothing when none was saved. Styles, dates and
 * number formats are ignored (a date reads as its serial number; the
 * roster has no date columns).
 *
 * Zip bombs: each part is capped by its declared uncompressed size BEFORE
 * it is inflated, and the total too.
 */
import { strFromU8, unzipSync } from 'fflate'

const MAX_PART_BYTES = 40 * 1024 * 1024
const MAX_TOTAL_BYTES = 60 * 1024 * 1024

export class XlsxError extends Error {}

export interface SheetRow {
  /** 1-based row number as Excel shows it. */
  n: number
  cells: string[]
}

export function readFirstSheet(bytes: Uint8Array, maxRows: number): SheetRow[] {
  let total = 0
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        const wanted =
          f.name === 'xl/workbook.xml' ||
          f.name === 'xl/_rels/workbook.xml.rels' ||
          f.name === 'xl/sharedStrings.xml' ||
          /^xl\/worksheets\/[^/]+\.xml$/.test(f.name)
        if (!wanted) return false
        if (f.originalSize > MAX_PART_BYTES) throw new XlsxError('too large')
        total += f.originalSize
        if (total > MAX_TOTAL_BYTES) throw new XlsxError('too large')
        return true
      },
    })
  } catch (err) {
    throw err instanceof XlsxError ? err : new XlsxError('not a workbook')
  }

  const text = (name: string) => (files[name] ? strFromU8(files[name]) : null)
  const sheetPath = firstSheetPath(text('xl/workbook.xml'), text('xl/_rels/workbook.xml.rels'))
  const sheet = sheetPath ? text(sheetPath) : null
  if (!sheet) throw new XlsxError('no worksheet')
  const shared = sharedStrings(text('xl/sharedStrings.xml'))
  return sheetRows(sheet, shared, maxRows)
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))
  return m ? m[1] : null
}

function firstSheetPath(workbook: string | null, rels: string | null): string | null {
  if (workbook && rels) {
    const sheetTag = workbook.match(/<sheet\b[^>]*>/)?.[0]
    const rid = sheetTag ? attr(sheetTag, 'r:id') : null
    if (rid) {
      for (const rel of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
        if (attr(rel, 'Id') !== rid) continue
        const target = attr(rel, 'Target')
        if (!target) break
        return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
      }
    }
  }
  return 'xl/worksheets/sheet1.xml'
}

export function decodeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (_, e: string) => {
    switch (e) {
      case 'amp':
        return '&'
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      case 'quot':
        return '"'
      case 'apos':
        return "'"
      default:
        return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    }
  })
}

/** The text of every <t> in a fragment, phonetic runs (<rPh>) excluded. */
function texts(fragment: string): string {
  const withoutPhonetic = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let out = ''
  for (const m of withoutPhonetic.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) out += decodeXml(m[1] ?? '')
  return out
}

function sharedStrings(xml: string | null): string[] {
  if (!xml) return []
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => texts(m[1] ?? ''))
}

function columnIndex(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function sheetRows(xml: string, shared: string[], maxRows: number): SheetRow[] {
  const rows: SheetRow[] = []
  let nextRow = 1
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const n = Number(attr(rm[1], 'r')) || nextRow
    nextRow = n + 1
    const body = rm[2] ?? ''
    const cells: string[] = []
    let nextCol = 0
    for (const cm of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r')
      const col = ref ? columnIndex(ref.replace(/\d+$/, '')) : nextCol
      nextCol = col + 1
      const inner = cm[2] ?? ''
      const type = attr(cm[1], 't')
      const v = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1]
      let value = ''
      if (type === 's') value = v !== undefined ? (shared[Number(v)] ?? '') : ''
      else if (type === 'inlineStr') value = texts(inner.match(/<is\b[^>]*>([\s\S]*?)<\/is>/)?.[1] ?? '')
      else if (type === 'b') value = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : ''
      else if (type === 'e') value = ''
      else value = v !== undefined ? decodeXml(v) : ''
      while (cells.length < col) cells.push('')
      cells[col] = value
    }
    if (cells.every((c) => c.trim() === '')) continue
    rows.push({ n, cells })
    if (rows.length > maxRows) break
  }
  return rows
}
