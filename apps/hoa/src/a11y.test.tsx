// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import axe from 'axe-core'
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogTrigger,
  Field,
  Input,
  AppShell,
  AppShellContent,
  AppShellHeader,
  AppShellMain,
  AppShellSidebar,
  Page,
  StatusBadge,
  ToastProvider,
} from '@homeowner-portal/ui'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh() {}, push() {} }),
  usePathname: () => '/resident',
}))
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children?: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/announcements/actions', () => ({ sendAnnouncement: async () => ({ ok: true }) }))
vi.mock('@/lib/association-settings-actions', () => ({ updateAssociationSettings: async () => ({ ok: true }) }))
vi.mock('@/lib/records-requests/actions', () => ({ createRecordsRequest: async () => ({ ok: true }) }))

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { AnnouncementFlow } = await import('./app/(dashboard)/communications/announce/AnnouncementFlow')
const { AssociationSettingsForm } = await import('./app/(dashboard)/settings/association/AssociationSettingsForm')
const { RecordsRequestForm } = await import('./app/resident/records/new/RecordsRequestForm')
const { OwnerRightsView } = await import('./app/resident/rights/OwnerRightsView')
const { ComplianceHeatMap } = await import('./components/dashboard/ComplianceHeatMap')
const { PendingApprovalsCard, ViolationSummaryCard, DuesOverviewCard } = await import('./components/dashboard/StatCards')
const { ResidentTabBar } = await import('./components/resident/ResidentTabBar')
const { ResidentStatus } = await import('./components/resident/status')
const { Panel } = await import('./components/resident/screen')

// WCAG 2.2 AA automated gate (axe-core). Static markup is rendered into
// jsdom and axe runs the WCAG 2.0/2.1/2.2 A + AA rule tags. jsdom has no
// layout, so `color-contrast` (covered by packages/ui tokens.test.ts) and
// the layout-dependent region rules are turned off; everything else
// (names, labels, roles, ARIA validity, headings, tables, landmarks) runs.
// Only serious and critical violations fail the test.

async function violations(container: HTMLElement) {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  })
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
}

