import { AlertTriangle, Info } from 'lucide-react'
import { INSURANCE_NOT_LEGAL_ADVICE, type CoverageCheck } from '@/lib/insurance/model'

// BL-132: the coverage check for one association. Warnings and notes only;
// every quote is verbatim from the statute text the app holds.
export function CoverageCheckPanel({ check, associationName }: { check: CoverageCheck; associationName: string | null }) {
  return (
    <section aria-label={associationName ? `Coverage check, ${associationName}` : 'Coverage check'} className="space-y-3 text-sm">
      {associationName ? <h3 className="font-medium text-foreground">{associationName}</h3> : null}
      <ul className="space-y-3">
        {check.findings.map((f) => (
          <li key={f.code} className="flex gap-2">
            {f.severity === 'warn' ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Warning" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-label="Note" />
            )}
            <div className="min-w-0 space-y-1">
              <p className="text-foreground">{f.message}</p>
              {f.citations.map((c) => (
                <blockquote key={`${c.cite}:${c.quote.slice(0, 24)}`} className="border-l-2 border-border pl-3 text-xs text-foreground-secondary">
                  “{c.quote}” <cite className="not-italic text-muted">({c.cite})</cite>
                </blockquote>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {check.notLoaded.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          {check.notLoaded.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted">{INSURANCE_NOT_LEGAL_ADVICE}</p>
    </section>
  )
}
