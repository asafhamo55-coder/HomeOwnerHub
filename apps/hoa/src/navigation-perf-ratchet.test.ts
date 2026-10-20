import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// BL-074 ratchets for "every navigation takes noticeable time".
const src = (p: string) => resolve(__dirname, p)

describe('navigation responds before the server finishes', () => {
  // Every board and resident page is force-dynamic. Without a loading
  // boundary above them, a click leaves the old page frozen on screen until
  // the new one has fully rendered on the server.
  it.each(['app/(dashboard)/loading.tsx', 'app/resident/loading.tsx', 'app/admin/loading.tsx'])(
    '%s exists',
    (path) => {
      expect(existsSync(src(path))).toBe(true)
    },
  )
})

describe('every board and resident page has its own loading state (BL-099)', () => {
  // The shell-level loading.tsx above paints a generic card stack; each
  // page directory has its own, laid out like the page, so the header and
  // column don't jump when the page streams in.
  const pageDirs = (root: string): string[] => {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name))
        else if (e.name === 'page.tsx') out.push(dir)
      }
    }
    walk(src(root))
    return out
  }
  it.each(['app/(dashboard)', 'app/resident'])('%s', (root) => {
    const missing = pageDirs(root).filter((d) => !existsSync(join(d, 'loading.tsx')))
    expect(missing.map((d) => relative(src('.'), d))).toEqual([])
  })
})

describe('the sidebar does not fully prefetch every page', () => {
  // `prefetch` (= true) on a Link to a dynamic page renders that whole page
  // on the server — every query it makes — as soon as the link scrolls into
  // view. The board sidebar has ~20 links, so each full page load used to
  // fire ~20 complete page renders in the background, competing with the
  // page the user actually asked for, and the results expired from the
  // router cache after 30s anyway (next.config.ts staleTimes.dynamic).
  // The default ("auto") prefetches only down to the nearest loading.tsx,
  // which is cheap and cached for staleTimes.static, so a click paints the
  // skeleton at once and streams the page in.
  it('HoaSidebar leaves Link prefetch at its default', () => {
    const file = readFileSync(src('components/layout/HoaSidebar.tsx'), 'utf8')
    // The JSX prop, bare or ={true} (comments mentioning it are fine).
    const props = file.split('\n').filter((line) => !line.trim().startsWith('//'))
    expect(props.filter((line) => /(^|\s)prefetch(\s*=\s*\{\s*true\s*\})?(\s|\/?>|$)/.test(line))).toEqual([])
  })
})
