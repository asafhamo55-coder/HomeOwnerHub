import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageHeader, ToastProvider } from '@homeowner-portal/ui'
import { printableHomes } from '@/lib/meeting-quorum/quorum'
import { proxyLaw } from '@/lib/meeting-quorum/law'
import { ProxyForm, SignInSheet } from './meetings/[id]/quorum/print'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }) }))
vi.mock('@/lib/insurance/actions', () => ({
  saveInsurancePolicy: async () => ({ ok: true }),
  deleteInsurancePolicy: async () => ({ ok: true }),
}))

// ui:overflow regressions, checked against server-rendered markup (the
// repo's component-test pattern: no DOM, so we assert the classes that
// let the layout wrap instead of overflowing).

;(globalThis as { React?: typeof React }).React = React

const { FollowUpActions } = await import('./communications/[id]/FollowUpActions')
const { PolicyList } = await import('./insurance/PolicyList')

const here = path.dirname(fileURLToPath(import.meta.url))
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')
const classOf = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/)

describe('inbox thread header (/inbox/[id] @1440: subject squeezed, bar 618px > 512px)', () => {
  const markup = html(
    <PageHeader
      title="Fence repair and the pool gate code"
      actionsBelow
      actions={
        <>
          <button type="button">Forward</button>
          <button type="button">Request from vendor</button>
          <button type="button">Create from email</button>
        </>
      }
    />,
  )

  it('stacks the title and actions in a column at every width — never a row', () => {
    // The wrapper holding both the title block and the action bar.
    const row = markup.match(/<div class="([^"]*)"><div class="min-w-0 flex-1 space-y-1">/)
    expect(row).not.toBeNull()
    const cls = row![1].split(/\s+/)
    expect(cls).toContain('flex-col')
    expect(cls.some((c) => /^(sm|md|lg|xl):flex-row$/.test(c))).toBe(false)
  })

  it('lets the action bar wrap and shrink instead of holding its width', () => {
    const bar = markup.match(/<div data-page-actions="[^"]*" class="[^"]*"/)
    expect(bar).not.toBeNull()
    const cls = classOf(bar![0])
    expect(cls).toEqual(expect.arrayContaining(['flex-wrap', 'min-w-0']))
    expect(cls).not.toContain('shrink-0')
  })

  it('gives the subject min-w-0 and break-words', () => {
    const h1 = markup.match(/<h1\b[^>]*>/)![0]
    expect(classOf(h1)).toEqual(expect.arrayContaining(['min-w-0', 'break-words']))
  })

  it('keeps the side-by-side layout for every other PageHeader', () => {
    const plain = html(<PageHeader title="Dues" actions={<button type="button">New</button>} />)
    expect(plain).toContain('sm:flex-row')
    expect(plain).toMatch(/data-page-actions="[^"]*" class="[^"]*shrink-0/)
  })

  it('the inbox thread page opts into actionsBelow', () => {
    const src = readFileSync(path.join(here, 'inbox', '[id]', 'page.tsx'), 'utf8')
    expect(src).toMatch(/<PageHeader[\s\S]*?\bactionsBelow\b[\s\S]*?actions=\{/)
  })
})

describe('communications follow-up buttons (/communications/[id] @375)', () => {
  const markup = html(<FollowUpActions commId="c1" count={2} textingReady />)
  const links = markup.match(/<a\b[^>]*>/g) ?? []

  it('renders both follow-up links', () => {
    expect(links).toHaveLength(2)
    expect(markup).toContain('Email again to the 2 who haven’t opened')
    expect(markup).toContain('aria-label="Text them: the 2 who haven’t opened"')
  })

  it('lets each button wrap its label and go full width on phones', () => {
    for (const tag of links) {
      const cls = classOf(tag)
      expect(cls).toEqual(
        expect.arrayContaining(['min-w-0', 'whitespace-normal', 'w-full', 'sm:w-auto', 'h-auto']),
      )
      // tailwind-merge must have dropped the kit's nowrap / fixed height.
      expect(cls).not.toContain('whitespace-nowrap')
      expect(cls).not.toContain('h-9')
      expect(cls).not.toContain('shrink-0')
    }
  })

  it('the row itself wraps', () => {
    const row = markup.match(/^<div class="([^"]*)"/)![1].split(/\s+/)
    expect(row).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'min-w-0']))
  })
})

describe('quorum sign-in sheet (/meetings/[id]/quorum/sign-in @375: table 469px > 375px)', () => {
  const homes = printableHomes([
    {
      propertyId: 'p1',
      address: '1200 Extraordinarily Long Sample Boulevard Northwest',
      unitNumber: '4B',
      lotNumber: null,
      owners: [{ name: 'Jordan Example', share: '100%', email: null, phone: null }],
    },
  ])
  const markup = html(
    <SignInSheet header={{ associationName: 'Demo HOA', meetingLabel: 'Annual meeting', meetingDate: 'Oct 21, 2026' }} homes={homes} showShares={false} />,
  )

  it('wraps the table in a sideways-scrolling box on screen', () => {
    const box = markup.match(/<div role="region"[^>]*>(?=<table)/)
    expect(box).not.toBeNull()
    const cls = classOf(box![0])
    expect(cls).toEqual(expect.arrayContaining(['max-w-full', 'overflow-x-auto']))
    // Keyboard users can scroll it too.
    expect(box![0]).toContain('tabindex="0"')
    expect(box![0]).toContain('aria-label="Sign-in sheet table"')
  })

  it('shows a scroll hint on phones only, never on paper', () => {
    const hint = markup.match(/<p data-scroll-hint[^>]*>[^<]*<\/p>/)
    expect(hint).not.toBeNull()
    expect(hint![0]).toContain('Scroll sideways')
    expect(classOf(hint![0])).toEqual(expect.arrayContaining(['sm:hidden', 'print:hidden']))
  })

  it('keeps print unchanged: full width, no scroll box, no screen minimum width', () => {
    const box = markup.match(/<div role="region"[^>]*>/)![0]
    expect(classOf(box)).toContain('print:overflow-visible')
    const table = classOf(markup.match(/<table\b[^>]*>/)![0])
    expect(table).toEqual(expect.arrayContaining(['w-full', 'print:min-w-0']))
  })
})

