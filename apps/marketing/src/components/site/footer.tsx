import Link from 'next/link'
import { Logo, SIGN_IN_URL, SIGN_UP_URL } from './brand'
import { TrackedLink } from './tracked-link'
import { HOA_PRODUCT_NAME, isOfferedHref } from '@/lib/hubs'

// Three-column editorial footer. Confidence over density: no padding
// columns, the manifesto line carries the weight.

const allProduct = [
  { label: HOA_PRODUCT_NAME, href: '/hoa' },
  { label: 'PM Hub', href: '/landlords' },
  { label: 'Eviction Hub', href: '/eviction' },
  { label: 'All features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Compare', href: '/compare' },
  { label: 'For attorneys and CPAs', href: '/professionals' },
  { label: 'Sign in', href: SIGN_IN_URL },
]

const allLearn = [
  { label: 'State laws', href: '/states' },
  { label: 'Georgia SB 406 guides', href: '/georgia' },
  { label: 'SB 406 readiness check', href: '/georgia/readiness' },
  { label: 'HOA guides by state', href: '/guides' },
  { label: 'Free HOA templates', href: '/templates' },
  { label: 'HOA board agenda template', href: '/templates/hoa-board-meeting-agenda' },
  { label: 'HOA treasurer duties', href: '/guides/hoa-treasurer-duties' },
]

// BL-097: PM and Eviction are not offered right now.
const product = allProduct.filter((l) => isOfferedHref(l.href))
const learn = allLearn.filter((l) => isOfferedHref(l.href))

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
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1.2fr_1fr]">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo />
            <p className="mt-7 max-w-md text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground md:text-[34px]">
              AI runs the paperwork.{' '}
              <span className="t-serif text-primary">The board runs the HOA.</span>
            </p>
            <p className="mt-6 max-w-sm text-[16px] leading-relaxed text-muted">
              Every AI workflow is labeled by quality bar, and its answers cite the source. We tell you what’s
              production, what’s beta, and what’s demo.
            </p>
            <TrackedLink href={SIGN_UP_URL} event="pilot_cta_click" position="footer" className="btn btn-primary mt-7">
              Start free trial
            </TrackedLink>
          </div>

          <FooterCol title="Product" label="Product links" links={product} />
          <FooterCol title="Learn" label="Learn links" links={learn} />
          <FooterCol title="Company" label="Company links" links={company} />
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-border/70 pt-6 md:flex-row md:items-center">
          <p className="text-[15px] text-muted">
            © {new Date().getFullYear()} HomeownerHub
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-0">
            {tail.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-flex min-h-11 items-center text-[15px] text-muted transition-colors hover:text-foreground"
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

// The column titles are a <p>, not a heading: the footer follows every page's
// own heading outline, so an <h2> here would read as a stray section of the
// page. Each column is a labelled <nav> landmark instead.
function FooterCol({
  title,
  label,
  links,
}: {
  title: string
  label: string
  links: { label: string; href: string }[]
}) {
  return (
    <nav aria-label={label}>
      <p className="eyebrow !text-foreground">
        {title}
      </p>
      <ul className="mt-4 space-y-1">
        {links.map((l) => (
          <li key={l.href}>
            {l.href.startsWith('http') ? (
              <a href={l.href} className="inline-flex min-h-11 items-center text-base text-foreground-secondary transition-colors hover:text-foreground">
                {l.label}
              </a>
            ) : (
              <Link
                href={l.href}
                className="inline-flex min-h-11 items-center text-base text-foreground-secondary transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
