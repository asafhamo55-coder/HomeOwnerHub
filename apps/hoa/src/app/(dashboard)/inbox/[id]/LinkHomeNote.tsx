import { LINK_HOME_NOTE } from '@/lib/inbox/draft/association-scope'
import { THREAD_CONTEXT_ANCHOR } from './ContextStrip'

/**
 * Shown above the reply box when the thread is not linked to a home and the
 * org has several associations: drafts then have no governing documents,
 * state law or past replies to draw on, because guessing the community could
 * quote the wrong one's rules. Linking the message to a home fixes it.
 */
export function LinkHomeNote() {
  return (
    <p role="note" className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-foreground">
      {LINK_HOME_NOTE}.{' '}
      <a href={`#${THREAD_CONTEXT_ANCHOR}`} className="font-medium underline">
        Choose a home
      </a>
    </p>
  )
}
