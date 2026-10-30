import * as React from 'react'
import type { FaqItem } from '@/lib/jsonld'

/** Accessible disclosure list (native <details>). Shared by /pricing and the homepage. */
export function FaqList({ items }: { items: readonly FaqItem[] }) {
  return (
    <div className="card mx-auto mt-12 max-w-3xl divide-y divide-border">
      {items.map((f) => (
        <details key={f.q} className="group p-6 md:px-8 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between gap-4 rounded text-left text-[17px] font-semibold text-foreground">
            {f.q}
            <span className="text-xl text-muted transition-transform group-open:rotate-45" aria-hidden>
              ＋
            </span>
          </summary>
          <p className="mt-3 text-[15px] leading-relaxed text-foreground-secondary">{f.a}</p>
        </details>
      ))}
    </div>
  )
}
