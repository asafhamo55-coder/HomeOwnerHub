import Link from 'next/link'
import { Logo, SIGN_IN_URL } from './brand'

// Three-column editorial footer. Confidence over density: no padding
// columns, the manifesto line carries the weight.

const product = [
  { label: 'HOA Hub', href: '/hoa' },
  { label: 'PM Hub', href: '/landlords' },
  { label: 'Eviction Hub', href: '/eviction' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Compare', href: '/compare' },
  { label: 'Sign in', href: SIGN_IN_URL },
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
    <footer className="border-t border-border bg-surface">
      <div className="container-page py-20">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <Logo />
              <span className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">
                Ledger
              </span>
            </div>
            <p className="mt-7 max-w-md text-balance text-[28px] font-medium leading-[1.1] tracking-[-0.02em] text-foreground md:text-[36px]">
              AI runs the paperwork. The board runs the HOA.
            </p>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted">
              Every AI workflow is labeled by quality bar, and its answers cite
              the source. We tell you what's production, what's
              beta, and what's demo.
            </p>
          </div>

          <FooterCol title="Product" links={product} />
          <FooterCol title="Company" links={company} />
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-border/70 pt-6 md:flex-row md:items-center">
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} Ledger, Inc.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {tail.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-xs text-muted transition-colors hover:text-foreground"
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
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {title}
      </h2>
      <ul className="mt-5 space-y-3">
        {links.map((l) => (
          <li key={l.href}>
            {l.href.startsWith('http') ? (
              <a href={l.href} className="text-sm text-foreground-secondary transition-colors hover:text-foreground">
                {l.label}
              </a>
            ) : (
              <Link
                href={l.href}
                className="text-sm text-foreground-secondary transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
