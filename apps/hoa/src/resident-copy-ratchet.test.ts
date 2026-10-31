import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = __dirname

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

describe('copy ratchets', () => {
  it('no made-up policy number (§12.03) anywhere in apps/hoa/src', () => {
    const hits = walk(SRC).filter(
      (f) => !f.endsWith('resident-copy-ratchet.test.ts') && readFileSync(f, 'utf8').includes('§12.03'),
    )
    expect(hits).toEqual([])
  })

  it('resident lib files never return a database error message to the caller', () => {
    // file -> reason, for any intentional exception. Empty on purpose.
    const ALLOW: Record<string, string> = {}
    const libDir = join(SRC, 'lib')
    const files = readdirSync(libDir).filter((n) => /^resident.*\.ts$/.test(n) && !n.endsWith('.test.ts'))
    expect(files.length).toBeGreaterThan(5)
    const offenders: string[] = []
    for (const f of files) {
      if (ALLOW[f]) continue
      readFileSync(join(libDir, f), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/\berror\??\.message\b/.test(line)) offenders.push(`${f}:${i + 1}`)
        })
    }
    expect(offenders).toEqual([])
  })

  it('resident documents page links to meeting minutes', () => {
    const src = readFileSync(join(SRC, 'app/resident/documents/page.tsx'), 'utf8')
    expect(src).toMatch(/href="\/resident\/meetings"[^]*?Meeting minutes/)
    expect(src).toMatch(/Ask the board/)
  })

  it('ticket form tells residents photos come on the next screen', async () => {
    const { TICKET_PHOTO_HINT, TICKET_SENT_TOAST } = await import('./app/resident/tickets/new/ticket-copy')
    expect(TICKET_PHOTO_HINT).toBe('You can add photos or files on the next screen after you send.')
    expect(TICKET_SENT_TOAST).toMatch(/photos or files on the next screen/)
    const form = readFileSync(join(SRC, 'app/resident/tickets/new/CreateTicketForm.tsx'), 'utf8')
    expect(form).toContain('TICKET_PHOTO_HINT')
    expect(form).toContain('TICKET_SENT_TOAST')
  })
})
