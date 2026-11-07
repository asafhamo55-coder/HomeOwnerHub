import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOGO_DIR, LOGO_FILE } from '@homeowner-portal/workflows/email-brand'

// Ratchet: app emails link /<LOGO_DIR>/<LOGO_FILE> with no network check at
// send time, so the file must ship in the same deploy that bumps LOGO_DIR.
describe('email logo file', () => {
  it('exists under apps/hoa/public for the configured LOGO_DIR and LOGO_FILE', () => {
    const file = path.resolve(__dirname, '../../../public', LOGO_DIR, LOGO_FILE)
    expect(existsSync(file), `missing ${path.join('apps/hoa/public', LOGO_DIR, LOGO_FILE)}`).toBe(true)
    expect(statSync(file).size).toBeGreaterThan(0)
  })
})
