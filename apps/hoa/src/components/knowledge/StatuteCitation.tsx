import { AlertTriangle, BookOpen } from 'lucide-react'
import type { CitationCheck } from '@/lib/fl-compliance/evaluate'
import { FL_RECORDS_SECTION } from '@/lib/fl-compliance/rules'

/**
 * One § 720.303 citation. A quote is rendered ONLY when it was validated
 * against the stored official statute text; otherwise the line says the
 * text isn't loaded (or no longer matches) and asks the reader to verify —
 * it never shows unvalidated statute wording.
 */
export function StatuteCitation({ check }: { check: CitationCheck }) {
  const cite = `${FL_RECORDS_SECTION}${check.subsection}`
  if (check.kind === 'validated') {
    return (
      <figure className="min-w-0 border-l-2 border-border-strong pl-3">
        <blockquote className="break-words font-serif text-sm leading-relaxed text-foreground-secondary">
          “{check.quote}”
        </blockquote>
        <figcaption className="mt-1 text-xs text-muted">
          <span className="num font-medium">Fla. Stat. {cite}</span> · quote checked against the official text
        </figcaption>
      </figure>
    )
  }
  return (
    <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted">
      {check.kind === 'mismatch' ? (
        <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
      ) : (
        <BookOpen className="mt-px size-3.5 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 break-words">
        <span className="num font-medium text-foreground-secondary">Fla. Stat. {cite}</span> —{' '}
        {check.kind === 'mismatch'
          ? `the current statute text no longer contains our quote — verify against ${FL_RECORDS_SECTION}`
          : `statute text not yet loaded — verify against ${FL_RECORDS_SECTION}`}
      </span>
    </p>
  )
}
