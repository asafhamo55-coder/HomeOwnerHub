import Link from 'next/link'
import { deadlineTitles, newEventHref } from './deadline-chips'

/**
 * Starting points for a new event. Each chip only opens the form with the
 * title filled in; nothing is created until the board saves.
 */
export function DeadlineChips({ state }: { state: string | null | undefined }) {
  return (
    <div className="space-y-2">
      <h3 id="common-deadlines" className="text-sm font-medium text-foreground-secondary">
        Common deadlines
      </h3>
      <ul aria-labelledby="common-deadlines" className="flex flex-wrap justify-center gap-2">
        {deadlineTitles(state).map((title) => (
          <li key={title}>
            <Link
              href={newEventHref(title)}
              className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-sm text-foreground no-underline hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
