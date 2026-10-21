// BL-144: the "rows we couldn't read" download from the import preview.
//
// The raw text comes straight from an uploaded file, so it is hostile until
// proven otherwise: a description of `=HYPERLINK(...)` must not run when a
// treasurer opens this in Excel. csvDocument (lib/csv.ts) neutralises
// formula starts and quotes per RFC 4180; this file never escapes by hand.

import { csvDocument } from '@/lib/csv'
import type { ParseIssue } from './parse'

export const PROBLEM_ROWS_HEADER = ['Line', 'Problem', 'Row as it appeared in the file'] as const

export function problemRowsCsv(issues: readonly ParseIssue[]): string {
  return csvDocument(
    PROBLEM_ROWS_HEADER,
    issues.map((i) => [i.line, i.reason, i.raw]),
  )
}
