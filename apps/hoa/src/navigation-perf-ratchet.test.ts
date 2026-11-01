import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// BL-074 ratchets for "every navigation takes noticeable time".
const src = (p: string) => resolve(__dirname, p)

describe('signed-in pages keep the old page on screen until the next one is ready', () => {
  // A route-level loading.tsx is a Suspense fallback. Next swaps it in the
  // instant a link is tapped, so the page the person was reading turned into
  // grey bars on every menu change. With no loading.tsx, the router's
  // navigation transition holds the current page (with NavigationProgress
  // moving) until the next page's first chunk arrives; slow widgets inside a
  // page still stream in under their own in-page <Suspense>. Verified against
  // next 15.5 router-reducer/ppr-navigations: a pending segment with no
  // loading boundary has nothing to render, so React keeps the old UI.
  const loadingFiles = (root: string): string[] => {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name))
        else if (/^loading\.(tsx|ts|jsx|js)$/.test(e.name)) out.push(join(dir, e.name))
      }
    }
    walk(src(root))
    return out
  }
  it.each(['app/(dashboard)', 'app/resident', 'app/admin', 'app/(pro)'])(
    '%s has no route-level loading.tsx',
    (root) => {
      expect(loadingFiles(root).map((f) => relative(src('.'), f))).toEqual([])
    },
  )

  it('no loading file hides anywhere else under app/ either', () => {
    expect(loadingFiles('app').map((f) => relative(src('.'), f))).toEqual([])
  })

  it.each([
    'app/(dashboard)/layout.tsx',
    'app/resident/layout.tsx',
    'app/admin/layout.tsx',
    'app/(pro)/layout.tsx',
  ])('%s mounts NavigationProgress so a tap responds at once', (file) => {
    expect(readFileSync(src(file), 'utf8')).toContain('<NavigationProgress />')
  })

  it('NavLink shows a pending state on the tapped link', () => {
    const text = readFileSync(src('components/layout/NavLink.tsx'), 'utf8')
    expect(text).toContain('useLinkStatus')
    expect(text).toContain('data-link-pending')
  })
})

describe('the sidebar does not fully prefetch every page', () => {
  // `prefetch` (= true) on a Link to a dynamic page renders that whole page
  // on the server — every query it makes — as soon as the link scrolls into
  // view. The board sidebar has ~20 links, so each full page load used to
  // fire ~20 complete page renders in the background, competing with the
  // page the user actually asked for, and the results expired from the
  // router cache after 30s anyway (next.config.ts staleTimes.dynamic).
  // The default ("auto") prefetches only the shared layout, which is cheap
  // and cached for staleTimes.static.
  it('HoaSidebar leaves Link prefetch at its default', () => {
    const file = readFileSync(src('components/layout/HoaSidebar.tsx'), 'utf8')
    // The JSX prop, bare or ={true} (comments mentioning it are fine).
    const props = file.split('\n').filter((line) => !line.trim().startsWith('//'))
    expect(props.filter((line) => /(^|\s)prefetch(\s*=\s*\{\s*true\s*\})?(\s|\/?>|$)/.test(line))).toEqual([])
  })
})

describe('menus load the hovered page in full', () => {
  // NavLink upgrades only the hovered or touched link to a full
  // prefetch, so the page is usually ready by the time the click lands.
  it('NavLink asks Next for a full prefetch on hover', () => {
    expect(readFileSync(src('components/layout/NavLink.tsx'), 'utf8')).toMatch(/<AppLink \{\.\.\.props\} unstable_dynamicOnHover>/)
  })

  it.each([
    'components/layout/HoaSidebar.tsx',
    'components/layout/ProSidebar.tsx',
    'components/layout/AdminSidebar.tsx',
    'components/resident/ResidentTabBar.tsx',
  ])('%s links through NavLink', (file) => {
    const text = readFileSync(src(file), 'utf8')
    expect(text).toContain("import { NavLink as Link } from '@/components/layout/NavLink'")
    expect(text).not.toMatch(/from 'next\/link'/)
  })
})