describe('proxy forms (/meetings/[id]/quorum/proxies @375)', () => {
  it('lets long addresses and owner names break inside the details grid', () => {
    const [home] = printableHomes([
      { propertyId: 'p1', address: '1200 Extraordinarily Long Sample Boulevard Northwest', unitNumber: '4B', lotNumber: null, owners: [] },
    ])
    const markup = html(
      <ProxyForm header={{ associationName: null, meetingLabel: 'Annual meeting', meetingDate: 'Oct 21, 2026' }} home={home!} law={proxyLaw('TX')} />,
    )
    const dds = markup.match(/<dd\b[^>]*>/g) ?? []
    expect(dds.length).toBeGreaterThanOrEqual(3)
    for (const tag of dds.slice(0, 3).filter((_, i) => i !== 1)) {
      expect(classOf(tag)).toEqual(expect.arrayContaining(['min-w-0', 'break-words']))
    }
    // No unscrollable wide table on the proxy page.
    expect(markup).not.toContain('<table')
  })
})

describe('insurance policy row header (/insurance @375: 320px in a 301px box)', () => {
  const policy = {
    id: 'pol1',
    associationId: null,
    kind: 'property' as const,
    carrier: 'Sample Mutual Insurance (demo)',
    policyNumber: 'UI-PROP-0001',
    coverageLimitCents: 450_000_000,
    deductibleCents: 2_500_000,
    premiumCents: 1_840_000,
    effectiveOn: '2025-11-11',
    expiresOn: '2026-11-11',
    documentId: null,
    notes: null,
  }
  const markup = html(
    <ToastProvider>
      <PolicyList
        policies={[policy]}
        reminders={[{ policyId: 'pol1', kind: 'property', carrier: policy.carrier, expiresOn: policy.expiresOn, daysLeft: 21, tone: '30' }]}
        today="2026-10-21"
        associations={[]}
        documents={[]}
        documentsFailed={false}
      />
    </ToastProvider>,
  )
  const header = markup.match(/<div class="flex flex-wrap items-start justify-between gap-2"><div class="([^"]*)">[\s\S]*?<\/div><div class="([^"]*)">/)

  it('renders the row with its expiry pill and actions', () => {
    expect(markup).toContain('Sample Mutual Insurance (demo)')
    expect(markup).toContain('Delete')
    expect(header).not.toBeNull()
  })

  it('lets the carrier text shrink and break', () => {
    expect(header![1].split(/\s+/)).toEqual(expect.arrayContaining(['min-w-0', 'max-w-full', 'break-words']))
  })

  it('lets the pill and Edit / Delete wrap instead of holding their width', () => {
    const cls = header![2].split(/\s+/)
    expect(cls).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'min-w-0', 'max-w-full']))
    expect(cls).not.toContain('shrink-0')
  })
})

// Be Vietnam Pro (b54bf54) is wider than the old font: these held their
// width at 375px once the font changed (UI shots run 211, 2026-10-31).
describe('wider-font regressions @375', () => {
  const src = (...p: string[]) => readFileSync(path.join(here, ...p), 'utf8')

  it('the violation wizard notes label row wraps under its AI button (322px in a 301px box)', () => {
    expect(src('violations', 'new', 'Wizard.tsx')).toMatch(
      /<div className="flex flex-wrap items-center justify-between gap-2">\s*<Label htmlFor="notes"/,
    )
  })

  it('"Invite all owners without an account" wraps and goes full width on phones (325px in a 301px box)', () => {
    const button = src('settings', 'members', 'OwnerInvites.tsx').match(
      /className="([^"]*)"\s*>\s*Invite all owners without an account/,
    )
    expect(button).not.toBeNull()
    expect(button![1].split(/\s+/)).toEqual(expect.arrayContaining(['h-auto', 'w-full', 'whitespace-normal', 'sm:w-auto']))
  })

  it('the follow-up letters header stacks on phones (violation page 383px > 375px)', () => {
    expect(src('violations', '[id]', 'page.tsx')).toMatch(
      /<CardHeader\s+className="flex-col sm:flex-row"\s+actions=\{\s*canDraftFollowUp && unitId \? \(\s*<FollowUpLetterDialog/,
    )
  })

  it('signature lines are drawn rules, not runs of underscores that never wrap (330px in a 301px box)', () => {
    for (const file of [
      src('properties', '[id]', 'estoppel', 'EstoppelCertificate.tsx'),
      src('properties', '[id]', 'collections-letter', 'CollectionsLetter.tsx'),
    ]) {
      expect(file).not.toMatch(/_{10,}/)
      expect(file).toMatch(/<span aria-hidden className="[^"]*\bmax-w-72\b[^"]*\bborder-b border-current"/)
    }
  })
})
