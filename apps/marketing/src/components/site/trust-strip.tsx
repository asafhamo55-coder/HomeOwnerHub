import { ShieldCheck, FileSearch, Languages, Scale } from 'lucide-react'

const items = [
  { Icon: ShieldCheck, label: 'Citations on every legal answer' },
  { Icon: FileSearch, label: 'Audit log on every AI action' },
  { Icon: Languages, label: 'Multilingual resident comms' },
  { Icon: Scale, label: 'Attorney-reviewed eviction templates' },
]

export function TrustStrip() {
  return (
    <section className="border-y border-ink-200/60 bg-ink-50/40 py-6">
      <div className="container-page">
        <div className="grid gap-y-4 gap-x-8 text-center md:grid-cols-4">
          {items.map(({ Icon, label }) => (
            <div
              key={label}
              className="flex items-center justify-center gap-2 text-xs font-medium text-ink-600"
            >
              <Icon className="h-4 w-4 text-brand-600" />
              {label}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
