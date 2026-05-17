import Link from 'next/link'

// Three-column editorial footer. Confidence over density: no padding
// columns, the manifesto line carries the weight.

const product = [
  { label: 'HOA Hub', href: '/hoa' },
  { label: 'PM Hub', href: '/landlords' },
  { label: 'Eviction Hub', href: '/eviction' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Compare', href: '/compare' },
]

const company = [
  { label: 'About', href: '/about' },
  { label: 'Case study', href: '/case-studies/madison-park' },
  { label: 'Roadmap', href: '/roadmap' },
  { label: 'AI honesty bars', href: '/honesty-bars' },
  { label: 'Security', href: '/security' },
]

const tail = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'DPA', href: '/dpa' },
  { label: 'Status', href: '/status' },
]

export function Footer() {
  return (
    <footer className="border-t border-ink-200/70 bg-white">
      <div className="container-page py-20">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
                <rect width="32" height="32" rx="8" fill="#1D4ED8" />
                <path
                  d="M11 7.5v17M11 24.5h12"
                  stroke="#ffffff"
                  strokeWidth="2.8"
                  strokeLinecap="square"
                  fill="none"
                />
              </svg>
              <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink-900">
                Ledger
              </span>
            </div>
            <p className="mt-7 max-w-md text-balance text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-ink-900 md:text-[36px]">
              AI runs the paperwork. The board runs the HOA.
            </p>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-ink-500">
              Every AI output is labeled by quality bar, cited to the source
              document, and audit-logged. We tell you what's production, what's
              beta, and what's demo.
            </p>
          </div>

          <FooterCol title="Product" links={product} />
          <FooterCol title="Company" links={company} />
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-ink-200/70 pt-6 md:flex-row md:items-center">
          <p className="text-xs text-ink-500">
            © {new Date().getFullYear()} Ledger, Inc.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {tail.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-xs text-ink-500 transition-colors hover:text-ink-900"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">
        {title}
      </h4>
      <ul className="mt-5 space-y-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-sm text-ink-700 transition-colors hover:text-ink-900"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
