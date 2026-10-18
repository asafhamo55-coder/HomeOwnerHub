import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { strToU8 } from 'fflate'

// Component tests for the board roster import (P4), rendered to static
// HTML (no browser, no database). Every state comes from the REAL pipeline
// (parse → auto-map → rows → dry run) over a synthetic CINC-style file.
// With ROSTER_PREVIEW_DIR set, also writes 375/1440 light/dark previews:
//
//   pnpm --filter hoa build   # for the compiled CSS
//   ROSTER_PREVIEW_DIR=.ui-shots/p4-roster-import pnpm exec vitest run "apps/hoa/src/app/(dashboard)/properties/import/RosterImport.test.tsx"

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children),
}))
vi.mock('@/lib/properties/roster/actions', () => ({
  previewRosterMatches: vi.fn(),
  beginRosterImport: vi.fn(),
  commitRosterChunk: vi.fn(),
}))
vi.mock('../../../../components/dashboard/DismissSetupButton', () => ({ DismissSetupButton: () => React.createElement('button', null, 'Dismiss') }))

const { RosterImport } = await import('./RosterImport')
const { UploadStep, MappingStep, PreviewStep, ProgressStep, DoneStep } = await import('./RosterImportSteps')
const { PropertiesHeader } = await import('../PropertiesHeader')
const { SetupChecklistCard } = await import('@/components/dashboard/SetupChecklistCard')
const { buildSetupChecklist } = await import('@/lib/dashboard/setup-checklist')
const { parseRosterFile } = await import('@/lib/properties/roster/parse')
const { autoMap } = await import('@/lib/properties/roster/fields')
const { toRosterRows } = await import('@/lib/properties/roster/rows')
const { classifyRoster, summarize } = await import('@/lib/properties/roster/classify')
const { finalResults } = await import('@/lib/properties/roster/run')

// ─── The real pipeline over a synthetic CINC-style export ──────────────
const CSV = [
  'Account #,Homeowner Name,Property Address,Unit,Property City,Property State,Property Zip,Mailing Address 1,Mailing City,Mailing State,Mailing Zip,Email Address,Cell Phone,Rental,Current Balance',
  'A-1,Jordan Example,12 Example Way,,Exampleton,FL,32000,,,,,jordan@example.test,555-0100,No,0.00',
  'A-2,Sam Sample,14 Example Way,,Exampleton,FL,32000,PO Box 9,Elsewhere,NY,10001,sam@example.test,555-0101,Yes,"$1,250.00"',
  'A-3,Riley Placeholder,16 Example Way,,Exampleton,FL,32000,,,,,riley@example,555-0102,No,25.00',
  'A-4,Casey Demo,20 Condo Court,,Exampleton,FL,32000,,,,,casey@example.test,,No,',
  'A-5,Alex Specimen,12 Example Way,,Exampleton,FL,32000,,,,,alex@example.test,,No,',
  'A-6,Jordan Example,12 EXAMPLE WAY.,,Exampleton,FL,32000,,,,,jordan@example.test,,No,',
  'A-7,Morgan Mock,,,Exampleton,FL,32000,,,,,morgan@example.test,,No,',
  'A-8,Taylor Test,18 Example Way,,Exampleton,FL,32000,,,,,taylor@example.test,555-0104,,10.00',
].join('\r\n')
const parsed = parseRosterFile('cinc-homeowners.csv', strToU8(CSV))
if (!parsed.ok) throw new Error(parsed.error)
const { mapping, preset } = autoMap(parsed.headers)
const rows = toRosterRows(parsed.headers, parsed.rows, mapping)
// What the server would say: 14 and 18 are on file; Condo Court is two homes.
const matches = rows.map((r) =>
  r.address === '14 Example Way'
    ? { kind: 'match' as const, propertyId: 'p-14' }
    : r.address === '18 Example Way'
      ? { kind: 'match' as const, propertyId: 'p-18' }
      : r.address === '20 Condo Court'
        ? { kind: 'ambiguous' as const }
        : { kind: 'none' as const },
)
const fileState = { fileName: 'cinc-homeowners.csv', fileType: 'csv' as const, headers: parsed.headers, rows: parsed.rows, mapping, preset, detected: preset }
const classifiedSkip = classifyRoster(rows, matches, 'skip')
const classifiedUpdate = classifyRoster(rows, matches, 'update')
const committed = classifiedSkip
  .filter((c) => c.status === 'new')
  .map((c) => (c.row.row === 8 ? { row: 8, status: 'error' as const, reason: 'Couldn’t save this row (a connection or server problem). Import the error file again to retry.' } : { row: c.row.row, status: c.status }))
const results = finalResults(classifiedSkip, committed)

const noop = () => {}
const html = (el: React.ReactElement) => renderToStaticMarkup(el)
const A = [
  { id: 'a1', name: 'Example Lakes' },
  { id: 'a2', name: 'Example Pines' },
]

