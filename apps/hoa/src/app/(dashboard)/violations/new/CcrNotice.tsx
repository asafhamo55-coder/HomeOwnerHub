import { Alert } from '@homeowner-portal/ui'

/** Shown at the top of the report form. `unknown` means the CC&R check itself failed. */
export function CcrNotice({ status }: { status: 'ok' | 'missing' | 'unknown' }) {
  if (status === 'ok') return null
  if (status === 'unknown') {
    return (
      <p className="text-sm text-muted">
        We couldn&apos;t check whether your CC&amp;Rs are uploaded. You can still report the violation.
      </p>
    )
  }
  return (
    <Alert variant="warning" title="No CC&Rs uploaded">
      The AI can still draft a letter, but it won&apos;t know which section to cite.{' '}
      <a className="font-medium underline underline-offset-2" href="/documents/governing">
        Upload your CC&amp;Rs
      </a>{' '}
      for better drafts.
    </Alert>
  )
}
