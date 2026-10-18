'use client'

/**
 * The board's roster import (P4 / PR-02): upload → map columns → dry run
 * → import in chunks → summary.
 *
 * The file is read in the browser (lib/properties/roster/parse.ts) and
 * never uploaded whole. The dry run sends only each row's address and
 * unit, to learn which homes are already on file; Import then sends the
 * homes in chunks of about 25 rows. Balances never leave the page.
 */
import * as React from 'react'
import { WizardStepper } from '@homeowner-portal/ui'
import { downloadCsvFile } from '@/lib/csv'
import { autoMap, detectPreset, templateCsv, type ColumnMapping, type RosterPreset } from '@/lib/properties/roster/fields'
import { parseRosterFile } from '@/lib/properties/roster/parse'
import { toRosterRows } from '@/lib/properties/roster/rows'
import {
  classifyRoster,
  COMMIT_CHUNK_ROWS,
  planCommit,
  summarize,
  type ClassifiedRow,
  type RosterMode,
} from '@/lib/properties/roster/classify'
import type { RowResult } from '@/lib/properties/roster/commit'
import { errorRowsCsv, finalResults, runChunks } from '@/lib/properties/roster/run'
import type { SheetRow } from '@/lib/properties/roster/xlsx'
import type { HomeMatch } from '@/lib/properties/match-home'
import { beginRosterImport, commitRosterChunk, previewRosterMatches } from '@/lib/properties/roster/actions'
import { DoneStep, MappingStep, PreviewStep, ProgressStep, UploadStep, type AssociationChoice } from './RosterImportSteps'

interface FileState {
  fileName: string
  fileType: 'csv' | 'xlsx'
  headers: string[]
  rows: SheetRow[]
  mapping: ColumnMapping
  preset: RosterPreset
  detected: RosterPreset
}

export type ImportState =
  | { step: 'upload' }
  | ({ step: 'map' } & FileState)
  | ({ step: 'preview'; matches: HomeMatch[]; mode: RosterMode } & FileState)
  | ({ step: 'importing'; matches: HomeMatch[]; mode: RosterMode; done: number; total: number } & FileState)
  | ({ step: 'done'; matches: HomeMatch[]; mode: RosterMode; results: RowResult[] } & FileState)

const STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'map', label: 'Columns' },
  { id: 'preview', label: 'Check' },
  { id: 'done', label: 'Import' },
]
const STEP_INDEX: Record<ImportState['step'], number> = { upload: 0, map: 1, preview: 2, importing: 3, done: 3 }

export function RosterImport({
  associations,
  initial = { step: 'upload' },
}: {
  /** Non-empty only when the org has more than one community. */
  associations: AssociationChoice[]
  initial?: ImportState
}) {
  const [state, setState] = React.useState<ImportState>(initial)
  const [associationId, setAssociationId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const rosterRows = React.useMemo(
    () => (state.step === 'upload' ? [] : toRosterRows(state.headers, state.rows, state.mapping)),
    [state],
  )
  const classified: ClassifiedRow[] = React.useMemo(
    () => (state.step === 'upload' || state.step === 'map' ? [] : classifyRoster(rosterRows, state.matches, state.mode)),
    [state, rosterRows],
  )

  const go = (next: ImportState) => {
    setError(null)
    setState(next)
  }

  const onFile = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const parsed = parseRosterFile(file.name, new Uint8Array(await file.arrayBuffer()))
      if (!parsed.ok) {
        setError(parsed.error)
        return
      }
      const detected = detectPreset(parsed.headers)
      const { mapping } = autoMap(parsed.headers, detected)
      go({
        step: 'map',
        fileName: file.name,
        fileType: /\.xlsx$/i.test(file.name) ? 'xlsx' : 'csv',
        headers: parsed.headers,
        rows: parsed.rows,
        mapping,
        preset: detected,
        detected,
      })
    } catch {
      setError('We couldn’t read that file. Try saving it again as .csv or .xlsx.')
    } finally {
      setBusy(false)
    }
  }

  const onCheck = async () => {
    if (state.step !== 'map') return
    setBusy(true)
    setError(null)
    try {
      const r = await previewRosterMatches({ homes: rosterRows.map((x) => ({ address: x.address, unit: x.unit })) })
      if (!r.ok) {
        setError(r.error)
        return
      }
      go({ ...state, step: 'preview', matches: r.matches, mode: 'skip' })
    } catch {
      setError('Couldn’t check your existing homes. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const onImport = async () => {
    if (state.step !== 'preview') return
    const homes = planCommit(classified)
    const summary = summarize(classified)
    setBusy(true)
    setError(null)
    try {
      const begun = await beginRosterImport({
        associationId,
        mode: state.mode,
        counts: summary,
        fileType: state.fileType,
        preset: state.preset,
      })
      if (!begun.ok) {
        setError(begun.error)
        return
      }
      const total = homes.reduce((n, h) => n + h.rows.length, 0)
      setState({ ...state, step: 'importing', done: 0, total })
      const committed = await runChunks(homes, {
        chunkRows: COMMIT_CHUNK_ROWS,
        commit: (chunk) => commitRosterChunk({ associationId: begun.associationId, mode: state.mode, homes: chunk }),
        onProgress: (done) => setState((s) => (s.step === 'importing' ? { ...s, done } : s)),
      })
      setState({ ...state, step: 'done', results: finalResults(classified, committed) })
    } catch {
      setError('Couldn’t start the import. Nothing was written. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const downloadErrors = (results: RowResult[]) => downloadCsvFile('roster-import-errors.csv', errorRowsCsv(classified, results))

  return (
    <div className="space-y-6">
      <WizardStepper steps={STEPS} currentIndex={STEP_INDEX[state.step]} vertical={false} />

      {state.step === 'upload' ? (
        <UploadStep
          associations={associations}
          associationId={associationId}
          onAssociation={setAssociationId}
          onFile={onFile}
          onTemplate={() => downloadCsvFile('roster-template.csv', templateCsv())}
          error={error}
          busy={busy}
        />
      ) : null}

      {state.step === 'map' ? (
        <MappingStep
          fileName={state.fileName}
          headers={state.headers}
          rows={state.rows}
          mapping={state.mapping}
          preset={state.preset}
          detected={state.detected}
          onMapping={(mapping) => setState({ ...state, mapping })}
          onPreset={(preset) => setState({ ...state, preset, mapping: autoMap(state.headers, preset).mapping })}
          onBack={() => go({ step: 'upload' })}
          onNext={onCheck}
          error={error}
          busy={busy}
        />
      ) : null}

      {state.step === 'preview' ? (
        <PreviewStep
          classified={classified}
          summary={summarize(classified)}
          mode={state.mode}
          onMode={(mode) => setState({ ...state, mode })}
          hasExisting={state.matches.some((m) => m.kind === 'match')}
          showBalance={state.mapping.balance !== undefined}
          onBack={() => go({ ...state, step: 'map' })}
          onImport={onImport}
          onDownloadErrors={() => downloadErrors(classified.map((c) => ({ row: c.row.row, status: c.status, reason: c.reason })))}
          error={error}
          busy={busy}
        />
      ) : null}

      {state.step === 'importing' ? <ProgressStep done={state.done} total={state.total} /> : null}

      {state.step === 'done' ? (
        <DoneStep
          summary={summarize(state.results)}
          results={state.results}
          classified={classified}
          onDownloadErrors={() => downloadErrors(state.results)}
          onRestart={() => go({ step: 'upload' })}
        />
      ) : null}
    </div>
  )
}
