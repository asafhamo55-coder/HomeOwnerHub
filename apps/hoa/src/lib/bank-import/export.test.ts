import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { problemRowsCsv } from './export'
import { parseStatement } from './parse'

const here = path.dirname(fileURLToPath(import.meta.url))

describe('problem-rows download (untrusted text into a spreadsheet)', () => {
  it('neutralises formula starts in every cell taken from the file', () => {
    const csv = problemRowsCsv([
      { line: 2, reason: 'No readable date', raw: '=HYPERLINK("http://evil.example/","x")' },
      { line: 3, reason: 'No readable amount', raw: '+SUM(A1)' },
      { line: 4, reason: 'No readable amount', raw: '@cmd' },
      { line: 5, reason: 'No readable amount', raw: '-2+3' },
    ])
    const lines = csv.replace(/^﻿/, '').trimEnd().split('\r\n')
    expect(lines[0]).toBe('Line,Problem,Row as it appeared in the file')
    expect(lines[1]).toBe(`2,No readable date,"'=HYPERLINK(""http://evil.example/"",""x"")"`)
    expect(lines[2]).toBe(`3,No readable amount,'+SUM(A1)`)
    expect(lines[3]).toBe(`4,No readable amount,'@cmd`)
    expect(lines[4]).toBe(`5,No readable amount,'-2+3`)
  })

  it('the hostile fixture round-trips with no cell starting a formula', () => {
    const r = parseStatement(readFileSync(path.join(here, 'fixtures', 'hostile.csv'), 'utf8'))
    if (!r.ok) throw new Error(r.error)
    const body = problemRowsCsv(r.issues).replace(/^﻿/, '')
    for (const line of body.trimEnd().split('\r\n').slice(1)) {
      const raw = line.split(',').slice(2).join(',').replace(/^"/, '')
      expect(raw).not.toMatch(/^[=+\-@]/)
    }
  })
})