describe('the pipeline the previews show', () => {
  it('detects the CINC layout and classifies every kind of row', () => {
    expect(preset).toBe('cinc')
    expect(classifiedSkip.map((c) => [c.row.row, c.status])).toEqual([
      [2, 'new'],
      [3, 'duplicate'],
      [4, 'error'], // riley@example
      [5, 'error'], // ambiguous condo address
      [6, 'new'], // a second owner for 12 Example Way
      [7, 'duplicate'], // same home and owner as row 2
      [8, 'error'], // no address
      [9, 'duplicate'],
    ])
    expect(classifiedUpdate.find((c) => c.row.row === 3)?.status).toBe('update')
  })
})

describe('UploadStep', () => {
  it('asks for the community first in a multi-community org', () => {
    const out = html(<UploadStep associations={A} associationId={null} onAssociation={noop} onFile={noop} onTemplate={noop} />)
    expect(out).toContain('Community')
    expect(out).toContain('Choose the community first.')
    expect(out).toMatch(/<input[^>]*type="file"[^>]*disabled/)
  })

  it('a single-community org goes straight to the file, CSV or XLSX only, with the template and CINC notes', () => {
    const out = html(<UploadStep associations={[]} associationId={null} onAssociation={noop} onFile={noop} onTemplate={noop} />)
    expect(out).not.toContain('Choose a community')
    expect(out).toContain('accept=".csv,.xlsx,')
    expect(out).toContain('Download the template')
    expect(out).toContain('Moving from CINC Systems?')
    expect(out).toContain('Formulas are never run')
  })

  it('shows a file error as an alert', () => {
    const out = html(<UploadStep associations={[]} associationId={null} onAssociation={noop} onFile={noop} onTemplate={noop} error="That file is empty." />)
    expect(out).toContain('role="alert"')
    expect(out).toContain('That file is empty.')
  })
})

describe('MappingStep', () => {
  it('says it recognised CINC and shows a sample for each matched column', () => {
    const out = html(<MappingStep {...fileState} onMapping={noop} onPreset={noop} onBack={noop} onNext={noop} />)
    expect(out).toContain('This looks like a CINC Systems export.')
    expect(out).toContain('e.g. 12 Example Way')
    expect(out).toContain('e.g. jordan@example.test')
    expect(out).toContain('Balances are never posted')
    expect(out).toMatch(/<button[^>]*>Check rows<\/button>/)
  })

  it('without an address column it says so and will not continue', () => {
    const { address: _a, ...rest } = mapping
    const out = html(<MappingStep {...fileState} mapping={rest} onMapping={noop} onPreset={noop} onBack={noop} onNext={noop} />)
    expect(out).toContain('Choose the column with the property address.')
    expect(out).toMatch(/<button[^>]*disabled[^>]*>.*Check rows/)
  })
})

describe('PreviewStep (dry run)', () => {
  const preview = (mode: 'skip' | 'update') => {
    const classified = mode === 'skip' ? classifiedSkip : classifiedUpdate
    return html(
      <PreviewStep
        classified={classified}
        summary={summarize(classified)}
        mode={mode}
        onMode={noop}
        hasExisting
        showBalance
        onBack={noop}
        onImport={noop}
        onDownloadErrors={noop}
      />,
    )
  }

  it('shows the counts, each row’s result with its reason, and the mode choice', () => {
    const out = preview('skip')
    for (const t of ['New homes', 'Updates', 'Skipped', 'Errors', 'Skip them', 'Update them', 'Download rows with errors']) expect(out).toContain(t)
    // Opens on the errors so they are seen first.
    expect(out).toContain('The owner email isn’t a valid email address.')
    expect(out).toContain('Several homes share this address')
    expect(out).toContain('The address is missing.')
    expect(out).toContain('Import 2 rows')
  })

  it('balances are reference only, with their total, and never a posting', () => {
    const out = preview('skip')
    expect(out).toContain('Balances are for reference only')
    expect(out).toContain('$1,285.00')
    expect(out).toContain('Import does not post them')
  })

  it("'update' turns matched homes into updates", () => {
    expect(preview('update')).toContain('Import 4 rows')
  })
})

describe('ProgressStep and DoneStep', () => {
  it('progress is a labelled bar with a live count', () => {
    const out = html(<ProgressStep done={50} total={200} />)
    expect(out).toContain('role="progressbar"')
    expect(out).toContain('aria-valuenow="25"')
    expect(out).toContain('Saved 50 of 200 rows')
  })

  it('the summary offers the error file when rows failed', () => {
    const out = html(<DoneStep summary={summarize(results)} results={results} classified={classifiedSkip} onDownloadErrors={noop} onRestart={noop} />)
    expect(out).toContain('Import finished')
    expect(out).toContain('rows were not imported')
    expect(out).toContain('Download error rows (CSV)')
    expect(out).toContain('href="/properties"')
  })
})

describe('RosterImport', () => {
  it('starts on the upload step of a four-step wizard', () => {
    const out = html(<RosterImport associations={[]} />)
    expect(out).toContain('Choose your roster file')
    for (const s of ['Upload', 'Columns', 'Check', 'Import']) expect(out).toContain(s)
  })
})

