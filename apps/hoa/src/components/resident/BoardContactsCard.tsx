import { Phone } from 'lucide-react'
import { telHref, type BoardContact } from '@/lib/association-contacts'
import { Panel } from '@/components/resident/screen'

/**
 * Read-only "Board and emergency contacts" card for the resident home.
 * Renders nothing when the board has not published any. Phone numbers and
 * emails are real links; the emergency line is its own labelled line.
 */
export function BoardContactsCard({ contacts, communityName }: { contacts: BoardContact[]; communityName?: string | null }) {
  if (contacts.length === 0) return null
  return (
    <Panel title={communityName ? `Board and emergency contacts · ${communityName}` : 'Board and emergency contacts'} icon={<Phone />}>
      <ul className="divide-y divide-border">
        {contacts.map((c, i) => (
          <li key={i} className="space-y-1 py-3 first:pt-0 last:pb-0">
            <p className="text-sm font-semibold text-foreground">{c.label}</p>
            {c.name ? <p className="text-sm text-foreground">{c.name}</p> : null}
            {c.phone ? (
              <p className="text-sm">
                <span className="sr-only">Phone: </span>
                <a href={telHref(c.phone)} className="inline-block py-1.5 font-medium text-primary underline-offset-2 hover:underline">
                  {c.phone}
                </a>
              </p>
            ) : null}
            {c.email ? (
              <p className="break-words text-sm">
                <span className="sr-only">Email: </span>
                <a href={`mailto:${c.email}`} className="inline-block py-1.5 font-medium text-primary underline-offset-2 hover:underline">
                  {c.email}
                </a>
              </p>
            ) : null}
            {c.emergencyLine ? (
              <p className="text-sm text-foreground">
                <span className="font-medium">Emergency: </span>
                {c.emergencyLine}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
