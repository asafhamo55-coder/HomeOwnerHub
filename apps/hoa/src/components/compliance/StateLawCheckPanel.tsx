'use client'

import Link from 'next/link'
import { Scale } from 'lucide-react'
import { Badge, Field, Select } from '@homeowner-portal/ui'
import {
  NOT_LEGAL_ADVICE,
  OVERRIDE_REASONS,
  type AppliedOverride,
  type DriftCheck,
  type OverrideReason,
} from '@/lib/compliance/statute-drift'

/**
 * BL-130: the "State law check" shown before a fine is levied or a
 * collections letter is saved, approved or printed. Each finding cites
 * its section and quotes the statute. A blocking finding asks for the
 * board's override reason (one code per finding) when `onOverride` is
 * given; the server action refuses without it and records it in
 * audit_log. `recorded` lists overrides the board already recorded.
 */
export function StateLawCheckPanel({
  check,
  overrides = {},
  onOverride,
  recorded = [],
  disabled = false,
}: {
  check: DriftCheck
  overrides?: Readonly<Record<string, string>>
  onOverride?: (code: string, reason: OverrideReason | '') => void
  recorded?: readonly AppliedOverride[]
  disabled?: boolean
}) {
  const blocks = check.findings.filter((f) => f.severity === 'block')
  const warns = check.findings.filter((f) => f.severity === 'warn')
  const recordedFor = (code: string) => recorded.find((r) => r.code === code) ?? null

  return (
    <section aria-labelledby="state-law-check" className="space-y-3 rounded-lg border border-border bg-subtle p-4 text-sm print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Scale className="size-4 text-muted" aria-hidden />
        <h3 id="state-law-check" className="font-semibold text-foreground">
          State law check{check.state ? ` · ${check.state}` : ''}
        </h3>
        {blocks.length > 0 ? <Badge variant="danger">{blocks.length} blocking</Badge> : null}
        {warns.length > 0 ? <Badge variant="warning">{warns.length} to confirm</Badge> : null}
        {check.findings.length === 0 ? <Badge variant="neutral">No problems found</Badge> : null}
      </div>

      {check.findings.length > 0 ? (
        <ul className="space-y-3">
          {[...blocks, ...warns].map((f) => {
            const done = recordedFor(f.code)
            return (
              <li key={f.code} className={`space-y-2 border-l-2 pl-3 ${f.severity === 'block' ? 'border-danger' : 'border-warning'}`}>
                <p className="text-foreground">
                  <span className="font-medium">{f.severity === 'block' ? 'Blocks this step: ' : 'Confirm: '}</span>
                  {f.message}
                </p>
                {f.citations.map((c) => (
                  <blockquote key={`${f.code}-${c.cite}-${c.quote.slice(0, 24)}`} className="text-xs text-foreground-secondary">
                    <span className="font-medium text-foreground">{c.cite}:</span> “{c.quote}”
                  </blockquote>
                ))}
                {f.link ? (
                  <p className="text-xs">
                    <Link href={f.link.href} className="font-medium text-primary hover:underline">
                      {f.link.label}
                    </Link>
                  </p>
                ) : null}
                {f.severity === 'block' && done ? (
                  <p className="text-xs text-foreground-secondary">Board override recorded: {OVERRIDE_REASONS[done.reason]}</p>
                ) : null}
                {f.severity === 'block' && !done && onOverride ? (
                  <Field label="Board’s reason to go ahead anyway" hint="Recorded in the activity log. Leave empty to stop here.">
                    <Select
                      value={overrides[f.code] ?? ''}
                      onValueChange={(v) => onOverride(f.code, v as OverrideReason | '')}
                      disabled={disabled}
                      placeholder="Don’t go ahead"
                    >
                      <option value="">Don’t go ahead</option>
                      {f.overrideReasons.map((r) => (
                        <option key={r} value={r}>
                          {OVERRIDE_REASONS[r]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {check.notLoaded.length > 0 ? (
        <div className="space-y-1 text-xs text-foreground-secondary">
          <p className="font-medium text-foreground">Not checked here</p>
          <ul className="list-disc space-y-1 pl-5">
            {check.notLoaded.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted">{NOT_LEGAL_ADVICE}</p>
    </section>
  )
}
