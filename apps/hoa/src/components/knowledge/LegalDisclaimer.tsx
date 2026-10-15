import { Scale } from 'lucide-react'

/**
 * The "informational, not legal advice" notice every state-law page
 * carries. A quiet inline note rather than a full Alert: it is always
 * true, so it should never compete with the page's content for attention.
 */
export function LegalDisclaimer({ children }: { children?: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border bg-subtle px-3 py-2.5 text-sm text-foreground-secondary">
      <Scale className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <span>
        <span className="font-medium text-foreground">Informational, not legal advice.</span>{' '}
        {children ??
          'Answers are grounded in the statute text and cite it, but they are not a substitute for an attorney. For decisions specific to your association, consult a licensed attorney in your state.'}
      </span>
    </p>
  )
}
