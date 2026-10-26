import { FileCheck2, Lock, UserCheck } from 'lucide-react'

// Three plain facts under the hero. No logos: we don't show customer logos
// we don't have. BL-090: "Reviewed by Georgia counsel" stays out; nothing in
// the repo shows a counsel review of the HOA product.

const ITEMS = [
  { Icon: UserCheck, label: 'Built for self-managed HOAs' },
  { Icon: Lock, label: 'Your data, never sold' },
  { Icon: FileCheck2, label: 'Citations on every legal answer' },
]

export function LogoStrip() {
  return (
    <section aria-label="What we stand for" className="border-y border-border bg-surface">
      <div className="container-page py-6">
        <ul className="grid gap-4 sm:grid-cols-3 sm:gap-8">
          {ITEMS.map(({ Icon, label }) => (
            <li key={label} className="flex items-center gap-3 sm:justify-center">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="text-[15px] font-semibold text-foreground">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
