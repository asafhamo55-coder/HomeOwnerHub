import * as React from 'react'
import { Plus } from 'lucide-react'
import type { FaqItem } from '@/lib/jsonld'

/** Accessible disclosure list (native <details>). Shared by /pricing and the homepage. */
export function FaqList({ items }: { items: readonly FaqItem[] }) {
  return (
    <div className="card mx-auto mt-12 max-w-3xl divide-y divide-border overflow-hidden">
      {items.map((f) => (
        <details key={f.q} className="group transition-colors open:bg-primary-subtle/40 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left text-lg font-semibold leading-snug text-foreground transition-colors hover:bg-subtle md:px-8">
            {f.q}
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary transition-transform duration-200 group-open:rotate-45" aria-hidden>
              <Plus className="h-4 w-4" />
            </span>
          </summary>
          <p className="max-w-[65ch] px-6 pb-6 text-[17px] leading-relaxed text-foreground-secondary md:px-8">{f.a}</p>
        </details>
      ))}
    </div>
  )
}
