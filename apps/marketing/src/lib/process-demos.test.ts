import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROCESSES, PROCESS_ORDER } from './process-demos'
import { FEATURE_PAGES } from './feature-pages'

// Every scene copies a screen that ships in apps/hoa. The proof string must
// still be in the named source file, so renaming or removing the screen
// fails here before the website keeps showing it.
const HOA_SRC = path.resolve(__dirname, '../../../hoa/src')

function proofPath(file: string) {
  return file.startsWith('lib/') ? path.join(HOA_SRC, file) : path.join(HOA_SRC, 'app', file)
}

describe('process demo scenes match shipped features', () => {
  for (const id of PROCESS_ORDER) {
    const def = PROCESSES[id]
    describe(id, () => {
      it('has 4 to 6 scenes of roughly 3 to 5 seconds', () => {
        expect(def.scenes.length).toBeGreaterThanOrEqual(4)
        expect(def.scenes.length).toBeLessThanOrEqual(6)
        for (const s of def.scenes) {
          expect(s.ms).toBeGreaterThanOrEqual(3000)
          expect(s.ms).toBeLessThanOrEqual(5000)
        }
      })
      it.each(def.scenes.map((s, i) => [i + 1, s] as const))('scene %i proof is in apps/hoa', (_n, s) => {
        const src = readFileSync(proofPath(s.proof.file), 'utf8')
        expect(src.includes(s.proof.text), `${s.proof.file} no longer contains "${s.proof.text}"`).toBe(true)
      })
      it('captions are numbered, plain and short', () => {
        def.scenes.forEach((s, i) => {
          expect(s.caption.startsWith(`${i + 1}. `)).toBe(true)
          expect(s.caption).not.toMatch(/[—–]/)
          expect(s.caption.length).toBeLessThan(80)
        })
      })
      it('never shows online card or ACH payments, which are not live', () => {
        const text = JSON.stringify(def.scenes).toLowerCase()
        expect(text).not.toMatch(/\bach\b|credit card|pay online|online payment/)
      })
    })
  }

  it('every feature page has a player', () => {
    const map = { approvals: 'arc', dues: 'dues', violations: 'violations', announcements: 'announcements', ask: 'ask' } as const
    for (const p of FEATURE_PAGES) expect(PROCESSES[map[p.screen]]).toBeDefined()
  })
})
