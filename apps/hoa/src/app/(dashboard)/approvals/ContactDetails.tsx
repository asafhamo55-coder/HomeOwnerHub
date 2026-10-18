import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { ContactCard } from '@/lib/approvals-inbox/model'

// PR-10: a resident's requested contact change, field by field — what is
// on file now and what they asked for. A part that won't be applied (the
// sign-in email hold) and anything that blocks approval are said plainly.

export function ContactDetails({ contact }: { contact: ContactCard }) {
  return (
    <div className="space-y-1.5 text-xs">
      <dl className="space-y-1">
        {contact.changes.map((c) => (
          <div key={c.label} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <dt className="shrink-0 text-muted">{c.label}</dt>
            <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 break-words text-foreground">
              <span className="text-muted">{c.from ?? 'None on file'}</span>
              <ArrowRight className="size-3 shrink-0 self-center text-muted" aria-label="changes to" />
              <span className="font-medium">{c.to}</span>
            </dd>
          </div>
        ))}
      </dl>
      {[...contact.held, ...(contact.problem ? [contact.problem] : [])].map((note) => (
        <p key={note} className="flex items-start gap-1.5 text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{note}</span>
        </p>
      ))}
    </div>
  )
}