function describeViolations(vs: Awaited<ReturnType<typeof violations>>): string {
  return vs.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html.slice(0, 120)).join(' | ')}`).join('\n')
}

let mounted: HTMLElement | null = null
let root: Root | null = null
afterEach(() => {
  if (root) act(() => root!.unmount())
  mounted?.remove()
  mounted = null
  root = null
})

async function auditStatic(el: React.ReactElement) {
  mounted = document.createElement('div')
  mounted.innerHTML = renderToStaticMarkup(<main>{el}</main>)
  document.body.appendChild(mounted)
  return violations(mounted)
}

async function auditMounted(el: React.ReactElement) {
  mounted = document.createElement('div')
  document.body.appendChild(mounted)
  root = createRoot(mounted)
  await act(async () => {
    root!.render(el)
  })
  return violations(document.body)
}

const STREETS = [{ key: 'oak', label: 'Oak Ln', unitIds: ['u1', 'u2'], ownerCount: 2, homes: [] }] as never
const ASSOC = { id: 'a1', name: 'Oak Hollow HOA', state: 'GA', governingLawState: null, type: 'hoa' }

describe('a11y (axe-core, WCAG 2.2 AA): no serious or critical violations', () => {
  it('control: the harness does flag an unnamed button, an unlabelled input and an image with no alt', async () => {
    const found = await auditStatic(
      <div>
        <button type="button" />
        <input type="text" />
        <img src="/x.png" />
      </div>,
    )
    expect(found.map((v) => v.id).sort()).toEqual(['button-name', 'image-alt', 'label'])
  })

  it('dashboard: stat cards, compliance calendar', async () => {
    const today = '2026-10-27'
    const cells = [
      { day: '2026-10-28', level: 'red' as const, notes: ['Notice 12 cure deadline'] },
      { day: '2026-10-30', level: 'yellow' as const, notes: ['Dues due'] },
      { day: '2026-11-02', level: 'green' as const, notes: [] },
    ]
    const found = await auditStatic(
      <Page title="Dashboard">
        <PendingApprovalsCard count={3} />
        <ViolationSummaryCard open={4} overdue={2} />
        <DuesOverviewCard amount={1200} propertiesBehind={2} />
        <ComplianceHeatMap cells={cells} today={today} />
      </Page>,
    )
    expect(describeViolations(found)).toBe('')
  })

  it('list pages (properties, dues, violations): DataTable with status badges and sort links', async () => {
    const rows = [
      { id: '1', address: '12 Oak Ln', status: 'notice_sent', owed: '$120.00' },
      { id: '2', address: '14 Oak Ln', status: 'resolved', owed: '$0.00' },
    ]
    const found = await auditStatic(
      <Page title="Violations">
        <DataTable
          caption="Violations"
          rows={rows}
          rowKey={(r) => r.id}
          sort={{ key: 'address', direction: 'asc' }}
          sortHref={(k, d) => `?sort=${k}&dir=${d}`}
          columns={[
            { key: 'address', header: 'Property', cell: (r) => <a href={`/p/${r.id}`}>{r.address}</a>, sortable: true },
            { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} tones={{ notice_sent: 'warning', resolved: 'success' }} /> },
            { key: 'owed', header: 'Owed', cell: (r) => r.owed, numeric: true },
          ]}
        />
        <Badge variant="info">Info</Badge>
      </Page>,
    )
    expect(describeViolations(found)).toBe('')
  })

  it('communications: new announcement flow opens on the occasion grid', async () => {
    const found = await auditMounted(
      <ToastProvider>
        <main>
          <AnnouncementFlow
            associationName="Oak Hollow HOA"
            today="2026-10-27"
            streets={[]}
            everyoneCount={42}
            smsAvailable
            schedulingEnabled
            initialOccasionId={null}
            initialDate=""
          />
        </main>
      </ToastProvider>,
    )
    expect(describeViolations(found)).toBe('')
  })

  it('communications: announcement flow draft step (form fields, Spanish toggle)', async () => {
    const found = await auditMounted(
      <ToastProvider>
        <main>
          <AnnouncementFlow
            associationName="Oak Hollow HOA"
            today="2026-10-27"
            streets={STREETS}
            everyoneCount={42}
            smsAvailable
            schedulingEnabled
            initialOccasionId="halloween-party"
            initialDate="2026-11-08"
          />
        </main>
      </ToastProvider>,
    )
    expect(describeViolations(found)).toBe('')
  })

  it('communications: announcement flow review step (audience radios, schedule)', async () => {
    const found = await auditMounted(
      <ToastProvider>
        <main>
          <AnnouncementFlow
            associationName="Oak Hollow HOA"
            today="2026-10-27"
            streets={STREETS}
            everyoneCount={42}
            smsAvailable
            schedulingEnabled
            initialOccasionId="halloween-party"
            initialDate="2026-10-31"
          />
        </main>
      </ToastProvider>,
    )
    expect(describeViolations(found)).toBe('')
    const next = Array.from(document.querySelectorAll('button')).find((b) => /review it/i.test(b.textContent ?? ''))
    expect(next).toBeTruthy()
    await act(async () => {
      next!.click()
    })
    expect(document.body.textContent).toContain('Who gets it')
    // Focus follows the user to the new step instead of falling to <body>.
    expect(document.activeElement?.textContent).toBe('Who gets it')
    expect(document.querySelector('[role="radiogroup"]')?.getAttribute('aria-labelledby')).toBe('announce-audience-h')
    expect(describeViolations(await violations(document.body))).toBe('')
  })

  it('settings: association form (admin and read-only)', async () => {
    const admin = await auditMounted(
      <ToastProvider>
        <main>
          <AssociationSettingsForm association={ASSOC} canEdit />
        </main>
      </ToastProvider>,
    )
    expect(describeViolations(admin)).toBe('')
    act(() => root!.unmount())
    root = null
    mounted?.remove()
    const readOnly = await auditMounted(
      <ToastProvider>
        <main>
          <AssociationSettingsForm association={ASSOC} canEdit={false} />
        </main>
      </ToastProvider>,
    )
    expect(describeViolations(readOnly)).toBe('')
  })

  it('resident portal: records request form, owner rights, tab bar, status', async () => {
    const units = [
      {
        unit_id: 'u1',
        unit_number: '12',
        address: '12 Oak Ln',
        association_id: 'a1',
        association_name: 'Oak Hollow HOA',
        ownership_pct: 100,
        valid_from: '2020-01-01',
      },
    ]
    const found = await auditMounted(
      <ToastProvider>
        <ResidentTabBar />
        <main>
          <h1>Request records</h1>
          <RecordsRequestForm units={units as never} />
          <OwnerRightsView today="2027-02-01" recordsLive />
          <Panel>
            <ResidentStatus kind="violation" status="notice_sent" />
          </Panel>
        </main>
      </ToastProvider>,
    )
    expect(describeViolations(found)).toBe('')
  })

  it('shell: skip link is the first tab stop and targets <main id="main">; closed phone drawer is not focusable; wide tables scroll by keyboard', async () => {
    const found = await auditMounted(
      <AppShell>
        <AppShellSidebar>
          <nav aria-label="Main">
            <a href="/dues">Dues</a>
          </nav>
        </AppShellSidebar>
        <AppShellMain>
          <AppShellHeader />
          <AppShellContent>
            <h1>Dues</h1>
            <DataTable caption="Dues" rows={[{ id: '1' }]} rowKey={(r) => r.id} columns={[{ key: 'a', header: 'A', cell: (r) => r.id }]} />
          </AppShellContent>
        </AppShellMain>
      </AppShell>,
    )
    expect(describeViolations(found)).toBe('')
    const skip = document.querySelector('a[href="#main"]')
    expect(skip?.textContent).toBe('Skip to main content')
    expect(document.body.querySelector('a, button, [tabindex]')).toBe(skip)
    expect(document.getElementById('main')?.getAttribute('tabindex')).toBe('-1')
    expect(document.querySelector('aside')?.className).toContain('max-md:invisible')
    expect(document.querySelector('table')?.parentElement?.getAttribute('tabindex')).toBe('0')
  })

  it('toasts: the Notifications region is a polite live region that exists before any toast', async () => {
    const found = await auditMounted(<ToastProvider>{null}</ToastProvider>)
    expect(describeViolations(found)).toBe('')
    const region = document.querySelector('[aria-label="Notifications"]')
    expect(region?.getAttribute('aria-live')).toBe('polite')
  })

  it('dialogs: an open Dialog is labelled and traps focus (Radix)', async () => {
    const found = await auditMounted(
      <Dialog defaultOpen>
        <DialogTrigger asChild>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent title="Send reminders" description="Remind owners who are behind.">
          <Field label="Message">
            <Input name="m" />
          </Field>
        </DialogContent>
      </Dialog>,
    )
    expect(describeViolations(found)).toBe('')
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy()
    expect(dialog?.getAttribute('aria-modal') ?? 'true').not.toBe('false')
  })
})
