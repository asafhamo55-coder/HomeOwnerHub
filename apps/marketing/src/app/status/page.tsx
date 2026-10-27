import type { Metadata } from 'next'
import { Activity } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { HOA_PRODUCT_NAME } from '@/lib/hubs'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/status']!, path: '/status' })

// Truth rule (BL-090): this page used to show every service as
// "Operational", a "99.94%" 90-day uptime and a "No incidents" note dated
// May 14, 2026, all hard-coded. Nothing was being monitored, so it claimed
// a live status page we don't have. Until a real monitor exists, it says so.
const services = [
  'Marketing site',
  `${HOA_PRODUCT_NAME} app`,
  'AI inference (Groq)',
  'Document ingestion',
  'Communications',
  'Background jobs',
  'Database (Supabase)',
] as const

export default function StatusPage() {
  return (
    <main id="main-content">
      <Nav />

      <PageHero
        eyebrow="System status"
        title={<>Service status.</>}
        subtitle="We don't run a public live status monitor yet, so this page doesn't pretend to be one."
      />

      <section className="py-12">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-subtle/40 p-5 ring-card">
              <Activity className="h-7 w-7 shrink-0 text-muted" />
              <div>
                <p className="text-base font-semibold text-foreground">No live status feed yet</p>
                <p className="text-xs text-muted">
                  If something looks wrong in the app, email us and we’ll tell you what we know.
                </p>
              </div>
            </div>

            <h2 className="mt-12 text-base font-semibold tracking-tight text-foreground">
              What we look after
            </h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-surface ring-card">
              <ul className="divide-y divide-border/70">
                {services.map((name) => (
                  <li key={name} className="px-5 py-4 text-sm font-medium text-foreground">
                    {name}
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-10 text-center text-xs text-muted">
              To report a production incident, email{' '}
              <a className="font-semibold text-foreground underline-offset-4 hover:underline" href="mailto:support@homeownerledger.com">
                support@homeownerledger.com
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
