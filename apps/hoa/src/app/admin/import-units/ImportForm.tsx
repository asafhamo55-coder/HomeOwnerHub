'use client'

import { useMemo, useState, useTransition } from 'react'
import { Upload } from 'lucide-react'
import { Button, Input, Select } from '@homeowner-portal/ui'
import {
  runImport,
  type AssociationOption,
  type ImportResult,
  type OrgOption,
} from './actions'

interface Props {
  orgs: OrgOption[]
  associations: AssociationOption[]
}

export function ImportForm({ orgs, associations }: Props): React.ReactElement {
  const [orgId, setOrgId] = useState<string>(orgs[0]?.id ?? '')
  const [associationId, setAssociationId] = useState<string>('')
  const [propertiesFile, setPropertiesFile] = useState<File | null>(null)
  const [residentsFile, setResidentsFile] = useState<File | null>(null)
  const [apply, setApply] = useState(false)

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const filteredAssociations = useMemo(
    () => associations.filter((a) => a.organization_id === orgId),
    [associations, orgId],
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (!orgId) {
      setError('Pick an organization.')
      return
    }
    if (!propertiesFile || !residentsFile) {
      setError('Both Properties.csv and Residents.csv are required.')
      return
    }

    const propertiesCsv = await propertiesFile.text()
    const residentsCsv = await residentsFile.text()

    startTransition(async () => {
      const res = await runImport({
        orgId,
        associationId: associationId || null,
        propertiesCsv,
        residentsCsv,
        apply,
      })
      if (!res.ok) {
        setError(res.error ?? 'Import failed.')
        return
      }
      setResult(res)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Target
        </h2>

        <Field label="Organization" required>
          <Select
            value={orgId}
            onValueChange={(v) => {
              setOrgId(v)
              setAssociationId('') // reset assoc when org changes
            }}
          >
            <option value="">— pick an org —</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Association (optional)">
          <Select
            value={associationId}
            onValueChange={(v) => setAssociationId(v)}
            disabled={!orgId || filteredAssociations.length === 0}
          >
            <option value="">— none / leave blank —</option>
            {filteredAssociations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.state ? ` (${a.state})` : ''}
              </option>
            ))}
          </Select>
        </Field>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Files
        </h2>

        <Field label="Properties.csv" required>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setPropertiesFile(e.currentTarget.files?.[0] ?? null)}
            required
          />
        </Field>

        <Field label="Residents.csv" required>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setResidentsFile(e.currentTarget.files?.[0] ?? null)}
            required
          />
        </Field>
      </section>

      <section className="space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={apply}
            onChange={(e) => setApply(e.currentTarget.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Apply</span> — actually write to the
            database. Leave unchecked for a dry run (parses + reports counts,
            no writes).
          </span>
        </label>
      </section>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          <Upload className="h-4 w-4" />
          {isPending
            ? (apply ? 'Importing…' : 'Running dry-run…')
            : (apply ? 'Run import' : 'Run dry-run')}
        </Button>
      </div>

      {result ? <ImportResultDisplay result={result} /> : null}
    </form>
  )
}

function ImportResultDisplay({ result }: { result: ImportResult }): React.ReactElement {
  return (
    <section className="mt-4 space-y-3 rounded-md border border-border/60 bg-muted/20 p-4">
      <h3 className="text-sm font-semibold">
        {result.dryRun ? 'Dry-run results' : 'Import complete'}
      </h3>

      <div className="grid gap-2 sm:grid-cols-3 text-sm">
        <Stat label="Units" data={result.units} />
        <Stat label="Ownerships" data={result.ownerships} />
        <Stat label="Tenancies" data={result.tenancies} />
      </div>

      {result.skipped > 0 ? (
        <p className="text-sm text-muted">Skipped: {result.skipped}</p>
      ) : null}

      {result.warnings.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium">
            Warnings ({result.warnings.length}{result.warnings.length === 30 ? '+' : ''})
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {result.warnings.map((w, i) => (
              <li key={i} className="list-disc text-muted">{w}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {result.dryRun ? (
        <p className="text-xs text-muted">
          This was a dry run. Re-submit with <strong>Apply</strong> checked to
          actually write.
        </p>
      ) : null}
    </section>
  )
}

function Stat({
  label,
  data,
}: {
  label: string
  data: { inserted: number; reused: number; errored: number }
}): React.ReactElement {
  return (
    <div className="rounded-md border border-border/60 bg-background px-3 py-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="text-sm">
        <span className="text-foreground">{data.inserted} inserted</span>
        {' · '}
        <span className="text-muted">{data.reused} reused</span>
        {data.errored > 0 ? (
          <>
            {' · '}
            <span className="text-destructive">{data.errored} errored</span>
          </>
        ) : null}
      </p>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  )
}
