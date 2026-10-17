'use client'

import { useMemo, useState, useTransition } from 'react'
import { Upload } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Input,
  Select,
} from '@homeowner-portal/ui'
import { runImport, type AssociationOption, type ImportResult, type OrgOption } from './actions'

interface Props {
  orgs: OrgOption[]
  associations: AssociationOption[]
}

type Errors = Partial<Record<'org' | 'properties' | 'residents', string>>

export function ImportForm({ orgs, associations }: Props): React.ReactElement {
  const [orgId, setOrgId] = useState<string>(orgs[0]?.id ?? '')
  const [associationId, setAssociationId] = useState<string>('')
  const [propertiesFile, setPropertiesFile] = useState<File | null>(null)
  const [residentsFile, setResidentsFile] = useState<File | null>(null)
  const [apply, setApply] = useState(false)

  const [isPending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<Errors>({})
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

    const errs: Errors = {}
    if (!orgId) errs.org = 'Pick the tenant to import into.'
    if (!propertiesFile) errs.properties = 'Choose the Properties.csv export.'
    if (!residentsFile) errs.residents = 'Choose the Residents.csv export.'
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0 || !propertiesFile || !residentsFile) return

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
        setError(res.error ?? 'The import failed. Nothing was written.')
        return
      }
      setResult(res)
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Target</CardTitle>
          <CardDescription>Where the units and residents land.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Tenant" required error={fieldErrors.org}>
            <Select
              value={orgId}
              onValueChange={(v) => {
                setOrgId(v)
                setAssociationId('')
              }}
            >
              <option value="">Pick a tenant…</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Association"
            optional
            hint={orgId && filteredAssociations.length === 0 ? 'This tenant has no associations yet.' : undefined}
          >
            <Select
              value={associationId}
              onValueChange={(v) => setAssociationId(v)}
              disabled={!orgId || filteredAssociations.length === 0}
            >
              <option value="">None</option>
              {filteredAssociations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.state ? ` (${a.state})` : ''}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Files</CardTitle>
          <CardDescription>HomeownerHub export format, UTF-8 CSV.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Properties.csv" required error={fieldErrors.properties}>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setPropertiesFile(e.currentTarget.files?.[0] ?? null)}
            />
          </Field>
          <Field label="Residents.csv" required error={fieldErrors.residents}>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setResidentsFile(e.currentTarget.files?.[0] ?? null)}
            />
          </Field>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Checkbox
            checked={apply}
            onChange={(e) => setApply(e.currentTarget.checked)}
            label="Write to the database"
            description="Leave off for a dry run: parse and count only, no writes."
          />
          <Button type="submit" loading={isPending} icon={<Upload aria-hidden />} className="shrink-0">
            {apply ? 'Run import' : 'Run dry run'}
          </Button>
        </CardFooter>
      </Card>

      {error ? (
        <Alert variant="error" title="Import failed">
          {error}
        </Alert>
      ) : null}

      {result ? <ImportResultDisplay result={result} /> : null}
    </form>
  )
}

function ImportResultDisplay({ result }: { result: ImportResult }): React.ReactElement {
  const errored =
    result.properties.errored +
    result.units.errored +
    result.ownerships.errored +
    result.residents.errored +
    result.tenancies.errored
  return (
    <Card aria-live="polite">
      <CardHeader>
        <CardTitle as="h2">{result.dryRun ? 'Dry-run results' : 'Import complete'}</CardTitle>
        <CardDescription>
          {result.dryRun
            ? 'Nothing was written. Turn on “Write to the database” and run again to apply.'
            : errored > 0
              ? `${errored} row${errored === 1 ? '' : 's'} failed; everything else was written.`
              : 'All rows were written.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Properties" data={result.properties} />
          <Stat label="Units" data={result.units} />
          <Stat label="Ownerships" data={result.ownerships} />
          <Stat label="Owner residents" data={result.residents} />
          <Stat label="Tenancies" data={result.tenancies} />
        </div>
        {result.skipped > 0 ? <p className="text-sm text-muted">{result.skipped} rows skipped.</p> : null}
        {result.warnings.length > 0 ? (
          <Alert variant="warning" title={`${result.warnings.length}${result.warnings.length === 30 ? '+' : ''} warnings`}>
            <ul className="list-disc space-y-1 pl-4">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
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
    <div className="rounded-lg border border-border bg-subtle px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="num mt-1 text-2xl font-semibold text-foreground">{data.inserted.toLocaleString()}</p>
      <p className="num text-xs text-muted">
        inserted · {data.reused} reused
        {data.errored > 0 ? <span className="font-medium text-danger"> · {data.errored} failed</span> : null}
      </p>
    </div>
  )
}