describe('entry points', () => {
  it('the Properties header links to the import next to Add property', () => {
    const out = html(<PropertiesHeader orgName="Example HOA" filter="all" total={3} allCount={3} search="" />)
    expect(out).toMatch(/href="\/properties\/import"[^>]*>.*Import<\/a>/)
    expect(out.indexOf('/properties/import')).toBeLessThan(out.indexOf('/properties/new'))
  })

  it('the setup checklist’s properties step links to the import as its own link', () => {
    const out = html(
      <SetupChecklistCard checklist={buildSetupChecklist({ mailbox: [1], properties: [0, 0], residents: [0, 0], governingDocs: [0], dues: [0], board: [1] })} />,
    )
    expect(out).toContain('href="/properties/import"')
    expect(out).toContain('Import a spreadsheet')
    expect(out).not.toMatch(/contact support/i)
    // Never a link inside a link.
    expect(out).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<a /s)
  })
})

// ─── Static previews ─────────────────────────────────────────────────────
const PREVIEWS: Record<string, { title: string; body: React.ReactElement }> = {
  upload: { title: 'Roster import — upload (multi-community org)', body: <RosterImport associations={A} /> },
  'upload-single': { title: 'Roster import — upload (one community)', body: <RosterImport associations={[]} /> },
  mapping: { title: 'Roster import — column mapping (CINC auto-detected)', body: <RosterImport associations={[]} initial={{ step: 'map', ...fileState }} /> },
  'preview-skip': {
    title: 'Roster import — dry run, Skip existing (opens on errors)',
    body: <RosterImport associations={[]} initial={{ step: 'preview', ...fileState, matches, mode: 'skip' }} />,
  },
  'preview-update': {
    title: 'Roster import — dry run, Update existing',
    body: <RosterImport associations={[]} initial={{ step: 'preview', ...fileState, matches, mode: 'update' }} />,
  },
  importing: { title: 'Roster import — importing', body: <RosterImport associations={[]} initial={{ step: 'importing', ...fileState, matches, mode: 'skip', done: 50, total: 120 }} /> },
  done: { title: 'Roster import — finished with an error row', body: <RosterImport associations={[]} initial={{ step: 'done', ...fileState, matches, mode: 'skip', results }} /> },
  'properties-header': { title: 'Properties header with Import', body: <PropertiesHeader orgName="Example HOA" filter="all" total={3} allCount={3} search="" /> },
  'setup-checklist': {
    title: 'Setup checklist — properties step with Import a spreadsheet',
    body: <SetupChecklistCard checklist={buildSetupChecklist({ mailbox: [1], properties: [0, 0], residents: [0, 0], governingDocs: [0], dues: [0], board: [1] })} />,
  },
}

// Each frame is an iframe of its real width, so the app's breakpoints
// (sm/md/lg media queries) apply as they would on that screen, and dark
// is the app's own `<html class="dark">`.
const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
function page(title: string, inner: string, links: string): string {
  const frame = (w: number, dark: boolean) => {
    const doc = `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=${w}">${links}</head><body class="bg-background text-foreground" style="margin:0;padding:16px">${inner}</body></html>`
    return (
      `<figure style="margin:0"><figcaption style="font:12px system-ui;color:#888;margin:0 0 6px">${w}px · ${dark ? 'dark' : 'light'}</figcaption>` +
      `<iframe title="${w}px ${dark ? 'dark' : 'light'}" srcdoc="${escapeAttr(doc)}" style="width:${w}px;height:${w < 800 ? 1500 : 1000}px;border:1px solid #ccc;background:#fff"></iframe></figure>`
    )
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${links}</head>
<body style="margin:0;padding:24px;background:#e9e9ec;display:flex;flex-direction:column;gap:24px">
<h1 style="font:600 16px system-ui;margin:0">${title}</h1>
<div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">${frame(375, false)}${frame(375, true)}</div>
<div style="display:flex;flex-direction:column;gap:24px">${frame(1440, false)}${frame(1440, true)}</div>
</body></html>`
}

describe('roster import previews', () => {
  it('every preview renders', () => {
    for (const [name, p] of Object.entries(PREVIEWS)) expect(html(p.body).length, name).toBeGreaterThan(200)
  })

  const out = process.env.ROSTER_PREVIEW_DIR
  it.runIf(!!out)('write HTML previews', () => {
    const dir = resolve(process.cwd(), out!)
    mkdirSync(dir, { recursive: true })
    const cssDir = resolve(__dirname, '../../../../../.next/static/css')
    const css = existsSync(cssDir) ? readdirSync(cssDir).filter((f) => f.endsWith('.css')) : []
    for (const f of css) copyFileSync(join(cssDir, f), join(dir, f))
    const links = css.map((f) => `<link rel="stylesheet" href="${f}">`).join('')
    const index: string[] = []
    for (const [name, p] of Object.entries(PREVIEWS)) {
      writeFileSync(join(dir, `${name}.html`), page(p.title, html(p.body), links))
      index.push(`<li><a href="${name}.html">${p.title}</a></li>`)
    }
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>P4 roster import previews</title><ul>${index.join('')}</ul>`)
  })
})
