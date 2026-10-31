import { describe, expect, it } from 'vitest'
import { csvCell, csvDocument, csvLine } from './csv'

describe('csvCell', () => {
  it('renders null and undefined as empty', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('leaves plain text alone', () => {
    expect(csvCell('Unit 4B')).toBe('Unit 4B')
  })

  it('quotes cells holding commas, quotes or line breaks (RFC 4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(csvCell('line1\r\nline2')).toBe('"line1\r\nline2"')
  })

  it('neutralises spreadsheet formulas in text cells', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-2+3')).toBe("'-2+3")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('\tcmd')).toBe("'\tcmd")
  })

  it('keeps real numbers numeric — a negative amount is not a formula', () => {
    expect(csvCell(-125.5)).toBe('-125.5')
    expect(csvCell(0)).toBe('0')
  })

  it('leaves a plain negative decimal string as a number, but still guards a formula', () => {
    expect(csvCell('-300.00')).toBe('-300.00')
    expect(csvCell('-3')).toBe('-3')
    expect(csvCell('-300.00+1')).toBe("'-300.00+1")
    expect(csvCell('-')).toBe("'-")
  })

  it('renders booleans, arrays and JSON', () => {
    expect(csvCell(true)).toBe('true')
    expect(csvCell(['plumbing', 'roofing'])).toBe('plumbing; roofing')
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"')
  })

  it('guards formulas hidden inside arrays and JSON too', () => {
    expect(csvCell(['=cmd', 'x'])).toBe("'=cmd; x")
  })
})

describe('csvLine / csvDocument', () => {
  it('joins cells with commas', () => {
    expect(csvLine(['a', 1, null, 'b,c'])).toBe('a,1,,"b,c"')
  })

  it('builds a BOM-prefixed CRLF document from a header and rows', () => {
    expect(csvDocument(['id', 'name'], [['1', 'x']])).toBe('﻿id,name\r\n1,x\r\n')
  })
})
