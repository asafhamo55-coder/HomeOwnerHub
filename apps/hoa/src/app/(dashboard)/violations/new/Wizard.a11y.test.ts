import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'Wizard.tsx'), 'utf8')

describe('violation wizard accessibility', () => {
  it('announces draft saving through a polite live region', () => {
    expect(src).toMatch(/text-xs text-muted" aria-live="polite"/)
  })

  it('announces the AI analysis step as a status', () => {
    expect(src).toMatch(/<div role="status" className="py-8 text-center">/)
  })

  it('photo remove buttons are named per photo and 44px on touch', () => {
    expect(src).toContain('aria-label={`Remove photo ${i + 1}`}')
    expect(src).toMatch(/p-1 text-background coarse:size-11/)
  })
})
