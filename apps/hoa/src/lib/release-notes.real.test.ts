import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseReleaseNote, sortReleaseNotes } from './release-notes'

// The real notes in docs/releases must parse: /whats-new reads them as-is.
const DIR = resolve(__dirname, '../../../../docs/releases')

describe('docs/releases notes parse for /whats-new', () => {
  const files = readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f))

  it('has notes', () => expect(files.length).toBeGreaterThan(0))

  it('every note yields a title and a summary, newest first', () => {
    const notes = files.map((f) => parseReleaseNote(f, readFileSync(resolve(DIR, f), 'utf8')))
    expect(notes.every(Boolean)).toBe(true)
    for (const n of notes) expect(JSON.stringify(n)).not.toMatch(/Short, plain-language headline/)
    const sorted = sortReleaseNotes(notes as NonNullable<(typeof notes)[number]>[])
    expect(sorted[0]).toBeTruthy()
  })
})
