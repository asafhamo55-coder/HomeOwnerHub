// BL-011 — stream the export zip straight to the response.
//
// Nothing is written server-side: rows are read a page at a time, turned
// into CSV text, deflated by fflate and enqueued. The stream is pull-based,
// so a slow download slows the reads instead of buffering the org in memory.
//
// A failed read ERRORS the stream. The browser then reports a failed
// download — never a complete-looking archive that is quietly missing a
// table. Logs carry the table name and org id only, never row content.

import { Zip, ZipDeflate, strToU8 } from 'fflate'
import { csvLine } from '@/lib/csv'
import { EXPORT_TABLES, type ExportTable } from './tables'

/** PostgREST caps a response at 1000 rows by default; page at that size. */
export const EXPORT_PAGE_SIZE = 1000

type QueryResult = { data: unknown[] | null; error: { message: string; code?: string } | null }

/**
 * The slice of the Supabase query builder the export uses, untyped by
 * table so one loop can walk every table. Columns are type-checked in
 * tables.ts instead.
 */
export interface ExportQuery {
  select(columns: string): ExportQuery
  eq(column: string, value: string): ExportQuery
  is(column: string, value: null): ExportQuery
  order(column: string, options: { ascending: boolean }): ExportQuery
  range(from: number, to: number): PromiseLike<QueryResult>
}
export interface ExportClient {
  from(table: string): ExportQuery
}

type Piece = { file: string; text: string; final: boolean } | { done: true }

async function* csvPieces(
  client: ExportClient,
  orgId: string,
  tables: readonly ExportTable[],
  counts: Map<string, number>,
): AsyncGenerator<Piece> {
  for (const t of tables) {
    const columns = t.columns as readonly string[]
    let rows = 0
    yield { file: t.file, text: '﻿' + csvLine(columns) + '\r\n', final: false }
    for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
      let q = client.from(t.table).select(columns.join(',')).eq(t.orgColumn, orgId)
      if (t.deletedColumn) q = q.is(t.deletedColumn, null)
      const { data, error } = await q
        .order('id', { ascending: true })
        .range(from, from + EXPORT_PAGE_SIZE - 1)
      if (error) {
        console.error('[data-export] read failed', { orgId, table: t.table, code: error.code ?? null })
        throw new Error(`Export failed reading ${t.table}`)
      }
      const page = (data ?? []) as Array<Record<string, unknown>>
      rows += page.length
      if (page.length > 0) {
        yield {
          file: t.file,
          text: page.map((r) => csvLine(columns.map((c) => r[c])) + '\r\n').join(''),
          final: false,
        }
      }
      if (page.length < EXPORT_PAGE_SIZE) break
    }
    counts.set(t.file, rows)
    yield { file: t.file, text: '', final: true }
  }
  yield { done: true }
}

export function readmeText(
  counts: ReadonlyMap<string, number>,
  tables: readonly ExportTable[],
  exportedAt: Date,
): string {
  const width = Math.max(...tables.map((t) => t.file.length))
  const lines = tables.map((t) => {
    const n = counts.get(t.file) ?? 0
    return `  ${t.file.padEnd(width)}  ${n} ${n === 1 ? 'row' : 'rows'}  (${t.label})`
  })
  return [
    'Association data export',
    `Exported ${exportedAt.toISOString()}`,
    '',
    'One CSV per area. Files are UTF-8 with a byte-order mark and open in',
    'Excel, Numbers and Google Sheets. Rows link to each other by id',
    '(for example payments.unit_id matches units.id).',
    '',
    'Text that starts with = + - or @ is prefixed with an apostrophe so a',
    'spreadsheet will not run it as a formula.',
    '',
    'Not included: uploaded files themselves (documents.csv lists them),',
    'bank and payment credentials, login data, and vendor tax ids.',
    '',
    'Files:',
    ...lines,
    '',
  ].join('\r\n')
}

/**
 * A ReadableStream of a zip with one CSV per table plus README.txt.
 * Reads go through `client`, which must be the caller's RLS-scoped client.
 */
export function exportZipStream(
  client: ExportClient,
  orgId: string,
  tables: readonly ExportTable[] = EXPORT_TABLES,
  now: () => Date = () => new Date(),
): ReadableStream<Uint8Array> {
  const counts = new Map<string, number>()
  const pieces = csvPieces(client, orgId, tables, counts)
  let zip: Zip
  let entry: ZipDeflate | null = null
  let entryFile: string | null = null
  let emitted = 0
  let finished = false

  return new ReadableStream<Uint8Array>({
    start(controller) {
      zip = new Zip((err, chunk, final) => {
        if (err) {
          controller.error(err)
          return
        }
        emitted++
        controller.enqueue(chunk)
        if (final) {
          finished = true
          controller.close()
        }
      })
    },
    // A pull that resolves without enqueuing is not re-invoked by the
    // stream, and the deflater buffers small pushes — so keep feeding it
    // until it emits a chunk or the archive is finished.
    async pull(controller) {
      const before = emitted
      try {
        while (emitted === before && !finished) {
          const next = await pieces.next()
          if (next.done) return
          const piece = next.value
          if ('done' in piece) {
            const readme = new ZipDeflate('README.txt', { level: 6 })
            zip.add(readme)
            readme.push(strToU8(readmeText(counts, tables, now())), true)
            zip.end()
            finished = true
            return
          }
          if (entryFile !== piece.file) {
            entry = new ZipDeflate(piece.file, { level: 6 })
            entryFile = piece.file
            zip.add(entry)
          }
          entry!.push(strToU8(piece.text), piece.final)
        }
      } catch (err) {
        zip.terminate()
        controller.error(err)
      }
    },
    async cancel() {
      zip.terminate()
      await pieces.return(undefined)
    },
  })
}
