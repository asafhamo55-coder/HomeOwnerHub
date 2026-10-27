import Link from 'next/link'
import { Logo, SIGN_IN_URL } from './brand'
import { HOA_PRODUCT_NAME, isOfferedHref } from '@/lib/hubs'

// Three-column editorial footer. Confidence over density: no padding
// columns, the manifesto line carries the weight.

const allProduct = [
  { label: HOA_PRODUCT_NAME, href: '/hoa' },
  { label: 'PM Hub', href: '/landlords' },
  { label: 'Eviction Hub', href: '/eviction' },
  { label: 'State laws', href: '/states' },
  { label: 'Georgia SB 406 guides', href: '/georgia' },
  { label: 'SB 406 readiness check', href: '/georgia/readiness' },
  { label: 'HOA board agenda template', href: '/templates/hoa-board-meeting-agenda' },
  { label: 'HOA treasurer duties', href: '/guides/hoa-treasurer-duties' },
  { label: 'For attorneys and CPAs', href: '/professionals' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Compare', href: '/compare' },
  { label: 'Sign in', href: SIGN_IN_URL },
]

// BL-097: PM and Eviction are not offered right now.
const product = allProduct.filter((l) => isOfferedHref(l.href))

const company = [
  { label: 'About', href: '/about' },
  { label: 'Case studies', href: '/case-studies' },
  { label: 'Roadmap', href: '/roadmap' },
  { label: 'AI honesty bars', href: '/honesty-bars' },
  { label: 'Security', href: '/security' },
  { label: 'Docs', href: '/docs' },
  { label: 'Blog', href: '/blog' },
]

const tail = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'DPA', href: '/dpa' },
  { label: 'Status', href: '/status' },
]

export function Footer() {
  return (
    <footer className="section-night on-dark mt-2 text-foreground print:hidden">
      <div className="container-page py-16 md:py-20">
        <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-7 max-w-md text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground md:text-[34px]">
              AI runs the paperwork.{' '}
              <span className="t-serif text-primary">The board runs the HOA.</span>
            </p>
            <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-muted">
              Every AI workflow is labeled by quality bar, and its answers cite the source. We tell you what’s
              production, what’s beta, and what’s demo.
            </p>
          </div>

          <FooterCol title="Product" links={product} />
          <FooterCol title="Company" links={company} />
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-border/70 pt-6 md:flex-row md:items-center">
          <p className="text-sm text-muted">
            © {new Date().getFullYear()} HomeownerHub
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {tail.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-sm text-muted transition-colors hover:text-foreground"
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
      <h2 className="eyebrow !text-foreground">
        {title}
      </h2>
      <ul className="mt-5 space-y-3">
        {links.map((l) => (
          <li key={l.href}>
            {l.href.startsWith('http') ? (
              <a href={l.href} className="text-[15px] text-foreground-secondary transition-colors hover:text-foreground">
                {l.label}
              </a>
            ) : (
              <Link
                href={l.href}
                className="text-[15px] text-foreground-secondary transition-colors hover:text-foreground"
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
